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
	/** True once the nut is reclaimed or known to be redeemed: no longer counts as expired. */
	settled?: boolean;
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

export type GiftStatus = 'created' | 'handed_over' | 'queued' | 'published' | 'received' | 'redeemed';

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
	/** Why a queued gift couldn't be sent as a nutzap (it stays queued). */
	sendError?: string;
	/** Set when the giver took the nut back after the locktime. */
	reclaimed?: boolean;
	/** Dropped by streaming while the episode played, rather than gifted by hand. */
	streamed?: boolean;
	/** When the listener's phone checked the creator's signed receipt for this gift. */
	receiptAt?: number;
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
	/** A nut the listener's phone streamed while they played the episode. */
	streamed?: boolean;
	checks: { lock: boolean; locktime: boolean; dleq: boolean };
	locktime: number;
	/** How it arrived: scanned or pasted in person, or collected from Nostr as a NIP-61 nutzap. */
	via?: 'qr' | 'nutzap';
	/** The kind 9321 event, for nutzaps. */
	eventId?: string;
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
	/** The creator's Nostr identity, which listeners address nutzaps to. Separate from the listener's nostrKeys. */
	creatorNostrKeys: { priv: string; pub: string };
	/** What this phone last published as the creator's kind 10019. */
	creatorNutzapInfo: { eventId: string; lockKey: string; mints: string[]; relays: string[]; publishedAt: number };
	feed: Show & { fetchedAt: number };
	/** Invoices created but not yet minted, so a paid one is never lost if the app closes. */
	pendingQuotes: { mintUrl: string; quote: string; amount: number; createdAt: number }[];
	/** Streaming sats while listening: off until the listener turns it on. */
	stream: { on: boolean; everyMinutes: number; capPerEpisode: number };
	/** The creator's Lightning payouts from redeemed sats, newest first. */
	cashOuts: { mintUrl: string; to: string; amount: number; fees: number; pending?: boolean; at: number }[];
	/** Where the creator last cashed out to. */
	cashOutTo: string;
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
		// The browser closed the connection (e.g. disk pressure): reopen on the next call.
		terminated() {
			dbPromise = undefined;
		},
	}).catch((err) => {
		// A failed open (disk full, "Internal error.") must not be cached, or every later call fails too.
		dbPromise = undefined;
		throw err;
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
