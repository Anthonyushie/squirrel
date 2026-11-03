import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Header, ServiceWorker, TabBar } from '@/components/Chrome';
import './globals.css';

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
});

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
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
		<html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
			<body className="flex min-h-full flex-col font-sans">
				<Header />
				<main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-28">{children}</main>
				<TabBar />
				<ServiceWorker />
			</body>
		</html>
	);
}
