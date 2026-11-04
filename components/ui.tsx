'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, CloseIcon } from '@/components/feel/icons';
import { haptic, reducedMotion } from '@/lib/feel';

/**
 * Renders overlays on <body>, so a parent's stacking context (like the sticky player) can't
 * put them underneath the tab bar.
 */
export function Overlay({ children }: { children: ReactNode }) {
	return createPortal(children, document.body);
}

/** Matches the `lg` breakpoint, where sheets open as centred dialogs instead. */
const centred = () => matchMedia('(min-width: 64rem)').matches;

/**
 * Bottom sheet: slides up, drag the top edge down (or tap outside, or Escape) to put it away.
 * On desktop it is a centred dialog that fades in, with no grabber to drag.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
	const panel = useRef<HTMLDivElement>(null);
	const backdrop = useRef<HTMLDivElement>(null);
	const closing = useRef(false);
	const drag = useRef<{ start: number; dy: number; t: number; v: number }>(undefined);

	const close = useCallback(() => {
		const p = panel.current;
		if (closing.current) return;
		closing.current = true;
		if (!p || reducedMotion()) return onClose();
		const from = p.style.transform || 'translateY(0)';
		const frames = centred()
			? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(12px) scale(0.98)' }]
			: [{ transform: from }, { transform: 'translateY(100%)' }];
		backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
		p.animate(frames, { duration: 200, easing: 'cubic-bezier(0.7, 0, 0.84, 0)', fill: 'forwards' }).finished.then(onClose, onClose);
	}, [onClose]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
		window.addEventListener('keydown', onKey);
		document.body.style.overflow = 'hidden';
		return () => {
			window.removeEventListener('keydown', onKey);
			document.body.style.overflow = '';
		};
	}, [close]);

	function onDown(e: PointerEvent<HTMLDivElement>) {
		if ((e.target as HTMLElement).closest('button') || centred()) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		drag.current = { start: e.clientY, dy: 0, t: e.timeStamp, v: 0 };
	}

	function onMove(e: PointerEvent<HTMLDivElement>) {
		const d = drag.current;
		if (!d || !panel.current) return;
		const dy = Math.max(0, e.clientY - d.start);
		d.v = (dy - d.dy) / Math.max(1, e.timeStamp - d.t);
		d.dy = dy;
		d.t = e.timeStamp;
		panel.current.style.transform = `translateY(${dy}px)`;
	}

	function onUp() {
		const d = drag.current;
		const p = panel.current;
		drag.current = undefined;
		if (!d || !p) return;
		if (d.dy > 110 || d.v > 0.6) return close();
		p.animate([{ transform: `translateY(${d.dy}px)` }, { transform: 'translateY(0)' }], { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
		p.style.transform = '';
	}

	return (
		<Overlay>
			<div ref={backdrop} className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 [animation:fade-in_220ms_ease-out_both] lg:items-center lg:p-8" onClick={close}>
				<div
					ref={panel}
					role="dialog"
					aria-modal="true"
					aria-label={title}
					className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border border-line bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-20px_var(--shadow)] [animation:sheet-up_420ms_var(--ease-out)_both] lg:max-h-[min(85vh,52rem)] lg:rounded-[2rem] lg:px-6 lg:pb-6 lg:shadow-[0_24px_60px_-28px_var(--shadow)] lg:[animation:dialog-in_320ms_var(--ease-out)_both]"
					onClick={(e) => e.stopPropagation()}
				>
					<div
						className="sticky top-0 z-10 -mx-4 cursor-grab touch-none bg-card px-4 pt-2 pb-3 lg:-mx-6 lg:cursor-auto lg:touch-auto lg:px-6 lg:pt-5"
						onPointerDown={onDown}
						onPointerMove={onMove}
						onPointerUp={onUp}
						onPointerCancel={onUp}
					>
						<div aria-hidden className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line lg:hidden" />
						<div className="flex items-center justify-between gap-3">
							<h2 className="text-xl">{title}</h2>
							<button className="btn -mr-2 size-11 shrink-0 p-0 text-muted" onClick={close} aria-label="Close">
								<CloseIcon className="size-5" />
							</button>
						</div>
					</div>
					{children}
				</div>
			</div>
		</Overlay>
	);
}

export function CopyText({ value, label }: { value: string; label?: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex items-stretch gap-2">
			<code className="min-w-0 flex-1 truncate rounded-2xl border border-line bg-background px-3 py-3 font-mono text-sm" title={value}>
				{value}
			</code>
			<button
				className="btn-ghost w-24 shrink-0"
				aria-label={label ? `Copy ${label}` : 'Copy'}
				onClick={async () => {
					await navigator.clipboard.writeText(value);
					haptic('tick');
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				}}
			>
				{copied ? (
					<span className="pop-in flex items-center gap-1 text-ok">
						<CheckIcon className="size-4" strokeWidth={3} /> Copied
					</span>
				) : (
					'Copy'
				)}
			</button>
		</div>
	);
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint: ReactNode; checked: boolean; onChange: (on: boolean) => void }) {
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

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode }) {
	const styles = {
		info: 'border-line bg-background text-muted',
		warn: 'border-accent/40 bg-accent/10 text-foreground',
		bad: 'border-bad/40 bg-bad/10 text-bad',
		ok: 'border-ok/40 bg-ok/10 text-ok',
	}[tone];
	return <p className={`rounded-2xl border px-3 py-2 text-sm ${tone === 'bad' ? 'shake-x' : ''} ${styles}`}>{children}</p>;
}
