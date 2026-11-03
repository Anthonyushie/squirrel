// Builds and signs a kind 9321 nutzap from a gift token and checks it the way NIP-61 observers
// should. Never publishes. Run: stage0/node_modules/.bin/tsx scripts/check-nutzap.mts <cashuB token>
import { getTokenMetadata, hasValidDleq, Wallet } from '@cashu/cashu-ts';
import { bytesToHex } from '@noble/hashes/utils.js';
import { generateSecretKey, verifyEvent } from 'nostr-tools';
import { buildNutzapEvent } from '../lib/nutzap';

const token = process.argv[2];
if (!token) throw new Error('pass a cashuB token');
const { mint } = getTokenMetadata(token);
const wallet = new Wallet(mint);
await wallet.loadMint();
const recipientHex = '9bdb965a3757e233699b5aabd8fc55bc0c1f48e39c4d5acac6d37b2f48f2161e';

const event = buildNutzapEvent({
	token,
	keysetIds: wallet.keyChain.getKeysets().map((k) => k.id),
	recipientHex,
	content: 'test',
	senderPrivHex: bytesToHex(generateSecretKey()),
});
const tag = (n: string) => event.tags.filter((t) => t[0] === n);
const proof = JSON.parse(tag('proof')[0][1]);
const checks = {
	'kind 9321': event.kind === 9321,
	'signature valid': verifyEvent(event),
	'u tag is the token mint': tag('u')[0]?.[1] === mint,
	'p tag is the recipient': tag('p')[0]?.[1] === recipientHex,
	'unit sat': tag('unit')[0]?.[1] === 'sat',
	'proof amount is a JSON number': typeof proof.amount === 'number',
	'proof keeps DLEQ': !!proof.dleq && hasValidDleq({ ...proof, amount: proof.amount }, wallet.keyChain.getKeyset(proof.id)),
	'proof is P2PK locked': JSON.parse(proof.secret)[0] === 'P2PK',
};
for (const [k, ok] of Object.entries(checks)) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}`);
console.log('\nNOT published. Tags:', event.tags.map((t) => t[0]).join(', '));
if (!Object.values(checks).every(Boolean)) process.exit(1);
