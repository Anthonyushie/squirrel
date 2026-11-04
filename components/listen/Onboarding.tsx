'use client';

import { useEffect, useRef, useState } from 'react';
import { Nut } from '@/components/feel/Nut';
import { list, savedEpisodeGuids } from '@/lib/db';
import { haptic } from '@/lib/feel';

type Steps = { episode: boolean; sats: boolean; jar: boolean };

/** First-run trail: the three things to do online before you can gift offline. Each done step earns its nut. */
export function Onboarding({ refreshKey, className = '' }: { refreshKey: number; className?: string }) {
	const [steps, setSteps] = useState<Steps>();
	// Steps finished since the trail first loaded: their nut pops in.
	const [fresh, setFresh] = useState<Set<keyof Steps>>(new Set());
	const last = useRef<Steps>(undefined);

	useEffect(() => {
		(async () => {
			const [saved, wallets, jars] = await Promise.all([savedEpisodeGuids(), list('wallet'), list('jars')]);
			const now = Date.now() / 1000;
			const next: Steps = {
				episode: saved.size > 0,
				sats: wallets.some((w) => w.proofs.length > 0) || jars.length > 0,
				jar: jars.some((j) => j.locktime > now && j.nuts.some((n) => !n.spent)),
			};
			const prev = last.current;
			last.current = next;
			const done = prev ? (Object.keys(next) as (keyof Steps)[]).filter((k) => next[k] && !prev[k]) : [];
			if (done.length) {
				setFresh((f) => new Set([...f, ...done]));
				haptic('land');
			}
			setSteps(next);
		})();
	}, [refreshKey]);

	if (!steps || (steps.episode && steps.sats && steps.jar)) return null;

	const items = [
		{ key: 'episode', done: steps.episode, title: 'Save an episode', hint: 'Tap Download on any episode below.' },
		{ key: 'sats', done: steps.sats, title: 'Add sats', hint: 'Fund your wallet from the mint.' },
		{ key: 'jar', done: steps.jar, title: 'Fill a jar', hint: 'Lock nuts to the creator so they are safe to hand over offline.' },
	] as const;
	const next = items.findIndex((i) => !i.done);

	return (
		// Desktop: the intro and the next hint on the left, the trail across the right.
		<section
			className={`card space-y-4 border-accent/40 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center lg:gap-x-12 lg:gap-y-3 lg:space-y-0 lg:p-6 ${className}`}
			aria-label="Getting started"
		>
			<div>
				<h2 className="text-xl">Stash nuts now, gift them anywhere</h2>
				<p className="text-sm text-muted">Three steps while you&apos;re online. After that, gifting works in airplane mode.</p>
			</div>
			<ol className="relative grid grid-cols-3 gap-2 lg:col-start-2 lg:row-span-2 lg:row-start-1">
				<span aria-hidden className="absolute inset-x-[16%] top-6 border-t-2 border-dashed border-line" />
				{items.map((item, i) => (
					<li key={item.key} className="relative flex flex-col items-center gap-1.5 text-center" aria-current={i === next ? 'step' : undefined}>
						<span
							aria-hidden
							className={`flex size-12 items-center justify-center rounded-full border-2 bg-card ${item.done ? 'border-transparent bg-accent/15' : i === next ? 'border-accent' : 'border-line'}`}
						>
							{item.done ? <Nut amount={32} className={`size-8 ${fresh.has(item.key) ? 'pop-in' : ''}`} /> : <span className={`num text-lg ${i === next ? 'text-accent' : 'text-muted'}`}>{i + 1}</span>}
						</span>
						<span className={`text-sm leading-tight font-semibold ${item.done ? 'text-muted' : ''}`}>
							{item.title}
							<span className="sr-only">{item.done ? ' (done)' : ''}</span>
						</span>
					</li>
				))}
			</ol>
			{next >= 0 && (
				<p key={next} className="rise-in rounded-2xl bg-background px-3 py-2 text-sm">
					<span className="font-semibold">Next:</span> {items[next].hint}
				</p>
			)}
		</section>
	);
}
