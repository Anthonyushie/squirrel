'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getSetting, savedEpisodeGuids, setSetting, type EpisodeRecord } from '@/lib/db';
import { deleteSavedEpisode, downloadEpisode, getSavedEpisode } from '@/lib/episodes';
import { formatBytes, formatTime, type Episode, type Show } from '@/lib/feed';
import { useOnline } from '@/lib/hooks';

type FeedState = { show?: Show & { fetchedAt?: number }; error?: string; loading: boolean };

export function Listen() {
	const online = useOnline();
	const [feed, setFeed] = useState<FeedState>({ loading: true });
	const [saved, setSaved] = useState<Set<string>>(new Set());
	const [progress, setProgress] = useState<Record<string, number>>({});
	const [playing, setPlaying] = useState<EpisodeRecord>();

	// Last feed from IndexedDB first (works offline), then refresh from the network.
	useEffect(() => {
		let live = true;
		(async () => {
			const cached = await getSetting('feed');
			setSaved(await savedEpisodeGuids());
			if (live && cached) setFeed({ show: cached, loading: navigator.onLine });
			if (!navigator.onLine) return setFeed((f) => ({ ...f, loading: false }));
			try {
				const res = await fetch('/api/feed');
				const body = await res.json();
				if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
				const show = { ...(body as Show), fetchedAt: Date.now() };
				await setSetting('feed', show);
				if (live) setFeed({ show, loading: false });
			} catch (e) {
				if (live) setFeed((f) => ({ ...f, loading: false, error: (e as Error).message }));
			}
		})();
		return () => {
			live = false;
		};
	}, []);

	async function download(ep: Episode) {
		setProgress((p) => ({ ...p, [ep.guid]: 0 }));
		try {
			await downloadEpisode(ep, (f) => setProgress((p) => ({ ...p, [ep.guid]: f })));
			setSaved(await savedEpisodeGuids());
		} catch (e) {
			alert(`Download failed: ${(e as Error).message}`);
		} finally {
			setProgress((p) => {
				const rest = { ...p };
				delete rest[ep.guid];
				return rest;
			});
		}
	}

	async function remove(ep: Episode) {
		if (playing?.guid === ep.guid) setPlaying(undefined);
		await deleteSavedEpisode(ep.guid);
		setSaved(await savedEpisodeGuids());
	}

	const show = feed.show;
	const episodes = show?.episodes ?? [];
	const savedEpisodes = episodes.filter((e) => saved.has(e.guid));

	return (
		<div className="space-y-6">
			{show && (
				<div className="flex items-center gap-3">
					{show.image && <img src={show.image} alt="" className="size-16 rounded-xl bg-line object-cover" />}
					<div>
						<h1 className="text-xl leading-tight font-bold">{show.title}</h1>
						<p className="text-sm text-muted">
							{savedEpisodes.length} saved for offline · {episodes.length} episodes
						</p>
					</div>
				</div>
			)}

			{playing && <Player episode={playing} />}

			{feed.loading && !show && <p className="text-muted">Loading episodes…</p>}
			{!feed.loading && !show && (
				<div className="card text-center">
					<p className="font-semibold">No episodes yet</p>
					<p className="text-sm text-muted">
						{online ? `Couldn't load the feed${feed.error ? `: ${feed.error}` : ''}.` : 'Go online once to load the show.'}
					</p>
				</div>
			)}
			{feed.error && show && <p className="text-sm text-muted">Showing the saved episode list ({feed.error}).</p>}

			<ul className="space-y-3">
				{episodes.map((ep) => (
					<EpisodeRow
						key={ep.guid}
						episode={ep}
						saved={saved.has(ep.guid)}
						progress={progress[ep.guid]}
						online={online}
						active={playing?.guid === ep.guid}
						onDownload={() => download(ep)}
						onRemove={() => remove(ep)}
						onPlay={async () => setPlaying(await getSavedEpisode(ep.guid))}
					/>
				))}
			</ul>
		</div>
	);
}

function EpisodeRow(props: {
	episode: Episode;
	saved: boolean;
	progress?: number;
	online: boolean;
	active: boolean;
	onDownload: () => void;
	onRemove: () => void;
	onPlay: () => void;
}) {
	const { episode: ep, saved, progress, online, active } = props;
	const downloading = progress !== undefined;
	return (
		<li className={`card space-y-3 ${active ? 'border-accent' : ''} ${!saved && !online ? 'opacity-50' : ''}`}>
			<div>
				<p className="leading-snug font-semibold">{ep.title}</p>
				<p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
					<span>{new Date(ep.published).toLocaleDateString()}</span>
					<span>·</span>
					<span>{formatTime(ep.duration)}</span>
					{ep.audioBytes > 0 && (
						<>
							<span>·</span>
							<span>{formatBytes(ep.audioBytes)}</span>
						</>
					)}
					{saved && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok">Saved</span>}
				</p>
			</div>
			{downloading ? (
				<div className="space-y-1" aria-live="polite">
					<div className="h-2 overflow-hidden rounded-full bg-line">
						<div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
					</div>
					<p className="text-xs text-muted">Downloading {Math.round(progress * 100)}%</p>
				</div>
			) : saved ? (
				<div className="flex gap-2">
					<button className="btn-primary flex-1" onClick={props.onPlay}>
						{active ? 'Playing' : 'Play'}
					</button>
					<button className="btn-ghost" onClick={props.onRemove} aria-label={`Remove ${ep.title} from device`}>
						Remove
					</button>
				</div>
			) : (
				<button className="btn-ghost w-full" onClick={props.onDownload} disabled={!online}>
					Download for offline
				</button>
			)}
		</li>
	);
}

function Player({ episode }: { episode: EpisodeRecord }) {
	const audio = useRef<HTMLAudioElement>(null);

	// Play from the stored Blob, never from the network.
	const src = useMemo(() => URL.createObjectURL(episode.audio), [episode]);
	useEffect(() => () => URL.revokeObjectURL(src), [src]);

	return (
		<div className="card sticky top-16 z-10 space-y-3 shadow-lg">
			<p className="text-xs font-semibold tracking-wide text-accent uppercase">Now playing · from device</p>
			<p className="leading-snug font-semibold">{episode.title}</p>
			{src && <audio ref={audio} src={src} controls autoPlay className="w-full" />}
		</div>
	);
}
