// The creator's moments map: where in each episode listeners reached for a gift. Pure, no network.
import type { InboxGift } from './db';
import { chapterAt, formatTime, type Episode } from './feed';

/** Timeline slots per episode, whatever its length. */
export const BUCKETS = 32;

/** A gift that carries an episode and a moment in it (any Squirrel gift does). */
export type PlacedGift = InboxGift & { episodeRef: string; seconds: number };

export type Bucket = { start: number; end: number; gifts: PlacedGift[]; sats: number };

export type EpisodeMoments = {
	ref: string;
	/** From this phone's copy of the feed; missing if the feed hasn't loaded or is older than the episode. */
	episode?: Episode;
	duration: number;
	/** Gifts made by hand, in episode order. */
	gifts: PlacedGift[];
	sats: number;
	/** Nuts streamed while listeners played the episode, in episode order: how far people listened. */
	streamed: PlacedGift[];
	streamedSats: number;
	buckets: Bucket[];
	/** Index of the bucket with the most sats. */
	peak: number;
};

const placed = (g: InboxGift): g is PlacedGift => !!g.episodeRef && g.seconds !== undefined;
const sum = (gifts: PlacedGift[]) => gifts.reduce((a, g) => a + g.amount, 0);
const latest = (m: EpisodeMoments) => Math.max(...[...m.gifts, ...m.streamed].map((g) => g.receivedAt));

/** Groups inbox gifts by episode and buckets them along its timeline, most recently gifted episode first. */
export function episodeMoments(inbox: InboxGift[], episodes: Map<string, Episode>): EpisodeMoments[] {
	const byRef = new Map<string, PlacedGift[]>();
	for (const g of inbox.filter(placed)) byRef.set(g.episodeRef, [...(byRef.get(g.episodeRef) ?? []), g]);

	return [...byRef.entries()]
		.map(([ref, unsorted]) => {
			const episode = episodes.get(ref);
			const all = [...unsorted].sort((a, b) => a.seconds - b.seconds);
			// Streamed nuts land every few minutes whatever is said, so they stay out of the peaks.
			const gifts = all.filter((g) => !g.streamed);
			const streamed = all.filter((g) => g.streamed);
			const last = all[all.length - 1].seconds;
			// Without a duration from the feed, stretch the timeline a little past the last gift.
			const duration = Math.max(episode?.duration || Math.ceil(last * 1.1), last + 1, 60);
			const size = duration / BUCKETS;

			const buckets: Bucket[] = Array.from({ length: BUCKETS }, (_, i) => ({ start: i * size, end: (i + 1) * size, gifts: [], sats: 0 }));
			for (const g of gifts) {
				const b = buckets[Math.min(BUCKETS - 1, Math.floor(g.seconds / size))];
				b.gifts.push(g);
				b.sats += g.amount;
			}
			// Most sats wins; ties go to more gifts, then to the earlier moment.
			const peak = buckets.reduce((best, b, i) => {
				const top = buckets[best];
				return b.sats > top.sats || (b.sats === top.sats && b.gifts.length > top.gifts.length) ? i : best;
			}, 0);

			return { ref, episode, duration, gifts, sats: sum(gifts), streamed, streamedSats: sum(streamed), buckets, peak };
		})
		.sort((a, b) => latest(b) - latest(a));
}

/** Index of the bucket that holds `seconds`. */
export const bucketAt = (m: EpisodeMoments, seconds: number) => Math.min(BUCKETS - 1, Math.floor(seconds / (m.duration / BUCKETS)));

/** The bucket with gifts closest to `index`, within `reach` slots, so a near-miss tap still lands. */
export function nearestWithGifts(buckets: Bucket[], index: number, reach = 2) {
	for (let d = 0; d <= reach; d++) {
		if (buckets[index - d]?.gifts.length) return index - d;
		if (buckets[index + d]?.gifts.length) return index + d;
	}
	return undefined;
}

/** Plain-text list for show notes, in episode order, like a boostagram read-out. */
export function onAirText(m: EpisodeMoments) {
	const lines = m.gifts.map((g) => {
		const chapter = chapterAt(m.episode?.chapters, g.seconds);
		const head = [formatTime(g.seconds), `${g.amount} sats`, chapter?.title].filter(Boolean).join(' · ');
		return g.message ? `${head}\n"${g.message}"` : head;
	});
	const stream = m.streamed.length ? [`Plus ${m.streamedSats} sats streamed by listeners while they played the episode`] : [];
	return [`Squirrel gifts · ${m.episode?.title ?? 'Episode'}`, `${m.gifts.length} gifts · ${m.sats} sats`, ...lines, ...stream].join('\n\n');
}
