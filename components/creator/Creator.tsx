'use client';

import { useCallback, useEffect, useState } from 'react';
import { CopyText, Notice, Overlay, Sheet } from '@/components/ui';
import { cacheAcceptedMints, listInbox, redeemAll, redeemedTokens } from '@/lib/creator';
import { getSetting, list, put, type InboxGift, type MintKeysRecord } from '@/lib/db';
import { refreshFeed } from '@/lib/episodes';
import { chapterAt, formatTime, type Episode } from '@/lib/feed';
import { episodeRef } from '@/lib/gift';
import { useOnline } from '@/lib/hooks';
import { getCreatorKeys, keypairFromPriv, newP2PKKeypair, setCreatorKeys } from '@/lib/keys';
import { mintHost } from '@/lib/settings';
import { verifyGift, type Verification } from '@/lib/verify';
import { Moments } from './Moments';
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

	useEffect(() => {
		(async () => {
			setKeys((await getCreatorKeys()) ?? null);
			setInbox(await listInbox());
			setMints(await list('mintKeys'));
			// Map memo episode refs back to episodes using this phone's copy of the feed, if any.
			const feed = await getSetting('feed');
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
			const results = await redeemAll((done, total) => setRedeeming(`Redeeming ${done} of ${total}…`));
			const ok = results.filter((r) => r.ok).length;
			setRedeeming(results.length ? `Redeemed ${ok} of ${results.length}.` : 'Nothing to redeem.');
		} catch (e) {
			setRedeeming((e as Error).message);
		}
		setVersion((n) => n + 1);
	}

	if (keys === undefined) return <p className="text-muted">Loading…</p>;
	if (keys === null) return <KeySetup onDone={(kp) => setKeys(kp)} />;

	const unredeemed = inbox.filter((g) => !g.redeemed && !g.redeemError);
	const received = inbox.reduce((a, g) => a + g.amount, 0);
	const tokens = redeemedTokens(inbox);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Creator</h1>
				<p className="text-sm text-muted">Scan gifts here, even in airplane mode.</p>
			</div>

			<button className="btn-primary w-full py-5 text-xl" onClick={() => setScanning(true)}>
				Scan gift
			</button>
			<button className="btn-ghost -mt-3 w-full text-sm" onClick={() => setPasting(true)}>
				Paste a gift instead
			</button>

			<Moments inbox={inbox} episodes={episodes} online={online} />

			<section className="space-y-3">
				<div className="flex items-end justify-between">
					<h2 className="text-lg font-bold">Inbox</h2>
					<p className="text-sm text-muted tabular-nums">{received} sats received</p>
				</div>
				{inbox.length === 0 ? (
					<div className="card text-center text-sm text-muted">No gifts yet. Scan a listener&apos;s gift QR to verify it offline.</div>
				) : (
					<ul className="space-y-2">
						{inbox.map((g) => (
							<li key={g.id} className="card space-y-1 py-3">
								<div className="flex items-center justify-between gap-2">
									<p className="font-semibold tabular-nums">{g.amount} sats</p>
									<span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${g.redeemed ? 'bg-ok/15 text-ok' : g.redeemError ? 'bg-bad/15 text-bad' : 'bg-accent/15 text-accent'}`}>
										{g.redeemed ? 'Redeemed' : g.redeemError ? 'Failed' : 'Verified offline'}
									</span>
								</div>
								{g.message && <p className="text-sm">&ldquo;{g.message}&rdquo;</p>}
								<p className="truncate text-xs text-muted">
									{g.seconds !== undefined && `at ${formatTime(g.seconds)}`}
									{g.episodeRef && episodes.get(g.episodeRef) ? ` · ${episodes.get(g.episodeRef)!.title}` : ''} · {mintHost(g.mintUrl)}
								</p>
								{g.redeemError && <p className="text-xs text-bad">{g.redeemError}</p>}
							</li>
						))}
					</ul>
				)}
				{inbox.length > 0 && (
					<>
						<button className="btn-primary w-full" onClick={redeem} disabled={!online || !unredeemed.length || (!!redeeming && redeeming.endsWith('…'))}>
							{unredeemed.length ? `Redeem all (${unredeemed.reduce((a, g) => a + g.amount, 0)} sats)` : 'All redeemed'}
						</button>
						{!online && unredeemed.length > 0 && <p className="text-center text-xs text-muted">Redeeming needs a connection. Verified gifts are safe until then.</p>}
						{redeeming && <Notice tone="info">{redeeming}</Notice>}
					</>
				)}
			</section>

			{tokens.length > 0 && (
				<section className="card space-y-3">
					<h2 className="font-bold">Your redeemed sats</h2>
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

			<section className="card space-y-3">
				<h2 className="font-bold">Your lock key</h2>
				<p className="text-sm text-muted">Paste this into the listener&apos;s Settings (Demo creator) so their jar locks to you.</p>
				<CopyText value={keys.pub} label="lock key" />
				<p className="text-xs text-muted">
					Accepted mints, keys on this phone:{' '}
					{mints.length ? mints.map((m) => mintHost(m.mintUrl)).join(', ') : online ? 'loading…' : 'none yet: go online once'}
				</p>
				<Notice tone="warn">Demo key store: the private key lives in this browser and isn&apos;t backed up.</Notice>
			</section>

			{scanning && <Scanner onResult={onScan} onClose={() => setScanning(false)} />}
			{pasting && <PasteSheet onSubmit={onScan} onClose={() => setPasting(false)} />}
			{result && <ResultScreen v={result} episode={result.episodeRef ? episodes.get(result.episodeRef) : undefined} onClose={() => setResult(undefined)} />}
		</div>
	);
}

function KeySetup({ onDone }: { onDone: (kp: { priv: string; pub: string }) => void }) {
	const [importing, setImporting] = useState(false);
	const [priv, setPriv] = useState('');
	const [error, setError] = useState('');

	async function save(kp: { priv: string; pub: string }) {
		await setCreatorKeys(kp);
		onDone(kp);
	}

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold">Creator</h1>
			<section className="card space-y-4">
				<div>
					<h2 className="font-bold">Set up this phone to receive</h2>
					<p className="text-sm text-muted">Gifts are locked to a key only this phone holds. Listeners lock their jar to its public half.</p>
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
				<textarea className="field min-h-32 py-2 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="cashuB…" autoCapitalize="off" spellCheck={false} />
				<button className="btn-primary w-full" onClick={() => onSubmit(text)} disabled={!text.trim()}>
					Verify
				</button>
			</div>
		</Sheet>
	);
}

function ResultScreen({ v, episode, onClose }: { v: Verification; episode?: Episode; onClose: () => void }) {
	const failed = v.checks.filter((c) => !c.ok);
	const chapter = v.seconds !== undefined ? chapterAt(episode?.chapters, v.seconds) : undefined;
	const duplicate = failed.length === 1 && failed[0].id === 'duplicate';
	return (
		<Overlay>
			<div
				role="alertdialog"
				aria-modal="true"
				aria-label={v.ok ? 'Gift verified' : 'Gift not accepted'}
				className={`fixed inset-0 z-50 flex flex-col px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white ${v.ok ? 'bg-[#15803d]' : duplicate ? 'bg-[#92400e]' : 'bg-[#b91c1c]'}`}
			>
				<div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
					<div className="verify-pop flex size-28 items-center justify-center rounded-full bg-white/20">
						<svg viewBox="0 0 24 24" className="size-16" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
							{v.ok ? <path className="verify-draw" d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M7 7l10 10M17 7L7 17" />}
						</svg>
					</div>
					{v.ok ? (
						<>
							<p className="text-4xl font-bold">Verified</p>
							<p className="text-2xl font-semibold tabular-nums">{v.amount} sats · locked to you</p>
						</>
					) : (
						<>
							<p className="text-3xl font-bold">{duplicate ? 'Already received' : 'Not accepted'}</p>
							<p className="text-lg">{failed[0]?.detail}</p>
						</>
					)}
					{v.message && <p className="max-w-sm text-xl text-balance">&ldquo;{v.message}&rdquo;</p>}
					{v.seconds !== undefined && (
						<p className="text-sm text-white/80">
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
				<ul className="mx-auto mb-4 w-full max-w-sm space-y-1 text-sm">
					{v.checks.map((c) => (
						<li key={c.id} className="flex items-start gap-2">
							<span aria-hidden>{c.ok ? '✓' : '✕'}</span>
							<span>
								<span className="font-semibold">{c.label}</span> <span className="text-white/80">· {c.detail}</span>
							</span>
						</li>
					))}
				</ul>
				<button className="btn mx-auto w-full max-w-sm bg-white text-black" onClick={onClose}>
					Done
				</button>
			</div>
		</Overlay>
	);
}
