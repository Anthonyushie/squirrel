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
import { ReceiptScan } from './Receipt';

const STATUS_STYLE: Record<Gift['status'], string> = {
	created: 'bg-accent/15 text-accent',
	handed_over: 'bg-ok/15 text-ok',
	queued: 'bg-accent/15 text-accent',
	published: 'bg-ok/15 text-ok',
	received: 'bg-ok/15 text-ok',
	redeemed: 'bg-ok/15 text-ok',
};

/** One gift made by hand, or every nut streamed into one episode, which would otherwise flood the list. */
type Row = { key: string; gifts: Gift[]; status: Gift['status'] };

function toRows(gifts: Gift[]): Row[] {
	const out: Row[] = [];
	const streams = new Map<string, Row>();
	for (const g of gifts) {
		if (!g.streamed) {
			out.push({ key: g.id, gifts: [g], status: g.status });
			continue;
		}
		const key = `stream|${g.episodeGuid}`;
		const row = streams.get(key);
		if (row) row.gifts.push(g);
		else {
			const r = { key, gifts: [g], status: g.status };
			streams.set(key, r);
			out.push(r);
		}
	}
	// A stream is as far along as its slowest nut: one still queued means it's still sending.
	for (const r of streams.values()) {
		r.gifts.reverse();
		r.status = r.gifts.some((g) => g.status === 'queued') ? 'queued' : r.gifts.every((g) => g.status === 'redeemed') ? 'redeemed' : 'published';
	}
	return out;
}

/** Gifts the listener has made, newest first. */
export function Gifts({ refreshKey, onChange }: { refreshKey: number; onChange: () => void }) {
	const [rows, setRows] = useState<Row[]>([]);
	const [jars, setJars] = useState<Map<string, Jar>>(new Map());
	const [showing, setShowing] = useState<Gift>();
	const [scanning, setScanning] = useState(false);
	const [synced, setSynced] = useState(0);
	// Rows whose status changed since the last read: their pill flips over in place.
	const [flipped, setFlipped] = useState<Set<string>>(new Set());
	const statuses = useRef(new Map<string, Gift['status']>());

	useEffect(() => {
		(async () => {
			const next = toRows(await listGifts());
			const before = statuses.current;
			statuses.current = new Map(next.map((r) => [r.key, r.status]));
			const changed = next.filter((r) => before.has(r.key) && before.get(r.key) !== r.status).map((r) => r.key);
			if (changed.length) haptic('tick');
			setFlipped(new Set(changed));
			setRows(next);
			setJars(new Map((await list('jars')).map((j) => [j.id, j])));
		})();
	}, [refreshKey, synced]);

	// Re-read after the background nutzap sync changes a gift's status.
	useEffect(() => {
		const onChange = () => setSynced((n) => n + 1);
		window.addEventListener(CHANGED, onChange);
		return () => window.removeEventListener(CHANGED, onChange);
	}, []);

	if (!rows.length) return null;

	const pill = (r: Row) => (
		<span key={r.status} className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]} ${flipped.has(r.key) ? 'flip-in' : ''}`}>
			{STATUS_LABEL[r.status]}
		</span>
	);

	return (
		<section className="space-y-2">
			<h2 className="text-xl">Your gifts</h2>
			<ul>
				{rows.map((r) => {
					const g = r.gifts[0];
					const creator = jars.get(g.jarId)?.creatorName ?? 'creator';
					if (g.streamed) {
						const last = r.gifts[r.gifts.length - 1];
						const sendError = r.status === 'queued' ? r.gifts.find((s) => s.sendError)?.sendError : undefined;
						return (
							<li key={r.key} className="flex gap-3 border-b border-line py-3 last:border-0">
								<Nut amount={g.amount} className="mt-0.5 size-9 shrink-0" />
								<div className="min-w-0 flex-1 space-y-1.5">
									<div className="flex items-center justify-between gap-2">
										<p className="font-semibold">
											<span className="num">{r.gifts.reduce((a, s) => a + s.amount, 0)} sats</span> <span className="font-normal text-muted">streamed → {creator}</span>
										</p>
										{pill(r)}
									</div>
									<p className="text-sm">
										{r.gifts.length} {r.gifts.length === 1 ? 'nut' : 'nuts'} while you listened, {formatTime(g.seconds)}
										{r.gifts.length > 1 && `–${formatTime(last.seconds)}`}
									</p>
									<p className="truncate text-xs text-muted">{g.episodeTitle}</p>
									{sendError && <p className="text-xs text-bad">{sendError}</p>}
								</div>
							</li>
						);
					}
					return (
						<li key={r.key} className="flex gap-3 border-b border-line py-3 last:border-0">
							<Nut amount={g.amount} className="mt-0.5 size-9 shrink-0" />
							<div className="min-w-0 flex-1 space-y-1.5">
								<div className="flex items-center justify-between gap-2">
									<p className="font-semibold">
										<span className="num">{g.amount} sats</span> <span className="font-normal text-muted">→ {creator}</span>
									</p>
									{pill(r)}
								</div>
								{g.message && <p className="text-sm">&ldquo;{g.message}&rdquo;</p>}
								<p className="truncate text-xs text-muted">
									{formatTime(g.seconds)} · {g.episodeTitle}
								</p>
								{g.status === 'queued' && g.sendError && <p className="text-xs text-bad">{g.sendError}</p>}
								{g.reclaimed && <p className="text-xs text-muted">Not redeemed in time: taken back into your wallet.</p>}
								{g.receiptAt && g.status === 'received' && <p className="text-xs text-muted">{creator} signed for it with their key. Checked on this phone.</p>}
								{g.eventId && (
									<a className="inline-block py-1 text-xs font-semibold text-accent underline" href={eventLink(g.eventId)} target="_blank" rel="noreferrer">
										View nutzap on Nostr
									</a>
								)}
								{(g.status === 'created' || g.status === 'handed_over') && !g.reclaimed && (
									<div className="flex gap-2">
										<button className="btn-ghost min-h-10 flex-1 text-sm lg:flex-none" onClick={() => setShowing(g)}>
											Show QR again
										</button>
										<button className="btn-ghost min-h-10 flex-1 text-sm lg:flex-none" onClick={() => setScanning(true)}>
											Scan receipt
										</button>
									</div>
								)}
							</div>
						</li>
					);
				})}
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
					onReceipt={() => setScanning(true)}
				/>
			)}
			{scanning && (
				<ReceiptScan
					onChange={onChange}
					onClose={(received) => {
						setScanning(false);
						if (received) setShowing(undefined);
					}}
				/>
			)}
		</section>
	);
}
