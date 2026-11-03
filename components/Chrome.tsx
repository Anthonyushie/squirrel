'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useOnline } from '@/lib/hooks';

const TABS = [
	{ href: '/listen', label: 'Listen', icon: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' },
	{ href: '/creator', label: 'Creator', icon: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10' },
	{ href: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z' },
];

export function Header() {
	const online = useOnline();
	return (
		<header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-background/90 px-4 py-3 backdrop-blur">
			<span className="flex items-center gap-2 text-lg font-bold">
				<img src="/icon.svg" alt="" className="size-7" />
				Squirrel
			</span>
			<span
				className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${online ? 'bg-ok/15 text-ok' : 'bg-muted/20 text-muted'}`}
			>
				<span className={`size-2 rounded-full ${online ? 'bg-ok' : 'bg-muted'}`} />
				{online ? 'Online' : 'Offline'}
			</span>
		</header>
	);
}

// Plain <a> links on purpose: full navigations are served by the service worker when offline,
// where client-side RSC fetches would fail.
export function TabBar() {
	const path = usePathname();
	return (
		<nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
			<ul className="mx-auto flex max-w-lg">
				{TABS.map((t) => {
					const active = path.startsWith(t.href);
					return (
						<li key={t.href} className="flex-1">
							<a
								href={t.href}
								aria-current={active ? 'page' : undefined}
								className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${active ? 'text-accent' : 'text-muted'}`}
							>
								<svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
									<path d={t.icon} />
								</svg>
								{t.label}
							</a>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

export function ServiceWorker() {
	useEffect(() => {
		// Service workers stay off in dev; offline behavior is tested on a production build.
		if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
		navigator.serviceWorker
			.register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID}`, { scope: '/', updateViaCache: 'none' })
			.catch((e) => console.error('SW registration failed', e));
	}, []);
	return null;
}
