import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Settings · Squirrel' };

export default function SettingsPage() {
	return (
		<section className="space-y-4">
			<h1 className="text-2xl font-bold">Settings</h1>
			<p className="text-muted">Mint, creator and keys.</p>
		</section>
	);
}
