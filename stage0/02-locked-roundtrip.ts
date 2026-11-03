// 0.2 Locked nut round trip: mint, lock 32-sat nuts to CREATOR with locktime and
// LISTENER refund key, redeem one as CREATOR, show LISTENER can't redeem before locktime.
// Saves keys, the unspent locked nut and the mint keychain to out/ for 0.3 and 0.4.
// Run: MINT_URL=https://testnut.cashu.space npx tsx 02-locked-roundtrip.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { MintQuoteState, OutputData, Wallet, serializeProofs, type Proof } from '@cashu/cashu-ts';
import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const MINT_URL = process.env.MINT_URL ?? 'https://testnut.cashu.space';
const LOCKTIME = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

function keypair() {
	const priv = randomBytes(32);
	return { priv: bytesToHex(priv), pub: bytesToHex(secp256k1.getPublicKey(priv, true)) };
}
const sum = (ps: Proof[]) => ps.reduce((a, p) => a + p.amount.toNumber(), 0);
const amounts = (ps: Proof[]) => ps.map((p) => p.amount.toNumber()).join(', ');
const step = (n: number, msg: string) => console.log(`\n[${n}] ${msg}`);

step(1, 'Keypairs');
const CREATOR = keypair();
const LISTENER = keypair();
console.log(`  CREATOR  pub ${CREATOR.pub}`);
console.log(`  LISTENER pub ${LISTENER.pub} (refund)`);

const wallet = new Wallet(MINT_URL);
await wallet.loadMint();

step(2, `Mint 100 sats from ${MINT_URL}`);
const quote = await wallet.createMintQuoteBolt11(100);
console.log(`  invoice ${quote.request.slice(0, 40)}...`);
for (let i = 0; ; i++) {
	const { state } = await wallet.checkMintQuoteBolt11(quote.quote);
	if (state === MintQuoteState.PAID) break;
	if (i > 30) throw new Error('quote never paid');
	await new Promise((r) => setTimeout(r, 1000));
}
const minted = await wallet.mintProofsBolt11(100, quote.quote);
console.log(`  minted ${sum(minted)} sats in ${minted.length} proofs: ${amounts(minted)}`);

step(3, 'Swap into two 32-sat nuts locked to CREATOR (locktime +30d, refund LISTENER)');
const { keep: change, send: locked } = await wallet.ops
	.send(64, minted)
	.asP2PK({ pubkey: CREATOR.pub, locktime: LOCKTIME, refundKeys: [LISTENER.pub] }, [32, 32])
	.run();
console.log(`  locked: ${amounts(locked)}  change (unlocked): ${amounts(change)} = ${sum(change)}`);
console.log(`  fee paid on swap: ${sum(minted) - sum(locked) - sum(change)} sat`);
console.log(`  DLEQ present on locked nuts: ${locked.every((p) => p.dleq != null)}`);

step(4, 'Locked nut secret');
console.log(`  ${locked[0].secret}`);

step(5, 'CREATOR redeems nut A');
const redeemed = await wallet.receive({ mint: MINT_URL, unit: 'sat', proofs: [locked[0]] }, { privkey: CREATOR.priv });
console.log(`  PASS  received ${sum(redeemed)} sats (32 minus input fee)`);

step(6, 'LISTENER tries to redeem nut B before locktime');
try {
	await wallet.receive({ mint: MINT_URL, unit: 'sat', proofs: [locked[1]] }, { privkey: LISTENER.priv });
	console.log('  FAIL  wallet accepted the refund key before locktime');
	process.exit(1);
} catch (e) {
	console.log(`  PASS  cashu-ts refused client-side: ${(e as Error).message}`);
}

// cashu-ts refuses before asking the mint, so sign with the refund key by hand and post
// /v1/swap directly to prove the MINT enforces the lock, not just our library.
step(7, 'Same attempt sent straight to the mint, signed with the refund key');
const nutB = locked[1];
const sig = schnorr.sign(sha256(utf8ToBytes(nutB.secret)), hexToBytes(LISTENER.priv));
const outputs = [16, 8, 4, 2, 1].map((a) => OutputData.createSingleRandomData(a, nutB.id).blindedMessage);
const res = await fetch(`${MINT_URL}/v1/swap`, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({
		inputs: [
			{
				amount: nutB.amount.toNumber(),
				id: nutB.id,
				secret: nutB.secret,
				C: nutB.C,
				witness: JSON.stringify({ signatures: [bytesToHex(sig)] }),
			},
		],
		outputs: outputs.map((o) => ({ amount: o.amount.toNumber(), id: o.id, B_: o.B_ })),
	}),
});
const body = await res.text();
if (res.ok) {
	console.log('  FAIL  mint accepted the refund signature before locktime');
	process.exit(1);
}
console.log(`  PASS  mint rejected it (HTTP ${res.status}): ${body}`);

mkdirSync('out', { recursive: true });
writeFileSync(
	'out/state.json',
	JSON.stringify(
		{
			mintUrl: MINT_URL,
			creator: CREATOR,
			listener: LISTENER,
			locktime: LOCKTIME,
			nut: JSON.parse(serializeProofs(locked[1])[0]),
		},
		null,
		2,
	),
);
console.log('\nSaved unspent nut B and test keys to out/state.json');
