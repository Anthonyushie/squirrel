// Offline gift verification on the creator's phone. Uses only data in IndexedDB.
import {
	getDecodedToken,
	getP2PKExpectedWitnessPubkeys,
	getTagScalar,
	getTokenMetadata,
	hasValidDleq,
	parseP2PKSecret,
	serializeProofs,
	type Proof,
} from '@cashu/cashu-ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { get, type InboxGift } from './db';
import { decodeMemo } from './gift';
import { cachedWallet } from './mint';

export type CheckId = 'format' | 'mint' | 'lock' | 'locktime' | 'dleq' | 'duplicate';
export type Check = { id: CheckId; ok: boolean; label: string; detail: string };

export type Verification = {
	ok: boolean;
	checks: Check[];
	amount: number;
	mintUrl?: string;
	message: string;
	episodeRef?: string;
	seconds?: number;
	locktime: number;
	/** Inbox record to store when ok. */
	record?: InboxGift;
};

/** Same nut, same id: a nut shown twice is stored once. */
export const nutId = (secret: string) => bytesToHex(sha256(utf8ToBytes(secret)));

const fail = (id: CheckId, label: string, detail: string, extra: Partial<Verification> = {}): Verification => ({
	ok: false,
	checks: [{ id, ok: false, label, detail }],
	amount: 0,
	message: '',
	locktime: 0,
	...extra,
});

/**
 * Checks a scanned cashuB gift with no network:
 * the mint is one whose keys this phone holds, every nut is locked to `myLockKey` alone,
 * the locktime hasn't passed, the mint's DLEQ signature is valid, and it isn't a duplicate.
 */
export async function verifyGift(token: string, myLockKey: string, nowSec = Math.floor(Date.now() / 1000)): Promise<Verification> {
	token = token.trim().replace(/^cashu:/i, '');

	let meta: ReturnType<typeof getTokenMetadata>;
	try {
		meta = getTokenMetadata(token);
	} catch {
		return fail('format', 'Readable gift', "This QR code isn't a Cashu token.");
	}
	const memo = decodeMemo(meta.memo);
	const base = { mintUrl: meta.mint, ...memo, amount: meta.amount.toNumber() };

	// A DLEQ proof only shows that *some* mint signed it; only mints we already hold keys for count.
	const wallet = await cachedWallet(meta.mint).catch(() => undefined);
	if (!wallet) return fail('mint', 'Known mint', `${meta.mint} isn't one of your mints, so its signature can't be checked offline.`, base);

	let proofs: Proof[];
	try {
		proofs = getDecodedToken(token, wallet.keyChain.getKeysets().map((k) => k.id)).proofs;
	} catch (e) {
		return fail('format', 'Readable gift', `Couldn't decode the token: ${(e as Error).message}`, base);
	}

	const checks: Check[] = [{ id: 'mint', ok: true, label: 'Known mint', detail: new URL(meta.mint).host }];

	// 1. Locked to me, and only me, right now.
	let locktime = Infinity;
	let lockDetail = 'Only your key can redeem it';
	const lockOk = proofs.every((p) => {
		try {
			const [kind, data] = parseP2PKSecret(p.secret);
			const signers = getP2PKExpectedWitnessPubkeys(p.secret);
			const lt = Number(getTagScalar(p.secret, 'locktime') ?? 0);
			locktime = Math.min(locktime, lt || Infinity);
			if (kind !== 'P2PK' || data.data !== myLockKey) lockDetail = "Locked to a different key, not yours";
			else if (signers.length !== 1 || signers[0] !== myLockKey) lockDetail = 'Another key could spend it too';
			else return true;
			return false;
		} catch {
			lockDetail = 'Not locked: whoever holds it can spend it';
			return false;
		}
	});
	checks.push({ id: 'lock', ok: lockOk, label: 'Locked to you', detail: lockDetail });

	// 2. Locktime ahead, or the listener's refund key could already take it back.
	const hasLocktime = Number.isFinite(locktime);
	const days = hasLocktime ? (locktime - nowSec) / 86400 : Infinity;
	const lockTimeOk = hasLocktime ? locktime > nowSec : true;
	checks.push({
		id: 'locktime',
		ok: lockTimeOk,
		label: 'Still yours to redeem',
		detail: !hasLocktime ? 'No locktime' : lockTimeOk ? `${days >= 1 ? `${Math.ceil(days - 0.01)} days` : `${Math.max(1, Math.floor(days * 24))} hours`} left to redeem` : 'Locktime passed: the giver can reclaim it',
	});

	// 3. The mint really signed it.
	let dleqOk = true;
	let dleqDetail = 'Mint signature checked offline';
	for (const p of proofs) {
		try {
			const keyset = wallet.keyChain.getKeyset(p.id);
			if (!hasValidDleq(p, keyset, { require: true })) {
				dleqOk = false;
				dleqDetail = 'Mint signature is invalid or missing';
			}
		} catch (e) {
			dleqOk = false;
			dleqDetail = `No keys for keyset ${p.id.slice(0, 10)}…: ${(e as Error).message}`;
		}
	}
	checks.push({ id: 'dleq', ok: dleqOk, label: 'Signed by the mint', detail: dleqDetail });

	// 4. Not already in the inbox.
	const id = nutId(proofs.map((p) => p.secret).join('|'));
	const existing = await get('inbox', id);
	checks.push({ id: 'duplicate', ok: !existing, label: 'New gift', detail: existing ? 'Already in your inbox: same nut, counted once' : 'Not seen before' });

	const ok = checks.every((c) => c.ok);
	const amount = proofs.reduce((a, p) => a + p.amount.toNumber(), 0);
	return {
		ok,
		checks,
		...base,
		amount,
		locktime: hasLocktime ? locktime : 0,
		record: ok
			? {
					id,
					token,
					amount,
					mintUrl: meta.mint,
					message: memo.message,
					episodeRef: memo.episodeRef,
					seconds: memo.seconds,
					checks: { lock: lockOk, locktime: lockTimeOk, dleq: dleqOk },
					locktime: hasLocktime ? locktime : 0,
					redeemed: false,
					receivedAt: Date.now(),
				}
			: undefined,
	};
}

/** Proofs as stored on an inbox record after redeeming. */
export const proofsJson = (proofs: Proof[]) => serializeProofs(proofs);
