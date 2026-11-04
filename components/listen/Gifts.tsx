'use client';

import { useEffect, useRef, useState } from 'react';
import { Nut } from '@/components/feel/Nut';
import { CHANGED } from '@/components/Sync';
import { list, type Gift, type Jar } from '@/lib/db';
import { formatTime } from '@/lib/feed';
import { haptic } from '@/lib/feel';
import { STATUS_LABEL, listGifts, setGiftStatus } from '@/lib/gift';
import { eventLink } from '@/lib/nutzap';
import { GiftQr } from './GiftSheet';

const STATUS_STYLE: Record<Gift['status'], string> = {
	created: 'bg-accent/15 text-accent',
	handed_over: 'bg-ok/15 text-ok',
	queued: 'bg-accent/15 text-accent',
	published: 'bg-ok/15 text-ok',
	redeemed: 'bg-ok/15 text-ok',
};

/** Gifts the listener has made, newest first. */
export function Gifts({ refreshKey, onChange }: { refreshKey: number; onChange: () => void }) {
	const [gifts, setGifts] = useState<Gift[]>([]);
	const [jars, setJars] = useState<Map<string, Jar>>(new Map());
	const [showing, setShowing] = useState<Gift>();
	const [synced, setSynced] = useState(0);
	// Gifts whose status changed since the last read: their pill flips over in place.
	const [flipped, setFlipped] = useState<Set<string>>(new Set());
	const statuses = useRef(new Map<string, Gift['status']>());

	useEffect(() => {
		(async () => {
			const next = await listGifts();
			const before = statuses.current;
			statuses.current = new Map(next.map((g) => [g.id, g.status]));
			const changed = next.filter((g) => before.has(g.id) && before.get(g.id) !== g.status).map((g) => g.id);
			if (changed.length) haptic('tick');
			setFlipped(new Set(changed));
			setGifts(next);
			setJars(new Map((await list('jars')).map((j) => [j.id, j])));
		})();
	}, [refreshKey, synced]);

	// Re-read after the background nutzap sync changes a gift's status.
	useEffect(() => {
		const onChange = () => setSynced((n) => n + 1);
		window.addEventListener(CHANGED, onChange);
		return () => window.removeEventListener(CHANGED, onChange);
	}, []);

	if (!gifts.length) return null;

	return (
		<section className="space-y-2">
			<h2 className="text-xl">Your gifts</h2>
			<ul>
				{gifts.map((g) => (
					<li key={g.id} className="flex gap-3 border-b border-line py-3 last:border-0">
						<Nut amount={g.amount} className="mt-0.5 size-9 shrink-0" />
						<div className="min-w-0 flex-1 space-y-1.5">
							<div className="flex items-center justify-between gap-2">
								<p className="font-semibold">
									<span className="num">{g.amount} sats</span> <span className="font-normal text-muted">→ {jars.get(g.jarId)?.creatorName ?? 'creator'}</span>
								</p>
								<span key={g.status} className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[g.status]} ${flipped.has(g.id) ? 'flip-in' : ''}`}>
									{STATUS_LABEL[g.status]}
								</span>
							</div>
							{g.message && <p className="text-sm">&ldquo;{g.message}&rdquo;</p>}
							<p className="truncate text-xs text-muted">
								{formatTime(g.seconds)} · {g.episodeTitle}
							</p>
							{g.status === 'queued' && g.sendError && <p className="text-xs text-bad">{g.sendError}</p>}
							{g.reclaimed && <p className="text-xs text-muted">Not redeemed in time: taken back into your wallet.</p>}
							{g.eventId && (
								<a className="inline-block py-1 text-xs font-semibold text-accent underline" href={eventLink(g.eventId)} target="_blank" rel="noreferrer">
									View nutzap on Nostr
								</a>
							)}
							{(g.status === 'created' || g.status === 'handed_over') && !g.reclaimed && (
								<button className="btn-ghost min-h-10 w-full text-sm lg:w-auto" onClick={() => setShowing(g)}>
									Show QR again
								</button>
							)}
						</div>
					</li>
				))}
			</ul>
			{showing && (
				<GiftQr
					gift={showing}
					creatorName={jars.get(showing.jarId)?.creatorName ?? 'the creator'}
					onDone={async () => {
						await setGiftStatus(showing.id, 'handed_over');
						setShowing(undefined);
						onChange();
					}}
				/>
			)}
		</section>
	);
}
