// Remote delivery: queued gifts go out as NIP-61 nutzaps (kind 9321) once the listener is online.
import { getDecodedToken, getTokenMetadata, serializeProofs } from '@cashu/cashu-ts';
import { hexToBytes } from '@noble/hashes/utils.js';
import { finalizeEvent, nip19, type VerifiedEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { get, list, put, type Gift, type Jar } from './db';
import { formatTime } from './feed';
import { ensureNostrKeys, normalizeLockKey } from './keys';
import { cachedWallet } from './mint';
import { DEFAULT_RELAYS, lookupNutzapInfo, npubToHex } from './nostr';

/** Builds and signs a kind 9321 nutzap for one gift. Pure: no network. */
export function buildNutzapEvent(opts: { token: string; keysetIds: string[]; recipientHex: string; content: string; senderPrivHex: string }): VerifiedEvent {
	const { mint, unit } = getTokenMetadata(opts.token);
	const { proofs } = getDecodedToken(opts.token, opts.keysetIds);
	return finalizeEvent(
		{
			kind: 9321,
			created_at: Math.floor(Date.now() / 1000),
			content: opts.content,
			tags: [...serializeProofs(proofs).map((p) => ['proof', p]), ['unit', unit || 'sat'], ['u', mint], ['p', opts.recipientHex]],
		},
		hexToBytes(opts.senderPrivHex),
	);
}

export function nutzapContent(gift: Gift) {
	const where = `at ${formatTime(gift.seconds)} in ${gift.episodeTitle}`;
	return gift.message ? `${gift.message} (${where})` : `Gift from Squirrel, ${where}`;
}

export const eventLink = (id: string) => `https://njump.me/${nip19.neventEncode({ id })}`;

/**
 * Publishes every queued gift. Before sending, re-reads the creator's kind 10019 and refuses
 * unless the gift's mint is one they list (exact URL) and the nut is locked to their listed key,
 * as NIP-61 requires; otherwise the creator might never be able to claim it.
 */
export async function publishQueued(): Promise<{ sent: number; failed: number }> {
	if (!navigator.onLine) return { sent: 0, failed: 0 };
	const queued = (await list('gifts')).filter((g) => g.status === 'queued');
	if (!queued.length) return { sent: 0, failed: 0 };

	const nostr = await ensureNostrKeys();
	const infoCache = new Map<string, Awaited<ReturnType<typeof lookupNutzapInfo>>>();
	let sent = 0;
	let failed = 0;

	for (const gift of queued) {
		const fail = async (sendError: string) => {
			failed++;
			await put('gifts', { ...gift, sendError });
		};
		const jar: Jar | undefined = await get('jars', gift.jarId);
		if (!jar?.creatorNpub) {
			await fail('This creator has no npub; hand it over by QR instead.');
			continue;
		}
		try {
			if (!infoCache.has(jar.creatorNpub)) infoCache.set(jar.creatorNpub, await lookupNutzapInfo(jar.creatorNpub));
			const info = infoCache.get(jar.creatorNpub)!;
			if (!info.found || !info.lockKey) {
				await fail(`${jar.creatorName} hasn't published nutzap info (kind 10019).`);
				continue;
			}
			if (!info.mints.includes(jar.mintUrl)) {
				await fail(`${jar.creatorName} doesn't accept nutzaps on ${new URL(jar.mintUrl).host}. Not sent, so it can't get lost.`);
				continue;
			}
			if (normalizeLockKey(info.lockKey) !== jar.lockKey) {
				await fail(`${jar.creatorName}'s nutzap key changed since this jar was filled. Not sent.`);
				continue;
			}

			const wallet = await cachedWallet(jar.mintUrl);
			const event = buildNutzapEvent({
				token: gift.token,
				keysetIds: wallet.keyChain.getKeysets().map((k) => k.id),
				recipientHex: npubToHex(jar.creatorNpub),
				content: nutzapContent(gift),
				senderPrivHex: nostr.priv,
			});

			const relays = info.relays.length ? info.relays : DEFAULT_RELAYS;
			const pool = new SimplePool();
			try {
				const results = await Promise.allSettled(pool.publish(relays, event, { maxWait: 8000 }));
				if (!results.some((r) => r.status === 'fulfilled')) throw new Error('No relay accepted the event');
			} finally {
				pool.close(relays);
			}

			await put('gifts', { ...gift, status: 'published', eventId: event.id, sendError: undefined });
			sent++;
		} catch (e) {
			await fail((e as Error).message);
		}
	}
	return { sent, failed };
}
