'use client';

import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckIcon } from '@/components/feel/icons';
import { Nut } from '@/components/feel/Nut';
import { Overlay } from '@/components/ui';
import { haptic } from '@/lib/feel';
import { signReceipt } from '@/lib/receipt';

/** The creator's signed receipt, full screen for the listener to scan. Signed right here, offline. */
export function ReceiptQr({ id, amount, lockPriv, onClose }: { id: string; amount: number; lockPriv: string; onClose: () => void }) {
	const receipt = useMemo(() => signReceipt(id, lockPriv), [id, lockPriv]);
	const [copied, setCopied] = useState(false);

	return (
		<Overlay>
			<div
				className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-white px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-black [animation:fade-in_200ms_ease-out_both]"
				role="dialog"
				aria-modal="true"
				aria-label="Receipt QR code"
			>
				<div className="flex items-center gap-3 text-left">
					<span className="relative shrink-0">
						<Nut amount={amount} className="pop-in size-12" />
						<span className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full bg-[#15803d] text-white" aria-hidden>
							<CheckIcon className="size-4" strokeWidth={3} />
						</span>
					</span>
					<div>
						<p className="num text-3xl leading-none font-semibold">Receipt · {amount} sats</p>
						<p className="mt-1 text-sm text-neutral-600">signed with your key · for the listener to scan</p>
					</div>
				</div>
				<div className="w-full max-w-sm [animation:rise-in_480ms_120ms_var(--ease-out)_both]">
					<QRCodeSVG value={receipt} level="M" marginSize={2} className="h-auto w-full" size={512} />
				</div>
				<div className="w-full max-w-sm space-y-2 text-center">
					<p className="pb-1 text-sm text-neutral-600">Their phone checks your signature offline and marks the gift received.</p>
					<button
						className="btn w-full bg-black text-white"
						onClick={() => {
							haptic('success');
							onClose();
						}}
					>
						Done
					</button>
					<button
						className="btn w-full text-sm text-neutral-600"
						onClick={async () => {
							await navigator.clipboard.writeText(receipt);
							haptic('tick');
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						}}
					>
						{copied ? 'Copied' : 'Copy receipt'}
					</button>
				</div>
			</div>
		</Overlay>
	);
}
