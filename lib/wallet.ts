import { MintQuoteState, deserializeProofs, serializeProofs, type MintQuoteBolt11Response, type Proof } from '@cashu/cashu-ts';
import { db, get, newId, put, type Jar } from './db';
import { ensureListenerKeys } from './keys';
import { getWallet } from './mint';

export const NUT_SIZES = [8, 32, 64] as const;
export type NutSize = (typeof NUT_SIZES)[number];
export const LOCK_DAYS = 30;

export const sumProofs = (proofs: Proof[]) => proofs.reduce((a, p) => a + p.amount.toNumber(), 0);

export async function getProofs(mintUrl: string): Promise<Proof[]> {
	const rec = await get('wallet', mintUrl);
	return rec ? deserializeProofs(rec.proofs) : [];
}

export async function saveProofs(mintUrl: string, proofs: Proof[]) {
	await put('wallet', { mintUrl, proofs: proofs.length ? serializeProofs(proofs) : [], updatedAt: Date.now() });
}

export const getBalance = async (mintUrl: string) => sumProofs(await getProofs(mintUrl));

export async function createFundingQuote(mintUrl: string, amount: number) {
	const wallet = await getWallet(mintUrl);
	return wallet.createMintQuoteBolt11(amount);
}

/** Polls until the invoice is paid, then mints the proofs into the wallet. */
export async function waitForPaymentAndMint(mintUrl: string, quote: MintQuoteBolt11Response, amount: number, signal: AbortSignal) {
	const wallet = await getWallet(mintUrl);
	for (;;) {
		if (signal.aborted) throw new Error('cancelled');
		const { state } = await wallet.checkMintQuoteBolt11(quote.quote);
		if (state === MintQuoteState.PAID) break;
		if (state === MintQuoteState.ISSUED) throw new Error('quote already used');
		await new Promise((r) => setTimeout(r, 2000));
	}
	const minted = await wallet.mintProofsBolt11(amount, quote.quote);
	await saveProofs(mintUrl, [...(await getProofs(mintUrl)), ...minted]);
	return sumProofs(minted);
}

export type JarTarget = { creatorNpub: string; creatorName: string; lockKey: string; mintUrl: string };

/**
 * Swaps wallet proofs into a jar of single-proof nuts of fixed sizes, each P2PK-locked to the
 * creator with a locktime and the listener's refund key. DLEQ proofs stay on every nut so the
 * creator can check the mint signature offline. Change goes back into the wallet.
 */
export async function fillJar(target: JarTarget, counts: Record<NutSize, number>, lockSeconds = LOCK_DAYS * 86400): Promise<Jar> {
	const denoms = NUT_SIZES.flatMap((size) => Array<number>(counts[size] ?? 0).fill(size));
	const total = denoms.reduce((a, b) => a + b, 0);
	if (!total) throw new Error('Pick at least one nut');

	const refund = await ensureListenerKeys();
	const wallet = await getWallet(target.mintUrl);
	const proofs = await getProofs(target.mintUrl);
	const locktime = Math.floor(Date.now() / 1000) + lockSeconds;

	const { keep, send } = await wallet.ops
		.send(total, proofs)
		.asP2PK({ pubkey: target.lockKey, locktime, refundKeys: [refund.pub] }, denoms)
		.run();

	if (send.some((p) => !p.dleq)) throw new Error('Mint returned nuts without DLEQ proofs');

	const jar: Jar = {
		id: newId(),
		...target,
		locktime,
		refundKey: refund.pub,
		nuts: send.map((p) => ({ proof: serializeProofs(p)[0], amount: p.amount.toNumber(), spent: false })),
		createdAt: Date.now(),
	};

	// The inputs are spent at the mint now; store change and jar together.
	const tx = (await db()).transaction(['wallet', 'jars'], 'readwrite');
	await Promise.all([
		tx.objectStore('wallet').put({ mintUrl: target.mintUrl, proofs: keep.length ? serializeProofs(keep) : [], updatedAt: Date.now() }),
		tx.objectStore('jars').put(jar),
		tx.done,
	]);
	return jar;
}

/** Input fee in sats for spending n proofs of a keyset with this ppk. */
export const inputFee = (nInputs: number, feePpk: number) => Math.ceil((nInputs * feePpk) / 1000);

/** Unspent nut counts per size across jars for one creator. */
export function jarCounts(jars: Jar[]) {
	const counts: Record<number, number> = {};
	for (const jar of jars) for (const nut of jar.nuts) if (!nut.spent) counts[nut.amount] = (counts[nut.amount] ?? 0) + 1;
	return counts;
}
