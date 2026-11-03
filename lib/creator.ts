// Creator side: accepted mints, the inbox, and redeeming once online.
import { deserializeProofs, getEncodedToken, serializeProofs } from '@cashu/cashu-ts';
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

/**
 * Signs each unredeemed gift with the creator key and swaps it at its mint into fresh,
 * unlocked proofs. A gift that fails (already spent, refunded) is marked and skipped.
 */
export async function redeemAll(onProgress?: (done: number, total: number) => void) {
	const keys = await getCreatorKeys();
	if (!keys) throw new Error('No creator key on this device');
	const pending = (await listInbox()).filter((g) => !g.redeemed);
	let done = 0;
	const results: { gift: InboxGift; ok: boolean; error?: string }[] = [];

	for (const gift of pending) {
		try {
			const wallet = await getWallet(gift.mintUrl);
			const proofs = await wallet.receive(gift.token, { privkey: keys.priv });
			const next = { ...gift, redeemed: true, redeemError: undefined, redeemedProofs: serializeProofs(proofs) };
			await put('inbox', next);
			results.push({ gift: next, ok: true });
		} catch (e) {
			const message = (e as Error).message;
			const spent = /spent|already|11001/i.test(message);
			const next = { ...gift, redeemError: spent ? 'Already spent: redeemed elsewhere or refunded to the giver' : message };
			await put('inbox', next);
			results.push({ gift: next, ok: false, error: next.redeemError });
		}
		onProgress?.(++done, pending.length);
	}
	return results;
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
