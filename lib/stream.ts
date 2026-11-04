// Streaming sats with no signal: while an episode plays, each stretch of listening turns one small
// nut into a queued gift stamped with that moment. They go out as nutzaps once the phone is online,
// so the creator's moments map shows how far people listened, not just where they tapped Gift.
import { getSetting, list, setSetting, type Gift, type SettingsMap } from './db';
import { availableSizes, createGift, creatorJars } from './gift';
import { recipientNpub } from './nutzap';

export type StreamPrefs = SettingsMap['stream'];

/** Streaming only ever spends the smallest nut, one per stretch. */
export const STREAM_NUT = 8;
/** Minutes of listening per nut: once a minute is the usual V4V streaming rate. */
export const STREAM_EVERY = [1, 5, 15] as const;
/** Sats per episode, at most. */
export const STREAM_CAPS = [32, 64, 128] as const;
export const STREAM_DEFAULTS: StreamPrefs = { on: false, everyMinutes: 5, capPerEpisode: 64 };

export const loadStreamPrefs = async (): Promise<StreamPrefs> => ({ ...STREAM_DEFAULTS, ...(await getSetting('stream')) });
export const saveStreamPrefs = (p: StreamPrefs) => setSetting('stream', p);

/** Sats streamed to an episode so far, counted from the gifts themselves so the cap holds across reloads. */
export async function streamedSats(episodeGuid: string) {
	return (await list('gifts')).filter((g) => g.streamed && g.episodeGuid === episodeGuid).reduce((a, g) => a + g.amount, 0);
}

export type StreamTarget = { groupKey: string; name: string; left: number } | { reason: string };

/** Who a stream goes to: a creator with unexpired 8-sat nuts left and an npub to nutzap them at. */
export async function streamTarget(nowSec = Date.now() / 1000): Promise<StreamTarget> {
	const jars = await list('jars');
	const groups = creatorJars(jars);
	if (!groups.length) return { reason: `Fill a jar first: streaming spends its ${STREAM_NUT}-sat nuts.` };
	let reason = `No ${STREAM_NUT}-sat nuts left. Fill a jar with some to keep streaming.`;
	for (const g of groups) {
		const left = availableSizes(g.jars.filter((j) => j.locktime > nowSec)).get(STREAM_NUT) ?? 0;
		if (!left) continue;
		// Streamed nuts are never handed over in person, so they need somewhere to go as nutzaps.
		if (!(await recipientNpub(g.jars[0], jars))) {
			reason = `${g.name} has no npub yet, and streamed nuts go out as nutzaps.`;
			continue;
		}
		return { groupKey: g.key, name: g.name, left };
	}
	return { reason };
}

/** Turns one 8-sat nut into a queued gift at this moment of the episode. No network. */
export function streamNut(opts: { groupKey: string; episodeGuid: string; episodeTitle: string; seconds: number }): Promise<Gift> {
	return createGift({ ...opts, size: STREAM_NUT, message: '', queue: true, streamed: true });
}
