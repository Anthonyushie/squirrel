'use client';

import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { haptic, playMoment, reducedMotion, sfx } from '@/lib/feel';
import { JarSim, seeded, type Body } from '@/lib/jar-physics';
import { ART_RADIUS, NUT_SCALE, NutArt, nutKind } from './Nut';
import './jar.css';

/** Inside of the glass in SVG units (viewBox 200 × 250). */
const BOUNDS = { left: 26, right: 174, floor: 240, corner: 30 };
/** New nuts drop in through the neck. */
const MOUTH = { left: 64, right: 136 };
/** Nuts are sized so even a full jar stays below the shoulders. */
const FILL_TOP = 104;
const MAX_VISIBLE = 90;
/** Contents that arrive this soon after an empty first paint are the page loading, not a pour. */
const LOAD_GRACE_MS = 1500;

const GLASS =
	'M62 30h76c0 14 4 20 14 24 18 6 26 16 26 38v120c0 20-12 32-32 32H54c-20 0-32-12-32-32V92c0-22 8-32 26-38 10-4 14-10 14-24z';

export type JarHandle = { rattle(): void };
export type PourPhase = 'start' | 'land' | 'end';

type Props = {
	/** One entry per nut, its amount in sats. The jar shows exactly these. */
	nuts: number[];
	ref?: Ref<JarHandle>;
	className?: string;
	onPour?: (phase: PourPhase) => void;
	/** Which moment's play count this jar's pours use (see playMoment). */
	moment?: string;
	/**
	 * A squirrel (an SVG rig in a 120 × 140 box) standing behind the jar, peeking over the lid with
	 * its paws on it. The jar hides its body, so give the wrapper about 24% top padding for the head.
	 */
	keeper?: ReactNode;
};

/**
 * A glass jar holding real nuts: simulated, sized by value, settled on first paint. New nuts pour in
 * through the lid, removed ones hop out. Tap to rattle; on Android, tilting the phone shifts them.
 * Decorative: the label next to it carries the numbers.
 */
export function Jar({ nuts, ref, className = '', onPour, moment = 'pour', keeper }: Props) {
	const mask = `jar-${useId().replace(/[^\w-]/g, '')}`;
	const sim = useRef<JarSim>(null);
	const svg = useRef<SVGSVGElement>(null);
	const nodes = useRef(new Map<number, SVGGElement>());
	const raf = useRef(0);
	const visible = useRef(true);
	const packedAt = useRef(0);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const leaving = useRef(new Set<number>());
	const pourHandler = useRef(onPour);
	const [bodies, setBodies] = useState<{ id: number; amount: number; leaving: boolean }[]>([]);
	const lid = useRef<SVGGElement>(null);

	useLayoutEffect(() => {
		pourHandler.current = onPour;
	});
	const pourEvent = (phase: PourPhase) => pourHandler.current?.(phase);

	function apply() {
		for (const b of sim.current?.bodies ?? []) {
			const el = nodes.current.get(b.id);
			if (!el) continue;
			const s = b.r / ART_RADIUS[nutKind(b.amount)];
			el.setAttribute('transform', `translate(${b.x.toFixed(2)} ${b.y.toFixed(2)}) rotate(${((b.angle * 180) / Math.PI).toFixed(1)}) scale(${s.toFixed(4)}) translate(-32 -32)`);
		}
	}

	function tick() {
		const s = sim.current;
		if (!s) return;
		const landed = s.step();
		if (landed.length) {
			sfx.clink();
			haptic('land');
			pourEvent('land');
		}
		apply();
		raf.current = s.asleep || !visible.current ? 0 : requestAnimationFrame(tick);
	}

	function wake() {
		sim.current?.wake();
		if (!raf.current && visible.current) raf.current = requestAnimationFrame(tick);
	}

	const publish = () => setBodies(sim.current!.bodies.map(({ id, amount }) => ({ id, amount, leaving: leaving.current.has(id) })));

	useImperativeHandle(ref, () => ({
		rattle() {
			const s = sim.current;
			if (!s || reducedMotion()) return;
			const rand = Math.random;
			for (const b of s.bodies) {
				b.px = b.x + (rand() - 0.5) * 5;
				b.py = b.y + 2 + rand() * 4;
			}
			sfx.clink();
			timers.current.push(setTimeout(() => sfx.clink(), 90));
			haptic('tap');
			wake();
		},
	}));

	// Reconcile the simulated nuts with the real ones whenever the jar's contents change. A layout
	// effect, so a jar that already holds nuts is packed before its first paint and never flashes empty.
	const contents = [...nuts].sort((a, b) => a - b).join(',');
	useLayoutEffect(() => {
		const s = (sim.current ??= new JarSim(BOUNDS));
		const shown = visibleNuts(nuts);
		const unit = unitRadius(shown);
		const radius = (amount: number) => unit * NUT_SCALE[nutKind(amount)];
		for (const b of s.bodies) b.r = radius(b.amount);

		const want = countBy(shown);
		const have = countBy(s.bodies.filter((b) => !leaving.current.has(b.id)).map((b) => b.amount));
		const adds: number[] = [];
		const removes: Body[] = [];
		for (const amount of new Set([...want.keys(), ...have.keys()])) {
			const diff = (want.get(amount) ?? 0) - (have.get(amount) ?? 0);
			if (diff > 0) adds.push(...Array<number>(diff).fill(amount));
			if (diff < 0) {
				// The topmost nuts leave first, like taking them off the pile.
				const pile = s.bodies.filter((b) => b.amount === amount && !leaving.current.has(b.id)).sort((a, b) => a.y - b.y);
				removes.push(...pile.slice(0, -diff));
			}
		}

		const loading = !packedAt.current || (!s.bodies.length && performance.now() - packedAt.current < LOAD_GRACE_MS);
		if (loading) {
			packedAt.current ||= performance.now();
			for (const amount of shuffle(adds, seeded(adds.length * 7919 + 13))) s.add(amount, radius(amount), 0, 0, false);
			s.pack(seeded(adds.length * 104729 + 7));
			publish();
			return;
		}

		if (removes.length) {
			for (const b of removes) leaving.current.add(b.id);
			publish();
			timers.current.push(
				setTimeout(() => {
					for (const b of removes) {
						s.remove(b.id);
						leaving.current.delete(b.id);
					}
					publish();
					wake();
				}, 300),
			);
		}

		if (adds.length) {
			const play = playMoment(moment);
			if (play === 'still') {
				for (const amount of adds) s.add(amount, radius(amount), 0, 0, false);
				s.pack(seeded(s.bodies.length));
				publish();
				apply();
				return;
			}
			const gap = play === 'full' ? 130 : 45;
			const rand = Math.random;
			lid.current?.setAttribute('data-open', 'true');
			pourEvent('start');
			sfx.pop();
			shuffle(adds, rand).forEach((amount, i) => {
				timers.current.push(
					setTimeout(() => {
						const r = radius(amount);
						const x = MOUTH.left + r + rand() * Math.max(0, MOUTH.right - MOUTH.left - 2 * r);
						const b = s.add(amount, r, x, -r - 6, true);
						b.angle = rand() * Math.PI * 2;
						// A little sideways drift so the pile doesn't stack in a column.
						b.px = b.x + (rand() - 0.5) * 1.6;
						publish();
						wake();
					}, 220 + i * gap),
				);
			});
			timers.current.push(
				setTimeout(
					() => {
						lid.current?.setAttribute('data-open', 'false');
						sfx.pop();
						pourEvent('end');
					},
					220 + adds.length * gap + 650,
				),
			);
		} else {
			wake();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- `contents` is the stable form of `nuts`
	}, [contents]);

	// New nut nodes get their position before the browser paints them.
	useLayoutEffect(apply, [bodies]);

	useEffect(() => {
		const list = timers.current;
		return () => {
			cancelAnimationFrame(raf.current);
			list.forEach(clearTimeout);
		};
	}, []);

	// Sleep while off screen.
	useEffect(() => {
		const el = svg.current;
		if (!el) return;
		const io = new IntersectionObserver(([e]) => {
			visible.current = e.isIntersecting;
			if (e.isIntersecting) wake();
		});
		io.observe(el);
		return () => io.disconnect();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Tilting the phone tips the nuts. iOS needs a permission prompt for this; a decoration doesn't earn one.
	useEffect(() => {
		if (reducedMotion() || typeof DeviceOrientationEvent === 'undefined') return;
		if (typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function') return;
		let last = 0;
		const onTilt = (e: DeviceOrientationEvent) => {
			const s = sim.current;
			if (e.gamma == null || !s) return;
			const g = Math.max(-35, Math.min(35, e.gamma));
			if (Math.abs(g - last) < 3) return;
			last = g;
			const rad = (g * Math.PI) / 180;
			s.gx = Math.sin(rad) * 0.42;
			s.gy = Math.cos(rad) * 0.42;
			wake();
		};
		window.addEventListener('deviceorientation', onTilt);
		return () => window.removeEventListener('deviceorientation', onTilt);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<svg ref={svg} viewBox="0 0 200 250" className={`block overflow-visible ${className}`} aria-hidden>
			{keeper && (
				<>
					<defs>
						<mask id={mask}>
							<rect x="-60" y="-90" width="320" height="400" fill="#fff" />
							{/* Clear glass: its body shows through, dimmed, behind the nuts. */}
							<path d={GLASS} fill="#555" />
							<rect x="56" y="26" width="88" height="10" fill="#555" />
						</mask>
					</defs>
					<g mask={`url(#${mask})`}>
						<g transform="translate(86 -50) scale(0.9)">{keeper}</g>
					</g>
				</>
			)}
			<ellipse cx="100" cy="247" rx="76" ry="5" fill="var(--shadow)" />
			<path d={GLASS} fill="var(--glass)" />
			<g>
				{bodies.map((b) => (
					<g
						key={b.id}
						ref={(el) => {
							if (el) nodes.current.set(b.id, el);
							else nodes.current.delete(b.id);
						}}
					>
						<g className={b.leaving ? 'jar-leave' : undefined}>
							<NutArt kind={nutKind(b.amount)} />
						</g>
					</g>
				))}
			</g>
			<path d={GLASS} fill="none" stroke="var(--glass-edge)" strokeWidth="3.5" strokeLinejoin="round" />
			<path d="M37 104c-2 40-2 76 2 106" fill="none" stroke="var(--glass-shine)" strokeWidth="7" strokeLinecap="round" opacity=".5" />
			<path d="M46 74c4-7 10-11 18-13" fill="none" stroke="var(--glass-shine)" strokeWidth="5" strokeLinecap="round" opacity=".5" />
			<path d="M164 120v36" fill="none" stroke="var(--glass-shine)" strokeWidth="4" strokeLinecap="round" opacity=".3" />
			<rect x="56" y="26" width="88" height="10" rx="4" fill="var(--glass)" stroke="var(--glass-edge)" strokeWidth="3" />
			<g ref={lid} className="jar-lid" data-open="false">
				<rect x="50" y="6" width="100" height="22" rx="6" fill="var(--shelf)" />
				<rect x="50" y="19" width="100" height="9" rx="3" fill="var(--shelf-edge)" />
				<path d="M60 13h80" stroke="var(--nut-light)" strokeWidth="2" strokeLinecap="round" opacity=".3" />
				{keeper && (
					<g fill="var(--nut-shell)">
						<ellipse cx="111" cy="7" rx="5.5" ry="3.6" />
						<ellipse cx="123.5" cy="7.5" rx="5.5" ry="3.6" />
					</g>
				)}
			</g>
		</svg>
	);
}

function countBy(amounts: number[]) {
	const m = new Map<number, number>();
	for (const a of amounts) m.set(a, (m.get(a) ?? 0) + 1);
	return m;
}

/** Past MAX_VISIBLE, show the same mix of nuts at a smaller count; the label keeps the exact numbers. */
function visibleNuts(nuts: number[]) {
	if (nuts.length <= MAX_VISIBLE) return nuts;
	const out: number[] = [];
	for (const [amount, n] of countBy(nuts)) out.push(...Array<number>(Math.max(1, Math.round((n * MAX_VISIBLE) / nuts.length))).fill(amount));
	return out;
}

/** Hazelnut radius that fills the jar to about its shoulders, within sensible limits. */
function unitRadius(amounts: number[]) {
	const area = (BOUNDS.right - BOUNDS.left) * (BOUNDS.floor - FILL_TOP);
	const sum = amounts.reduce((a, n) => a + NUT_SCALE[nutKind(n)] ** 2, 0) || 1;
	return Math.min(17, Math.max(5, Math.sqrt((0.55 * area) / (Math.PI * sum))));
}

function shuffle<T>(items: T[], rand: () => number) {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}
