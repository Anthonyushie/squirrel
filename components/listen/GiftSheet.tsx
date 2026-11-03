'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Notice, Overlay, Sheet } from '@/components/ui';
import { list, type Gift, type Jar } from '@/lib/db';
import { formatTime } from '@/lib/feed';
import { MESSAGE_MAX, availableSizes, createGift, creatorJars, setGiftStatus } from '@/lib/gift';
import { NUT_SIZES } from '@/lib/wallet';

type Props = {
	episode: { guid: string; title: string };
	seconds: number;
	onClose: () => void;
	onChange: () => void;
};

/** Compose a gift from a jar nut, then hand it over by QR or queue it. No network calls. */
export function GiftSheet({ episode, seconds, onClose, onChange }: Props) {
	const [jars, setJars] = useState<Jar[]>();
	const [groupKey, setGroupKey] = useState<string>();
	const [size, setSize] = useState<number>();
	const [message, setMessage] = useState('');
	const [gift, setGift] = useState<Gift>();
	const [showQr, setShowQr] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		list('jars').then((js) => {
			setJars(js);
			const groups = creatorJars(js).filter((g) => availableSizes(g.jars).size > 0);
			setGroupKey(groups[0]?.key);
		});
	}, []);

	if (!jars) return null;

	const groups = creatorJars(jars);
	const group = groups.find((g) => g.key === groupKey);
	const sizes = group ? availableSizes(group.jars) : new Map<number, number>();
	const canQueue = !!group?.jars[0].creatorNpub;

	async function create() {
		if (!group || !size) return;
		setError('');
		try {
			const g = await createGift({ groupKey: group.key, size, message: message.trim(), episodeGuid: episode.guid, episodeTitle: episode.title, seconds });
			setGift(g);
			onChange();
		} catch (e) {
			setError((e as Error).message);
		}
	}

	async function deliver(how: 'qr' | 'queue') {
		if (!gift) return;
		if (how === 'qr') {
			setGift(await setGiftStatus(gift.id, 'created', { delivery: 'qr' }));
			setShowQr(true);
		} else {
			setGift(await setGiftStatus(gift.id, 'queued', { delivery: 'queue' }));
			onChange();
		}
	}

	if (showQr && gift) {
		return (
			<GiftQr
				gift={gift}
				creatorName={group?.name ?? 'the creator'}
				onDone={async () => {
					await setGiftStatus(gift.id, 'handed_over');
					onChange();
					onClose();
				}}
			/>
		);
	}

	return (
		<Sheet title={gift ? 'Gift ready' : 'Gift a nut'} onClose={onClose}>
			{!groups.length ? (
				<Notice tone="warn">No nuts stashed yet. Fill a jar while you&apos;re online, then gift from anywhere.</Notice>
			) : gift ? (
				<div className="space-y-4">
					<div className="rounded-2xl bg-background p-4 text-center">
						<p className="text-4xl font-bold tabular-nums">{gift.amount} sats</p>
						<p className="mt-1 text-sm text-muted">
							for {group?.name} · at {formatTime(gift.seconds)}
						</p>
						{gift.message && <p className="mt-3 text-balance">&ldquo;{gift.message}&rdquo;</p>}
					</div>
					{gift.status === 'queued' ? (
						<>
							<Notice tone="ok">Will send when you&apos;re online, as a nutzap on Nostr.</Notice>
							<button className="btn-ghost w-full" onClick={onClose}>
								Done
							</button>
						</>
					) : (
						<>
							<button className="btn-primary w-full" onClick={() => deliver('qr')}>
								Show QR (in person)
							</button>
							<button className="btn-ghost w-full" onClick={() => deliver('queue')} disabled={!canQueue}>
								Send later (when online)
							</button>
							{!canQueue && <p className="text-center text-xs text-muted">This creator has no npub, so gifts go by QR only.</p>}
						</>
					)}
				</div>
			) : (
				<div className="space-y-4">
					{groups.length > 1 && (
						<div className="flex flex-wrap gap-2">
							{groups.map((g) => (
								<button key={g.key} className={`rounded-full border px-3 py-2 text-sm ${g.key === groupKey ? 'border-accent bg-accent/10 font-semibold' : 'border-line'}`} onClick={() => { setGroupKey(g.key); setSize(undefined); }}>
									{g.name}
								</button>
							))}
						</div>
					)}
					<p className="text-sm text-muted">
						To <span className="font-semibold text-foreground">{group?.name}</span> · at {formatTime(seconds)} in &ldquo;{episode.title}&rdquo;
					</p>
					<div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Gift size">
						{NUT_SIZES.map((s) => {
							const left = sizes.get(s) ?? 0;
							return (
								<button key={s} role="radio" aria-checked={size === s} aria-label={`${s} sats, ${left} left`} disabled={!left} onClick={() => setSize(s)} className={`btn flex-col gap-0 border py-3 ${size === s ? 'border-accent bg-accent text-accent-foreground' : 'border-line bg-background'}`}>
									<span className="text-xl tabular-nums">{s}</span>
									<span className="text-xs font-normal opacity-80">{left} left</span>
								</button>
							);
						})}
					</div>
					<label className="block">
						<span className="label flex justify-between">
							<span>Message (optional)</span>
							<span className="tabular-nums">
								{message.length}/{MESSAGE_MAX}
							</span>
						</span>
						<textarea className="field min-h-20 py-2" maxLength={MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Danke für die Folge!" />
					</label>
					{error && <Notice tone="bad">{error}</Notice>}
					<button className="btn-primary w-full" onClick={create} disabled={!size}>
						{size ? `Gift ${size} sats` : 'Pick a size'}
					</button>
				</div>
			)}
		</Sheet>
	);
}

/** Full-screen, high-contrast QR for the creator to scan. */
export function GiftQr({ gift, creatorName, onDone }: { gift: Gift; creatorName: string; onDone: () => void }) {
	return (
		<Overlay>
			<div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-white px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-black" role="dialog" aria-modal="true" aria-label="Gift QR code">
				<div className="text-center">
					<p className="text-3xl font-bold tabular-nums">{gift.amount} sats</p>
					<p className="text-sm text-neutral-600">for {creatorName} · scan with Squirrel</p>
				</div>
				<div className="w-full max-w-sm">
					<QRCodeSVG value={gift.token} level="L" marginSize={2} className="h-auto w-full" size={512} />
				</div>
				<div className="w-full max-w-sm space-y-3 text-center">
					<p className="text-sm text-neutral-600">Turn your screen brightness up for a quick scan.</p>
					<button className="btn w-full bg-black text-white" onClick={onDone}>
						Done, they scanned it
					</button>
				</div>
			</div>
		</Overlay>
	);
}
