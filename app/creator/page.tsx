import type { Metadata } from 'next';
import { Creator } from '@/components/creator/Creator';

export const metadata: Metadata = { title: 'Creator · Squirrel' };

export default function CreatorPage() {
	return <Creator />;
}
