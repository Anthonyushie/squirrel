'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckIcon, CloseIcon, ScanIcon } from '@/components/feel/icons';
import { Jar } from '@/components/feel/Jar';
import { Nut, NutChip } from '@/components/feel/Nut';
import { Rolling } from '@/components/feel/Rolling';
import { Squirrel, usePose, type Pose } from '@/components/feel/Squirrel';
import { CopyText, Notice, Overlay, Sheet } from '@/components/ui';
import { cacheAcceptedMints, listInbox, redeemAll, redeemedTokens } from '@/lib/creator';
import { getSetting, list, put, type InboxGift, type MintKeysRecord } from '@/lib/db';
import { refreshFeed } from '@/lib/episodes';
import { chapterAt, formatTime, type Episode } from '@/lib/feed';
import { haptic, playMoment, sfx, type Play } from '@/lib/feel';
import { episodeRef } from '@/lib/gift';
import { useOnline } from '@/lib/hooks';
import { getCreatorKeys, keypairFromPriv, newP2PKKeypair, setCreatorKeys } from '@/lib/keys';
import { mintHost } from '@/lib/settings';
import { verifyGift, type Verification } from '@/lib/verify';
import { Moments } from './Moments';
import { Receive } from './Receive';
import { Scanner } from './Scanner';

export function Creator() {
	const online = useOnline();
	const [keys, setKeys] = useState<{ priv: string; pub: string } | null>();
	const [inbox, setInbox] = useState<InboxGift[]>([]);
	const [mints, setMints] = useState<MintKeysRecord[]>([]);
	const [episodes, setEpisodes] = useState<Map<string, Episode>>(new Map());
	const [scanning, setScanning] = useState(false);
	const [pasting, setPasting] = useState(false);
	const [result, setResult] = useState<Verification>();
	const [redeeming, setRedeeming] = useState<string>();
	const [version, setVersion] = useState(0);
	const [pose, play] = usePose();

	useEffect(() => {
		(async () => {
			// Read everything first and set it together, so the hoard renders with its nuts already in.
			const [k, gifts, mintKeys, feed] = await Promise.all([getCreatorKeys(), listInbox(), list('mintKeys'), getSetting('feed')]);
			setKeys(k ?? null);
			setInbox(gifts);
			setMints(mintKeys);
			// Map memo episode refs back to episodes using this phone's copy of the feed, if any.
			setEpisodes(new Map((feed?.episodes ?? []).map((e) => [episodeRef(e.guid), e])));
		})();
	}, [version]);

	// While online, cache accepted mints' keys and the feed, so gifts verify and the moments map
	// can name episodes and chapters in airplane mode later.
	useEffect(() => {
		Promise.allSettled([cacheAcceptedMints(), navigator.onLine && refreshFeed()]).then(() => setVersion((v) => v + 1));
	}, []);

	const onScan = useCallback(
		async (text: string) => {
			setScanning(false);
			setPasting(false);
			if (!keys) return;
			const v = await verifyGift(text, keys.pub);
			if (v.ok && v.record) await put('inbox', v.record);
			setResult(v);
			setVersion((n) => n + 1);
		},
		[keys],
	);

	async function redeem() {
		setRedeeming('Starting…');
		try {
			// Re-read after each swap, so nuts hop from one jar to the other as they're redeemed.
			const results = await redeemAll((done, total) => {
				setRedeeming(`Redeeming ${done} of ${total}…`);
				setVersion((n) => n + 1);
			});
			const ok = results.filter((r) => r.ok).length;
			setRedeeming(results.length ? `Redeemed ${ok} of ${results.length}.` : 'Nothing to redeem.');
			if (ok) {
				sfx.chime();
				haptic('success');
				play('cheer', 1100);
			}
		} catch (e) {
			setRedeeming((e as Error).message);
			sfx.thud();
		}
		setVersion((n) => n + 1);
	}

	if (keys === undefined)
		return (
			<p className="flex items-center gap-2 text-muted">
				<Nut amount={32} className="rock size-5" /> Loading…
			</p>
		);
	if (keys === null) return <KeySetup onDone={(kp) => setKeys(kp)} />;

	const unredeemed = inbox.filter((g) => !g.redeemed && !g.redeemError);
	const redeemed = inbox.filter((g) => g.redeemed);
	const received = inbox.reduce((a, g) => a + g.amount, 0);
	const tokens = redeemedTokens(inbox);
	const busy = !!redeeming && redeeming.endsWith('…');

	// Desktop: scanning and the hoard stay pinned on the left; moments, inbox and keys scroll on the right.
	return (
		<div className="space-y-7 lg:grid lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-start lg:gap-x-14 lg:gap-y-8 lg:space-y-0">
			<div className="lg:col-span-2">
				<h1 className="text-3xl">Creator</h1>
				<p className="text-sm text-muted">Scan gifts here, even in airplane mode.</p>
			</div>

			<div className="space-y-7 tall:sticky tall:top-22">
				<div className="space-y-2">
					<button className="btn-primary w-full py-6 text-2xl" onClick={() => setScanning(true)}>
						<ScanIcon className="size-7" />
						Scan gift
					</button>
					<button className="btn-ghost w-full text-sm" onClick={() => setPasting(true)}>
						Paste a gift instead
					</button>
				</div>

				<section className="space-y-3" aria-label="Your hoard">
					<div className="flex items-end justify-between">
						<h2 className="text-xl">Hoard</h2>
						<p className="text-sm text-muted">
							<Rolling value={received} className="font-semibold text-foreground" /> sats received
						</p>
					</div>
					{/* Two jars on one plank: what's waiting to be redeemed, with the squirrel guarding it, and what's done. */}
					<div className="grid grid-cols-2 items-end gap-x-4 px-3">
						<div className="pt-[24%]">
							<Jar nuts={unredeemed.map((g) => g.amount)} moment="hoard" keeper={<Squirrel nested pose={pose} goggles={!online} />} className="w-full" />
						</div>
						<Jar nuts={redeemed.map((g) => g.amount)} moment="redeem" className="w-full" />
						<div aria-hidden className="relative col-span-2 -mx-3 h-3.5 rounded-lg bg-shelf shadow-[0_8px_14px_-8px_var(--shadow)]">
							<div className="absolute inset-x-0 bottom-0 h-1.5 rounded-b-lg bg-[var(--shelf-edge)]" />
						</div>
						<HoardLabel title="To redeem" gifts={unredeemed} />
						<HoardLabel title="Redeemed" gifts={redeemed} />
					</div>
					{inbox.length > 0 && (
						<>
							<button className="btn-primary w-full" onClick={redeem} disabled={!online || !unredeemed.length || busy} aria-busy={busy}>
								{busy ? (
									<>
										<NutChip amount={32} spin className="size-6" /> {redeeming}
									</>
								) : unredeemed.length ? (
									`Redeem all (${unredeemed.reduce((a, g) => a + g.amount, 0)} sats)`
								) : (
									'All redeemed'
								)}
							</button>
							{!online && unredeemed.length > 0 && <p className="text-center text-xs text-muted">Redeeming needs a connection. Verified gifts are safe until then.</p>}
							{redeeming && !busy && <Notice tone="info">{redeeming}</Notice>}
						</>
					)}
				</section>
			</div>

			<div className="space-y-7">
				<Moments inbox={inbox} episodes={episodes} online={online} />

				<section className="space-y-2">
					<h2 className="text-xl">Inbox</h2>
					{inbox.length === 0 ? (
						<p className="rounded-3xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No gifts yet. Scan a listener&apos;s gift QR to verify it offline, or publish your nutzap info to receive gifts remotely.</p>
					) : (
						<ul>
							{inbox.map((g) => (
								<li key={g.id} className="flex gap-3 border-b border-line py-3 last:border-0">
									<Nut amount={g.amount} className="mt-0.5 size-9 shrink-0" />
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex items-center justify-between gap-2">
											<p className="num font-semibold">{g.amount} sats</p>
											<span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${g.redeemed ? 'bg-ok/15 text-ok' : g.redeemError ? 'bg-bad/15 text-bad' : 'bg-accent/15 text-accent'}`}>
												{g.redeemed ? 'Redeemed' : g.redeemError ? 'Failed' : g.via === 'nutzap' ? 'Verified nutzap' : 'Verified offline'}
											</span>
										</div>
										{g.message && <p className="text-sm">&ldquo;{g.message}&rdquo;</p>}
										<p className="truncate text-xs text-muted">
											{g.seconds !== undefined && `at ${formatTime(g.seconds)}`}
											{g.episodeRef && episodes.get(g.episodeRef) ? ` · ${episodes.get(g.episodeRef)!.title}` : ''} · {mintHost(g.mintUrl)}
										</p>
										{g.redeemError && <p className="text-xs text-bad">{g.redeemError}</p>}
									</div>
								</li>
							))}
						</ul>
					)}
				</section>

				{tokens.length > 0 && (
					<section className="card space-y-3">
						<h2 className="text-lg">Your redeemed sats</h2>
						<p className="text-sm text-muted">Unlocked and yours. Paste into any Cashu wallet to move them.</p>
						{tokens.map((t) => (
							<div key={t.mintUrl}>
								<span className="label">
									{t.amount} sats · {mintHost(t.mintUrl)}
								</span>
								<CopyText value={t.token} label="redeemed token" />
							</div>
						))}
					</section>
				)}

				<Receive lockKey={keys.pub} online={online} onChange={() => setVersion((n) => n + 1)} />

				<section className="card space-y-3">
					<h2 className="text-lg">Your lock key</h2>
					<p className="text-sm text-muted">For gifts by QR only, a listener can paste this into Settings instead of looking up your npub.</p>
					<CopyText value={keys.pub} label="lock key" />
					<p className="text-xs text-muted">
						Accepted mints, keys on this phone:{' '}
						{mints.length ? mints.map((m) => mintHost(m.mintUrl)).join(', ') : online ? 'loading…' : 'none yet: go online once'}
					</p>
					<Notice tone="warn">Demo key store: the private key lives in this browser and isn&apos;t backed up.</Notice>
				</section>
			</div>

			{scanning && <Scanner onResult={onScan} onClose={() => setScanning(false)} />}
			{pasting && <PasteSheet onSubmit={onScan} onClose={() => setPasting(false)} />}
			{result && <ResultScreen v={result} episode={result.episodeRef ? episodes.get(result.episodeRef) : undefined} onClose={() => setResult(undefined)} />}
		</div>
	);
}

function HoardLabel({ title, gifts }: { title: string; gifts: InboxGift[] }) {
	const sats = gifts.reduce((a, g) => a + g.amount, 0);
	return (
		<div className="mx-auto -mt-0.5 w-[88%] rotate-[-1.5deg] rounded-t-sm rounded-b-lg bg-kraft px-2.5 py-2 text-kraft-ink shadow-[0_8px_14px_-10px_var(--shadow)]">
			<p className="truncate font-display text-xs font-semibold tracking-wide uppercase">{title}</p>
			<p className="num text-lg leading-tight font-semibold">
				{sats} <span className="font-sans text-xs font-medium">sats</span>
			</p>
			<p className="text-[13px]">
				{gifts.length} {gifts.length === 1 ? 'nut' : 'nuts'}
			</p>
		</div>
	);
}

function KeySetup({ onDone }: { onDone: (kp: { priv: string; pub: string }) => void }) {
	const [importing, setImporting] = useState(false);
	const [priv, setPriv] = useState('');
	const [error, setError] = useState('');

	async function save(kp: { priv: string; pub: string }) {
		await setCreatorKeys(kp);
		haptic('success');
		onDone(kp);
	}

	return (
		<div className="space-y-6 lg:max-w-xl">
			<h1 className="text-3xl">Creator</h1>
			<section className="card space-y-4">
				<div className="flex items-end gap-3">
					<div className="flex-1">
						<h2 className="text-lg">Set up this phone to receive</h2>
						<p className="text-sm text-muted">Gifts are locked to a key only this phone holds. Listeners lock their jar to its public half.</p>
					</div>
					<Squirrel className="w-20 shrink-0" />
				</div>
				<button className="btn-primary w-full" onClick={() => save(newP2PKKeypair())}>
					Generate creator key
				</button>
				{importing ? (
					<>
						<label className="block">
							<span className="label">Private key (64 hex characters)</span>
							<input className="field font-mono text-sm" value={priv} onChange={(e) => setPriv(e.target.value)} autoCapitalize="off" spellCheck={false} type="password" />
						</label>
						{error && <Notice tone="bad">{error}</Notice>}
						<button
							className="btn-ghost w-full"
							onClick={() => {
								try {
									save(keypairFromPriv(priv));
								} catch (e) {
									setError((e as Error).message);
								}
							}}
						>
							Import key
						</button>
					</>
				) : (
					<button className="btn-ghost w-full" onClick={() => setImporting(true)}>
						Import a private key
					</button>
				)}
				<Notice tone="warn">Demo key store: the key lives in this browser and isn&apos;t backed up.</Notice>
			</section>
		</div>
	);
}

function PasteSheet({ onSubmit, onClose }: { onSubmit: (text: string) => void; onClose: () => void }) {
	const [text, setText] = useState('');
	return (
		<Sheet title="Paste a gift" onClose={onClose}>
			<div className="space-y-3">
				<textarea className="field min-h-32 resize-none py-2 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="cashuB…" autoCapitalize="off" spellCheck={false} />
				<button className="btn-primary w-full" onClick={() => onSubmit(text)} disabled={!text.trim()}>
					Verify
				</button>
			</div>
		</Sheet>
	);
}

const PACE: Record<Play, number> = { full: 1, short: 0.45, still: 0 };

/**
 * The creator's big moment: the nut drops in, each offline check ticks in one by one, then the
 * verdict stamps down. Everything is in the DOM from the start; the timing is only presentation.
 */
function ResultScreen({ v, episode, onClose }: { v: Verification; episode?: Episode; onClose: () => void }) {
	const failed = v.checks.filter((c) => !c.ok);
	const chapter = v.seconds !== undefined ? chapterAt(episode?.chapters, v.seconds) : undefined;
	const duplicate = failed.length === 1 && failed[0].id === 'duplicate';
	const [play] = useState(() => playMoment(v.ok ? 'verified' : 'rejected'));
	const pace = PACE[play];
	const land = 430 * pace;
	const checksAt = 640 * pace;
	const step = 170 * pace;
	const verdictAt = checksAt + v.checks.length * step + 80 * pace;
	const [pose, setPose] = useState<Pose>('idle');
	const ms = (n: number) => `${Math.round(n)}ms`;

	useEffect(() => {
		const t: ReturnType<typeof setTimeout>[] = [];
		const at = (when: number, fn: () => void) => t.push(setTimeout(fn, when));
		at(land, () => {
			sfx.clink();
			haptic('land');
		});
		v.checks.forEach((c, i) => at(checksAt + i * step, () => (c.ok ? sfx.tick() : sfx.thud())));
		at(verdictAt, () => {
			if (v.ok) {
				sfx.chime();
				haptic('success');
				setPose('cheer');
			} else {
				haptic('error');
				setPose('worry');
			}
		});
		return () => t.forEach(clearTimeout);
	}, [v, land, checksAt, step, verdictAt]);

	const tone = v.ok ? 'bg-[#15803d]' : duplicate ? 'bg-[#92400e]' : 'bg-[#b91c1c]';
	const rise = (delay: number) => ({ animation: `rise-in 420ms var(--ease-out) ${ms(delay)} both` });

	return (
		<Overlay>
			<div
				role="alertdialog"
				aria-modal="true"
				aria-label={v.ok ? 'Gift verified' : 'Gift not accepted'}
				className={`fixed inset-0 z-50 flex flex-col overflow-y-auto px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white ${tone}`}
			>
				<div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
					<div className="relative">
						<div className="flex size-32 items-center justify-center rounded-full bg-white/15">
							<div className="relative" style={{ animation: pace ? `nut-drop ${ms(620 * pace)} var(--ease-out) both` : undefined }}>
								<Nut amount={v.amount || 32} className={`size-20 ${!v.ok && !duplicate ? 'shake-x' : ''}`} style={!v.ok && !duplicate ? { animationDelay: ms(verdictAt) } : undefined} />
								{!v.ok && !duplicate && (
									<svg viewBox="0 0 64 64" className="absolute inset-0 size-20" aria-hidden>
										<path d="M33 18l-4 9 6 6-5 8 4 9" fill="none" stroke="var(--nut-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="44" style={{ animation: `verify-draw 300ms ease-out ${ms(verdictAt)} both`, strokeDashoffset: 0 }} />
									</svg>
								)}
							</div>
						</div>
						<span
							className={`absolute -right-1 -bottom-1 flex size-12 items-center justify-center rounded-full bg-white ${v.ok ? 'text-[#15803d]' : duplicate ? 'text-[#92400e]' : 'text-[#b91c1c]'}`}
							style={{ animation: `pop-in 380ms var(--ease-out) ${ms(verdictAt)} both` }}
						>
							{v.ok ? <CheckIcon className="size-7" strokeWidth={3} /> : <CloseIcon className="size-7" strokeWidth={3} />}
						</span>
						<Squirrel pose={pose} className="absolute bottom-0 left-full ml-2 w-20" />
					</div>
					{v.ok ? (
						<>
							<p className="font-display text-5xl font-semibold" style={{ animation: `stamp-in 460ms var(--ease-out) ${ms(verdictAt)} both` }}>
								Verified
							</p>
							<p className="num text-2xl font-semibold" style={rise(verdictAt + 120 * pace)}>
								{v.amount} sats · locked to you
							</p>
						</>
					) : (
						<>
							<p className="font-display text-4xl font-semibold" style={{ animation: `stamp-in 460ms var(--ease-out) ${ms(verdictAt)} both` }}>
								{duplicate ? 'Already received' : 'Not accepted'}
							</p>
							<p className="text-lg text-balance" style={rise(verdictAt + 120 * pace)}>
								{duplicate ? 'Counted once. This nut is already in your hoard, so there is nothing new to redeem.' : failed[0]?.detail}
							</p>
						</>
					)}
					{v.message && (
						<p className="max-w-sm text-xl text-balance" style={rise(verdictAt + 220 * pace)}>
							&ldquo;{v.message}&rdquo;
						</p>
					)}
					{v.seconds !== undefined && (
						<p className="text-sm text-white/85" style={rise(verdictAt + 280 * pace)}>
							at {formatTime(v.seconds)}
							{episode ? ` in ${episode.title}` : ''}
							{chapter && (
								<>
									<br />
									{chapter.title}
								</>
							)}
						</p>
					)}
				</div>
				<ul className="mx-auto mt-6 mb-4 w-full max-w-sm space-y-1.5 text-sm" aria-label="Offline checks">
					{v.checks.map((c, i) => (
						<li key={c.id} className="flex items-start gap-2.5" style={rise(checksAt + i * step)}>
							<span className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-full ${c.ok ? 'bg-white/25' : 'bg-white text-[#b91c1c]'}`} aria-hidden>
								{c.ok ? <CheckIcon className="size-3.5" strokeWidth={3} /> : <CloseIcon className="size-3.5" strokeWidth={3} />}
							</span>
							<span>
								<span className="font-semibold">{c.label}</span> <span className="text-white/85">· {c.detail}</span>
								<span className="sr-only">{c.ok ? ' (passed)' : ' (failed)'}</span>
							</span>
						</li>
					))}
				</ul>
				<button className="btn mx-auto w-full max-w-sm bg-white text-black" onClick={onClose} style={rise(verdictAt + 200 * pace)}>
					Done
				</button>
			</div>
		</Overlay>
	);
}
