// All user data lives on the device in IndexedDB. Nothing here touches the network.
import { openDB, type DBSchema, type IDBPDatabase, type StoreNames } from 'idb';
import type { Show } from './feed';

/** A Cashu proof serialized with cashu-ts `serializeProofs` (amounts as JSON numbers). */
export type ProofJson = string;

export type WalletRecord = {
	mintUrl: string;
	proofs: ProofJson[];
	updatedAt: number;
};

export type JarNut = {
	proof: ProofJson;
	amount: number;
	spent: boolean;
	reclaimed?: boolean;
};

export type Jar = {
	id: string;
	creatorNpub: string;
	creatorName: string;
	lockKey: string; // 33-byte compressed hex
	mintUrl: string;
	locktime: number; // unix seconds
	refundKey: string; // listener refund pubkey
	nuts: JarNut[];
	createdAt: number;
};

export type GiftStatus = 'created' | 'handed_over' | 'queued' | 'published' | 'redeemed';

export type Gift = {
	id: string;
	jarId: string;
	token: string; // cashuB
	amount: number;
	episodeGuid: string;
	episodeTitle: string;
	seconds: number;
	message: string;
	delivery?: 'qr' | 'queue';
	status: GiftStatus;
	eventId?: string;
	createdAt: number;
};

export type InboxGift = {
	id: string; // Y of the proof secret, so the same nut is only stored once
	token: string;
	amount: number;
	mintUrl: string;
	message: string;
	episodeRef?: string;
	seconds?: number;
	checks: { lock: boolean; locktime: boolean; dleq: boolean };
	locktime: number;
	redeemed: boolean;
	redeemError?: string;
	/** The creator's own unlocked proofs after redeeming, so they can move them to any wallet. */
	redeemedProofs?: ProofJson[];
	receivedAt: number;
};

export type MintKeysRecord = {
	mintUrl: string;
	mintInfo: unknown; // cashu-ts GetInfoResponse
	keychain: unknown; // cashu-ts KeyChainCache
	fetchedAt: number;
};

export type EpisodeRecord = {
	guid: string;
	title: string;
	audio: Blob;
	bytes: number;
	duration: number;
	image?: string;
	savedAt: number;
};

/** Small key/value store: keypairs, user settings, the last fetched feed. */
export type SettingsMap = {
	settings: {
		mintUrl: string;
		creatorNpub: string;
		creatorName: string;
		creatorLockKey: string;
		trustedMints: string[];
		creatorRelays: string[];
	};
	listenerKeys: { priv: string; pub: string };
	nostrKeys: { priv: string; pub: string };
	creatorKeys: { priv: string; pub: string };
	feed: Show & { fetchedAt: number };
};

interface SquirrelDB extends DBSchema {
	wallet: { key: string; value: WalletRecord };
	jars: { key: string; value: Jar };
	gifts: { key: string; value: Gift; indexes: { status: GiftStatus } };
	inbox: { key: string; value: InboxGift };
	mintKeys: { key: string; value: MintKeysRecord };
	episodes: { key: string; value: EpisodeRecord };
	kv: { key: string; value: { key: string; value: unknown } };
}

type Store = Exclude<StoreNames<SquirrelDB>, 'kv'>;
type Value<S extends Store> = SquirrelDB[S]['value'];

let dbPromise: Promise<IDBPDatabase<SquirrelDB>> | undefined;

export function db() {
	dbPromise ??= openDB<SquirrelDB>('squirrel', 1, {
		upgrade(d) {
			d.createObjectStore('wallet', { keyPath: 'mintUrl' });
			d.createObjectStore('jars', { keyPath: 'id' });
			d.createObjectStore('gifts', { keyPath: 'id' }).createIndex('status', 'status');
			d.createObjectStore('inbox', { keyPath: 'id' });
			d.createObjectStore('mintKeys', { keyPath: 'mintUrl' });
			d.createObjectStore('episodes', { keyPath: 'guid' });
			d.createObjectStore('kv', { keyPath: 'key' });
		},
	});
	return dbPromise;
}

export const get = async <S extends Store>(store: S, key: string) => (await db()).get(store, key) as Promise<Value<S> | undefined>;
export const put = async <S extends Store>(store: S, value: Value<S>) => (await db()).put(store, value as never);
export const list = async <S extends Store>(store: S) => (await db()).getAll(store) as Promise<Value<S>[]>;
export const del = async <S extends Store>(store: S, key: string) => (await db()).delete(store, key);

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K] | undefined> {
	return (await (await db()).get('kv', key))?.value as SettingsMap[K] | undefined;
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]) {
	await (await db()).put('kv', { key, value });
}

/** Episode list without the audio blobs, for rendering. */
export async function savedEpisodeGuids(): Promise<Set<string>> {
	return new Set(await (await db()).getAllKeys('episodes'));
}

export const newId = () => crypto.randomUUID();

// Handy for poking at data from the browser console: `await squirrelDb.list('jars')`
if (typeof window !== 'undefined') {
	Object.assign(window, { squirrelDb: { get, put, list, del, getSetting, setSetting } });
}
