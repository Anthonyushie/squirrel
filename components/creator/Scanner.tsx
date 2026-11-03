'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Overlay } from '@/components/ui';

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
export function Scanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
	const video = useRef<HTMLVideoElement>(null);
	// Camera access needs a secure context (HTTPS or localhost); without it mediaDevices is missing.
	const [error, setError] = useState(() => (navigator.mediaDevices ? '' : 'Camera needs HTTPS. Open the deployed app, or paste the gift instead.'));

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
					navigator.vibrate?.(60);
					onResult(text);
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
			<div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Scan gift">
				<video ref={video} className="absolute inset-0 size-full object-cover" playsInline muted />
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<div className="aspect-square w-[78vw] max-w-sm rounded-3xl border-4 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
				</div>
				<div className="relative mt-auto space-y-3 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
					{error ? <p className="rounded-xl bg-black/70 p-3 text-sm">{error}</p> : <p className="text-sm text-white/80">Point at the gift QR on the listener&apos;s phone</p>}
					<button className="btn w-full bg-white text-black" onClick={onClose}>
						Cancel
					</button>
				</div>
			</div>
		</Overlay>
	);
}
