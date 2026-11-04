// Creator side: accepted mints, the inbox, and redeeming once online.
import { deserializeProofs, getDecodedToken, getEncodedToken, serializeProofs, type Wallet } from '@cashu/cashu-ts';
import { list, put, type InboxGift } from './db';
import { getCreatorKeys } from './keys';
import { getWallet, refreshMintKeys } from './mint';
import { MINIBITS, TEST_MINT } from './settings';

/** Mints a creator accepts gifts on. Their keys are cached so gifts verify offline. */
export const ACCEPTED_MINTS = [TEST_MINT, MINIBITS];

/** Caches keys for the accepted mints. Call when online, before going offline to receive. */
export async function cacheAcceptedMints() {
	if (!navigator.onLine) return;
	await Promise.allSettled(ACCEPTED_MINTS.map(refreshMintKeys));
}

export const listInbox = async () => (await list('inbox')).sort((a, b) => b.receivedAt - a.receivedAt);

/** Gifts per swap. The mint's input fee rounds up per swap, so bigger batches waste less. */
const BATCH = 100;

/** Signs several locked gift tokens from one mint and swaps them in a single swap. */
export async function redeemTogether(wallet: Wallet, mintUrl: string, tokens: string[], privkey: string) {
	const keysetIds = wallet.keyChain.getKeysets().map((k) => k.id);
	const proofs = tokens.flatMap((t) => getDecodedToken(t, keysetIds).proofs);
	return wallet.receive({ mint: mintUrl, unit: 'sat', proofs }, { privkey });
}

/**
 * Signs every unredeemed gift with the creator key and swaps it at its mint into fresh, unlocked
 * proofs, one swap per mint: the input fee rounds up per swap (testnut: 1 sat per 10 nuts), so
 * ten 8-sat gifts cost 1 sat together instead of 1 sat each. If a batch fails, its gifts are
 * retried one by one, and a gift that fails alone (already spent, refunded) is marked and skipped.
 */
export async function redeemAll(onProgress?: (done: number, total: number) => void) {
	const keys = await getCreatorKeys();
	if (!keys) throw new Error('No creator key on this device');
	const pending = (await listInbox()).filter((g) => !g.redeemed);
	let done = 0;
	const results: { gift: InboxGift; ok: boolean; error?: string }[] = [];

	const byMint = new Map<string, InboxGift[]>();
	for (const g of pending) byMint.set(g.mintUrl, [...(byMint.get(g.mintUrl) ?? []), g]);

	for (const [mintUrl, gifts] of byMint) {
		let wallet: Wallet;
		try {
			wallet = await getWallet(mintUrl);
		} catch (e) {
			// Mint unreachable: report it, but don't mark the gifts failed; the next try may work.
			for (const gift of gifts) results.push({ gift, ok: false, error: (e as Error).message });
			onProgress?.((done += gifts.length), pending.length);
			continue;
		}
		for (let i = 0; i < gifts.length; i += BATCH) {
			const batch = gifts.slice(i, i + BATCH);
			try {
				const proofs = await redeemTogether(wallet, mintUrl, batch.map((g) => g.token), keys.priv);
				// The new proofs can't be split back per gift; the first gift holds them all, and
				// redeemedTokens adds them up per mint anyway.
				for (const [j, gift] of batch.entries()) {
					const next = { ...gift, redeemed: true, redeemError: undefined, redeemedProofs: j === 0 ? serializeProofs(proofs) : [] };
					await put('inbox', next);
					results.push({ gift: next, ok: true });
				}
			} catch {
				for (const gift of batch) results.push(await redeemOne(wallet, gift, keys.priv));
			}
			onProgress?.((done += batch.length), pending.length);
		}
	}
	return results;
}

async function redeemOne(wallet: Wallet, gift: InboxGift, privkey: string) {
	try {
		const proofs = await wallet.receive(gift.token, { privkey });
		const next = { ...gift, redeemed: true, redeemError: undefined, redeemedProofs: serializeProofs(proofs) };
		await put('inbox', next);
		return { gift: next, ok: true };
	} catch (e) {
		const message = (e as Error).message;
		const spent = /spent|already|11001/i.test(message);
		const next = { ...gift, redeemError: spent ? 'Already spent: redeemed elsewhere or refunded to the giver' : message };
		await put('inbox', next);
		return { gift: next, ok: false, error: next.redeemError };
	}
}

/** Redeemed sats per mint, as cashuB tokens the creator can paste into any Cashu wallet. */
export function redeemedTokens(inbox: InboxGift[]) {
	const byMint = new Map<string, string[]>();
	for (const g of inbox) if (g.redeemedProofs?.length) byMint.set(g.mintUrl, [...(byMint.get(g.mintUrl) ?? []), ...g.redeemedProofs]);
	return [...byMint.entries()].map(([mintUrl, proofs]) => {
		const decoded = deserializeProofs(proofs);
		return {
			mintUrl,
			amount: decoded.reduce((a, p) => a + p.amount.toNumber(), 0),
			token: getEncodedToken({ mint: mintUrl, unit: 'sat', proofs: decoded }),
		};
	});
}
