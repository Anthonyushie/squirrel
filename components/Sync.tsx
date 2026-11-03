'use client';

import { useEffect } from 'react';
import { publishQueued } from '@/lib/nutzap';

export const CHANGED = 'squirrel:changed';

/** Sends queued gifts as nutzaps on app start and whenever the device comes back online. */
export function Sync() {
	useEffect(() => {
		let running = false;
		async function run() {
			if (running || !navigator.onLine) return;
			running = true;
			try {
				const { sent, failed } = await publishQueued();
				if (sent || failed) window.dispatchEvent(new Event(CHANGED));
			} catch (e) {
				console.error('nutzap sync failed', e);
			} finally {
				running = false;
			}
		}
		run();
		window.addEventListener('online', run);
		return () => window.removeEventListener('online', run);
	}, []);
	return null;
}
