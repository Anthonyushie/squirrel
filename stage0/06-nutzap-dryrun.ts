// 0.6 Nutzap dry run: build a real NIP-61 kind 9321 nutzap to a creator, on a mint from their
// kind 10019, and verify it the way an observer would. Signs the event but does NOT publish it.
// Run (real sats, you pay the invoice): npx tsx 06-nutzap-dryrun.ts
// Run (test mint, nothing real):       MINT_URL=https://testnut.cashu.space npx tsx 06-nutzap-dryrun.ts --allow-unlisted

import { mkdirSync, writeFileSync } from 'node:fs';
import { MintQuoteState, Wallet, getEncodedToken, hasValidDleq, serializeProofs, type Proof } from '@cashu/cashu-ts';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, randomBytes } from '@noble/hashes/utils.js';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, verifyEvent } from 'nostr-tools';
import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import QRCode from 'qrcode';
import WebSocket from 'ws';

useWebSocketImplementation(WebSocket);

const MINT_URL = process.env.MINT_URL ?? 'https://mint.minibits.cash/Bitcoin';
const NPUB = process.env.CREATOR_NPUB ?? 'npub1n0devk3h2l3rx6vmt24a3lz4hsxp7j8rn3x44jkx6daj7j8jzc0q2u02cy';
const FUND = 21; // sats to mint; one 8-sat nut is zapped, the rest stays as change
const NUT = 8;
const ALLOW_UNLISTED = process.argv.includes('--allow-unlisted');
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const sum = (ps: Proof[]) => ps.reduce((a, p) => a + p.amount.toNumber(), 0);

// 1. Creator's nutzap info
const recipient = nip19.decode(NPUB).data as string;
const pool = new SimplePool();
const info = await pool.get(RELAYS, { kinds: [10019], authors: [recipient] }, { maxWait: 5000 });
pool.close(RELAYS);
if (!info) throw new Error('creator has no kind 10019; nutzaps are not possible');
const listedMints = info.tags.filter((t) => t[0] === 'mint').map((t) => t[1]);
const rawKey = info.tags.find((t) => t[0] === 'pubkey')?.[1];
if (!rawKey) throw new Error('kind 10019 has no pubkey tag');
// NIP-61: x-only keys get a "02" prefix; a 33-byte compressed key is used as-is.
const lockKey = rawKey.length === 64 ? `02${rawKey}` : rawKey;
console.log(`[1] Creator lock key ${lockKey}`);
console.log(`    Listed mints: ${listedMints.join(', ')}`);

// NIP-61 requires the exact URL string the creator listed.
const listed = listedMints.includes(MINT_URL);
if (!listed && !ALLOW_UNLISTED) throw new Error(`${MINT_URL} is not in the creator's mints; they may never claim it`);
console.log(`    ${MINT_URL}: ${listed ? 'listed' : 'NOT listed (test run only, --allow-unlisted)'}`);

// 2. Fund
const wallet = new Wallet(MINT_URL);
await wallet.loadMint();
const quote = await wallet.createMintQuoteBolt11(FUND);
console.log(`\n[2] Pay this ${FUND}-sat invoice from any Lightning wallet (waits up to 10 minutes):\n`);
console.log(await QRCode.toString(quote.request, { type: 'terminal', small: true, errorCorrectionLevel: 'L' }));
console.log(quote.request);
for (let i = 0; ; i++) {
	const { state } = await wallet.checkMintQuoteBolt11(quote.quote);
	if (state === MintQuoteState.PAID) break;
	if (i > 300) throw new Error('invoice not paid within 10 minutes');
	await new Promise((r) => setTimeout(r, 2000));
}
const minted = await wallet.mintProofsBolt11(FUND, quote.quote);
console.log(`    minted ${sum(minted)} sats`);

// 3. Lock one nut to the creator, with the listener's refund key as the fallback
const refundPriv = randomBytes(32);
const refundPub = bytesToHex(secp256k1.getPublicKey(refundPriv, true));
const locktime = Math.floor(Date.now() / 1000) + 30 * 86400;
const { keep: change, send: [nut] } = await wallet.ops
	.send(NUT, minted)
	.asP2PK({ pubkey: lockKey, locktime, refundKeys: [refundPub] }, [NUT])
	.run();
console.log(`\n[3] Locked ${nut.amount.toNumber()}-sat nut to creator, change ${sum(change)} sats`);

// 4. Build and sign the kind 9321 nutzap (NIP-61), not published
const listenerNostr = generateSecretKey();
const event = finalizeEvent(
	{
		kind: 9321,
		created_at: Math.floor(Date.now() / 1000),
		content: 'Squirrel test nutzap: Danke für die Folge!',
		tags: [
			['proof', serializeProofs(nut)[0]],
			['unit', 'sat'],
			['u', MINT_URL],
			['p', recipient],
		],
	},
	listenerNostr,
);
console.log(`\n[4] Signed kind 9321 ${event.id} from ${nip19.npubEncode(getPublicKey(listenerNostr))}`);

// 5. Verify it the way NIP-61 tells observers to
const proof = JSON.parse(event.tags.find((t) => t[0] === 'proof')![1]);
const keyset = await wallet.keyChain.getKeyset(proof.id);
const checks = {
	'event signature': verifyEvent(event),
	'mint is listed by creator': listedMints.includes(event.tags.find((t) => t[0] === 'u')![1]),
	'locked to creator 10019 key': JSON.parse(proof.secret)[1].data === lockKey,
	'DLEQ valid': hasValidDleq(nut, keyset, { require: true }),
};
console.log('\n[5] Observer checks');
for (const [name, ok] of Object.entries(checks)) console.log(`    ${ok ? 'PASS' : 'FAIL'}  ${name}`);

// Keep everything needed to recover the sats: change token, plus the locked nut and refund key
// (reclaimable after locktime if the event is never published or claimed).
mkdirSync('out', { recursive: true });
const file = `out/nutzap-${new URL(MINT_URL).hostname}-${event.id.slice(0, 8)}.json`;
writeFileSync(
	file,
	JSON.stringify(
		{
			mintUrl: MINT_URL,
			event,
			refundPriv: bytesToHex(refundPriv),
			listenerNostrPriv: bytesToHex(listenerNostr),
			changeToken: getEncodedToken({ mint: MINT_URL, unit: 'sat', proofs: change }),
			lockedNutToken: getEncodedToken({ mint: MINT_URL, unit: 'sat', proofs: [nut] }),
		},
		null,
		2,
	),
);
console.log(`\nNOT published. Event, keys and a change token (paste into any Cashu wallet) saved to ${file}`);
if (!Object.values(checks).every(Boolean) || (!listed && !ALLOW_UNLISTED)) process.exit(1);
