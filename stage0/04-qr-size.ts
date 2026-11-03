// 0.4 QR size test: encode the locked 32-sat nut (with DLEQ) as cashuB, with and without
// a 100-character message, and write QR PNGs to scan from a phone.
// Run: npx tsx 04-qr-size.ts

import { readFileSync } from 'node:fs';
import { deserializeProofs, getDecodedToken, getEncodedToken } from '@cashu/cashu-ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import QRCode from 'qrcode';

const state = JSON.parse(readFileSync('out/state.json', 'utf8'));
const proofs = deserializeProofs([state.nut]);

// Proposed gift memo: "sq1|<episode ref>|<seconds into episode>|<message>"
// Episode ref is the first 8 hex chars of sha256(episode guid): Nodesignal guids can be long
// URLs, and the creator's app can map the hash back to a title from its own copy of the feed.
// The memo is a standard cashuB field, so any Cashu wallet can still read the token.
function giftMemo(episodeGuid: string, seconds: number, message: string) {
	const ref = bytesToHex(sha256(utf8ToBytes(episodeGuid))).slice(0, 8);
	return `sq1|${ref}|${Math.floor(seconds)}|${message.slice(0, 100)}`;
}

const message = 'Danke für die Folge! Der Teil über Cashu und Offline-Zahlungen war genau das, was ich gebraucht habe.'.slice(0, 100);
const memo = giftMemo('https://nodesignal.space/episode/example-guid-1234', 1834, message);

const cases = [
	{ name: 'plain', token: getEncodedToken({ mint: state.mintUrl, unit: 'sat', proofs }) },
	{ name: 'with-message', token: getEncodedToken({ mint: state.mintUrl, unit: 'sat', proofs, memo }) },
];

for (const { name, token } of cases) {
	const qr = QRCode.create(token, { errorCorrectionLevel: 'L' });
	const file = `out/gift-${name}.png`;
	await QRCode.toFile(file, token, { errorCorrectionLevel: 'L', margin: 4, width: 800 });
	console.log(`${name.padEnd(13)} ${token.length} chars  QR version ${qr.version} (${qr.modules.size}x${qr.modules.size} modules)  -> ${file}`);
}

// Round trip: the creator side must get the nut, DLEQ and memo back out of the string.
const decoded = getDecodedToken(cases[1].token, [proofs[0].id]);
const [tag, ref, secs, msg] = decoded.memo!.split('|');
const ok =
	tag === 'sq1' &&
	decoded.proofs[0].secret === proofs[0].secret &&
	decoded.proofs[0].dleq?.r === proofs[0].dleq?.r &&
	msg === message;
console.log(`\n${ok ? 'PASS' : 'FAIL'}  decode round trip: ref=${ref} at ${secs}s, message ${msg.length} chars, DLEQ kept`);
console.log(`memo: ${decoded.memo}`);
if (!ok) process.exit(1);
