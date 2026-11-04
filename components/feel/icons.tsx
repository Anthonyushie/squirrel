import type { SVGProps } from 'react';

/** Stroke icons in the tab bar's style: 24-unit box, 2px round strokes, currentColor. */
function Icon({ d, ...props }: { d: string } & SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
			<path d={d} />
		</svg>
	);
}

type P = SVGProps<SVGSVGElement>;

export const PlusIcon = (p: P) => <Icon d="M12 5v14M5 12h14" {...p} />;
export const MinusIcon = (p: P) => <Icon d="M5 12h14" {...p} />;
export const CloseIcon = (p: P) => <Icon d="M6 6l12 12M18 6L6 18" {...p} />;
export const CheckIcon = (p: P) => <Icon d="M5 12.5l4.5 4.5L19 7.5" {...p} />;
export const PlayIcon = (p: P) => <Icon d="M7 4.5v15l12-7.5z" fill="currentColor" {...p} />;
export const PauseIcon = (p: P) => <Icon d="M8 5v14M16 5v14" strokeWidth={3} {...p} />;
export const BackIcon = (p: P) => <Icon d="M11 6l-6 6 6 6M5 12h9a5 5 0 0 1 0 10" {...p} />;
export const DownloadIcon = (p: P) => <Icon d="M12 4v11M7 10l5 5 5-5M5 20h14" {...p} />;
export const ScanIcon = (p: P) => <Icon d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" {...p} />;
export const TrashIcon = (p: P) => <Icon d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" {...p} />;
export const ChevronDownIcon = (p: P) => <Icon d="M6 9l6 6 6-6" {...p} />;
export const ReplayIcon = (p: P) => <Icon d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" {...p} />;
export const ForwardIcon = (p: P) => <Icon d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4" {...p} />;
