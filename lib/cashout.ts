// The creator's way out to Lightning: melt redeemed sats at their mint to pay a Lightning invoice or
// a Lightning address (LUD-16). Online only. Quote first, so the exact cost is on screen before
// anything is paid.
import { CheckStateEnum, MeltQuoteState, deserializeProofs, serializeProofs, type MeltQuoteBolt11Response, type Proof, type Wallet } from '@cashu/cashu-ts';
import { db, getSetting, list, setSetting, type InboxGift } from './db';
import { getWallet } from './mint';
import { sumProofs } from './wallet';

const LN_ADDRESS = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const INVOICE = /^ln(bc|tb|bcrt|tbs)[0-9a-z]+$/i;

export const isLightningAddress = (to: string) => LN_ADDRESS.test(to.trim());

/** Strips a "lightning:" prefix and checks the destination is an address or a BOLT11 invoice. */
export function parseDestination(to: string): { kind: 'address' | 'invoice'; value: string } | undefined {
	const value = to.trim().replace(/^lightning:/i, '');
	if (LN_ADDRESS.test(value)) return { kind: 'address', value: value.toLowerCase() };
	if (INVOICE.test(value)) return { kind: 'invoice', value: value.toLowerCase() };
	return undefined;
}

/** Inbox records holding redeemed proofs on one mint (redeemAll parks a batch's proofs on its first gift). */
async function holders(mintUrl: string) {
	return (await list('inbox')).filter((g) => g.mintUrl === mintUrl && g.redeemedProofs?.length);
}

/** Replaces everything held on a mint with `proofs`, parked on the first record, in one transaction. */
async function hold(records: InboxGift[], proofs: Proof[]) {
	const tx = (await db()).transaction('inbox', 'readwrite');
	for (const [i, r] of records.entries()) {
		const g = await tx.store.get(r.id);
		if (g) await tx.store.put({ ...g, redeemedProofs: i === 0 && proofs.length ? serializeProofs(proofs) : [] });
	}
	await tx.done;
}

/**
 * The redeemed proofs on a mint that are still unspent. Proofs spent elsewhere (the token was
 * pasted into another wallet) are dropped for good, so the balance on screen stays true.
 */
async function unspentHeld(wallet: Wallet, mintUrl: string) {
	const records = await holders(mintUrl);
	const proofs = deserializeProofs(records.flatMap((g) => g.redeemedProofs ?? []));
	if (!proofs.length) return { records, proofs, movedAway: 0 };
	const states = await wallet.checkProofsStates(proofs);
	const unspent = proofs.filter((_, i) => states[i]?.state === CheckStateEnum.UNSPENT);
	if (unspent.length < proofs.length) await hold(records, unspent);
	return { records, proofs: unspent, movedAway: sumProofs(proofs) - sumProofs(unspent) };
}

async function fetchJson(url: string) {
	const res = await fetch(url, { headers: { accept: 'application/json' } }).catch(() => {
		throw new Error(`Couldn't reach ${new URL(url).host}. Paste an invoice from your wallet instead.`);
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok || body.status === 'ERROR') throw new Error(body.reason ?? `${new URL(url).host} answered ${res.status}`);
	return body;
}

/** LUD-16: asks a Lightning address for an invoice of exactly `sats`. */
async function invoiceFor(address: string, sats: number): Promise<string> {
	const [name, domain] = address.split('@');
	const pay = await fetchJson(`https://${domain}/.well-known/lnurlp/${name}`);
	const msat = sats * 1000;
	if (msat < pay.minSendable || msat > pay.maxSendable) throw new Error(`${address} takes ${Math.ceil(pay.minSendable / 1000)} to ${Math.floor(pay.maxSendable / 1000)} sats per payment.`);
	const callback = new URL(pay.callback);
	callback.searchParams.set('amount', String(msat));
	const { pr } = await fetchJson(callback.toString());
	if (!pr) throw new Error(`${address} didn't return an invoice.`);
	return pr;
}

export type CashOutPlan = {
	mintUrl: string;
	to: string;
	quote: MeltQuoteBolt11Response;
	/** What the recipient gets. */
	amount: number;
	/** The mint holds this back for routing; unused fee comes back as change. */
	feeReserve: number;
	/** The mint's own fee for spending proofs, at most: once if it has to split them first, once to melt. */
	inputFee: number;
	/** Unspent redeemed sats on this mint right now. */
	available: number;
	/** Sats found already spent elsewhere and dropped while preparing. */
	movedAway: number;
};

/** A first guess at what a Lightning address payment can carry once fees are paid, for the amount field. */
export const suggestedAmount = (available: number) => Math.max(0, available - Math.max(2, Math.ceil(available * 0.02)) - 1);

/**
 * Gets a melt quote for paying `to` from the redeemed sats on one mint. For a Lightning address with
 * no amount, it sends as much as fees allow: if the first quote doesn't fit, it asks again for less.
 */
export async function prepareCashOut(mintUrl: string, to: string, sats?: number): Promise<CashOutPlan> {
	const dest = parseDestination(to);
	if (!dest) throw new Error('Enter a Lightning address (you@wallet.com) or a Lightning invoice (lnbc…).');
	const wallet = await getWallet(mintUrl);
	const { proofs, movedAway } = await unspentHeld(wallet, mintUrl);
	const available = sumProofs(proofs);
	if (!available) throw new Error(movedAway ? 'These sats were already moved to another wallet.' : 'Nothing to send from this mint.');
	const inputFee = 2 * wallet.getFeesForProofs(proofs).toNumber();
	const needs = (q: MeltQuoteBolt11Response) => q.amount.toNumber() + q.fee_reserve.toNumber() + inputFee;

	const quoteFor = async (amount?: number) => {
		const invoice = dest.kind === 'invoice' ? dest.value : await invoiceFor(dest.value, amount!);
		const quote = await wallet.createMeltQuoteBolt11(invoice);
		// LUD-06: the invoice must be for exactly what was asked.
		if (amount !== undefined && quote.amount.toNumber() !== amount) throw new Error(`${dest.value} returned an invoice for a different amount. Not paid.`);
		return quote;
	};

	let amount = dest.kind === 'address' ? (sats ?? suggestedAmount(available)) : undefined;
	if (amount !== undefined && amount < 1) throw new Error(`Not enough to cover fees: ${available} sats on this mint.`);
	let quote = await quoteFor(amount);
	if (needs(quote) > available && dest.kind === 'address' && sats === undefined) {
		amount = amount! - (needs(quote) - available);
		if (amount < 1) throw new Error(`Not enough to cover fees: ${available} sats on this mint.`);
		quote = await quoteFor(amount);
	}
	if (needs(quote) > available) throw new Error(`That needs up to ${needs(quote)} sats with fees, and ${available} are here.`);

	return { mintUrl, to: dest.value, quote, amount: quote.amount.toNumber(), feeReserve: quote.fee_reserve.toNumber(), inputFee, available, movedAway };
}

export type CashOutResult = { paid: boolean; pending: boolean; spent: number; change: number };

/**
 * Pays a prepared quote. The proofs going in are written back before the melt, so a crash mid-way
 * loses nothing: whatever the mint didn't spend is found unspent next time.
 */
export async function confirmCashOut(plan: CashOutPlan): Promise<CashOutResult> {
	const wallet = await getWallet(plan.mintUrl);
	const { records, proofs } = await unspentHeld(wallet, plan.mintUrl);
	const { keep, send } = await wallet.send(plan.quote.amount.add(plan.quote.fee_reserve), proofs, { includeFees: true });
	await hold(records, [...keep, ...send]);

	const { quote, change } = await wallet.meltProofsBolt11(plan.quote, send);
	const paid = quote.state === MeltQuoteState.PAID;
	const pending = quote.state === MeltQuoteState.PENDING;
	// Unpaid: the mint gave the proofs back, and they're still held. Pending: they stay held until
	// the next cash out finds out whether the mint spent them.
	if (paid) await hold(records, [...keep, ...change]);

	const spent = sumProofs(send) - sumProofs(change);
	if (paid || pending) {
		const log = (await getSetting('cashOuts')) ?? [];
		await setSetting('cashOuts', [{ mintUrl: plan.mintUrl, to: plan.to, amount: plan.amount, fees: Math.max(0, spent - plan.amount), pending, at: Date.now() }, ...log].slice(0, 20));
		await setSetting('cashOutTo', plan.to);
	}
	return { paid, pending, spent, change: sumProofs(change) };
}
