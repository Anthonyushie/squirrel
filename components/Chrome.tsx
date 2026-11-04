'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { haptic } from '@/lib/feel';
import { useOnline } from '@/lib/hooks';

const TABS = [
	{ href: '/listen', label: 'Listen', icon: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' },
	{ href: '/creator', label: 'Creator', icon: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10' },
	{ href: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z' },
];

export function Header() {
	const online = useOnline();
	// Bumped when the connection changes while the page is open: the pill flips over, and going
	// offline briefly says the part that matters.
	const [flips, setFlips] = useState(0);
	const [reassure, setReassure] = useState(false);

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;
		const onChange = () => {
			setFlips((n) => n + 1);
			haptic('tick');
			clearTimeout(timer);
			setReassure(!navigator.onLine);
			if (!navigator.onLine) timer = setTimeout(() => setReassure(false), 3500);
		};
		window.addEventListener('online', onChange);
		window.addEventListener('offline', onChange);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('online', onChange);
			window.removeEventListener('offline', onChange);
		};
	}, []);

	return (
		<header className="sticky top-0 z-20 border-b border-line bg-background px-4 py-3 [view-transition-name:header] lg:px-8">
			<div className="mx-auto flex max-w-6xl items-center justify-between">
				<div className="flex items-center gap-10">
					<span className="flex items-center gap-2 font-display text-xl font-semibold">
						<img src="/icon.svg" alt="" className="size-8" />
						Squirrel
					</span>
					<TopNav />
				</div>
				<span
					key={flips}
					role="status"
					className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${flips ? 'flip-in' : ''} ${online ? 'bg-ok/15 text-ok' : 'bg-muted/20 text-muted'}`}
				>
					<span className={`size-2 rounded-full ${online ? 'bg-ok' : 'bg-muted'}`} />
					{online ? 'Online' : reassure ? 'Offline · gifting still works' : 'Offline'}
				</span>
			</div>
		</header>
	);
}

function TabIcon({ d, className }: { d: string; className: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
			<path d={d} />
		</svg>
	);
}

/** Desktop: the tabs move up into the header, and the pill glides along it. */
function TopNav() {
	const path = usePathname();
	return (
		<nav aria-label="Main" className="hidden lg:block">
			<ul className="flex gap-1">
				{TABS.map((t) => {
					const active = path.startsWith(t.href);
					return (
						<li key={t.href}>
							<a
								href={t.href}
								aria-current={active ? 'page' : undefined}
								className={`relative flex h-10 items-center gap-2 rounded-full px-4 font-display font-semibold transition-colors duration-200 ${active ? 'text-accent' : 'text-muted hover:bg-foreground/5 hover:text-foreground'}`}
							>
								{active && <span aria-hidden className="absolute inset-0 rounded-full bg-accent/15 [view-transition-name:tab-pill]" />}
								<TabIcon d={t.icon} className="relative size-5" />
								<span className="relative">{t.label}</span>
							</a>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

// Plain <a> links on purpose: full navigations are served by the service worker when offline,
// where client-side RSC fetches would fail. They animate as cross-document view transitions.
export function TabBar() {
	const path = usePathname();
	return (
		<nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-background pb-[env(safe-area-inset-bottom)] [view-transition-name:tabbar] lg:hidden">
			<ul className="mx-auto flex max-w-lg">
				{TABS.map((t) => {
					const active = path.startsWith(t.href);
					return (
						<li key={t.href} className="flex-1">
							<a
								href={t.href}
								aria-current={active ? 'page' : undefined}
								onClick={() => haptic('tick')}
								className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? 'text-accent' : 'text-muted'}`}
							>
								<span className={`flex h-8 w-14 items-center justify-center rounded-full ${active ? 'bg-accent/15 [view-transition-name:tab-pill] lg:[view-transition-name:none]' : ''}`}>
									<TabIcon d={t.icon} className="size-6" />
								</span>
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
