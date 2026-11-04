'use client';

import { useEffect, useState } from 'react';
import { nip19 } from 'nostr-tools';
import { CopyText, Notice } from '@/components/ui';
import { haptic, setFeelPrefs, sfx, useFeelPrefs } from '@/lib/feel';
import { getSetting } from '@/lib/db';
import { useOnline } from '@/lib/hooks';
import { ensureListenerKeys, ensureNostrKeys, getCreatorKeys, normalizeLockKey } from '@/lib/keys';
import { checkMint, type MintSupport } from '@/lib/mint';
import { lookupNutzapInfo } from '@/lib/nostr';
import { MINIBITS, NODESIGNAL_NPUB, TEST_MINT, isTestMint, loadSettings, saveSettings, type Settings as S } from '@/lib/settings';

export function Settings() {
	const online = useOnline();
	const [s, setS] = useState<S>();
	const [keys, setKeys] = useState<{ refund: string; npub: string }>();
	const [busy, setBusy] = useState('');
	const [note, setNote] = useState<{ tone: 'ok' | 'bad' | 'warn' | 'info'; text: string }>();
	const [support, setSupport] = useState<MintSupport>();
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		(async () => {
			setS(await loadSettings());
			const [refund, nostr] = await Promise.all([ensureListenerKeys(), ensureNostrKeys()]);
			setKeys({ refund: refund.pub, npub: nip19.npubEncode(nostr.pub) });
		})();
	}, []);

	if (!s) return <p className="text-muted">Loading…</p>;

	const update = (patch: Partial<S>) => {
		setS({ ...s, ...patch });
		setSaved(false);
	};

	async function lookup(npub = s!.creatorNpub, base = s!) {
		setBusy('lookup');
		setNote(undefined);
		try {
			const info = await lookupNutzapInfo(npub);
			if (!info.found) {
				setNote({ tone: 'warn', text: 'No nutzap info (kind 10019) found. Paste the creator lock key by hand.' });
				return { ...base, creatorNpub: npub, creatorName: info.name ?? base.creatorName };
			}
			// Keep a short name the user already has for this creator; profile names can be long.
			const sameCreator = base.creatorNpub === npub && !!base.creatorName;
			const next: S = {
				...base,
				creatorNpub: npub,
				creatorName: sameCreator ? base.creatorName : (info.name ?? base.creatorName),
				creatorLockKey: info.lockKey ? normalizeLockKey(info.lockKey) : base.creatorLockKey,
				trustedMints: info.mints,
				creatorRelays: info.relays,
			};
			setNote({ tone: 'ok', text: `Found nutzap info: ${info.mints.length} trusted mints, lock key set.` });
			return next;
		} catch (e) {
			setNote({ tone: 'bad', text: `Lookup failed: ${(e as Error).message}` });
			return base;
		} finally {
			setBusy('');
		}
	}

	async function presetNodesignal() {
		const next = await lookup(NODESIGNAL_NPUB, { ...s!, creatorName: 'Nodesignal' });
		const mintUrl = next.trustedMints.includes(MINIBITS) ? MINIBITS : (next.trustedMints[0] ?? next.mintUrl);
		update({ ...next, mintUrl });
	}

	async function presetDemo() {
		const [creator, nostr, info] = await Promise.all([getCreatorKeys(), getSetting('creatorNostrKeys'), getSetting('creatorNutzapInfo')]);
		// With this device's nutzap info published, gifts to the demo creator can go by QR or by nutzap.
		const remote = creator && nostr && info?.lockKey === creator.pub;
		update({
			creatorNpub: remote ? nip19.npubEncode(nostr.pub) : '',
			creatorName: 'Demo creator',
			creatorLockKey: creator?.pub ?? '',
			mintUrl: TEST_MINT,
			trustedMints: remote ? info.mints : [],
			creatorRelays: remote ? info.relays : [],
		});
		setNote(
			remote
				? { tone: 'ok', text: "Using this device's creator, by QR or nutzap. For two phones, paste the npub from the creator phone and look it up." }
				: creator
					? { tone: 'ok', text: "Using this device's creator key, QR only. Publish nutzap info on Creator to send gifts remotely too." }
					: { tone: 'info', text: 'On the creator phone, open Creator: paste its npub below and look it up, or paste its lock key for QR only.' },
		);
	}

	async function save() {
		setBusy('save');
		setNote(undefined);
		try {
			const lockKey = s!.creatorLockKey ? normalizeLockKey(s!.creatorLockKey) : '';
			const mintUrl = s!.mintUrl.trim().replace(/\/$/, '');
			const next = { ...s!, creatorLockKey: lockKey, mintUrl };
			if (online) {
				const sup = await checkMint(mintUrl);
				setSupport(sup);
				if (!sup.p2pk || !sup.dleq) throw new Error(`${sup.name} does not support ${!sup.p2pk ? 'P2PK (NUT-11)' : 'DLEQ (NUT-12)'}`);
			}
			await saveSettings(next);
			setS(next);
			setSaved(true);
		} catch (e) {
			setNote({ tone: 'bad', text: (e as Error).message });
		} finally {
			setBusy('');
		}
	}

	const untrusted = s.trustedMints.length > 0 && !s.trustedMints.includes(s.mintUrl.trim().replace(/\/$/, ''));
	const realSats = !isTestMint(s.mintUrl);

	// Desktop: the creator form on the left, keys and feel beside it.
	return (
		<div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8 lg:gap-y-6 lg:space-y-0">
			<h1 className="text-3xl lg:col-span-2">Settings</h1>

			<section className="card space-y-4">
				<div>
					<h2 className="text-lg">Who you&apos;re gifting</h2>
					<p className="text-sm text-muted">Jars you fill next are locked to this creator, on this mint.</p>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<button className="btn-ghost flex-col gap-0 py-2 text-sm" onClick={presetNodesignal} disabled={!online || !!busy}>
						Nodesignal
						<span className="text-xs font-normal text-muted">real sats</span>
					</button>
					<button className="btn-ghost flex-col gap-0 py-2 text-sm" onClick={presetDemo} disabled={!!busy}>
						Demo creator
						<span className="text-xs font-normal text-muted">test sats</span>
					</button>
				</div>

				<label className="block">
					<span className="label">Creator name</span>
					<input className="field" value={s.creatorName} onChange={(e) => update({ creatorName: e.target.value })} />
				</label>
				<label className="block">
					<span className="label">Creator npub</span>
					<input className="field font-mono text-sm" value={s.creatorNpub} placeholder="npub1…" onChange={(e) => update({ creatorNpub: e.target.value })} autoCapitalize="off" spellCheck={false} />
				</label>
				<button className="btn-ghost w-full" onClick={async () => update(await lookup())} disabled={!online || !s.creatorNpub || !!busy}>
					{busy === 'lookup' ? 'Looking up…' : 'Look up nutzap info'}
				</button>
				<label className="block">
					<span className="label">Creator lock key</span>
					<input className="field font-mono text-sm" value={s.creatorLockKey} placeholder="02… or 03…" onChange={(e) => update({ creatorLockKey: e.target.value })} autoCapitalize="off" spellCheck={false} />
				</label>
				<label className="block">
					<span className="label">Mint URL</span>
					<input className="field font-mono text-sm" value={s.mintUrl} onChange={(e) => update({ mintUrl: e.target.value })} autoCapitalize="off" spellCheck={false} inputMode="url" />
				</label>
				{s.trustedMints.length > 0 && (
					<div className="flex flex-wrap gap-2">
						{s.trustedMints.map((m) => (
							<button key={m} className={`rounded-full border px-3 py-1.5 text-xs ${m === s.mintUrl ? 'border-accent bg-accent/10' : 'border-line'}`} onClick={() => update({ mintUrl: m })}>
								{m.replace('https://', '')}
							</button>
						))}
					</div>
				)}

				{untrusted && <Notice tone="warn">This mint isn&apos;t in {s.creatorName}&apos;s trusted mints. Gifts here may never be claimed.</Notice>}
				{realSats && <Notice tone="warn">This mint uses real bitcoin. Keep amounts small: keys live in this browser.</Notice>}
				{support && saved && (
					<Notice tone="ok">
						{support.name}: P2PK and DLEQ supported · {support.fee ? `${support.fee} ppk input fee` : 'no input fee'}
					</Notice>
				)}
				{note && <Notice tone={note.tone}>{note.text}</Notice>}

				<button className="btn-primary w-full" onClick={save} disabled={!!busy}>
					{busy === 'save' ? 'Checking mint…' : saved ? <span className="pop-in">Saved</span> : 'Save'}
				</button>
			</section>

			<div className="space-y-6">
				<section className="card space-y-4">
					<div>
						<h2 className="text-lg">Your keys</h2>
						<p className="text-sm text-muted">Made on this device. Demo key store: not backed up.</p>
					</div>
					{keys ? (
						<>
							<div>
								<span className="label">Refund key (takes back unredeemed nuts after the locktime)</span>
								<CopyText value={keys.refund} label="refund key" />
							</div>
							<div>
								<span className="label">Nostr key (signs nutzaps you send)</span>
								<CopyText value={keys.npub} label="Nostr npub" />
							</div>
						</>
					) : (
						<p className="text-muted">Generating…</p>
					)}
				</section>

				<FeelSettings />
			</div>
		</div>
	);
}

function FeelSettings() {
	const prefs = useFeelPrefs();
	return (
		<section className="card space-y-4">
			<div>
				<h2 className="text-lg">Feel</h2>
				<p className="text-sm text-muted">Your phone vibrates on key moments where it can (Android). Saved on this device.</p>
			</div>
			<Toggle
				label="Sounds"
				hint="Clinks, pops and a chime. Off until you turn it on."
				checked={prefs.sound}
				onChange={(sound) => {
					setFeelPrefs({ sound });
					if (sound) sfx.chime();
				}}
			/>
			<Toggle label="Calm animations" hint="Shorter moments every time. Your phone's reduce-motion setting turns travel off entirely." checked={prefs.calm} onChange={(calm) => setFeelPrefs({ calm })} />
		</section>
	);
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div>
				<p className="font-semibold">{label}</p>
				<p className="text-sm text-muted">{hint}</p>
			</div>
			<button
				role="switch"
				aria-checked={checked}
				aria-label={label}
				onClick={() => {
					onChange(!checked);
					haptic('tick');
				}}
				className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-accent' : 'bg-line'}`}
			>
				<span className={`absolute top-1 left-1 size-6 rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.3)] transition-transform duration-200 ease-[var(--ease-out)] ${checked ? 'translate-x-6' : ''}`} />
			</button>
		</div>
	);
}
