'use client';

import { useEffect, useState } from 'react';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * A whole number whose digits roll like an odometer when it changes, each in its own cell so the
 * rest of the line never reflows. The real value stays in the DOM for screen readers; the reels are hidden.
 */
export function Rolling({ value, className = '' }: { value: number; className?: string }) {
	const digits = String(Math.max(0, Math.round(value))).split('').map(Number);
	// A page load shows the number as it is; only later changes roll.
	const [live, setLive] = useState(false);
	useEffect(() => {
		const id = requestAnimationFrame(() => setLive(true));
		return () => cancelAnimationFrame(id);
	}, []);

	return (
		<span className={`num inline-flex ${className}`}>
			<span className="sr-only">{value}</span>
			<span aria-hidden className="inline-flex">
				{digits.map((d, i) => {
					const place = digits.length - 1 - i;
					return (
						// The invisible digit sizes the cell (Fredoka has no tabular figures, so a fixed 1ch cell
						// opens gaps around a 1) and keeps the baseline. overflow: clip hides the reel without
						// making a scroll container, so the baseline holds and the reel adds no scroll height.
						<span key={place} className="relative inline-block h-[1.1em] overflow-clip text-center leading-[1.1em]">
							<span className="invisible">{d}</span>
							<span
								className="absolute inset-x-0 top-0 flex flex-col items-center"
								style={{
									transform: `translateY(${-d * 1.1}em)`,
									transition: live ? `transform 760ms var(--ease-out) ${place * 45}ms` : 'none',
								}}
							>
								{DIGITS.map((n) => (
									<span key={n} className="block h-[1.1em]">
										{n}
									</span>
								))}
							</span>
						</span>
					);
				})}
			</span>
		</span>
	);
}
