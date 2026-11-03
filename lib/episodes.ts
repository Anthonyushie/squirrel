import { del, get, put, setSetting, type EpisodeRecord } from './db';
import type { Episode, Show } from './feed';

/** Fetches the show through /api/feed and keeps it in IndexedDB for offline use. */
export async function refreshFeed() {
	const res = await fetch('/api/feed');
	const body = await res.json();
	if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
	const show = { ...(body as Show), fetchedAt: Date.now() };
	await setSetting('feed', show);
	return show;
}

/** Downloads episode audio into IndexedDB, reporting progress from 0 to 1. */
export async function downloadEpisode(ep: Episode, onProgress: (fraction: number) => void, signal?: AbortSignal) {
	// Ask the browser not to evict our storage; offline playback depends on it.
	await navigator.storage?.persist?.().catch(() => false);

	const res = await fetch(ep.audioUrl, { signal });
	if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
	const total = Number(res.headers.get('content-length')) || ep.audioBytes;

	const reader = res.body.getReader();
	const chunks: Uint8Array<ArrayBuffer>[] = [];
	let received = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.length;
		if (total) onProgress(Math.min(received / total, 1));
	}

	const record: EpisodeRecord = {
		guid: ep.guid,
		title: ep.title,
		audio: new Blob(chunks, { type: res.headers.get('content-type') ?? 'audio/mpeg' }),
		bytes: received,
		duration: ep.duration,
		image: ep.image,
		savedAt: Date.now(),
	};
	await put('episodes', record);
	return record;
}

export const getSavedEpisode = (guid: string) => get('episodes', guid);
export const deleteSavedEpisode = (guid: string) => del('episodes', guid);
