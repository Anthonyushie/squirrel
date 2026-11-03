import { getSetting, setSetting, type SettingsMap } from './db';

export type Settings = SettingsMap['settings'];

export const NODESIGNAL_NPUB = process.env.NEXT_PUBLIC_CREATOR_NPUB ?? 'npub1n0devk3h2l3rx6vmt24a3lz4hsxp7j8rn3x44jkx6daj7j8jzc0q2u02cy';
export const TEST_MINT = process.env.NEXT_PUBLIC_MINT_URL ?? 'https://testnut.cashudevkit.org';
/** Nodesignal's zero-fee mint, as listed in their kind 10019. */
export const MINIBITS = 'https://mint.minibits.cash/Bitcoin';

export const DEFAULT_SETTINGS: Settings = {
	mintUrl: TEST_MINT,
	creatorNpub: NODESIGNAL_NPUB,
	creatorName: 'Nodesignal',
	creatorLockKey: '',
	trustedMints: [],
	creatorRelays: [],
};

export const loadSettings = async (): Promise<Settings> => ({ ...DEFAULT_SETTINGS, ...(await getSetting('settings')) });
export const saveSettings = (s: Settings) => setSetting('settings', s);

/** Test mints use a fake Lightning backend; everything else moves real bitcoin. */
export const isTestMint = (url: string) => /testnut|fake|localhost|127\.0\.0\.1/.test(url);

export const mintHost = (url: string) => {
	try {
		const u = new URL(url);
		return u.host + (u.pathname === '/' ? '' : u.pathname);
	} catch {
		return url;
	}
};
