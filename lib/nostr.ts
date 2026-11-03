import { nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';

export const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];

export type NutzapInfo = {
	pubkey: string; // hex Nostr identity
	name?: string;
	lockKey?: string; // from the 10019 "pubkey" tag, as published
	mints: string[];
	relays: string[]; // where the creator reads nutzaps
	found: boolean;
};

export function npubToHex(npub: string): string {
	const decoded = nip19.decode(npub.trim());
	if (decoded.type !== 'npub') throw new Error('Not an npub');
	return decoded.data;
}

/** Reads a creator's NIP-61 nutzap info (kind 10019) and profile name. */
export async function lookupNutzapInfo(npub: string, relays = DEFAULT_RELAYS): Promise<NutzapInfo> {
	const pubkey = npubToHex(npub);
	const pool = new SimplePool();
	try {
		const [profile, info] = await Promise.all([
			pool.get(relays, { kinds: [0], authors: [pubkey] }, { maxWait: 5000 }),
			pool.get(relays, { kinds: [10019], authors: [pubkey] }, { maxWait: 5000 }),
		]);
		let name: string | undefined;
		try {
			const p = profile ? JSON.parse(profile.content) : {};
			name = p.display_name || p.name || undefined;
		} catch {
			// unparseable profile; keep going without a name
		}
		const tags = info?.tags ?? [];
		return {
			pubkey,
			name,
			lockKey: tags.find((t) => t[0] === 'pubkey')?.[1],
			mints: tags.filter((t) => t[0] === 'mint').map((t) => t[1]),
			relays: tags.filter((t) => t[0] === 'relay').map((t) => t[1]),
			found: !!info,
		};
	} finally {
		pool.close(relays);
	}
}
