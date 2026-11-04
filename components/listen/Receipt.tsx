'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckIcon, CloseIcon } from '@/components/feel/icons';
import { Nut } from '@/components/feel/Nut';
import { Squirrel } from '@/components/feel/Squirrel';
import { Scanner } from '@/components/creator/Scanner';
import { Overlay, Sheet } from '@/components/ui';
import { formatTime } from '@/lib/feed';
import { haptic, playMoment, sfx } from '@/lib/feel';
import { acceptReceipt, type ReceiptResult } from '@/lib/receipt';

/**
 * The listener's side of a receipt: scan (or paste) the creator's signed receipt, check the
 * signature offline against the jar's lock key, and say so.
 */
export function ReceiptScan({ onClose, onChange }: { onClose: (received: boolean) => void; onChange: () => void }) {
	// Without a secure context there's no camera: go straight to pasting.
	const [pasting, setPasting] = useState<boolean>(() => !navigator.mediaDevices);
	const [result, setResult] = useState<ReceiptResult>();
	// The scanner restarts its camera when onResult changes, so keep the callback stable.
	const changed = useRef(onChange);
	useEffect(() => {
		changed.current = onChange;
	}, [onChange]);

	const check = useCallback(async (text: string) => {
		const r = await acceptReceipt(text);
		setResult(r);
		if (r.ok) changed.current();
	}, []);

	if (result) return <ReceiptResultScreen r={result} onClose={() => onClose(result.ok)} onRetry={() => setResult(undefined)} />;
	if (pasting) return <PasteReceipt onSubmit={check} onClose={() => onClose(false)} />;
	return <Scanner label="Scan receipt" hint="Point at the receipt on the creator's phone" onResult={check} onClose={() => onClose(false)} onPaste={() => setPasting(true)} />;
}

function PasteReceipt({ onSubmit, onClose }: { onSubmit: (text: string) => void; onClose: () => void }) {
	const [text, setText] = useState('');
	return (
		<Sheet title="Paste a receipt" onClose={onClose}>
			<div className="space-y-3">
				<textarea className="field min-h-24 resize-none py-2 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="sqr1|…" autoCapitalize="off" spellCheck={false} />
				<button className="btn-primary w-full" onClick={() => onSubmit(text)} disabled={!text.trim()}>
					Check receipt
				</button>
			</div>
		</Sheet>
	);
}

function ReceiptResultScreen({ r, onClose, onRetry }: { r: ReceiptResult; onClose: () => void; onRetry: () => void }) {
	const [play] = useState(() => playMoment(r.ok ? 'receipt' : 'receipt-bad'));
	const pace = play === 'full' ? 1 : play === 'short' ? 0.5 : 0;
	const ms = (n: number) => `${Math.round(n * pace)}ms`;

	useEffect(() => {
		const t = setTimeout(
			() => {
				if (r.ok) {
					sfx.chime();
					haptic('success');
				} else {
					sfx.thud();
					haptic('error');
				}
			},
			Math.round(380 * pace),
		);
		return () => clearTimeout(t);
	}, [r, pace]);

	return (
		<Overlay>
			<div
				role="alertdialog"
				aria-modal="true"
				aria-label={r.ok ? 'Gift received' : 'Receipt not accepted'}
				className={`fixed inset-0 z-50 flex flex-col overflow-y-auto px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white ${r.ok ? 'bg-[#15803d]' : 'bg-[#92400e]'}`}
			>
				<div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
					<div className="relative">
						<div className="flex size-32 items-center justify-center rounded-full bg-white/15">
							<Nut amount={r.ok ? r.gift.amount : 32} className="size-20" style={pace ? { animation: `nut-drop ${ms(620)} var(--ease-out) both` } : undefined} />
						</div>
						<span
							className={`absolute -right-1 -bottom-1 flex size-12 items-center justify-center rounded-full bg-white ${r.ok ? 'text-[#15803d]' : 'text-[#92400e]'}`}
							style={{ animation: `pop-in 380ms var(--ease-out) ${ms(380)} both` }}
						>
							{r.ok ? <CheckIcon className="size-7" strokeWidth={3} /> : <CloseIcon className="size-7" strokeWidth={3} />}
						</span>
						{r.ok && <Squirrel pose="cheer" className="absolute bottom-0 left-full ml-2 w-20" />}
					</div>
					{r.ok ? (
						<>
							<p className="font-display text-5xl font-semibold" style={{ animation: `stamp-in 460ms var(--ease-out) ${ms(380)} both` }}>
								Received
							</p>
							<p className="num text-2xl font-semibold">
								{r.creatorName} has your {r.gift.amount} sats
							</p>
							{r.gift.message && <p className="max-w-sm text-xl text-balance">&ldquo;{r.gift.message}&rdquo;</p>}
							<p className="text-sm text-white/85">
								at {formatTime(r.gift.seconds)} in {r.gift.episodeTitle}
							</p>
						</>
					) : (
						<>
							<p className="font-display text-4xl font-semibold" style={{ animation: `stamp-in 460ms var(--ease-out) ${ms(380)} both` }}>
								Not accepted
							</p>
							<p className="max-w-sm text-lg text-balance">{r.reason}</p>
						</>
					)}
				</div>
				{r.ok && (
					<ul className="mx-auto mt-6 mb-4 w-full max-w-sm space-y-1.5 text-sm" aria-label="Offline checks">
						{['Signed by the key your jar is locked to', 'Checked on this phone, no network'].map((label) => (
							<li key={label} className="flex items-start gap-2.5">
								<span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-white/25" aria-hidden>
									<CheckIcon className="size-3.5" strokeWidth={3} />
								</span>
								<span className="font-semibold">{label}</span>
							</li>
						))}
					</ul>
				)}
				<div className="mx-auto w-full max-w-sm space-y-1">
					<button className="btn w-full bg-white text-black" onClick={onClose}>
						Done
					</button>
					{!r.ok && (
						<button className="btn w-full text-white/90" onClick={onRetry}>
							Try again
						</button>
					)}
				</div>
			</div>
		</Overlay>
	);
}
