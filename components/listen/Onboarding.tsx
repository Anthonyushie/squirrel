'use client';

import { useEffect, useState } from 'react';
import { list, savedEpisodeGuids } from '@/lib/db';

type Steps = { episode: boolean; sats: boolean; jar: boolean };

/** First-run checklist: the three things to do online before you can gift offline. */
export function Onboarding({ refreshKey }: { refreshKey: number }) {
	const [steps, setSteps] = useState<Steps>();

	useEffect(() => {
		(async () => {
			const [saved, wallets, jars] = await Promise.all([savedEpisodeGuids(), list('wallet'), list('jars')]);
			const now = Date.now() / 1000;
			setSteps({
				episode: saved.size > 0,
				sats: wallets.some((w) => w.proofs.length > 0) || jars.length > 0,
				jar: jars.some((j) => j.locktime > now && j.nuts.some((n) => !n.spent)),
			});
		})();
	}, [refreshKey]);

	if (!steps || (steps.episode && steps.sats && steps.jar)) return null;

	const items = [
		{ done: steps.episode, title: 'Save an episode', hint: 'Tap Download on any episode below.' },
		{ done: steps.sats, title: 'Add sats', hint: 'Fund your wallet from the mint.' },
		{ done: steps.jar, title: 'Fill a jar', hint: 'Lock nuts to the creator so they are safe to hand over offline.' },
	];
	const next = items.findIndex((i) => !i.done);

	return (
		<section className="card space-y-3 border-accent/40" aria-label="Getting started">
			<div>
				<h2 className="font-bold">Stash nuts now, gift them anywhere</h2>
				<p className="text-sm text-muted">Three steps while you&apos;re online. After that, gifting works in airplane mode.</p>
			</div>
			<ol className="space-y-2">
				{items.map((item, i) => (
					<li key={item.title} className="flex items-start gap-3">
						<span
							className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.done ? 'bg-ok text-white' : i === next ? 'bg-accent text-accent-foreground' : 'bg-line text-muted'}`}
							aria-hidden
						>
							{item.done ? '✓' : i + 1}
						</span>
						<div>
							<p className={`font-semibold ${item.done ? 'text-muted line-through' : ''}`}>
								{item.title}
								<span className="sr-only">{item.done ? ' (done)' : ''}</span>
							</p>
							{i === next && <p className="text-sm text-muted">{item.hint}</p>}
						</div>
					</li>
				))}
			</ol>
		</section>
	);
}
