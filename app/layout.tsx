import type { Metadata, Viewport } from 'next';
import { Fredoka, Geist, Geist_Mono } from 'next/font/google';
import { Header, ServiceWorker, TabBar } from '@/components/Chrome';
import { Sync } from '@/components/Sync';
import './globals.css';

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
});

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
});

// Display voice: numbers, titles, buttons and jar labels.
const fredoka = Fredoka({
	variable: '--font-fredoka',
	subsets: ['latin'],
});

export const metadata: Metadata = {
	title: 'Squirrel',
	description: 'Stash nuts now, gift them anywhere. Offline Cashu gifts for podcast creators.',
	appleWebApp: { capable: true, title: 'Squirrel', statusBarStyle: 'default' },
	icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
	viewportFit: 'cover',
	themeColor: [
		{ media: '(prefers-color-scheme: light)', color: '#faf6f0' },
		{ media: '(prefers-color-scheme: dark)', color: '#17120e' },
	],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
	return (
		<html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} h-full antialiased`}>
			<body className="flex min-h-full flex-col font-sans">
				<Header />
				<main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-28 lg:max-w-[calc(72rem+4rem)] lg:px-8 lg:pt-8 lg:pb-16">{children}</main>
				<TabBar />
				<ServiceWorker />
				<Sync />
			</body>
		</html>
	);
}
