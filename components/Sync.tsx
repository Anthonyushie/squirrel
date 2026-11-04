'use client';

import { useEffect } from 'react';
import { publishQueued } from '@/lib/nutzap';
import { checkRedeemed } from '@/lib/refund';

export const CHANGED = 'squirrel:changed';
/** Dispatch after queueing a gift, so it goes out right away when already online. */
export const QUEUED = 'squirrel:queued';

/**
 * Sends queued gifts as nutzaps and asks the mints which gifts the creator redeemed: on app start,
 * whenever the device comes back online or the app comes back into view, and right after a gift is queued.
 */
export function Sync() {
	useEffect(() => {
		let running = false;
		// A gift queued mid-run missed that run's list: go round once more.
		let again = false;
		async function run() {
			if (!navigator.onLine) return;
			if (running) {
				again = true;
				return;
			}
			running = true;
			try {
				do {
					again = false;
					const { sent, failed } = await publishQueued();
					const redeemed = await checkRedeemed();
					if (sent || failed || redeemed) window.dispatchEvent(new Event(CHANGED));
				} while (again);
			} catch (e) {
				console.error('nutzap sync failed', e);
			} finally {
				running = false;
			}
		}
		const onVisible = () => document.visibilityState === 'visible' && run();
		run();
		window.addEventListener('online', run);
		window.addEventListener(QUEUED, run);
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			window.removeEventListener('online', run);
			window.removeEventListener(QUEUED, run);
			document.removeEventListener('visibilitychange', onVisible);
		};
	}, []);
	return null;
}
