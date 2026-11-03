// After the locktime, the listener's refund key can take back nuts the creator never redeemed.
import { CheckStateEnum, deserializeProofs, getTokenMetadata, type Proof } from '@cashu/cashu-ts';
import { db, list, type Gift, type Jar } from './db';
import { ensureListenerKeys } from './keys';
import { getWallet } from './mint';
import { getProofs, saveProofs, sumProofs } from './wallet';

export type Expired = { jar: Jar; index: number; proof: Proof; amount: number; gift?: Gift };

/** Jar nuts past their locktime: never gifted, or gifted but not (yet known to be) redeemed. */
export async function listExpired(nowSec = Math.floor(Date.now() / 1000)): Promise<Expired[]> {
	const [jars, gifts] = await Promise.all([list('jars'), list('gifts')]);
	const out: Expired[] = [];
	for (const jar of jars) {
		if (jar.locktime > nowSec) continue;
		jar.nuts.forEach((nut, index) => {
			if (nut.settled) return;
			const [proof] = deserializeProofs([nut.proof]);
			const gift = nut.spent ? gifts.find((g) => g.jarId === jar.id && giftSecrets(g).includes(proof.secret)) : undefined;
			if (gift?.status === 'redeemed' || gift?.reclaimed) return;
			out.push({ jar, index, proof, amount: nut.amount, gift });
		});
	}
	return out;
}

// A gift token carries exactly its jar nut; token metadata exposes the secrets without keyset ids.
function giftSecrets(gift: Gift) {
	try {
		return getTokenMetadata(gift.token).incompleteProofs.map((p) => p.secret);
	} catch {
		return [];
	}
}

/**
 * Asks the mint which expired nuts are still unspent, then swaps those back into the wallet
 * with the refund key. Nuts the mint reports as spent were redeemed by the creator.
 */
export async function reclaimExpired(items: Expired[]) {
	const refund = await ensureListenerKeys();
	const byMint = new Map<string, Expired[]>();
	for (const it of items) byMint.set(it.jar.mintUrl, [...(byMint.get(it.jar.mintUrl) ?? []), it]);

	let reclaimed = 0;
	let redeemedByCreator = 0;
	for (const [mintUrl, group] of byMint) {
		const wallet = await getWallet(mintUrl);
		const states = await wallet.checkProofsStates(group.map((g) => g.proof));
		const unspent = group.filter((_, i) => states[i]?.state === CheckStateEnum.UNSPENT);
		const spent = group.filter((_, i) => states[i]?.state === CheckStateEnum.SPENT);

		let fresh: Proof[] = [];
		if (unspent.length) {
			fresh = await wallet.receive({ mint: mintUrl, unit: 'sat', proofs: unspent.map((u) => u.proof) }, { privkey: refund.priv });
			reclaimed += sumProofs(fresh);
		}
		redeemedByCreator += spent.length;

		// Record outcomes: reclaimed nuts and gifts, and gifts the creator redeemed.
		const d = await db();
		const tx = d.transaction(['jars', 'gifts'], 'readwrite');
		const jars = new Map<string, Jar>();
		for (const it of [...unspent, ...spent]) {
			const jar = jars.get(it.jar.id) ?? (await tx.objectStore('jars').get(it.jar.id))!;
			const wasReclaimed = unspent.includes(it);
			jar.nuts[it.index] = { ...jar.nuts[it.index], spent: true, settled: true };
			jars.set(jar.id, jar);
			if (it.gift) await tx.objectStore('gifts').put(wasReclaimed ? { ...it.gift, reclaimed: true } : { ...it.gift, status: 'redeemed' });
		}
		for (const jar of jars.values()) await tx.objectStore('jars').put(jar);
		await tx.done;

		if (fresh.length) await saveProofs(mintUrl, [...(await getProofs(mintUrl)), ...fresh]);
	}
	return { reclaimed, redeemedByCreator };
}
