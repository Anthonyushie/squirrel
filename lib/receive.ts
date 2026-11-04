// Creator side of NIP-61. Publishes where listeners can send nutzaps (kind 10019), then collects
// the nutzaps that arrive (kind 9321) and runs the same offline checks as a scanned gift before
// any of them reaches the inbox.
import { deserializeProofs, getEncodedToken } from '@cashu/cashu-ts';
import { hexToBytes } from '@noble/hashes/utils.js';
import { finalizeEvent, verifyEvent, type Event, type VerifiedEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { ACCEPTED_MINTS } from './creator';
import { get, getSetting, put, setSetting } from './db';
import { MEMO_TAG, MESSAGE_MAX } from './gift';
import { ensureCreatorNostrKeys, getCreatorKeys } from './keys';
import { refreshMintKeys } from './mint';
import { DEFAULT_RELAYS } from './nostr';
import { verifyGift } from './verify';

/** The creator's kind 10019: lock nutzaps to this key, on these mints, and post them to these relays. Pure. */
export function buildNutzapInfoEvent(opts: { lockKey: string; mints: string[]; relays: string[]; privHex: string }): VerifiedEvent {
	return finalizeEvent(
		{
			kind: 10019,
			created_at: Math.floor(Date.now() / 1000),
			content: '',
			// The full 33-byte lock key, as Nodesignal publishes theirs; normalizeLockKey reads either form.
			tags: [...opts.relays.map((r) => ['relay', r]), ...opts.mints.map((m) => ['mint', m, 'sat']), ['pubkey', opts.lockKey]],
		},
		hexToBytes(opts.privHex),
	);
}

/** Publishes this phone's lock key and accepted mints as the creator's kind 10019. Online only. */
export async function publishNutzapInfo() {
	const creator = await getCreatorKeys();
	if (!creator) throw new Error('No creator key on this device');
	const nostr = await ensureCreatorNostrKeys();
	const relays = DEFAULT_RELAYS;
	const event = buildNutzapInfoEvent({ lockKey: creator.pub, mints: ACCEPTED_MINTS, relays, privHex: nostr.priv });

	const pool = new SimplePool();
	let accepted = 0;
	try {
		const results = await Promise.allSettled(pool.publish(relays, event, { maxWait: 8000 }));
		accepted = results.filter((r) => r.status === 'fulfilled').length;
	} finally {
		pool.close(relays);
	}
	if (!accepted) throw new Error('No relay accepted the event');

	const info = { eventId: event.id, lockKey: creator.pub, mints: ACCEPTED_MINTS, relays, publishedAt: Date.now() };
	await setSetting('creatorNutzapInfo', info);
	return { ...info, accepted };
}

/** Turns a kind 9321 nutzap into a cashuB token the offline checks can read. Pure. */
export function nutzapToken(event: Event): string {
	const tag = (name: string) => event.tags.find((t) => t[0] === name)?.[1];
	const mint = tag('u');
	const unit = tag('unit') ?? 'sat';
	const proofs = event.tags.filter((t) => t[0] === 'proof').map((t) => t[1]);
	if (!mint || !proofs.length) throw new Error('Not a nutzap: no mint or no proofs');
	if (unit !== 'sat') throw new Error(`Only sat nutzaps are supported, not ${unit}`);
	// A Squirrel nutzap carries its gift memo in a tag; anyone else's comment becomes the message.
	const memo = tag(MEMO_TAG) ?? event.content.slice(0, MESSAGE_MAX);
	return getEncodedToken({ mint, unit: 'sat', proofs: deserializeProofs(proofs), memo });
}

export type Collected = { added: number; rejected: { eventId: string; reason: string }[] };

/**
 * Fetches nutzaps addressed to this creator and checks each one exactly like a scanned gift:
 * an accepted mint, locked to this phone's key alone, locktime ahead, a valid DLEQ proof, and
 * not already in the inbox. Passing ones join the inbox; the rest are reported and left alone.
 */
export async function collectNutzaps(): Promise<Collected> {
	const out: Collected = { added: 0, rejected: [] };
	const [creator, nostr, info] = await Promise.all([getCreatorKeys(), getSetting('creatorNostrKeys'), getSetting('creatorNutzapInfo')]);
	if (!navigator.onLine || !creator || !nostr || !info) return out;

	const pool = new SimplePool();
	let events: Event[];
	try {
		events = await pool.querySync(info.relays, { kinds: [9321], '#p': [nostr.pub], limit: 500 }, { maxWait: 8000 });
	} finally {
		pool.close(info.relays);
	}

	// The checks need mint keys on this phone. Fetch any accepted mint's keys that are missing, and
	// only those: caching a mint a sender picked would make it count as trusted.
	const missing = [];
	for (const mint of ACCEPTED_MINTS) if (!(await get('mintKeys', mint))) missing.push(mint);
	await Promise.allSettled(missing.map(refreshMintKeys));

	for (const event of events) {
		try {
			if (!verifyEvent(event)) throw new Error('Bad event signature');
			const v = await verifyGift(nutzapToken(event), creator.pub);
			if (v.ok && v.record) {
				await put('inbox', { ...v.record, via: 'nutzap', eventId: event.id });
				out.added++;
				continue;
			}
			// Already in the inbox (fetched before, or the same nut also came by QR): nothing to report.
			const failed = v.checks.filter((c) => !c.ok);
			if (failed.every((c) => c.id === 'duplicate')) continue;
			out.rejected.push({ eventId: event.id, reason: failed[0].detail });
		} catch (e) {
			out.rejected.push({ eventId: event.id, reason: (e as Error).message });
		}
	}
	return out;
}
