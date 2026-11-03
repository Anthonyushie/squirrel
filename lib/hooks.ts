'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

function subscribeOnline(cb: () => void) {
	window.addEventListener('online', cb);
	window.addEventListener('offline', cb);
	return () => {
		window.removeEventListener('online', cb);
		window.removeEventListener('offline', cb);
	};
}

/** navigator.onLine, live. Assumes online during server render. */
export function useOnline() {
	return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** Loads async data on mount and exposes a reload. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
	const [data, setData] = useState<T>();
	const [version, setVersion] = useState(0);
	useEffect(() => {
		let live = true;
		load().then((d) => live && setData(d));
		return () => {
			live = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [version, ...deps]);
	return [data, () => setVersion((v) => v + 1)] as const;
}
