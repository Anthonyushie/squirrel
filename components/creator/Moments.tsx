'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { PlayIcon } from '@/components/feel/icons';
import { Sheet } from '@/components/ui';
import type { InboxGift } from '@/lib/db';
import { getSavedEpisode } from '@/lib/episodes';
import { chapterAt, formatTime, type Episode } from '@/lib/feed';
import { BUCKETS, bucketAt, episodeMoments, nearestWithGifts, onAirText, type EpisodeMoments } from '@/lib/moments';

/** Seconds of audio before a gift: listeners tap Gift just after the moment that moved them. */
const LEAD_IN = 15;

export function Moments({ inbox, episodes, online }: { inbox: InboxGift[]; episodes: Map<string, Episode>; online: boolean }) {
	const moments = useMemo(() => episodeMoments(inbox, episodes), [inbox, episodes]);

	// One moment plays at a time across episode cards.
	useEffect(() => {
		const onPlay = (e: Event) => document.querySelectorAll('audio').forEach((a) => a !== e.target && a.pause());
		document.addEventListener('play', onPlay, true);
		return () => document.removeEventListener('play', onPlay, true);
	}, []);

	if (!moments.length) return null;
	return (
		<section className="space-y-3">
			<div>
				<h2 className="text-xl">Moments</h2>
				<p className="text-sm text-muted">Where in each episode listeners reached for a gift. Tap a bar to hear that moment.</p>
			</div>
			{moments.map((m) => (
				<MomentsCard key={m.ref} m={m} online={online} />
			))}
		</section>
	);
}

function MomentsCard({ m, online }: { m: EpisodeMoments; online: boolean }) {
	// A moment in seconds rather than a bar index: the timeline rescales once the feed brings the
	// episode's real duration, and the same moment must stay selected.
	const [selectedAt, setSelectedAt] = useState<number>();
	const [onAir, setOnAir] = useState(false);
	const [src, setSrc] = useState<string>();
	const [from, setFrom] = useState<number>();
	const audio = useRef<HTMLAudioElement>(null);
	const guid = m.episode?.guid;
	const audioUrl = m.episode?.audioUrl;

	// Audio saved on this phone plays offline; otherwise stream the episode while online.
	useEffect(() => {
		let live = true;
		let url: string | undefined;
		(async () => {
			const saved = guid ? await getSavedEpisode(guid) : undefined;
			if (!live) return;
			if (saved) setSrc((url = URL.createObjectURL(saved.audio)));
			else setSrc(online ? audioUrl : undefined);
		})();
		return () => {
			live = false;
			if (url) URL.revokeObjectURL(url);
		};
	}, [guid, audioUrl, online]);

	function play(seconds: number) {
		const a = audio.current;
		if (!a) return;
		const t = Math.max(0, seconds - LEAD_IN);
		// Before metadata loads this sets the start position, so playback begins at the moment.
		a.currentTime = t;
		setFrom(t);
		a.play().catch(() => {});
	}

	function choose(i: number) {
		const first = m.buckets[i].gifts[0].seconds;
		setSelectedAt(first);
		play(first);
	}

	// Bars are narrow on a phone: a tap in a gap picks the nearest bar with gifts.
	function onStripClick(e: MouseEvent<HTMLDivElement>) {
		if ((e.target as HTMLElement).closest('button')) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const i = nearestWithGifts(m.buckets, Math.floor(((e.clientX - rect.left) / rect.width) * BUCKETS));
		if (i !== undefined) choose(i);
	}

	const max = Math.max(...m.buckets.map((b) => b.sats));
	const chapters = m.episode?.chapters ?? [];
	const current = selectedAt === undefined ? m.peak : bucketAt(m, selectedAt);
	const bucket = m.buckets[current];
	const chapter = chapterAt(chapters, bucket.gifts[0]?.seconds ?? bucket.start);
	const pct = (s: number) => `${Math.min(100, (s / m.duration) * 100)}%`;

	return (
		<div className="card space-y-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="leading-snug font-semibold">{m.episode?.title ?? `Episode ${m.ref}`}</p>
					<p className="text-sm text-muted tabular-nums">
						{m.gifts.length} {m.gifts.length === 1 ? 'gift' : 'gifts'} · {m.sats} sats
						{m.streamed.length > 0 && ` · ${m.streamedSats} streamed`}
					</p>
				</div>
				<button className="btn-ghost min-h-11 shrink-0 px-3 text-sm" onClick={() => setOnAir(true)}>
					Read on air
				</button>
			</div>

			<div>
				{m.gifts.length > 0 && (
					<div className="relative h-24" onClick={onStripClick}>
						{/* Alternating bands mark the chapters behind the bars. */}
						{chapters.map((c, i) =>
							i % 2 ? (
								<span key={c.start} aria-hidden className="absolute inset-y-0 rounded-sm bg-foreground/5" style={{ left: pct(c.start), width: `calc(${pct(chapters[i + 1]?.start ?? m.duration)} - ${pct(c.start)})` }} />
							) : null,
						)}
						<div role="group" aria-label="Gifts along the episode" className="relative flex h-full items-end gap-px">
							{m.buckets.map((b, i) =>
								b.gifts.length ? (
									<button
										key={i}
										className="flex h-full flex-1 items-end"
										aria-pressed={i === current}
										aria-label={`${formatTime(b.start)} to ${formatTime(b.end)}: ${b.gifts.length} ${b.gifts.length === 1 ? 'gift' : 'gifts'}, ${b.sats} sats`}
										onClick={() => choose(i)}
									>
										{/* Bars grow up from the baseline the first time the map appears. */}
										<span
											className={`w-full origin-bottom rounded-t-sm transition-colors ${i === current ? 'bg-foreground' : 'bg-accent'}`}
											style={{ height: `${Math.max(10, (b.sats / max) * 100)}%`, animation: `grow-up 640ms var(--ease-out) ${i * 16}ms both` }}
										/>
									</button>
								) : (
									<span key={i} aria-hidden className="flex h-full flex-1 items-end">
										<span className="h-0.5 w-full bg-line" />
									</span>
								),
							)}
						</div>
					</div>
				)}
				{/* Streamed nuts: one dot per stretch someone listened, so the lane shows how far people got. */}
				{m.streamed.length > 0 && (
					<div className="relative mt-2 h-3" role="img" aria-label={`${m.streamedSats} sats streamed while listening, ${m.streamed.length} nuts, from ${formatTime(m.streamed[0].seconds)} to ${formatTime(m.streamed[m.streamed.length - 1].seconds)}`}>
						<span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
						{m.streamed.map((g) => (
							<span key={g.id} className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ok ring-2 ring-card" style={{ left: pct(g.seconds) }} />
						))}
					</div>
				)}
				<div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
					<span>0:00</span>
					<span>{formatTime(m.duration)}</span>
				</div>
				{m.streamed.length > 0 && (
					<p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
						<span aria-hidden className="size-2 rounded-full bg-ok" />
						{m.streamedSats} sats streamed while people listened
					</p>
				)}
			</div>

			{m.gifts.length > 0 && (
				<div className="space-y-2 rounded-xl bg-background p-3" aria-live="polite">
					<div className="flex items-baseline justify-between gap-2">
						<p className="text-sm font-semibold tabular-nums">
							{current === m.peak && <span className="text-accent">Peak · </span>}
							{formatTime(bucket.start)}–{formatTime(bucket.end)}
						</p>
						<p className="shrink-0 text-sm text-muted tabular-nums">{bucket.sats} sats</p>
					</div>
					{chapter && <p className="text-sm text-muted">{chapter.title}</p>}
					<ul>
						{bucket.gifts.map((g) => (
							<li key={g.id}>
								<button className="flex min-h-11 w-full items-center gap-3 text-left" onClick={() => play(g.seconds)} disabled={!src} aria-label={`Play from ${formatTime(g.seconds)}`}>
									<span className="flex shrink-0 items-center gap-1 font-semibold text-accent tabular-nums">
										<PlayIcon className="size-3.5" /> {formatTime(g.seconds)}
									</span>
									<span className="min-w-0 flex-1 text-sm">{g.message ? <>&ldquo;{g.message}&rdquo;</> : <span className="text-muted">No message</span>}</span>
									<span className="shrink-0 text-sm text-muted tabular-nums">{g.amount}</span>
								</button>
							</li>
						))}
					</ul>
				</div>
			)}

			{src ? (
				<div className="space-y-1">
					<audio ref={audio} src={src} controls preload="none" className="w-full" />
					{from !== undefined && <p className="text-xs text-muted">Playing from {formatTime(from)}, a few seconds before the gift.</p>}
				</div>
			) : (
				<p className="text-xs text-muted">
					{m.episode ? 'Go online, or save this episode on Listen, to hear these moments.' : 'Go online once to load this episode from the feed.'}
				</p>
			)}

			{onAir && <OnAir m={m} onClose={() => setOnAir(false)} />}
		</div>
	);
}

/** Every gift for one episode in the order it happened, large enough to read out on the show. */
function OnAir({ m, onClose }: { m: EpisodeMoments; onClose: () => void }) {
	const [copied, setCopied] = useState(false);
	return (
		<Sheet title="Read on air" onClose={onClose}>
			<div className="space-y-5">
				<p className="text-sm text-muted">
					{m.episode?.title ?? `Episode ${m.ref}`} · {m.gifts.length} {m.gifts.length === 1 ? 'gift' : 'gifts'} · {m.sats} sats, in episode order
				</p>
				<ol className="space-y-5">
					{m.gifts.map((g) => {
						const chapter = chapterAt(m.episode?.chapters, g.seconds);
						return (
							<li key={g.id} className="grid grid-cols-[3.5rem_1fr] gap-3">
								<p className="pt-1 text-sm font-semibold text-muted tabular-nums">{formatTime(g.seconds)}</p>
								<div className="space-y-1">
									<p className="text-xl leading-snug font-semibold text-balance">{g.message ? <>&ldquo;{g.message}&rdquo;</> : <span className="text-muted">No message</span>}</p>
									<p className="text-sm text-muted">
										<span className="font-semibold text-accent tabular-nums">{g.amount} sats</span>
										{chapter && ` · ${chapter.title}`}
									</p>
								</div>
							</li>
						);
					})}
				</ol>
				{m.streamed.length > 0 && <p className="text-sm text-muted">Plus {m.streamedSats} sats streamed by listeners while they played the episode.</p>}
				<button
					className="btn-ghost w-full"
					onClick={async () => {
						await navigator.clipboard.writeText(onAirText(m));
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					}}
				>
					{copied ? 'Copied' : 'Copy for show notes'}
				</button>
			</div>
		</Sheet>
	);
}
