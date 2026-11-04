// Keypairs live in IndexedDB for the demo. Production would need proper backup.
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { getSetting, setSetting, type SettingsMap } from './db';

type Keypair = { priv: string; pub: string };

/** secp256k1 keypair with a 33-byte compressed pubkey, the form P2PK locks use. */
export function newP2PKKeypair(): Keypair {
	const priv = randomBytes(32);
	return { priv: bytesToHex(priv), pub: bytesToHex(secp256k1.getPublicKey(priv, true)) };
}

/** Nostr keypair; pub is the 32-byte x-only hex key. */
export function newNostrKeypair(): Keypair {
	const priv = generateSecretKey();
	return { priv: bytesToHex(priv), pub: getPublicKey(priv) };
}

async function ensure(name: 'listenerKeys' | 'nostrKeys' | 'creatorNostrKeys', make: () => Keypair): Promise<Keypair> {
	const existing = await getSetting(name);
	if (existing) return existing;
	const kp = make();
	await setSetting(name, kp);
	return kp;
}

/** The listener's refund key (reclaims unredeemed nuts after locktime). */
export const ensureListenerKeys = () => ensure('listenerKeys', newP2PKKeypair);
/** The listener's Nostr key, used to sign nutzap events. */
export const ensureNostrKeys = () => ensure('nostrKeys', newNostrKeypair);

/** The creator's Nostr key: publishes their kind 10019 and is the npub listeners nutzap. */
export const ensureCreatorNostrKeys = () => ensure('creatorNostrKeys', newNostrKeypair);

export const getCreatorKeys = () => getSetting('creatorKeys');
export const setCreatorKeys = (kp: SettingsMap['creatorKeys']) => setSetting('creatorKeys', kp);

/** Accepts a 64-char hex private key; returns the matching P2PK keypair, or throws. */
export function keypairFromPriv(privHex: string): Keypair {
	const hex = privHex.trim().toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('Private key must be 64 hex characters');
	return { priv: hex, pub: bytesToHex(secp256k1.getPublicKey(hexToBytes(hex), true)) };
}

/** NIP-61: x-only keys get a "02" prefix; 33-byte compressed keys are used as-is. */
export function normalizeLockKey(key: string): string {
	const k = key.trim().toLowerCase();
	if (/^[0-9a-f]{64}$/.test(k)) return `02${k}`;
	if (/^0[23][0-9a-f]{64}$/.test(k)) return k;
	throw new Error('Lock key must be 64 or 66 hex characters');
}
