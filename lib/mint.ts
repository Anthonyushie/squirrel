// Mint public keys are cached in IndexedDB so offline code (DLEQ checks, encoding) never
// touches the network.
import { Wallet, type GetInfoResponse, type KeyChainCache } from '@cashu/cashu-ts';
import { get, list, put } from './db';

/** Fetches mint info and keysets, saves them, and returns a ready wallet. Online only. */
export async function refreshMintKeys(mintUrl: string): Promise<Wallet> {
	const wallet = new Wallet(mintUrl);
	await wallet.loadMint();
	await put('mintKeys', {
		mintUrl,
		mintInfo: wallet.getMintInfo().cache,
		keychain: JSON.parse(JSON.stringify(wallet.keyChain.cache)),
		fetchedAt: Date.now(),
	});
	return wallet;
}

/** A wallet built only from cached keys. Throws if this mint was never cached. */
export async function cachedWallet(mintUrl: string): Promise<Wallet> {
	const rec = await get('mintKeys', mintUrl);
	if (!rec) throw new Error(`No cached keys for ${mintUrl}. Go online once first.`);
	const wallet = new Wallet(mintUrl);
	wallet.loadMintFromCache(rec.mintInfo as GetInfoResponse, rec.keychain as KeyChainCache);
	return wallet;
}

/** Fresh wallet when online (and refreshes the cache), cached one when offline. */
export async function getWallet(mintUrl: string): Promise<Wallet> {
	if (navigator.onLine) {
		try {
			return await refreshMintKeys(mintUrl);
		} catch {
			// mint unreachable: fall back to what we have
		}
	}
	return cachedWallet(mintUrl);
}

/** Refreshes cached keys for every mint the app uses. Call on app start. */
export async function refreshKnownMints(extra: string[] = []) {
	if (!navigator.onLine) return;
	const mints = new Set([...extra, ...(await list('jars')).map((j) => j.mintUrl), ...(await list('wallet')).map((w) => w.mintUrl)]);
	await Promise.allSettled([...mints].map(refreshMintKeys));
}

export type MintSupport = { name: string; p2pk: boolean; dleq: boolean; fee: number };

/** Checks NUT-11 and NUT-12 support, and the input fee of the active sat keyset. */
export async function checkMint(mintUrl: string): Promise<MintSupport> {
	const wallet = await refreshMintKeys(mintUrl);
	const info = wallet.getMintInfo();
	return {
		name: info.name,
		p2pk: info.isSupported(11).supported,
		dleq: info.isSupported(12).supported,
		fee: wallet.keyChain.getKeyset().fee,
	};
}
