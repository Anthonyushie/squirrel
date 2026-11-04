// Turning a jar nut into a gift. Everything in this file works with no network.
import { deserializeProofs, getEncodedToken } from '@cashu/cashu-ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { db, list, newId, type Gift, type GiftStatus, type Jar } from './db';

export const MESSAGE_MAX = 100;

/** Short episode reference for the memo: the creator maps it back via their own copy of the feed. */
export const episodeRef = (guid: string) => bytesToHex(sha256(utf8ToBytes(guid))).slice(0, 8);

// Gift memo inside the standard cashuB memo field: "sq1|<episode ref>|<seconds>|<message>".
// Any Cashu wallet can still redeem the token; Squirrel just reads extra context out of it.
export function encodeMemo(episodeGuid: string, seconds: number, message: string) {
	return `sq1|${episodeRef(episodeGuid)}|${Math.floor(seconds)}|${message.slice(0, MESSAGE_MAX)}`;
}

/** Nutzap tag carrying the same memo, since a kind 9321 holds bare proofs with no token memo. */
export const MEMO_TAG = 'squirrel';

export function decodeMemo(memo?: string): { episodeRef?: string; seconds?: number; message: string } {
	if (!memo?.startsWith('sq1|')) return { message: memo ?? '' };
	const [, ref, secs, ...rest] = memo.split('|');
	return { episodeRef: ref || undefined, seconds: Number(secs) || 0, message: rest.join('|') };
}

/** Groups jars that lock to the same creator key on the same mint. */
export function creatorJars(jars: Jar[]) {
	const map = new Map<string, Jar[]>();
	for (const j of jars) {
		const key = `${j.lockKey}|${j.mintUrl}`;
		map.set(key, [...(map.get(key) ?? []), j]);
	}
	return [...map.entries()].map(([key, js]) => ({ key, name: js[0].creatorName, mintUrl: js[0].mintUrl, jars: js }));
}

/** Unspent nut sizes available for one creator group, with counts. */
export function availableSizes(jars: Jar[]) {
	const counts = new Map<number, number>();
	for (const j of jars) for (const n of j.nuts) if (!n.spent) counts.set(n.amount, (counts.get(n.amount) ?? 0) + 1);
	return counts;
}

/**
 * Takes one unspent nut of `size` from the creator's jars (soonest locktime first, so the
 * creator gets the most redeem time out of the rest), marks it spent and records the gift.
 */
export async function createGift(opts: {
	groupKey: string;
	size: number;
	message: string;
	episodeGuid: string;
	episodeTitle: string;
	seconds: number;
}): Promise<Gift> {
	const group = creatorJars(await list('jars')).find((g) => g.key === opts.groupKey);
	if (!group) throw new Error('No jar for this creator');

	const candidates = group.jars
		.filter((j) => j.locktime > Date.now() / 1000)
		.sort((a, b) => a.locktime - b.locktime)
		.flatMap((j) => j.nuts.map((n, i) => ({ jar: j, i, n })))
		.filter(({ n }) => !n.spent && n.amount === opts.size);
	const pick = candidates[0];
	if (!pick) throw new Error(`No ${opts.size}-sat nuts left`);

	const [proof] = deserializeProofs([pick.n.proof]);
	const token = getEncodedToken({
		mint: pick.jar.mintUrl,
		unit: 'sat',
		proofs: [proof],
		memo: encodeMemo(opts.episodeGuid, opts.seconds, opts.message),
	});

	const gift: Gift = {
		id: newId(),
		jarId: pick.jar.id,
		token,
		amount: opts.size,
		episodeGuid: opts.episodeGuid,
		episodeTitle: opts.episodeTitle,
		seconds: Math.floor(opts.seconds),
		message: opts.message.slice(0, MESSAGE_MAX),
		status: 'created',
		createdAt: Date.now(),
	};

	// Spend the nut and record the gift atomically, so a nut can never be gifted twice.
	const jar = { ...pick.jar, nuts: pick.jar.nuts.map((n, i) => (i === pick.i ? { ...n, spent: true } : n)) };
	const tx = (await db()).transaction(['jars', 'gifts'], 'readwrite');
	await Promise.all([tx.objectStore('jars').put(jar), tx.objectStore('gifts').put(gift), tx.done]);
	return gift;
}

export async function setGiftStatus(id: string, status: GiftStatus, patch: Partial<Gift> = {}) {
	const d = await db();
	const gift = await d.get('gifts', id);
	if (!gift) throw new Error('Gift not found');
	const next = { ...gift, ...patch, status };
	await d.put('gifts', next);
	return next;
}

export const listGifts = async () => (await list('gifts')).sort((a, b) => b.createdAt - a.createdAt);

export const STATUS_LABEL: Record<GiftStatus, string> = {
	created: 'Not delivered',
	handed_over: 'Handed over',
	queued: 'Sends when online',
	published: 'Sent as nutzap',
	redeemed: 'Redeemed',
};
