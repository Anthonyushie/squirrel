// 0.3 Offline verification of the locked nut saved by 0.2.
// Phase 1 (online, once): fetch the mint's public keys into out/keys.json.
// Phase 2 (offline): with fetch disabled, check lock, locktime and DLEQ using only out/ files.
// Run: npx tsx 03-offline-verify.ts

import { readFileSync, writeFileSync } from 'node:fs';
import {
	deserializeProofs,
	getP2PKExpectedWitnessPubkeys,
	hasValidDleq,
	parseP2PKSecret,
	type HasKeysetKeys,
	type Proof,
} from '@cashu/cashu-ts';

const state = JSON.parse(readFileSync('out/state.json', 'utf8'));
const [nut] = deserializeProofs([state.nut]);

console.log('[online] Fetch and save mint keys');
const res = await fetch(`${state.mintUrl}/v1/keys`);
writeFileSync('out/keys.json', JSON.stringify({ mintUrl: state.mintUrl, fetchedAt: Date.now(), ...(await res.json()) }, null, 2));
console.log('  saved out/keys.json');

// From here on any network call throws, so a PASS can't have come from the mint.
globalThis.fetch = () => {
	throw new Error('network call attempted in offline section');
};

const { keysets }: { keysets: HasKeysetKeys[] } = JSON.parse(readFileSync('out/keys.json', 'utf8'));

type Check = { name: string; ok: boolean; detail: string };

function verifyGift(proof: Proof, myLockKey: string, nowSec = Math.floor(Date.now() / 1000)): Check[] {
	const checks: Check[] = [];

	// 1. Locked to me, and only me: the keys that can sign right now must be exactly mine.
	// (An extra lock key in a "pubkeys" tag would let someone else spend it.)
	try {
		const [kind, data] = parseP2PKSecret(proof.secret);
		const signers = getP2PKExpectedWitnessPubkeys(proof.secret);
		const ok = kind === 'P2PK' && data.data === myLockKey && signers.length === 1 && signers[0] === myLockKey;
		checks.push({ name: 'Locked to my key', ok, detail: `signers now: ${signers.join(', ') || 'none (unlocked!)'}` });

		// 2. Locktime still in the future, otherwise the refund key could already take it back.
		const locktime = Number(data.tags?.find((t) => t[0] === 'locktime')?.[1] ?? 0);
		const days = ((locktime - nowSec) / 86400).toFixed(1);
		checks.push({ name: 'Locktime not passed', ok: locktime > nowSec, detail: `${days} days left to redeem` });
	} catch (e) {
		checks.push({ name: 'Locked to my key', ok: false, detail: `not a P2PK secret: ${(e as Error).message}` });
	}

	// 3. The mint really signed it (NUT-12 DLEQ), against cached keys only.
	const keyset = keysets.find((k) => k.id === proof.id);
	let dleqOk = false;
	let detail = keyset ? 'mint signature valid' : `unknown keyset ${proof.id}`;
	if (keyset) {
		try {
			dleqOk = hasValidDleq(proof, keyset, { require: true });
			if (!dleqOk) detail = 'DLEQ proof invalid or missing';
		} catch (e) {
			detail = (e as Error).message;
		}
	}
	checks.push({ name: 'Mint signed it (DLEQ)', ok: dleqOk, detail });
	return checks;
}

function report(label: string, checks: Check[]) {
	console.log(`\n[offline] ${label}`);
	for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}`);
	return checks.every((c) => c.ok);
}

const genuine = report('Genuine nut, as CREATOR', verifyGift(nut, state.creator.pub));

// Negative cases: each should fail exactly the check it targets.
const wrongCreator = report('Genuine nut, checked by someone else', verifyGift(nut, state.listener.pub));
const forged = report('Forged nut (C changed)', verifyGift({ ...nut, C: nut.C.slice(0, -2) + (nut.C.endsWith('00') ? '01' : '00') }, state.creator.pub));
const expired = report('Genuine nut, 31 days from now', verifyGift(nut, state.creator.pub, Math.floor(Date.now() / 1000) + 31 * 86400));

const ok = genuine && !wrongCreator && !forged && !expired;
console.log(`\n${ok ? 'PASS' : 'FAIL'}  genuine nut verifies offline; wrong key, forgery and expiry are all caught`);
if (!ok) process.exit(1);
