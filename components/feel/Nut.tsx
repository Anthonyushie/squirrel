import type { SVGProps } from 'react';

/**
 * Nut art, drawn in a 64×64 box centred on (32, 32) in the acorn logo's flat style and colours.
 * Size follows value so a jar reads at a glance: hazelnut 8, acorn 32 (the logo itself), walnut 64.
 */
export type NutKind = 'hazelnut' | 'acorn' | 'walnut';

export const nutKind = (amount: number): NutKind => (amount <= 16 ? 'hazelnut' : amount <= 48 ? 'acorn' : 'walnut');

/** Collision radius relative to a hazelnut, used by the jar physics and to size icons. */
export const NUT_SCALE: Record<NutKind, number> = { hazelnut: 1, acorn: 1.25, walnut: 1.5 };

/** Radius of each drawing inside its 64-unit box, so `scale = radius / ART_RADIUS`. */
export const ART_RADIUS: Record<NutKind, number> = { hazelnut: 19, acorn: 22, walnut: 22 };

export function NutArt({ kind }: { kind: NutKind }) {
	if (kind === 'hazelnut') {
		return (
			<g>
				<path d="M32 12c1.8 0 2.9 1.4 3.6 3.2C44.6 17.4 51 25.2 51 34.5 51 45 42.6 52 32 52s-19-7-19-17.5c0-9.3 6.4-17.1 15.4-19.3.7-1.8 1.8-3.2 3.6-3.2z" fill="var(--nut-rust)" />
				<path d="M17.5 40c3.2 6.2 8.4 9.4 14.5 9.4S43.3 46.2 46.5 40c-4.3 2.1-9.2 3.2-14.5 3.2S21.8 42.1 17.5 40z" fill="var(--nut-light)" opacity=".5" />
				<path d="M22 29c1.8-4.4 5.4-7.6 9.6-8.6" fill="none" stroke="var(--nut-light)" strokeWidth="3" strokeLinecap="round" opacity=".75" />
			</g>
		);
	}
	if (kind === 'walnut') {
		return (
			<g>
				<path d="M32 10c12.2 0 21 9.6 21 22.4S44.2 55 32 55s-21-9.8-21-22.6S19.8 10 32 10z" fill="var(--nut-shell)" />
				<path d="M32 11.5v42" stroke="var(--nut-line)" strokeWidth="2.6" />
				<path d="M21 21c3.2 2.4 4.2 5.6 3 8.8M18.6 36c3.2 1.2 5 4.4 4 8.4M43 21c-3.2 2.4-4.2 5.6-3 8.8M45.4 36c-3.2 1.2-5 4.4-4 8.4M26.5 15.5c1.2 3 .2 5.4-2 7.2M37.5 15.5c-1.2 3-.2 5.4 2 7.2M27 49c-1.4-2.6-1-5 1-7M37 49c1.4-2.6 1-5-1-7" fill="none" stroke="var(--nut-line)" strokeWidth="2" strokeLinecap="round" />
				<path d="M17.6 28c.8-6.2 4.4-11.4 9.4-14" fill="none" stroke="var(--nut-light)" strokeWidth="3" strokeLinecap="round" opacity=".35" />
			</g>
		);
	}
	// The logo's acorn, path for path.
	return (
		<g>
			<path d="M32 8v6" stroke="var(--nut-shell)" strokeWidth="4" strokeLinecap="round" />
			<path d="M14 27c0-8 8-13 18-13s18 5 18 13v2H14z" fill="var(--nut-shell)" />
			<path d="M14 27c0-8 8-13 18-13s18 5 18 13" fill="none" stroke="var(--nut-line)" strokeWidth="2" />
			<path d="M17 29h30c0 13-6 22-15 27-9-5-15-14-15-27z" fill="var(--nut-amber)" />
			<path d="M23 34c0 7 3 12 7 15" fill="none" stroke="var(--nut-light)" strokeWidth="3" strokeLinecap="round" opacity=".7" />
		</g>
	);
}

/** A nut on a dark disc, for sitting on the accent fill of a primary button, where the acorn's amber would vanish. */
export function NutChip({ amount, className = '', spin = false }: { amount: number; className?: string; spin?: boolean }) {
	return (
		<span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--nut-ink)]/85 p-[3px] ${className}`}>
			<Nut amount={amount} className={`size-full ${spin ? 'rock' : ''}`} />
		</span>
	);
}

/** A standalone nut icon for a gift of `amount` sats. Decorative: the amount is always written next to it. */
export function Nut({ amount, ...props }: { amount: number } & SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 64 64" aria-hidden {...props}>
			<NutArt kind={nutKind(amount)} />
		</svg>
	);
}
