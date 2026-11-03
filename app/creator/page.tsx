import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Creator · Squirrel' };

export default function CreatorPage() {
	return (
		<section className="space-y-4">
			<h1 className="text-2xl font-bold">Creator</h1>
			<p className="text-muted">Scan and verify gifts here, even offline.</p>
		</section>
	);
}
