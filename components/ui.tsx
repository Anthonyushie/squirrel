'use client';

import { useEffect, useState, type ReactNode } from 'react';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
		window.addEventListener('keydown', onKey);
		document.body.style.overflow = 'hidden';
		return () => {
			window.removeEventListener('keydown', onKey);
			document.body.style.overflow = '';
		};
	}, [onClose]);

	return (
		<div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50" onClick={onClose}>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-lg font-bold">{title}</h2>
					<button className="btn -mr-2 min-h-11 px-3 text-muted" onClick={onClose} aria-label="Close">
						✕
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}

export function CopyText({ value, label }: { value: string; label?: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex items-stretch gap-2">
			<code className="min-w-0 flex-1 truncate rounded-xl border border-line bg-background px-3 py-3 font-mono text-sm" title={value}>
				{value}
			</code>
			<button
				className="btn-ghost shrink-0"
				aria-label={label ? `Copy ${label}` : 'Copy'}
				onClick={async () => {
					await navigator.clipboard.writeText(value);
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				}}
			>
				{copied ? 'Copied' : 'Copy'}
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
	return <p className={`rounded-xl border px-3 py-2 text-sm ${styles}`}>{children}</p>;
}
