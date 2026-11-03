'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { MintQuoteBolt11Response } from '@cashu/cashu-ts';
import { CopyText, Notice, Sheet } from '@/components/ui';
import { list, type Jar } from '@/lib/db';
import { useOnline } from '@/lib/hooks';
import { refreshKnownMints } from '@/lib/mint';
import { listExpired, reclaimExpired, type Expired } from '@/lib/refund';
import { isTestMint, loadSettings, mintHost, type Settings } from '@/lib/settings';
import { NUT_SIZES, createFundingQuote, fillJar, getBalance, jarCounts, resumePendingQuotes, waitForPaymentAndMint, type NutSize } from '@/lib/wallet';

/** Wallet balance and jars of nuts, with the Add sats and Fill jar flows. */
export function Stash({ refreshKey = 0, onChange }: { refreshKey?: number; onChange?: () => void }) {
	const online = useOnline();
	const [settings, setSettings] = useState<Settings>();
	const [balance, setBalance] = useState(0);
	const [jars, setJars] = useState<Jar[]>([]);
	const [expired, setExpired] = useState<Expired[]>([]);
	const [sheet, setSheet] = useState<'fund' | 'fill'>();
	const [reclaiming, setReclaiming] = useState('');

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

	if (!settings) return null;

	const groups = groupJars(jars);

	return (
		<section className="card space-y-4">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-sm text-muted">Wallet · {mintHost(settings.mintUrl)}</p>
					<p className="text-3xl font-bold tabular-nums">
						{balance} <span className="text-base font-semibold text-muted">sats</span>
					</p>
				</div>
				{!isTestMint(settings.mintUrl) && <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">Real sats</span>}
			</div>

			{groups.length > 0 ? (
				<ul className="space-y-2">
					{groups.map((g) => (
						<li key={g.key} className="rounded-xl bg-background px-3 py-2">
							<p className="font-semibold">
								{g.name} <span className="font-normal text-muted">· {g.total} sats ready</span>
							</p>
							<p className="text-sm text-muted">
								{Object.entries(g.counts)
									.filter(([, n]) => n > 0)
									.map(([size, n]) => `${n} × ${size}`)
									.join(', ') || 'Empty'}{' '}
								· {mintHost(g.mintUrl)} · {daysLeft(g.locktime)}
							</p>
						</li>
					))}
				</ul>
			) : (
				<p className="text-sm text-muted">No nuts stashed yet. Add sats, then fill a jar for {settings.creatorName} while you&apos;re online.</p>
			)}

			<div className="grid grid-cols-2 gap-2">
				<button className="btn-ghost" onClick={() => setSheet('fund')} disabled={!online}>
					Add sats
				</button>
				<button className="btn-primary" onClick={() => setSheet('fill')} disabled={!online || balance === 0}>
					Fill jar
				</button>
			</div>
			{!online && <p className="text-center text-xs text-muted">Adding sats and filling jars needs a connection. Gifting doesn&apos;t.</p>}

			{expired.length > 0 && (
				<div className="space-y-2 rounded-xl border border-accent/40 bg-accent/10 p-3">
					<p className="text-sm">
						<span className="font-semibold">{expired.reduce((a, e) => a + e.amount, 0)} sats</span> in {expired.length} nut{expired.length > 1 ? 's' : ''} passed the locktime without being redeemed. Your refund key can take them back.
					</p>
					<button className="btn-ghost min-h-10 w-full text-sm" onClick={reclaim} disabled={!online || reclaiming.endsWith('…')}>
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

function groupJars(jars: Jar[]) {
	const map = new Map<string, { key: string; name: string; mintUrl: string; jars: Jar[] }>();
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
	const abort = useRef<AbortController>(undefined);

	useEffect(() => () => abort.current?.abort(), []);

	async function start() {
		setState('creating');
		try {
			const q = await createFundingQuote(settings.mintUrl, amount);
			setQuote(q);
			setState('waiting');
			abort.current = new AbortController();
			const minted = await waitForPaymentAndMint(settings.mintUrl, q, amount, abort.current.signal);
			setMessage(`Added ${minted} sats.`);
			setState('done');
			onDone();
		} catch (e) {
			if ((e as Error).message === 'cancelled') return;
			setMessage((e as Error).message);
			setState('error');
		}
	}

	return (
		<Sheet title="Add sats" onClose={onClose}>
			<div className="space-y-4">
				{state === 'idle' || state === 'creating' ? (
					<>
						<label className="block">
							<span className="label">Amount (sats)</span>
							<input className="field text-lg tabular-nums" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value))))} />
						</label>
						<Notice tone={real ? 'warn' : 'info'}>
							{real ? `Real bitcoin on ${mintHost(settings.mintUrl)}. You pay the invoice from your own Lightning wallet.` : 'Test mint: the invoice pays itself, no real money moves.'}
						</Notice>
						<button className="btn-primary w-full" onClick={start} disabled={!amount || state === 'creating'}>
							{state === 'creating' ? 'Creating invoice…' : 'Create invoice'}
						</button>
					</>
				) : null}

				{quote && state === 'waiting' && (
					<>
						<div className="mx-auto w-fit rounded-2xl bg-white p-3">
							<QRCodeSVG value={quote.request.toUpperCase()} size={240} level="L" />
						</div>
						<CopyText value={quote.request} label="invoice" />
						<p className="text-center text-sm text-muted" aria-live="polite">
							Waiting for payment…
						</p>
					</>
				)}

				{state === 'done' && <Notice tone="ok">{message}</Notice>}
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
	const total = NUT_SIZES.reduce((a, size) => a + size * counts[size], 0);
	const ready = !!settings.creatorLockKey;
	const untrusted = settings.trustedMints.length > 0 && !settings.trustedMints.includes(settings.mintUrl);

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
						<ul className="space-y-2">
							{NUT_SIZES.map((size) => (
								<li key={size} className="flex items-center justify-between rounded-xl bg-background px-3 py-2">
									<span className="font-semibold">{size} sats</span>
									<span className="flex items-center gap-2">
										<button className="btn-ghost size-11 p-0 text-xl" aria-label={`Fewer ${size}-sat nuts`} onClick={() => setCounts({ ...counts, [size]: Math.max(0, counts[size] - 1) })}>
											−
										</button>
										<span className="w-6 text-center text-lg tabular-nums">{counts[size]}</span>
										<button className="btn-ghost size-11 p-0 text-xl" aria-label={`More ${size}-sat nuts`} onClick={() => setCounts({ ...counts, [size]: counts[size] + 1 })}>
											+
										</button>
									</span>
								</li>
							))}
						</ul>
						<p className="flex justify-between text-sm">
							<span className="text-muted">Total (plus a small mint fee)</span>
							<span className={`font-semibold tabular-nums ${total > balance ? 'text-bad' : ''}`}>
								{total} / {balance} sats
							</span>
						</p>
						{untrusted && <Notice tone="warn">{mintHost(settings.mintUrl)} isn&apos;t one of {settings.creatorName}&apos;s trusted mints.</Notice>}
						{isTestMint(settings.mintUrl) && (
							<label className="flex items-center gap-2 text-sm text-muted">
								<input type="checkbox" className="size-5 accent-[var(--accent)]" checked={quickExpiry} onChange={(e) => setQuickExpiry(e.target.checked)} />
								Test refunds: lock for 2 minutes instead of 30 days
							</label>
						)}
						{error && <Notice tone="bad">{error}</Notice>}
						<button className="btn-primary w-full" onClick={fill} disabled={busy || !total || total > balance}>
							{busy ? 'Locking nuts…' : `Fill jar with ${total} sats`}
						</button>
					</>
				)}
			</div>
		</Sheet>
	);
}
