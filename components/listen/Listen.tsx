'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, DownloadIcon, ForwardIcon, PauseIcon, PlayIcon, ReplayIcon, TrashIcon } from '@/components/feel/icons';
import { Nut, NutChip } from '@/components/feel/Nut';
import { Sheet } from '@/components/ui';
import { getSetting, savedEpisodeGuids, type EpisodeRecord } from '@/lib/db';
import { deleteSavedEpisode, downloadEpisode, getSavedEpisode, refreshFeed } from '@/lib/episodes';
import { formatBytes, formatTime, type Episode, type Show } from '@/lib/feed';
import { haptic } from '@/lib/feel';
import { useOnline } from '@/lib/hooks';
import { GiftSheet } from './GiftSheet';
import { Gifts } from './Gifts';
import { Onboarding } from './Onboarding';
import { Stash } from './Stash';

type FeedState = { show?: Show & { fetchedAt?: number }; error?: string; loading: boolean };

export function Listen() {
	const online = useOnline();
	const [feed, setFeed] = useState<FeedState>({ loading: true });
	const [saved, setSaved] = useState<Set<string>>(new Set());
	const [fresh, setFresh] = useState<Set<string>>(new Set());
	const [progress, setProgress] = useState<Record<string, number>>({});
	const [playing, setPlaying] = useState<EpisodeRecord>();
	const [paused, setPaused] = useState(true);
	// Bumped after a gift so the jar counts and gift list re-read IndexedDB.
	const [stashVersion, setStashVersion] = useState(0);
	const bump = () => setStashVersion((v) => v + 1);

	// Last feed from IndexedDB first (works offline), then refresh from the network.
	useEffect(() => {
		let live = true;
		(async () => {
			const cached = await getSetting('feed');
			setSaved(await savedEpisodeGuids());
			if (live && cached) setFeed({ show: cached, loading: navigator.onLine });
			if (!navigator.onLine) return setFeed((f) => ({ ...f, loading: false }));
			try {
				const show = await refreshFeed();
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
			setFresh((s) => new Set([...s, ep.guid]));
			haptic('land');
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

	// Desktop: the jar shelf stays pinned on the left while the gifts and episodes scroll on the right.
	return (
		<div className="space-y-7 lg:grid lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-start lg:gap-x-14 lg:gap-y-8 lg:space-y-0">
			<Onboarding refreshKey={stashVersion + saved.size} className="lg:col-span-2" />
			<div className="tall:sticky tall:top-22">
				<Stash refreshKey={stashVersion} onChange={bump} />
			</div>

			<div className="space-y-7">
				<Gifts refreshKey={stashVersion} onChange={bump} />

				<section className="space-y-2">
					{show && (
						<div className="flex items-center gap-3">
							{show.image && <img src={show.image} alt="" className="size-16 rounded-2xl bg-line object-cover" />}
							<div className="min-w-0">
								<h1 className="text-2xl leading-tight">{show.title}</h1>
								<p className="text-sm text-muted">
									{savedEpisodes.length} saved for offline · {episodes.length} episodes
								</p>
							</div>
						</div>
					)}

					{feed.loading && !show && <EpisodeSkeleton />}
					{!feed.loading && !show && (
						<div className="card text-center">
							<p className="font-semibold">No episodes yet</p>
							<p className="text-sm text-muted">
								{online ? `Couldn't load the feed${feed.error ? `: ${feed.error}` : ''}.` : 'Go online once to load the show.'}
							</p>
						</div>
					)}
					{feed.error && show && <p className="text-sm text-muted">Showing the saved episode list ({feed.error}).</p>}

					<ul>
						{episodes.map((ep) => (
							<EpisodeRow
								key={ep.guid}
								episode={ep}
								saved={saved.has(ep.guid)}
								fresh={fresh.has(ep.guid)}
								progress={progress[ep.guid]}
								online={online}
								active={playing?.guid === ep.guid}
								playing={playing?.guid === ep.guid && !paused}
								onDownload={() => download(ep)}
								onRemove={() => remove(ep)}
								onPlay={async () => setPlaying(await getSavedEpisode(ep.guid))}
							/>
						))}
					</ul>
				</section>

				{playing && (
					<>
						{/* Room for the docked player above the tab bar. */}
						<div aria-hidden className="h-20" />
						<Player episode={playing} artwork={playing.image ?? show?.image} onGift={bump} onPausedChange={setPaused} />
					</>
				)}
			</div>
		</div>
	);
}

function EpisodeSkeleton() {
	return (
		<ul aria-label="Loading episodes" className="space-y-4 pt-2">
			{[0, 1, 2].map((i) => (
				<li key={i} className="flex items-center gap-3">
					<div className="flex-1 space-y-2">
						<div className="skeleton h-4 w-4/5 rounded-full" />
						<div className="skeleton h-3 w-1/2 rounded-full" />
					</div>
					<div className="skeleton size-12 rounded-full" />
				</li>
			))}
		</ul>
	);
}

function EpisodeRow(props: {
	episode: Episode;
	saved: boolean;
	fresh: boolean;
	progress?: number;
	online: boolean;
	active: boolean;
	playing: boolean;
	onDownload: () => void;
	onRemove: () => void;
	onPlay: () => void;
}) {
	const { episode: ep, saved, progress, online, active } = props;
	const downloading = progress !== undefined;
	const pct = Math.round((progress ?? 0) * 100);
	return (
		<li className={`flex items-center gap-3 border-b border-line py-3.5 last:border-0 ${!saved && !online ? 'opacity-50' : ''}`}>
			<div className="min-w-0 flex-1">
				<p className={`leading-snug font-semibold ${active ? 'text-accent' : ''}`}>{ep.title}</p>
				<p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
					<span>{new Date(ep.published).toLocaleDateString()}</span>
					<span>·</span>
					<span>{formatTime(ep.duration)}</span>
					{ep.audioBytes > 0 && (
						<>
							<span>·</span>
							<span>{formatBytes(ep.audioBytes)}</span>
						</>
					)}
					{saved && <span className={`rounded-full bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok ${props.fresh ? 'pop-in' : ''}`}>Saved</span>}
				</p>
				{downloading && (
					<div className="mt-3 space-y-1" aria-live="polite">
						<div className="relative h-2 rounded-full bg-line">
							<div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
							{/* An acorn rolls along with the download. */}
							<Nut
								amount={32}
								className="absolute -top-2 size-6 transition-[left,transform] duration-300"
								style={{ left: `calc(${pct}% - 12px)`, transform: `rotate(${pct * 7.2}deg)` }}
							/>
						</div>
						<p className="text-xs text-muted">Downloading {pct}%</p>
					</div>
				)}
			</div>
			{!downloading && (
				<div className="flex shrink-0 items-center gap-1.5">
					{saved ? (
						<>
							<button className="btn size-11 p-0 text-muted" onClick={props.onRemove} aria-label={`Remove ${ep.title} from device`}>
								<TrashIcon className="size-5" />
							</button>
							{active ? (
								<span className="flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent" aria-label="Now playing">
									<Equalizer moving={props.playing} />
								</span>
							) : (
								<button className="btn-primary size-12 rounded-full p-0" onClick={props.onPlay} aria-label={`Play ${ep.title}`}>
									<PlayIcon className="ml-0.5 size-5" />
								</button>
							)}
						</>
					) : (
						<button className="btn-ghost size-12 rounded-full p-0" onClick={props.onDownload} disabled={!online} aria-label={`Download ${ep.title} for offline`}>
							<DownloadIcon className="size-5" />
						</button>
					)}
				</div>
			)}
		</li>
	);
}

function Equalizer({ moving }: { moving: boolean }) {
	return (
		<span aria-hidden className="flex h-4 items-end gap-0.5">
			{[0, 1, 2].map((i) => (
				<span
					key={i}
					className="w-1 origin-bottom rounded-full bg-current"
					style={{ height: '100%', animation: moving ? `eq 900ms ${i * 150}ms ease-in-out infinite alternate` : 'none', transform: moving ? undefined : `scaleY(${[0.5, 0.9, 0.65][i]})` }}
				/>
			))}
		</span>
	);
}

/** Docked above the tab bar, Gift in thumb reach. Tap the title to open the full player. */
function Player({ episode, artwork, onGift, onPausedChange }: { episode: EpisodeRecord; artwork?: string; onGift: () => void; onPausedChange: (paused: boolean) => void }) {
	const audio = useRef<HTMLAudioElement>(null);
	const [gifting, setGifting] = useState<number>();
	const [expanded, setExpanded] = useState(false);
	const [paused, setPaused] = useState(true);
	const [time, setTime] = useState(0);
	const [duration, setDuration] = useState(episode.duration);

	// Play from the stored Blob, never from the network.
	const src = useMemo(() => URL.createObjectURL(episode.audio), [episode]);
	useEffect(() => () => URL.revokeObjectURL(src), [src]);

	function gift() {
		audio.current?.pause();
		haptic('tap');
		setExpanded(false);
		setGifting(audio.current?.currentTime ?? 0);
	}

	function toggle() {
		const a = audio.current;
		if (!a) return;
		if (a.paused) a.play().catch(() => {});
		else a.pause();
	}

	function seek(to: number) {
		const a = audio.current;
		if (a) a.currentTime = Math.max(0, Math.min(duration || a.duration || 0, to));
	}

	const pct = duration ? Math.min(100, (time / duration) * 100) : 0;
	const playButton = (big?: boolean) => (
		<button
			className={`btn shrink-0 rounded-full bg-foreground p-0 text-background ${big ? 'size-16' : 'size-11'}`}
			onClick={toggle}
			aria-label={paused ? 'Play' : 'Pause'}
		>
			{paused ? <PlayIcon className={big ? 'ml-1 size-7' : 'ml-0.5 size-5'} /> : <PauseIcon className={big ? 'size-7' : 'size-5'} />}
		</button>
	);
	const giftButton = (big?: boolean) => (
		<button className={`btn-primary shrink-0 ${big ? 'w-full text-xl' : 'px-3.5 lg:px-5'}`} onClick={gift}>
			<NutChip amount={32} className={big ? 'size-9' : 'size-7'} />
			Gift
		</button>
	);

	return (
		<>
			<audio
				ref={audio}
				src={src}
				autoPlay
				onPlay={() => {
					setPaused(false);
					onPausedChange(false);
				}}
				onPause={() => {
					setPaused(true);
					onPausedChange(true);
				}}
				onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
				onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
			/>
			{/* Desktop: no tab bar, so it docks to the window's bottom edge with seek and artwork inline. */}
			<div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-3 pb-2 [animation:rise-in_420ms_var(--ease-out)_both] lg:bottom-0 lg:px-8 lg:pb-5">
				<div className="mx-auto flex max-w-lg items-center gap-3 rounded-3xl border border-line bg-card p-2 shadow-[0_14px_32px_-14px_var(--shadow)] lg:max-w-6xl lg:gap-4 lg:pr-2.5">
					<span className="flex shrink-0 items-center gap-1">
						<button className="btn size-11 rounded-full p-0 text-muted max-lg:hidden" onClick={() => seek(time - 15)} aria-label="Back 15 seconds">
							<ReplayIcon className="size-5" />
						</button>
						{playButton()}
						<button className="btn size-11 rounded-full p-0 text-muted max-lg:hidden" onClick={() => seek(time + 30)} aria-label="Forward 30 seconds">
							<ForwardIcon className="size-5" />
						</button>
					</span>
					{artwork && <img src={artwork} alt="" className="size-11 shrink-0 rounded-xl bg-line object-cover max-lg:hidden" />}
					<button className="min-w-0 flex-1 py-1 text-left" onClick={() => setExpanded(true)} aria-label={`Open player: ${episode.title}`}>
						<p className="truncate text-sm font-semibold">{episode.title}</p>
						<div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
							<div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
						</div>
						<p className="num mt-1 text-xs text-muted">
							{formatTime(time)} / {formatTime(duration)}
						</p>
					</button>
					{giftButton()}
				</div>
			</div>

			{expanded && (
				<Sheet title="Now playing" onClose={() => setExpanded(false)}>
					<div className="space-y-5 pb-2">
						{artwork && <img src={artwork} alt="" className="mx-auto aspect-square w-3/5 rounded-3xl bg-line object-cover shadow-[0_20px_40px_-24px_var(--shadow)]" />}
						<div className="text-center">
							<p className="text-lg leading-snug font-semibold text-balance">{episode.title}</p>
							<p className="mt-1 text-sm text-muted">Playing from your device, no signal needed</p>
						</div>
						<div>
							<input
								type="range"
								min={0}
								max={Math.max(1, Math.floor(duration))}
								step={1}
								value={Math.floor(time)}
								onChange={(e) => seek(Number(e.target.value))}
								aria-label="Position"
								className="w-full"
							/>
							<div className="num flex justify-between text-xs text-muted">
								<span>{formatTime(time)}</span>
								<span>-{formatTime(Math.max(0, duration - time))}</span>
							</div>
						</div>
						<div className="flex items-center justify-center gap-6">
							<button className="btn size-12 rounded-full p-0 text-muted" onClick={() => seek(time - 15)} aria-label="Back 15 seconds">
								<ReplayIcon className="size-6" />
							</button>
							{playButton(true)}
							<button className="btn size-12 rounded-full p-0 text-muted" onClick={() => seek(time + 30)} aria-label="Forward 30 seconds">
								<ForwardIcon className="size-6" />
							</button>
						</div>
						{giftButton(true)}
						<button className="btn mx-auto flex text-sm text-muted" onClick={() => setExpanded(false)}>
							<ChevronDownIcon className="size-4" /> Minimise
						</button>
					</div>
				</Sheet>
			)}

			{gifting !== undefined && <GiftSheet episode={episode} seconds={gifting} onClose={() => setGifting(undefined)} onChange={onGift} />}
		</>
	);
}
