'use client';

import { useEffect, useState } from 'react';
import { CheckIcon } from '@/components/feel/icons';
import { NutChip } from '@/components/feel/Nut';
import { Notice, Sheet } from '@/components/ui';
import { confirmCashOut, parseDestination, prepareCashOut, suggestedAmount, type CashOutPlan, type CashOutResult } from '@/lib/cashout';
import { getSetting } from '@/lib/db';
import { haptic, sfx } from '@/lib/feel';
import { useOnline } from '@/lib/hooks';
import { isTestMint, mintHost } from '@/lib/settings';

/** Sends redeemed sats on one mint to a Lightning address or invoice: quote first, then pay. */
export function CashOut({ mintUrl, available, onClose, onChange }: { mintUrl: string; available: number; onClose: () => void; onChange: () => void }) {
	const online = useOnline();
	const [to, setTo] = useState('');
	const [amount, setAmount] = useState('');
	const [plan, setPlan] = useState<CashOutPlan>();
	const [busy, setBusy] = useState<'' | 'quote' | 'send'>('');
	const [error, setError] = useState('');
	const [result, setResult] = useState<{ plan: CashOutPlan; r: CashOutResult }>();

	useEffect(() => {
		getSetting('cashOutTo').then((last) => last && setTo((t) => t || last));
	}, []);

	const dest = parseDestination(to);
	const test = isTestMint(mintUrl);

	function edit(next: () => void) {
		next();
		setPlan(undefined);
		setError('');
	}

	async function quote() {
		setBusy('quote');
		setError('');
		try {
			// An empty amount means as much as the fees allow.
			setPlan(await prepareCashOut(mintUrl, to, dest?.kind === 'address' && amount ? Number(amount) : undefined));
		} catch (e) {
			setError((e as Error).message);
			sfx.thud();
			haptic('error');
		} finally {
			setBusy('');
		}
	}

	async function send() {
		if (!plan) return;
		setBusy('send');
		setError('');
		try {
			const r = await confirmCashOut(plan);
			if (r.paid || r.pending) {
				setResult({ plan, r });
				sfx.chime();
				haptic('success');
			} else {
				setError("The mint couldn't pay that invoice. Your sats are still here.");
				setPlan(undefined);
			}
		} catch (e) {
			setError(`${(e as Error).message.replace(/\.+$/, '')}. Anything the mint didn't spend is still here.`);
			setPlan(undefined);
			sfx.thud();
			haptic('error');
		} finally {
			setBusy('');
			onChange();
		}
	}

	if (result) {
		const { plan: p, r } = result;
		return (
			<Sheet title={r.paid ? 'Sent' : 'On its way'} onClose={onClose}>
				<div className="space-y-4 pb-2 text-center">
					<div className="relative mx-auto w-fit">
						<NutChip amount={p.amount} className="pop-in size-20" />
						<span className="absolute -right-1 -bottom-1 flex size-9 items-center justify-center rounded-full bg-ok text-white" aria-hidden>
							<CheckIcon className="size-5" strokeWidth={3} />
						</span>
					</div>
					<p className="num text-5xl leading-none font-semibold">
						{p.amount} <span className="text-xl font-medium">sats</span>
					</p>
					<p className="text-balance">{r.paid ? `Paid to ${shortTo(p.to)} over Lightning.` : "The mint is still routing it. Check back here: if it doesn't go through, the sats come back."}</p>
					<p className="text-sm text-muted">
						Fees {sats(Math.max(0, r.spent - p.amount))}
						{r.change ? ` · ${sats(r.change)} of unused fee came back` : ''}
					</p>
					{test && <Notice tone="warn">Test mint: no real bitcoin moved.</Notice>}
					<button className="btn-primary w-full" onClick={onClose}>
						Done
					</button>
				</div>
			</Sheet>
		);
	}

	return (
		<Sheet title="Send to Lightning" onClose={onClose}>
			<div className="space-y-4">
				<p className="text-sm text-muted">
					{available} sats on {mintHost(mintUrl)}. The mint pays your Lightning wallet from them.
				</p>
				<label className="block">
					<span className="label">Lightning address or invoice</span>
					<input
						className="field font-mono text-sm"
						value={to}
						onChange={(e) => edit(() => setTo(e.target.value))}
						placeholder="you@wallet.com or lnbc…"
						autoCapitalize="off"
						autoComplete="off"
						spellCheck={false}
					/>
				</label>
				{dest?.kind === 'address' && (
					<label className="block">
						<span className="label">Amount in sats</span>
						<input
							className="field num"
							value={amount}
							onChange={(e) => edit(() => setAmount(e.target.value.replace(/\D/g, '')))}
							placeholder={`All of it, about ${suggestedAmount(available)} after fees`}
							inputMode="numeric"
						/>
					</label>
				)}

				{plan && (
					<div className="space-y-2 rounded-2xl bg-background p-3 text-sm">
						<dl className="space-y-1.5">
							<Line label="To" value={shortTo(plan.to)} />
							<Line label="They receive" value={sats(plan.amount)} />
							<Line label="Routing fee, at most" value={sats(plan.feeReserve)} />
							<Line label="Mint fee, at most" value={sats(plan.inputFee)} />
							<Line label="Total, at most" value={`${plan.amount + plan.feeReserve + plan.inputFee} of ${plan.available} sats`} strong />
						</dl>
						{plan.movedAway > 0 && <p className="text-xs text-muted">{plan.movedAway} sats were already moved to another wallet and are no longer counted.</p>}
						<p className="text-xs text-muted">Whatever routing fee isn&apos;t used comes back as change.</p>
					</div>
				)}
				{test && <Notice tone="warn">Test mint: the payment is simulated and no real bitcoin moves.</Notice>}
				{error && <Notice tone="bad">{error}</Notice>}

				{plan ? (
					<button className="btn-primary w-full text-lg" onClick={send} disabled={!!busy || !online} aria-busy={busy === 'send'}>
						{busy === 'send' ? (
							<>
								<NutChip amount={32} spin className="size-6" /> Sending…
							</>
						) : (
							`Send ${plan.amount} sats`
						)}
					</button>
				) : (
					<button className="btn-primary w-full" onClick={quote} disabled={!dest || !!busy || !online} aria-busy={busy === 'quote'}>
						{busy === 'quote' ? 'Getting a quote…' : 'Get quote'}
					</button>
				)}
				{!online && <p className="text-center text-xs text-muted">Sending to Lightning needs a connection.</p>}
			</div>
		</Sheet>
	);
}

const sats = (n: number) => `${n} ${n === 1 ? 'sat' : 'sats'}`;
const shortTo = (to: string) => (to.includes('@') ? to : `${to.slice(0, 16)}…${to.slice(-6)}`);

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
	return (
		<div className={`flex justify-between gap-3 ${strong ? 'border-t border-line pt-1.5 font-semibold' : ''}`}>
			<dt className={strong ? '' : 'text-muted'}>{label}</dt>
			<dd className="num min-w-0 truncate text-right">{value}</dd>
		</div>
	);
}
