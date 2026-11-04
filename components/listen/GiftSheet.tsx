'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Nut } from '@/components/feel/Nut';
import { CHANGED, QUEUED } from '@/components/Sync';
import { Notice, Overlay, Sheet } from '@/components/ui';
import { get, list, type Gift, type Jar } from '@/lib/db';
import { formatTime } from '@/lib/feed';
import { haptic, playMoment, reducedMotion, sfx } from '@/lib/feel';
import { MESSAGE_MAX, availableSizes, createGift, creatorJars, setGiftStatus } from '@/lib/gift';
import { useOnline } from '@/lib/hooks';
import { eventLink, recipientNpub } from '@/lib/nutzap';
import { NUT_SIZES } from '@/lib/wallet';
import { ReceiptScan } from './Receipt';

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
	const [npubs, setNpubs] = useState<Map<string, string | undefined>>(new Map());
	const [showQr, setShowQr] = useState(false);
	const [scanningReceipt, setScanningReceipt] = useState(false);
	const [error, setError] = useState('');
	const online = useOnline();
	const cardNuts = useRef(new Map<number, SVGSVGElement>());
	const flyFrom = useRef<DOMRect>(undefined);
	const landing = useRef<SVGSVGElement>(null);

	useEffect(() => {
		list('jars').then(async (js) => {
			setJars(js);
			const groups = creatorJars(js).filter((g) => availableSizes(g.jars).size > 0);
			setGroupKey(groups[0]?.key);
			// Where each creator can be nutzapped, so Send later knows whether a gift can go remotely.
			setNpubs(new Map(await Promise.all(creatorJars(js).map(async (g) => [g.key, await recipientNpub(g.jars[0], js)] as const))));
		});
	}, []);

	// The nut picked from its card flies up and lands in the middle of the gift.
	useLayoutEffect(() => {
		const el = landing.current;
		const from = flyFrom.current;
		flyFrom.current = undefined;
		if (!gift || !el || !from) return;
		const play = playMoment('gift-create');
		if (play === 'still') return;
		const to = el.getBoundingClientRect();
		const dx = from.left + from.width / 2 - (to.left + to.width / 2);
		const dy = from.top + from.height / 2 - (to.top + to.height / 2);
		const s = from.width / to.width;
		el.animate(
			[
				{ transform: `translate(${dx}px, ${dy}px) scale(${s})` },
				{ transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 80}px) scale(${(s + 1) / 2}) rotate(-14deg)`, offset: 0.55 },
				{ transform: 'none' },
			],
			{ duration: play === 'full' ? 640 : 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
		).finished.then(
			() => {
				sfx.pop();
				haptic('land');
			},
			() => {},
		);
	}, [gift?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- once per new gift

	// Once queued, follow the background send so the sheet shows how it went.
	const followId = gift?.delivery === 'queue' ? gift.id : undefined;
	useEffect(() => {
		if (!followId) return;
		const onChanged = () => get('gifts', followId).then((g) => g && setGift(g));
		window.addEventListener(CHANGED, onChanged);
		return () => window.removeEventListener(CHANGED, onChanged);
	}, [followId]);

	if (!jars) return null;

	const groups = creatorJars(jars);
	const group = groups.find((g) => g.key === groupKey);
	const sizes = group ? availableSizes(group.jars) : new Map<number, number>();
	const canQueue = !!groupKey && !!npubs.get(groupKey);

	async function create() {
		if (!group || !size) return;
		setError('');
		try {
			flyFrom.current = cardNuts.current.get(size)?.getBoundingClientRect();
			const g = await createGift({ groupKey: group.key, size, message: message.trim(), episodeGuid: episode.guid, episodeTitle: episode.title, seconds });
			sfx.whoosh();
			setGift(g);
			onChange();
		} catch (e) {
			setError((e as Error).message);
			sfx.thud();
			haptic('error');
		}
	}

	async function deliver(how: 'qr' | 'queue') {
		if (!gift) return;
		haptic('send');
		if (how === 'qr') {
			sfx.whoosh();
			const el = landing.current;
			if (el && !reducedMotion()) {
				await el
					.animate([{ transform: 'none' }, { transform: 'translateY(-50vh) scale(0.5) rotate(-30deg)', opacity: 0 }], { duration: 300, easing: 'cubic-bezier(0.7, 0, 0.84, 0)', fill: 'forwards' })
					.finished.catch(() => {});
			}
			setGift(await setGiftStatus(gift.id, 'created', { delivery: 'qr' }));
			setShowQr(true);
		} else {
			setGift(await setGiftStatus(gift.id, 'queued', { delivery: 'queue' }));
			onChange();
			window.dispatchEvent(new Event(QUEUED));
		}
	}

	if (showQr && gift) {
		return (
			<>
				<GiftQr
					gift={gift}
					creatorName={group?.name ?? 'the creator'}
					onDone={async () => {
						await setGiftStatus(gift.id, 'handed_over');
						onChange();
						onClose();
					}}
					onReceipt={() => setScanningReceipt(true)}
				/>
				{scanningReceipt && (
					<ReceiptScan
						onChange={onChange}
						onClose={(received) => {
							setScanningReceipt(false);
							if (received) onClose();
						}}
					/>
				)}
			</>
		);
	}

	return (
		<Sheet title={gift ? 'Gift ready' : 'Gift a nut'} onClose={onClose}>
			{!groups.length ? (
				<Notice tone="warn">No nuts stashed yet. Fill a jar while you&apos;re online, then gift from anywhere.</Notice>
			) : gift ? (
				<div className="space-y-4">
					<div className="overflow-hidden rounded-3xl bg-background px-4 pt-5 pb-4 text-center">
						<Nut
							ref={landing}
							amount={gift.amount}
							className={`mx-auto size-24 ${gift.delivery === 'queue' ? '[animation:drop-away_700ms_var(--ease-in)_both]' : ''}`}
						/>
						<p className="num mt-2 text-5xl leading-none font-semibold">
							{gift.amount} <span className="text-xl font-medium">sats</span>
						</p>
						<p className="mt-2 text-sm text-muted">
							for {group?.name} · at {formatTime(gift.seconds)}
						</p>
						{gift.message && <p className="mt-3 text-lg text-balance">&ldquo;{gift.message}&rdquo;</p>}
					</div>
					{gift.delivery === 'queue' ? (
						<>
							<div key={`${gift.status}|${gift.sendError ?? ''}`} className="flip-in">
								{gift.status === 'redeemed' ? (
									<Notice tone="ok">{group?.name} has redeemed it.</Notice>
								) : gift.status === 'published' ? (
									<Notice tone="ok">Sent to {group?.name} as a nutzap on Nostr.</Notice>
								) : gift.sendError ? (
									<Notice tone="bad">{gift.sendError}</Notice>
								) : online ? (
									<Notice>Sending to {group?.name} as a nutzap on Nostr…</Notice>
								) : (
									<Notice tone="ok">In your outbox. It goes out as a nutzap on Nostr the next time you&apos;re online.</Notice>
								)}
							</div>
							{gift.eventId && (
								<a className="block py-1 text-center text-sm font-semibold text-accent underline" href={eventLink(gift.eventId)} target="_blank" rel="noreferrer">
									View nutzap on Nostr
								</a>
							)}
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
							{!canQueue && <p className="text-center text-xs text-muted">No npub for this creator yet, so this one goes by QR. To send remotely, tap Publish nutzap info on the creator&apos;s Creator tab.</p>}
						</>
					)}
				</div>
			) : (
				<div className="space-y-4">
					{groups.length > 1 && (
						<div className="flex flex-wrap gap-2">
							{groups.map((g) => (
								<button
									key={g.key}
									className={`min-h-11 rounded-full border px-3 py-2 text-sm ${g.key === groupKey ? 'border-accent bg-accent/10 font-semibold' : 'border-line'}`}
									onClick={() => {
										setGroupKey(g.key);
										setSize(undefined);
									}}
								>
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
							const on = size === s;
							return (
								<button
									key={s}
									role="radio"
									aria-checked={on}
									aria-label={`${s} sats, ${left} left`}
									disabled={!left}
									onClick={() => {
										setSize(s);
										haptic('tick');
									}}
									className={`btn h-auto flex-col gap-1 rounded-3xl border py-3 ${on ? 'border-accent bg-accent/10' : 'border-line bg-background'}`}
								>
									<Nut
										ref={(el) => {
											if (el) cardNuts.current.set(s, el);
										}}
										amount={s}
										className={`size-12 transition-transform duration-300 ${on ? '-translate-y-1.5 scale-110 drop-shadow-[0_8px_5px_var(--shadow)]' : ''}`}
									/>
									<span className="num text-2xl leading-none">{s}</span>
									<span className="font-sans text-xs font-normal opacity-80">{left} left</span>
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
						<textarea className="field min-h-20 resize-none py-2" maxLength={MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Danke für die Folge!" />
					</label>
					{error && <Notice tone="bad">{error}</Notice>}
					<button className="btn-primary w-full text-lg" onClick={create} disabled={!size}>
						{size ? `Gift ${size} sats` : 'Pick a size'}
					</button>
				</div>
			)}
		</Sheet>
	);
}

/** Full-screen, high-contrast QR for the creator to scan. Nothing ever sits on the code itself. */
export function GiftQr({ gift, creatorName, onDone, onReceipt }: { gift: Gift; creatorName: string; onDone: () => void; onReceipt: () => void }) {
	return (
		<Overlay>
			<div
				className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-white px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-black [animation:fade-in_200ms_ease-out_both]"
				role="dialog"
				aria-modal="true"
				aria-label="Gift QR code"
			>
				<div className="flex items-center gap-3 text-left">
					<Nut amount={gift.amount} className="pop-in size-12" />
					<div>
						<p className="num text-3xl leading-none font-semibold">{gift.amount} sats</p>
						<p className="mt-1 text-sm text-neutral-600">for {creatorName} · scan with Squirrel</p>
					</div>
				</div>
				<div className="w-full max-w-sm [animation:rise-in_480ms_120ms_var(--ease-out)_both]">
					<QRCodeSVG value={gift.token} level="L" marginSize={2} className="h-auto w-full" size={512} />
				</div>
				<div className="w-full max-w-sm space-y-2 text-center">
					<p className="pb-1 text-sm text-neutral-600">Turn your screen brightness up for a quick scan.</p>
					<button
						className="btn w-full bg-black text-white"
						onClick={() => {
							haptic('success');
							onDone();
						}}
					>
						Done, they scanned it
					</button>
					<button className="btn w-full text-sm text-neutral-700" onClick={onReceipt}>
						Scan their receipt
					</button>
				</div>
			</div>
		</Overlay>
	);
}
