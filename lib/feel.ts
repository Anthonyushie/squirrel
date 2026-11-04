// Game feel: haptics, generated sound effects and motion preferences. Works offline: the
// sounds are synthesized with Web Audio, so there are no files to download or cache.
import { useSyncExternalStore } from 'react';

export type FeelPrefs = { sound: boolean; calm: boolean };

const PREFS_KEY = 'squirrel:feel';
const SEEN_KEY = 'squirrel:seen';
const DEFAULTS: FeelPrefs = { sound: false, calm: false };

// Per-device conveniences, so localStorage rather than IndexedDB: animations read them synchronously.
let prefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function readJson<T>(key: string, fallback: T): T {
	try {
		return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? '{}') };
	} catch {
		return fallback;
	}
}

function writeJson(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// private mode or storage full: the preference just lasts for this page
	}
}

export function getFeelPrefs(): FeelPrefs {
	if (!loaded && typeof window !== 'undefined') {
		loaded = true;
		prefs = readJson(PREFS_KEY, DEFAULTS);
	}
	return prefs;
}

export function setFeelPrefs(patch: Partial<FeelPrefs>) {
	prefs = { ...getFeelPrefs(), ...patch };
	writeJson(PREFS_KEY, prefs);
	listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

export function useFeelPrefs() {
	return useSyncExternalStore(subscribe, getFeelPrefs, () => DEFAULTS);
}

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** full: the whole moment. short: same story, faster. still: no travel, everything in place. */
export type Play = 'full' | 'short' | 'still';

/** Big moments play in full the first few times, then in a shorter cut so the 50th gift doesn't drag. */
const FULL_PLAYS = 3;

export function playMoment(name: string): Play {
	if (reducedMotion()) return 'still';
	if (getFeelPrefs().calm) return 'short';
	const seen = readJson<Record<string, number>>(SEEN_KEY, {});
	const n = seen[name] ?? 0;
	writeJson(SEEN_KEY, { ...seen, [name]: n + 1 });
	return n < FULL_PLAYS ? 'full' : 'short';
}

const PATTERNS = {
	tick: 6,
	tap: 12,
	land: 9,
	send: [14, 50, 22],
	success: [20, 60, 30, 40, 60],
	error: [50, 40, 50],
} satisfies Record<string, number | number[]>;

/** Vibration where the browser has it (Android); a silent no-op elsewhere, never the only signal. */
export function haptic(kind: keyof typeof PATTERNS) {
	try {
		navigator.vibrate?.(PATTERNS[kind]);
	} catch {
		// some browsers throw without a user gesture
	}
}

let ctx: AudioContext | undefined;
let noiseBuffer: AudioBuffer | undefined;

function audio() {
	if (!getFeelPrefs().sound || typeof AudioContext === 'undefined') return;
	ctx ??= new AudioContext();
	if (ctx.state === 'suspended') ctx.resume().catch(() => {});
	return ctx;
}

type Tone = { freq: number; to?: number; type?: OscillatorType; at?: number; dur: number; gain: number };

function tone(c: AudioContext, o: Tone) {
	const t = c.currentTime + (o.at ?? 0);
	const osc = c.createOscillator();
	const g = c.createGain();
	osc.type = o.type ?? 'sine';
	osc.frequency.setValueAtTime(o.freq, t);
	if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(o.gain, t + 0.006);
	g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
	osc.connect(g).connect(c.destination);
	osc.start(t);
	osc.stop(t + o.dur + 0.02);
}

function noise(c: AudioContext, o: { freq: number; to?: number; q?: number; at?: number; dur: number; gain: number }) {
	if (!noiseBuffer) {
		noiseBuffer = c.createBuffer(1, c.sampleRate / 2, c.sampleRate);
		const data = noiseBuffer.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
	}
	const t = c.currentTime + (o.at ?? 0);
	const src = c.createBufferSource();
	const filter = c.createBiquadFilter();
	const g = c.createGain();
	src.buffer = noiseBuffer;
	filter.type = 'bandpass';
	filter.Q.value = o.q ?? 1;
	filter.frequency.setValueAtTime(o.freq, t);
	if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(o.gain, t + 0.005);
	g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
	src.connect(filter).connect(g).connect(c.destination);
	src.start(t);
	src.stop(t + o.dur + 0.02);
}

/** Opt-in sound effects (Settings → Sounds). Each call is a no-op while sound is off. */
export const sfx = {
	/** A nut landing on glass. */
	clink() {
		const c = audio();
		if (!c) return;
		const f = 2000 + Math.random() * 700;
		tone(c, { freq: f, dur: 0.22, gain: 0.07 });
		tone(c, { freq: f * 2.76, dur: 0.1, gain: 0.025 });
	},
	/** The jar lid. */
	pop() {
		const c = audio();
		if (!c) return;
		noise(c, { freq: 900, q: 1.4, dur: 0.05, gain: 0.22 });
		tone(c, { freq: 520, to: 170, type: 'triangle', dur: 0.09, gain: 0.1 });
	},
	/** Verified, payment received. */
	chime() {
		const c = audio();
		if (!c) return;
		tone(c, { freq: 1318.5, dur: 0.5, gain: 0.07 });
		tone(c, { freq: 1975.5, at: 0.09, dur: 0.75, gain: 0.06 });
		tone(c, { freq: 2637, at: 0.09, dur: 0.35, gain: 0.015 });
	},
	/** One offline check passing. */
	tick() {
		const c = audio();
		if (!c) return;
		tone(c, { freq: 1500, dur: 0.04, gain: 0.03, type: 'square' });
	},
	/** A nut leaving for the creator. */
	whoosh() {
		const c = audio();
		if (!c) return;
		noise(c, { freq: 380, to: 2600, q: 0.8, dur: 0.32, gain: 0.1 });
	},
	/** Something went wrong. */
	thud() {
		const c = audio();
		if (!c) return;
		tone(c, { freq: 150, to: 70, dur: 0.2, gain: 0.22 });
	},
};
