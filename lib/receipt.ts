// Signed receipts, so the handover is confirmed both ways with no network. Once a gift verifies, the
// creator's phone signs the nut's id with the creator's lock key (BIP-340 Schnorr) and shows it as a
// QR. The listener's phone checks that signature against the key its jar was locked to, the only
// key that can redeem the nut, and marks the gift received.
import { getTokenMetadata } from '@cashu/cashu-ts';
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { get, list, type Gift } from './db';
import { setGiftStatus } from './gift';
import { nutId } from './verify';

const PREFIX = 'sqr1';
const signed = (id: string) => sha256(utf8ToBytes(`squirrel/receipt/1/${id}`));

/** "sqr1|<nut id>|<signature>": about 200 characters, a quick scan. Pure. */
export function signReceipt(id: string, lockPrivHex: string) {
	return `${PREFIX}|${id}|${bytesToHex(schnorr.sign(signed(id), hexToBytes(lockPrivHex)))}`;
}

/** True if `sig` over nut `id` comes from the private half of this 33-byte lock key. Pure. */
export function receiptValid(id: string, sigHex: string, lockKey: string) {
	try {
		return schnorr.verify(hexToBytes(sigHex), signed(id), hexToBytes(lockKey).slice(1));
	} catch {
		return false;
	}
}

/** The id the creator's inbox gives this gift's nut (see verifyGift). */
export function giftNutId(gift: Gift) {
	try {
		return nutId(
			getTokenMetadata(gift.token)
				.incompleteProofs.map((p) => p.secret)
				.join('|'),
		);
	} catch {
		return undefined;
	}
}

export type ReceiptResult = { ok: true; gift: Gift; creatorName: string } | { ok: false; reason: string };

/** Checks a scanned receipt against this phone's gifts and, if it's genuine, marks that gift received. */
export async function acceptReceipt(text: string): Promise<ReceiptResult> {
	const [tag, id, sig] = text.trim().split('|');
	if (tag !== PREFIX || !/^[0-9a-f]{64}$/.test(id ?? '') || !/^[0-9a-f]{128}$/.test(sig ?? '')) return { ok: false, reason: "That code isn't a Squirrel receipt." };

	const gift = (await list('gifts')).find((g) => giftNutId(g) === id);
	if (!gift) return { ok: false, reason: "This receipt is for a gift that wasn't made on this phone." };
	const jar = await get('jars', gift.jarId);
	if (!jar) return { ok: false, reason: 'The jar this gift came from is gone, so there is no key to check against.' };
	if (!receiptValid(id, sig, jar.lockKey)) return { ok: false, reason: `The signature isn't from ${jar.creatorName}'s key. Not marked received.` };

	// Redeemed already says more than received; keep it.
	const next = gift.status === 'redeemed' ? gift : await setGiftStatus(gift.id, 'received', { receiptAt: Date.now() });
	return { ok: true, gift: next, creatorName: jar.creatorName };
}
