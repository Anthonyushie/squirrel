import { notFound } from 'next/navigation';
import { Lab } from '@/components/feel/Lab';

export default function FeelLabPage() {
	// A design preview, never shipped.
	if (process.env.NODE_ENV === 'production') notFound();
	return <Lab />;
}
