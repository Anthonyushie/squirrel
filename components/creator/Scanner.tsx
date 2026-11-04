'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Overlay } from '@/components/ui';
import { haptic, reducedMotion } from '@/lib/feel';

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
	interface Window {
		BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
	}
}

/**
 * Full-screen camera QR scanner. Uses the native BarcodeDetector where it exists (Chrome on
 * Android) and jsQR everywhere else (iOS Safari). Works offline; needs HTTPS for the camera.
 */
export function Scanner({
	onResult,
	onClose,
	label = 'Scan gift',
	hint = "Point at the gift QR on the listener's phone",
	onPaste,
}: {
	onResult: (text: string) => void;
	onClose: () => void;
	label?: string;
	hint?: string;
	/** Offers pasting the code instead, for one-phone demos and browsers without a camera. */
	onPaste?: () => void;
}) {
	const video = useRef<HTMLVideoElement>(null);
	// Camera access needs a secure context (HTTPS or localhost); without it mediaDevices is missing.
	const [error, setError] = useState(() => (navigator.mediaDevices ? '' : 'Camera needs HTTPS. Open the deployed app, or paste the gift instead.'));
	// The viewfinder snaps shut on the code for a beat before the result screen takes over.
	const [found, setFound] = useState(false);

	useEffect(() => {
		let stream: MediaStream | undefined;
		let raf = 0;
		let stopped = false;
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : undefined;

		async function tick() {
			const v = video.current;
			if (stopped || !v) return;
			if (v.readyState >= 2 && v.videoWidth) {
				let text: string | undefined;
				if (detector) {
					text = (await detector.detect(v).catch(() => []))[0]?.rawValue;
				} else if (ctx) {
					// Scan a centered square at up to 1000px: dense gift codes need the resolution.
					const side = Math.min(v.videoWidth, v.videoHeight);
					const size = Math.min(side, 1000);
					canvas.width = canvas.height = size;
					ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, size, size);
					text = jsQR(ctx.getImageData(0, 0, size, size).data, size, size, { inversionAttempts: 'dontInvert' })?.data;
				}
				if (text && !stopped) {
					stopped = true;
					haptic('tap');
					setFound(true);
					const found = text;
					setTimeout(() => onResult(found), reducedMotion() ? 0 : 240);
					return;
				}
			}
			raf = requestAnimationFrame(tick);
		}

		navigator.mediaDevices
			?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
			.then((s) => {
				stream = s;
				if (!video.current) return;
				video.current.srcObject = s;
				video.current.play().then(tick, tick);
			})
			.catch((e: Error) => setError(e.name === 'NotAllowedError' ? 'Camera permission was denied.' : `Camera unavailable: ${e.message}`));

		return () => {
			stopped = true;
			cancelAnimationFrame(raf);
			stream?.getTracks().forEach((t) => t.stop());
		};
	}, [onResult]);

	return (
		<Overlay>
			<div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={label}>
				<video ref={video} className="absolute inset-0 size-full object-cover" playsInline muted />
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<div
						className={`relative aspect-square w-[78vw] max-w-sm transition-transform duration-200 ${found ? 'scale-90' : '[animation:breathe_2.4s_ease-in-out_infinite]'}`}
					>
						<div className="absolute inset-0 rounded-3xl shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)]" />
						{['top-0 left-0 border-t-[5px] border-l-[5px] rounded-tl-3xl', 'top-0 right-0 border-t-[5px] border-r-[5px] rounded-tr-3xl', 'bottom-0 left-0 border-b-[5px] border-l-[5px] rounded-bl-3xl', 'bottom-0 right-0 border-r-[5px] border-b-[5px] rounded-br-3xl'].map((c) => (
							<span key={c} className={`absolute size-14 transition-colors ${found ? 'border-[#4ade80]' : 'border-white'} ${c}`} />
						))}
					</div>
				</div>
				<div className="relative mt-auto space-y-3 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
					{error ? <p className="rounded-xl bg-black/70 p-3 text-sm">{error}</p> : <p className="text-sm text-white/80">{hint}</p>}
					<button className="btn w-full bg-white text-black" onClick={onClose}>
						Cancel
					</button>
					{onPaste && (
						<button className="btn w-full text-sm text-white/85" onClick={onPaste}>
							Paste instead
						</button>
					)}
				</div>
			</div>
		</Overlay>
	);
}
