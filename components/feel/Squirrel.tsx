'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NutArt, nutKind } from './Nut';
import './squirrel.css';

/**
 * The pantry keeper: one hand-built SVG rig (tail, body, head, ears, eye, cheek, arms) in the acorn
 * logo's flat style, facing left toward the jar. Idle motion is CSS; poses are short, one-shot.
 * Always decorative: whatever it acts out is also written on screen.
 */
export type Pose = 'idle' | 'hop' | 'puff' | 'toss' | 'cheer' | 'worry';

export function Squirrel({
	pose = 'idle',
	holding,
	goggles = false,
	nested = false,
	className = '',
}: {
	pose?: Pose;
	/** Amount of the nut held in its paws, if any. */
	holding?: number;
	/** Aviator goggles: worn while offline, which is when Squirrel does its best work. */
	goggles?: boolean;
	/** Drawn inside another SVG (the jar's keeper slot), at its own 120 × 140 user units. */
	nested?: boolean;
	className?: string;
}) {
	return (
		<svg viewBox="0 0 120 140" {...(nested && { width: 120, height: 140 })} className={`sq overflow-visible ${className}`} data-pose={pose} aria-hidden>
			<g className="sq-all">
				<g className="sq-tail">
					<path d="M76 126c24 2 40-16 38-42-1.4-20 5-36-4-54C102 14 82 9 74 22c-6 10 2 20 12 16 8-3 12 10 10 22-2 16-6 34-16 50z" fill="var(--nut-rust)" />
					<path d="M84 31c7-5 17-1 19 9 2 12-3 24-4 38-1 14-4 28-14 40" fill="none" stroke="var(--nut-light)" strokeWidth="3.5" strokeLinecap="round" opacity=".4" />
				</g>
				<g className="sq-body">
					<path d="M40 132c-12-2-14-24-6-40 6-12 18-18 30-16 14 4 22 22 20 38-1 12-10 18-22 18z" fill="var(--nut-rust)" />
					<ellipse cx="46" cy="108" rx="10.5" ry="17" transform="rotate(12 46 108)" fill="var(--nut-light)" opacity=".88" />
					<ellipse cx="47" cy="132.5" rx="13" ry="4.5" fill="var(--nut-shell)" />
				</g>
				<g className="sq-arms">
					{holding !== undefined && (
						<g transform="translate(17 70) scale(0.42)">
							<NutArt kind={nutKind(holding)} />
						</g>
					)}
					<path d="M52 86c-6 0-12 1-16 3" fill="none" stroke="var(--nut-rust)" strokeWidth="7" strokeLinecap="round" />
					<path d="M54 92c-6 0-11 0-15 1" fill="none" stroke="var(--nut-rust)" strokeWidth="6.5" strokeLinecap="round" />
					<ellipse cx="33.5" cy="89" rx="4.2" ry="3.8" fill="var(--nut-shell)" />
					<ellipse cx="36.5" cy="94" rx="4" ry="3.6" fill="var(--nut-shell)" />
				</g>
				<g className="sq-head">
					<g transform="translate(44 58) scale(1.14) translate(-44 -58)">
						<path className="sq-ear-back" d="M56 46c-1-8 2-16 6-22 2 6 2 14 0 22z" fill="var(--nut-shell)" />
						<path d="M66 58c0-14-12-20-22-18-12 2-20 10-23 18-2 6 1 11 7 12 8 6 24 8 32 2 4-4 6-8 6-14z" fill="var(--nut-rust)" />
						<g className="sq-ear-front">
							<path d="M44 44c-2-9-.5-17 3.5-22l2.5-9 2.5 10c3 7 3 14 0 21z" fill="var(--nut-rust)" />
							<path d="M46.5 40c-1-6 .5-11 3.5-15 2 6 2 10 .5 15z" fill="var(--nut-light)" opacity=".55" />
						</g>
						<circle className="sq-cheek" cx="35" cy="65" r="6.5" fill="var(--nut-light)" opacity=".5" />
						<g className="sq-eye">
							<ellipse cx="39" cy="54" rx="3.4" ry="4.2" fill="var(--nut-ink)" />
							<circle cx="37.9" cy="52.4" r="1.2" fill="#fff" />
						</g>
						<circle cx="21.5" cy="60" r="2.6" fill="var(--nut-ink)" />
						<path d="M24 66c3 2 6 1.5 8-.5" fill="none" stroke="var(--nut-ink)" strokeWidth="1.6" strokeLinecap="round" />
						{goggles && (
							<g className="sq-goggles">
								<path d="M28 47c10-6 26-7 38 0" fill="none" stroke="var(--nut-line)" strokeWidth="4" strokeLinecap="round" />
								<circle cx="40" cy="44" r="6.5" fill="var(--nut-light)" fillOpacity=".7" stroke="var(--nut-line)" strokeWidth="2.6" />
								<circle cx="53" cy="42.5" r="5.5" fill="var(--nut-light)" fillOpacity=".7" stroke="var(--nut-line)" strokeWidth="2.6" />
								<path d="M37.5 41.5l3-2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
							</g>
						)}
					</g>
				</g>
			</g>
		</svg>
	);
}

/** Holds a pose for one beat, then returns to idle. Replaying the same pose restarts it. */
export function usePose(initial: Pose = 'idle') {
	const [pose, setPose] = useState<Pose>(initial);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	const play = useCallback((next: Pose, ms = 700) => {
		clearTimeout(timer.current);
		setPose('idle');
		requestAnimationFrame(() => setPose(next));
		timer.current = setTimeout(() => setPose('idle'), ms);
	}, []);
	return [pose, play] as const;
}
