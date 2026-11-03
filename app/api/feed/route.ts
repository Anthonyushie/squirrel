import { cacheLife } from 'next/cache';
import { XMLParser } from 'fast-xml-parser';
import { DEFAULT_FEED_URL, parseDuration, type Chapter, type Episode, type Show } from '@/lib/feed';

const MAX_EPISODES = 50;
const CHAPTERS_TIMEOUT_MS = 5000;

// Fetches the podcast RSS server-side (the browser would hit CORS) and returns compact JSON.
export async function GET() {
	try {
		return Response.json(await getShow(process.env.FEED_URL ?? DEFAULT_FEED_URL));
	} catch (e) {
		return Response.json({ error: (e as Error).message }, { status: 502 });
	}
}

async function getShow(feedUrl: string): Promise<Show> {
	'use cache';
	cacheLife('hours');

	const res = await fetch(feedUrl);
	if (!res.ok) throw new Error(`feed returned HTTP ${res.status}`);

	const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(await res.text());
	const channel = xml.rss.channel;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- parsed RSS has no schema
	const items: any[] = [channel.item ?? []].flat();

	const episodes: Episode[] = await Promise.all(
		items
			.filter((item) => item.enclosure?.url)
			.slice(0, MAX_EPISODES)
			.map(async (item) => ({
				guid: String(typeof item.guid === 'object' ? item.guid['#text'] : item.guid ?? item.enclosure.url),
				title: String(item.title),
				published: new Date(item.pubDate).toISOString(),
				duration: parseDuration(item['itunes:duration']),
				audioUrl: item.enclosure.url,
				audioBytes: Number(item.enclosure.length) || 0,
				image: item['itunes:image']?.href,
				number: Number(item['podcast:episode'] ?? item['itunes:episode']) || undefined,
				chapters: await getChapters(item['podcast:chapters']?.url),
			})),
	);

	return {
		title: String(channel.title),
		image: channel.image?.url ?? channel['itunes:image']?.href,
		episodes,
	};
}

// Chapters live in a separate JSON file per episode. Inlining them here means they're cached
// with the feed, so the creator's moments map can name chapters offline. A missing or slow
// file just leaves the episode without chapters.
async function getChapters(url: unknown): Promise<Chapter[] | undefined> {
	if (typeof url !== 'string' || !url) return undefined;
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(CHAPTERS_TIMEOUT_MS) });
		if (!res.ok) return undefined;
		const body = await res.json();
		const chapters: Chapter[] = [body?.chapters ?? []]
			.flat()
			// Chapters with toc: false are hidden markers in the Podcasting 2.0 spec, not titled sections.
			.filter((c) => c?.title && c.toc !== false && Number.isFinite(Number(c.startTime)))
			.map((c) => ({ start: Number(c.startTime), title: String(c.title) }))
			.sort((a, b) => a.start - b.start);
		return chapters.length ? chapters : undefined;
	} catch {
		return undefined;
	}
}
