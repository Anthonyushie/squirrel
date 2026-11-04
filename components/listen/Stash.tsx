'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { MintQuoteBolt11Response } from '@cashu/cashu-ts';
import { CheckIcon, MinusIcon, PlusIcon } from '@/components/feel/icons';
import { Jar, type JarHandle, type PourPhase } from '@/components/feel/Jar';
import { Nut, NutChip } from '@/components/feel/Nut';
import { Rolling } from '@/components/feel/Rolling';
import { Squirrel, usePose, type Pose } from '@/components/feel/Squirrel';
import { CopyText, Notice, Sheet } from '@/components/ui';
import { list, type Jar as JarRecord } from '@/lib/db';
import { haptic, sfx } from '@/lib/feel';
import { useOnline } from '@/lib/hooks';
import { refreshKnownMints } from '@/lib/mint';
import { listExpired, reclaimExpired, type Expired } from '@/lib/refund';
import { isTestMint, loadSettings, mintHost, type Settings } from '@/lib/settings';
import { NUT_SIZES, createFundingQuote, fillJar, getBalance, jarCounts, resumePendingQuotes, waitForPaymentAndMint, type NutSize } from '@/lib/wallet';

/** Wallet balance and the shelf of jars, with the Add sats and Fill jar flows. */
export function Stash({ refreshKey = 0, onChange }: { refreshKey?: number; onChange?: () => void }) {
	const online = useOnline();
	const [settings, setSettings] = useState<Settings>();
	const [balance, setBalance] = useState(0);
	const [jars, setJars] = useState<JarRecord[]>([]);
	const [expired, setExpired] = useState<Expired[]>([]);
	const [sheet, setSheet] = useState<'fund' | 'fill'>();
	const [reclaiming, setReclaiming] = useState('');
	const [pose, play] = usePose();

	async function load() {
		const s = await loadSettings();
		return { s, balance: await getBalance(s.mintUrl), jars: await list('jars'), expired: await listExpired() };
	}

	async function reload() {
		const d = await load();
		setSettings(d.s);
		setBalance(d.balance);
		setJars(d.jars);
		setExpired(d.expired);
		onChange?.();
	}

	useEffect(() => {
		(async () => {
			const d = await load();
			setSettings(d.s);
			setBalance(d.balance);
			setJars(d.jars);
			setExpired(d.expired);
		})();
	}, [refreshKey]);

	async function reclaim() {
		setReclaiming('Checking with the mint…');
		try {
			const r = await reclaimExpired(expired);
			setReclaiming(
				[r.reclaimed && `Took back ${r.reclaimed} sats.`, r.redeemedByCreator && `${r.redeemedByCreator} gifted nut${r.redeemedByCreator > 1 ? 's were' : ' was'} already redeemed by the creator.`]
					.filter(Boolean)
					.join(' ') || 'Nothing to take back.',
			);
		} catch (e) {
			setReclaiming(`Couldn't reclaim: ${(e as Error).message}`);
		}
		reload();
	}

	// Once per page load while online: refresh mint keys for offline checks, and mint any
	// invoice that got paid after the Add sats sheet was closed.
	useEffect(() => {
		(async () => {
			await refreshKnownMints([(await loadSettings()).mintUrl]);
			if (await resumePendingQuotes()) {
				const d = await load();
				setBalance(d.balance);
			}
		})();
	}, []);

	function onPour(phase: PourPhase) {
		if (phase === 'start') play('puff', 900);
		if (phase === 'end') play('hop', 600);
	}

	if (!settings) return <StashSkeleton />;

	const groups = groupJars(jars);

	return (
		<section className="space-y-4" aria-label="Your stash">
			<div className="flex items-end justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate text-sm text-muted">Wallet · {mintHost(settings.mintUrl)}</p>
					<p className="font-display text-5xl leading-none font-semibold">
						<Rolling value={balance} /> <span className="text-lg font-medium text-muted">sats</span>
					</p>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-2">
					{!isTestMint(settings.mintUrl) && <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">Real sats</span>}
					<button className="btn-ghost min-h-11 px-3 text-base" onClick={() => setSheet('fund')} disabled={!online}>
						<PlusIcon className="size-4" />
						Add sats
					</button>
				</div>
			</div>

			<Shelf groups={groups} creatorName={settings.creatorName} walletMint={settings.mintUrl} pose={pose} goggles={!online} onPour={onPour} />

			<button className="btn-primary w-full text-lg" onClick={() => setSheet('fill')} disabled={!online || balance === 0}>
				Fill jar
			</button>
			{!online && <p className="text-center text-xs text-muted">Adding sats and filling jars needs a connection. Gifting doesn&apos;t.</p>}

			{expired.length > 0 && (
				<div className="space-y-2 rounded-2xl border border-accent/40 bg-accent/10 p-3">
					<p className="text-sm">
						<span className="font-semibold">{expired.reduce((a, e) => a + e.amount, 0)} sats</span> in {expired.length} nut{expired.length > 1 ? 's' : ''} passed the locktime without being redeemed. Your refund key can take them back.
					</p>
					<button className="btn-ghost min-h-10 w-full text-sm" onClick={reclaim} disabled={!online || reclaiming.endsWith('…')} aria-busy={reclaiming.endsWith('…')}>
						{reclaiming.endsWith('…') ? reclaiming : 'Reclaim'}
					</button>
				</div>
			)}
			{reclaiming && !reclaiming.endsWith('…') && <Notice tone="info">{reclaiming}</Notice>}

			{sheet === 'fund' && <FundSheet settings={settings} onClose={() => setSheet(undefined)} onDone={reload} />}
			{sheet === 'fill' && <FillSheet settings={settings} balance={balance} onClose={() => setSheet(undefined)} onDone={reload} />}
		</section>
	);
}

type Group = ReturnType<typeof groupJars>[number];

/** Jars standing on one plank, a kraft label hanging under each, the squirrel peeking over the first lid. */
function Shelf({ groups, creatorName, walletMint, pose, goggles, onPour }: { groups: Group[]; creatorName: string; walletMint: string; pose: Pose; goggles: boolean; onPour: (p: PourPhase) => void }) {
	const refs = useRef(new Map<string, JarHandle>());
	const columns = groups.length ? groups : [undefined];
	const template = { gridTemplateColumns: `repeat(${columns.length}, min(46vw, 12rem))` };
	return (
		<div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
			<div className="w-max min-w-full">
				<div className="grid items-end justify-center gap-x-3" style={template}>
					{columns.map((g, i) => (
						// Tapping the glass rattles the nuts: a decoration, so pointer only.
						<div key={g?.key ?? 'empty'} className={i === 0 ? 'pt-[24%]' : ''} onPointerDown={() => g && refs.current.get(g.key)?.rattle()}>
							<Jar
								nuts={g?.nuts ?? []}
								ref={(h) => {
									if (g && h) refs.current.set(g.key, h);
								}}
								onPour={onPour}
								keeper={i === 0 ? <Squirrel nested pose={pose} goggles={goggles} /> : undefined}
								className="w-full"
							/>
						</div>
					))}
				</div>
				<div aria-hidden className="relative h-3.5 rounded-lg bg-shelf shadow-[0_8px_14px_-8px_var(--shadow)]">
					<div className="absolute inset-x-0 bottom-0 h-1.5 rounded-b-lg bg-[var(--shelf-edge)]" />
				</div>
				<div className="grid items-start justify-center gap-x-3" style={template}>
					{columns.map((g) => (
						<JarLabel key={g?.key ?? 'empty'} group={g} creatorName={creatorName} walletMint={walletMint} />
					))}
				</div>
			</div>
		</div>
	);
}

function JarLabel({ group: g, creatorName, walletMint }: { group?: Group; creatorName: string; walletMint: string }) {
	return (
		<div className="relative mx-auto -mt-0.5 w-[92%] rotate-[-1.5deg] rounded-t-sm rounded-b-lg bg-kraft px-3 pt-2.5 pb-2 text-kraft-ink shadow-[0_8px_14px_-10px_var(--shadow)]">
			<span aria-hidden className="absolute top-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-kraft-ink/40" />
			{g ? (
				<>
					<p className="truncate font-display text-sm font-semibold tracking-wide uppercase">{g.name}</p>
					<p className="num text-xl leading-tight font-semibold">
						{g.total} <span className="font-sans text-sm font-medium">sats ready</span>
					</p>
					<p className="text-[13px] leading-snug">
						{Object.entries(g.counts)
							.filter(([, n]) => n > 0)
							.map(([size, n]) => `${n} × ${size}`)
							.join(' · ') || 'All gifted'}
					</p>
					<p className="text-[13px] leading-snug">{daysLeft(g.locktime)}</p>
					{/* The wallet line names the current mint; a jar on another mint says which. */}
					{g.mintUrl !== walletMint && <p className="truncate text-xs leading-snug">on {mintHost(g.mintUrl)}</p>}
				</>
			) : (
				<>
					<p className="truncate font-display text-sm font-semibold tracking-wide uppercase">Empty jar</p>
					<p className="text-[13px] leading-snug">Add sats, then fill it for {creatorName} while you&apos;re online.</p>
				</>
			)}
		</div>
	);
}

function StashSkeleton() {
	return (
		<div className="space-y-4" aria-hidden>
			<div className="skeleton h-4 w-40 rounded-full" />
			<div className="skeleton h-12 w-32 rounded-2xl" />
			<div className="skeleton h-56 w-full rounded-3xl" />
		</div>
	);
}

function groupJars(jars: JarRecord[]) {
	const map = new Map<string, { key: string; name: string; mintUrl: string; jars: JarRecord[] }>();
	const now = Date.now() / 1000;
	// Expired jars can't be gifted from any more; their nuts show up under Reclaim instead.
	for (const j of jars.filter((j) => j.locktime > now)) {
		const key = `${j.lockKey}|${j.mintUrl}`;
		if (!map.has(key)) map.set(key, { key, name: j.creatorName, mintUrl: j.mintUrl, jars: [] });
		map.get(key)!.jars.push(j);
	}
	return [...map.values()].map((g) => {
		const counts = jarCounts(g.jars);
		return {
			...g,
			counts,
			nuts: g.jars.flatMap((j) => j.nuts.filter((n) => !n.spent).map((n) => n.amount)),
			total: Object.entries(counts).reduce((a, [size, n]) => a + Number(size) * n, 0),
			locktime: Math.min(...g.jars.filter((j) => j.nuts.some((n) => !n.spent)).map((j) => j.locktime), Infinity),
		};
	});
}

function daysLeft(locktime: number) {
	if (!Number.isFinite(locktime)) return 'all gifted';
	const secs = locktime - Date.now() / 1000;
	if (secs >= 86400) return `${Math.ceil(secs / 86400 - 0.01)} days to redeem`;
	if (secs >= 3600) return `${Math.floor(secs / 3600)} hours to redeem`;
	return `${Math.max(1, Math.ceil(secs / 60))} min to redeem`;
}

function FundSheet({ settings, onClose, onDone }: { settings: Settings; onClose: () => void; onDone: () => void }) {
	const real = !isTestMint(settings.mintUrl);
	const [amount, setAmount] = useState(real ? 100 : 500);
	const [quote, setQuote] = useState<MintQuoteBolt11Response>();
	const [state, setState] = useState<'idle' | 'creating' | 'waiting' | 'done' | 'error'>('idle');
	const [message, setMessage] = useState('');
	const [minted, setMinted] = useState(0);
	const abort = useRef<AbortController>(undefined);

	useEffect(() => () => abort.current?.abort(), []);

	async function start() {
		setState('creating');
		try {
			const q = await createFundingQuote(settings.mintUrl, amount);
			setQuote(q);
			setState('waiting');
			abort.current = new AbortController();
			const sats = await waitForPaymentAndMint(settings.mintUrl, q, amount, abort.current.signal);
			setMinted(sats);
			setMessage(`Added ${sats} sats.`);
			setState('done');
			sfx.chime();
			haptic('success');
			onDone();
		} catch (e) {
			if ((e as Error).message === 'cancelled') return;
			setMessage((e as Error).message);
			setState('error');
			sfx.thud();
			haptic('error');
		}
	}

	return (
		<Sheet title="Add sats" onClose={onClose}>
			<div className="space-y-4">
				{state === 'idle' || state === 'creating' ? (
					<>
						<label className="block">
							<span className="label">Amount (sats)</span>
							<input className="field num text-2xl" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value))))} />
						</label>
						<Notice tone={real ? 'warn' : 'info'}>
							{real ? `Real bitcoin on ${mintHost(settings.mintUrl)}. You pay the invoice from your own Lightning wallet.` : 'Test mint: the invoice pays itself, no real money moves.'}
						</Notice>
						<button className="btn-primary w-full" onClick={start} disabled={!amount || state === 'creating'} aria-busy={state === 'creating'}>
							{state === 'creating' ? (
								<>
									<NutChip amount={32} spin className="size-6" /> Creating invoice…
								</>
							) : (
								'Create invoice'
							)}
						</button>
					</>
				) : null}

				{quote && state === 'waiting' && (
					<>
						<div className="ring-pulse mx-auto w-fit rounded-3xl bg-white p-3">
							<QRCodeSVG value={quote.request.toUpperCase()} size={240} level="L" />
						</div>
						<CopyText value={quote.request} label="invoice" />
						<p className="flex items-center justify-center gap-2 text-sm text-muted" aria-live="polite">
							<Nut amount={8} className="rock size-4" /> Waiting for payment…
						</p>
					</>
				)}

				{state === 'done' && (
					<div className="py-4 text-center" role="status">
						<p className="pop-in font-display text-5xl font-semibold text-ok">+{minted}</p>
						<p className="mt-1 text-muted">{message} They&apos;re in your wallet, ready for a jar.</p>
					</div>
				)}
				{state === 'error' && <Notice tone="bad">{message}</Notice>}
				{(state === 'done' || state === 'error') && (
					<button className="btn-ghost w-full" onClick={onClose}>
						Done
					</button>
				)}
			</div>
		</Sheet>
	);
}

function FillSheet({ settings, balance, onClose, onDone }: { settings: Settings; balance: number; onClose: () => void; onDone: () => void }) {
	const [counts, setCounts] = useState<Record<NutSize, number>>({ 8: 3, 32: 2, 64: 1 });
	// Test-mint only: a 2-minute locktime so the refund path can be tried without waiting 30 days.
	const [quickExpiry, setQuickExpiry] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [shakes, setShakes] = useState(0);
	const total = NUT_SIZES.reduce((a, size) => a + size * counts[size], 0);
	const ready = !!settings.creatorLockKey;
	const untrusted = settings.trustedMints.length > 0 && !settings.trustedMints.includes(settings.mintUrl);
	const preview = NUT_SIZES.flatMap((size) => Array<number>(counts[size]).fill(size));

	function change(size: NutSize, delta: number) {
		const next = { ...counts, [size]: Math.max(0, counts[size] + delta) };
		setCounts(next);
		if (delta > 0 && NUT_SIZES.reduce((a, s) => a + s * next[s], 0) > balance) {
			setShakes((n) => n + 1);
			haptic('error');
		} else {
			haptic('tick');
		}
	}

	async function fill() {
		setBusy(true);
		setError('');
		try {
			await fillJar(
				{ creatorNpub: settings.creatorNpub, creatorName: settings.creatorName, lockKey: settings.creatorLockKey, mintUrl: settings.mintUrl },
				counts,
				quickExpiry ? 120 : undefined,
			);
			onDone();
			onClose();
		} catch (e) {
			setError((e as Error).message);
			sfx.thud();
			haptic('error');
		} finally {
			setBusy(false);
		}
	}

	return (
		<Sheet title={`Fill a jar for ${settings.creatorName}`} onClose={onClose}>
			<div className="space-y-4">
				{!ready ? (
					<Notice tone="warn">
						No creator lock key yet. Set one in{' '}
						<a href="/settings" className="font-semibold underline">
							Settings
						</a>
						.
					</Notice>
				) : (
					<>
						<p className="text-sm text-muted">Each nut is locked to {settings.creatorName}&apos;s key for 30 days, so it&apos;s safe to hand over offline. Unused nuts come back to you after that.</p>
						<div className="flex items-end gap-4">
							<Jar nuts={preview} moment="pour-preview" className="w-28 shrink-0" />
							<ul className="flex-1 space-y-2">
								{NUT_SIZES.map((size) => (
									<li key={size} className="flex items-center justify-between gap-2 rounded-2xl bg-background py-1.5 pr-1.5 pl-2">
										<span className="flex items-center gap-1.5">
											<Nut amount={size} className="size-7" />
											<span className="num font-semibold">{size}</span>
										</span>
										<span className="flex items-center gap-1">
											<button className="btn-ghost size-10 p-0" aria-label={`Fewer ${size}-sat nuts`} onClick={() => change(size, -1)} disabled={!counts[size]}>
												<MinusIcon className="size-4" />
											</button>
											<span className="num w-6 text-center text-lg">{counts[size]}</span>
											<button className="btn-ghost size-10 p-0" aria-label={`More ${size}-sat nuts`} onClick={() => change(size, 1)}>
												<PlusIcon className="size-4" />
											</button>
										</span>
									</li>
								))}
							</ul>
						</div>
						<p className="flex items-baseline justify-between text-sm">
							<span className="text-muted">Total (plus a small mint fee)</span>
							<span key={shakes} className={`num text-lg font-semibold ${total > balance ? 'shake-x text-bad' : ''}`}>
								<Rolling value={total} /> / {balance} sats
							</span>
						</p>
						{untrusted && <Notice tone="warn">{mintHost(settings.mintUrl)} isn&apos;t one of {settings.creatorName}&apos;s trusted mints.</Notice>}
						{isTestMint(settings.mintUrl) && (
							<label className="flex cursor-pointer items-center gap-3 text-sm text-muted">
								<span className="relative inline-flex">
									<input type="checkbox" className="check peer" checked={quickExpiry} onChange={(e) => setQuickExpiry(e.target.checked)} />
									<CheckIcon className="pointer-events-none absolute inset-0 m-auto size-4 text-accent-foreground opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={3} />
								</span>
								Test refunds: lock for 2 minutes instead of 30 days
							</label>
						)}
						{error && <Notice tone="bad">{error}</Notice>}
						<button className="btn-primary w-full" onClick={fill} disabled={busy || !total || total > balance} aria-busy={busy}>
							{busy ? (
								<>
									<NutChip amount={32} spin className="size-6" /> Locking nuts…
								</>
							) : (
								`Fill jar with ${total} sats`
							)}
						</button>
					</>
				)}
			</div>
		</Sheet>
	);
}
