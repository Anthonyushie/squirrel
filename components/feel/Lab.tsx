'use client';

import { useRef, useState } from 'react';
import { setFeelPrefs, useFeelPrefs } from '@/lib/feel';
import { Jar, type JarHandle } from './Jar';
import { Nut } from './Nut';
import { Rolling } from './Rolling';
import { Squirrel, usePose, type Pose } from './Squirrel';

const POSES: Pose[] = ['idle', 'hop', 'puff', 'toss', 'cheer', 'worry'];

/** Dev-only preview of every nut, pose and jar state at phone size. */
export function Lab() {
	const prefs = useFeelPrefs();
	const [nuts, setNuts] = useState<number[]>([8, 8, 8, 32, 32, 64]);
	const [pose, play] = usePose();
	const [goggles, setGoggles] = useState(false);
	const jar = useRef<JarHandle>(null);
	const total = nuts.reduce((a, n) => a + n, 0);

	return (
		<div className="space-y-8">
			<section className="flex items-end justify-around">
				{[8, 32, 64].map((a) => (
					<div key={a} className="text-center">
						<Nut amount={a} className="mx-auto size-16" />
						<p className="num text-sm">{a}</p>
					</div>
				))}
			</section>

			<section className="flex items-end gap-2">
				<div className="w-1/2" onPointerDown={() => jar.current?.rattle()}>
					<Jar ref={jar} nuts={nuts} onPour={(p) => p === 'start' && play('puff', 900)} />
				</div>
				<Squirrel pose={pose} goggles={goggles} holding={pose === 'toss' ? 32 : undefined} className="w-1/3" />
			</section>
			<p className="num text-4xl">
				<Rolling value={total} /> <span className="text-base text-muted">sats</span>
			</p>

			<div className="flex flex-wrap gap-2">
				<button className="btn-primary" onClick={() => setNuts([...nuts, 8, 32, 64])}>
					Pour 3
				</button>
				<button className="btn-ghost" onClick={() => setNuts([...nuts, ...Array<number>(20).fill(8)])}>
					Pour 20
				</button>
				<button className="btn-ghost" onClick={() => setNuts(nuts.slice(0, -1))}>
					Take 1
				</button>
				<button className="btn-ghost" onClick={() => setNuts([])}>
					Empty
				</button>
				<button className="btn-ghost" onClick={() => setGoggles(!goggles)}>
					Goggles
				</button>
				<button className="btn-ghost" onClick={() => setFeelPrefs({ sound: !prefs.sound })}>
					Sound {prefs.sound ? 'on' : 'off'}
				</button>
				<button className="btn-primary" disabled>
					Disabled
				</button>
			</div>
			<div className="flex flex-wrap gap-2">
				{POSES.map((p) => (
					<button key={p} className="btn-ghost min-h-10 text-sm" onClick={() => play(p, 1100)}>
						{p}
					</button>
				))}
			</div>
		</div>
	);
}
