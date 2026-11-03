'use client';

import { useEffect, useState } from 'react';
import { CHANGED } from '@/components/Sync';
import { list, type Gift, type Jar } from '@/lib/db';
import { formatTime } from '@/lib/feed';
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

	useEffect(() => {
		(async () => {
			setGifts(await listGifts());
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
		<section className="space-y-3">
			<h2 className="text-lg font-bold">Your gifts</h2>
			<ul className="space-y-2">
				{gifts.map((g) => (
					<li key={g.id} className="card space-y-2 py-3">
						<div className="flex items-center justify-between gap-2">
							<p className="font-semibold tabular-nums">
								{g.amount} sats <span className="font-normal text-muted">→ {jars.get(g.jarId)?.creatorName ?? 'creator'}</span>
							</p>
							<span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[g.status]}`}>{STATUS_LABEL[g.status]}</span>
						</div>
						{g.message && <p className="text-sm">&ldquo;{g.message}&rdquo;</p>}
						<p className="truncate text-xs text-muted">
							{formatTime(g.seconds)} · {g.episodeTitle}
						</p>
						{g.status === 'queued' && g.sendError && <p className="text-xs text-bad">{g.sendError}</p>}
						{g.reclaimed && <p className="text-xs text-muted">Not redeemed in time: taken back into your wallet.</p>}
						{g.eventId && (
							<a className="text-xs font-semibold text-accent underline" href={eventLink(g.eventId)} target="_blank" rel="noreferrer">
								View nutzap on Nostr
							</a>
						)}
						{(g.status === 'created' || g.status === 'handed_over') && !g.reclaimed && (
							<button className="btn-ghost min-h-10 w-full text-sm" onClick={() => setShowing(g)}>
								Show QR again
							</button>
						)}
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
