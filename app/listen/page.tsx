import type { Metadata } from 'next';
import { Listen } from '@/components/listen/Listen';

export const metadata: Metadata = { title: 'Listen · Squirrel' };

export default function ListenPage() {
	return <Listen />;
}
