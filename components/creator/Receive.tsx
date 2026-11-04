'use client';

import { useEffect, useState } from 'react';
import { nip19 } from 'nostr-tools';
import { CopyText, Notice } from '@/components/ui';
import { ACCEPTED_MINTS } from '@/lib/creator';
import { getSetting } from '@/lib/db';
import { haptic, sfx } from '@/lib/feel';
import { useLoad } from '@/lib/hooks';
import { collectNutzaps, publishNutzapInfo, type Collected } from '@/lib/receive';
import { mintHost } from '@/lib/settings';

type Note = { tone: 'ok' | 'bad' | 'warn' | 'info'; text: string };

/** What a collect turned up; quiet checks only speak when something arrived or was turned away. */
function describe(c: Collected, quiet: boolean): Note | undefined {
	const parts = [];
	if (c.added) parts.push(`${c.added} new ${c.added === 1 ? 'gift' : 'gifts'} by nutzap, checked like a scanned gift.`);
	if (c.rejected.length) parts.push(`${c.rejected.length} didn't pass: ${c.rejected[0].reason}`);
	if (!parts.length) return quiet ? undefined : { tone: 'info', text: 'No new nutzaps.' };
	return { tone: c.rejected.length ? 'warn' : 'ok', text: parts.join(' ') };
}

/**
 * Remote receiving. The creator publishes their nutzap info once; after that, nutzaps are pulled
 * in whenever this tab opens online, or on demand.
 */
export function Receive({ lockKey, online, onChange }: { lockKey: string; online: boolean; onChange: () => void }) {
	const [loaded, reload] = useLoad(async () => {
		const [info, nostr] = await Promise.all([getSetting('creatorNutzapInfo'), getSetting('creatorNostrKeys')]);
		return { info, npub: nostr ? nip19.npubEncode(nostr.pub) : undefined };
	});
	const [busy, setBusy] = useState<'publish' | 'check'>();
	const [note, setNote] = useState<Note>();

	function arrived(c: Collected, quiet: boolean) {
		// A quiet check with nothing to say leaves any earlier note (like "Published") in place.
		const next = describe(c, quiet);
		if (next) setNote(next);
		if (!c.added) return;
		sfx.chime();
		haptic('success');
		onChange();
	}

	async function check() {
		setBusy('check');
		try {
			arrived(await collectNutzaps(), false);
		} catch (e) {
			setNote({ tone: 'bad', text: `Couldn't check relays: ${(e as Error).message}` });
		} finally {
			setBusy(undefined);
		}
	}

	async function publish() {
		setBusy('publish');
		setNote(undefined);
		try {
			const r = await publishNutzapInfo();
			reload();
			setNote({ tone: 'ok', text: `Published to ${r.accepted} of ${r.relays.length} relays. Listeners can now look up your npub in Settings.` });
		} catch (e) {
			setNote({ tone: 'bad', text: `Couldn't publish: ${(e as Error).message}` });
		} finally {
			setBusy(undefined);
		}
	}

	// Pull in nutzaps quietly when the tab opens online, or comes back online.
	const published = !!loaded?.info;
	useEffect(() => {
		if (!online || !published) return;
		let live = true;
		collectNutzaps()
			.then((c) => live && arrived(c, true))
			.catch((e) => console.warn('nutzap check failed', e));
		return () => {
			live = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [online, published]);

	if (!loaded) return null;
	const { info, npub } = loaded;
	const stale = !!info && (info.lockKey !== lockKey || ACCEPTED_MINTS.some((m) => !info.mints.includes(m)));

	return (
		<section className="card space-y-3">
			<div>
				<h2 className="text-lg">Receive by nutzap</h2>
				<p className="text-sm text-muted">
					{info
						? "Listeners who aren't with you send gifts to this npub. They arrive as NIP-61 nutzaps and get the same checks as a scanned gift."
						: "Let listeners who aren't with you send gifts. This posts your lock key and accepted mints to Nostr (kind 10019)."}
				</p>
			</div>
			{info && npub && <CopyText value={npub} label="creator npub" />}
			{info && (
				<p className="text-xs text-muted">
					Published {new Date(info.publishedAt).toLocaleDateString()} · {info.mints.map(mintHost).join(', ')}
				</p>
			)}
			{stale && <Notice tone="warn">Your key or accepted mints changed since you published. Publish again so nutzaps lock to the right key.</Notice>}
			{!info || stale ? (
				<button className="btn-primary w-full" onClick={publish} disabled={!online || !!busy}>
					{busy === 'publish' ? 'Publishing…' : info ? 'Publish again' : 'Publish nutzap info'}
				</button>
			) : (
				<button className="btn-ghost w-full" onClick={check} disabled={!online || !!busy}>
					{busy === 'check' ? 'Checking relays…' : 'Check for nutzaps'}
				</button>
			)}
			{!online && <p className="text-xs text-muted">Needs a connection. Scanning gifts still works offline.</p>}
			{note && <Notice tone={note.tone}>{note.text}</Notice>}
		</section>
	);
}
