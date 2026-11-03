/** One entry from a Podcasting 2.0 JSON chapters file (podcast:chapters). */
export type Chapter = { start: number; title: string };

export type Episode = {
	guid: string;
	title: string;
	published: string; // ISO date
	duration: number; // seconds
	audioUrl: string;
	audioBytes: number;
	image?: string;
	number?: number;
	chapters?: Chapter[];
};

export type Show = {
	title: string;
	image?: string;
	episodes: Episode[];
};

export const DEFAULT_FEED_URL = 'https://serve.podhome.fm/rss/e8df0b13-47de-544a-99b7-ec7cbd960a16';

/** "00:43:53", "43:53" or "2633" -> seconds */
export function parseDuration(value: unknown): number {
	if (value == null) return 0;
	const parts = String(value).split(':').map(Number);
	if (parts.some(Number.isNaN)) return 0;
	return parts.reduce((total, part) => total * 60 + part, 0);
}

/** The chapter playing at `seconds`, if the episode has chapters. */
export function chapterAt(chapters: Chapter[] | undefined, seconds: number): Chapter | undefined {
	return chapters?.findLast((c) => c.start <= seconds);
}

export function formatTime(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const ss = String(s % 60).padStart(2, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function formatBytes(bytes: number): string {
	if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
	if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} kB`;
	return `${bytes} B`;
}
