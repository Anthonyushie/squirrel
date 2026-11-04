// After the locktime, the listener's refund key can take back nuts the creator never redeemed.
// Before it, the mint can already say which gifted nuts the creator has redeemed.
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

/**
 * Asks each mint whether gifted nuts are spent, without waiting for the locktime. Before it,
 * only the creator's key can spend a gifted nut, so spent means the creator has it.
 * Returns how many gifts turned redeemed.
 */
export async function checkRedeemed(): Promise<number> {
	if (!navigator.onLine) return 0;
	const [jars, gifts] = await Promise.all([list('jars'), list('gifts')]);
	// Queued gifts never left the device, so the creator can't have spent those yet.
	const out = gifts.filter((g) => !g.reclaimed && (g.status === 'created' || g.status === 'handed_over' || g.status === 'published' || g.status === 'received'));

	const byMint = new Map<string, { gift: Gift; jarId: string; index: number; proof: Proof }[]>();
	for (const gift of out) {
		const jar = jars.find((j) => j.id === gift.jarId);
		if (!jar) continue;
		const secrets = giftSecrets(gift);
		jar.nuts.forEach((nut, index) => {
			if (!nut.spent || nut.settled) return;
			const [proof] = deserializeProofs([nut.proof]);
			if (secrets.includes(proof.secret)) byMint.set(jar.mintUrl, [...(byMint.get(jar.mintUrl) ?? []), { gift, jarId: jar.id, index, proof }]);
		});
	}

	let redeemed = 0;
	for (const [mintUrl, group] of byMint) {
		try {
			const wallet = await getWallet(mintUrl);
			const states = await wallet.checkProofsStates(group.map((g) => g.proof));
			const spent = group.filter((_, i) => states[i]?.state === CheckStateEnum.SPENT);
			if (!spent.length) continue;

			const tx = (await db()).transaction(['jars', 'gifts'], 'readwrite');
			for (const it of spent) {
				const jar = (await tx.objectStore('jars').get(it.jarId))!;
				jar.nuts[it.index] = { ...jar.nuts[it.index], settled: true };
				await tx.objectStore('jars').put(jar);
				// Re-read: the gift may have moved on (handed over, say) since the list above.
				const gift = await tx.objectStore('gifts').get(it.gift.id);
				if (gift && !gift.reclaimed) await tx.objectStore('gifts').put({ ...gift, status: 'redeemed' });
			}
			await tx.done;
			redeemed += spent.length;
		} catch (e) {
			// One unreachable mint shouldn't hold up the others; the next sync tries again.
			console.warn(`redeem check failed for ${mintUrl}`, e);
		}
	}
	return redeemed;
}
