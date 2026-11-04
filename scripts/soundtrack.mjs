// An original soundtrack for the launch video, synthesised from scratch, so it is free to post
// anywhere. A minor, Am-F-C-G, a plucked hook over a four-on-the-floor groove, laid out in sections
// that follow the video's scenes, plus sound effects at the moments the video names.
// Used by scripts/make-video.mjs; `node scripts/soundtrack.mjs` writes a standalone preview WAV.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SR = 44100;
const TAU = Math.PI * 2;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** Seeded noise, so every render is identical. */
function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
	};
}
const noise = rng(21);

/** Topology-preserving state-variable filter; cutoff can move every sample. */
class Svf {
	constructor(fc = 1000, q = 0.707) {
		this.ic1 = this.ic2 = 0;
		this.set(fc, q);
	}
	set(fc, q = this.q) {
		this.q = q;
		const g = Math.tan((Math.PI * Math.min(fc, SR * 0.45)) / SR);
		const k = 1 / q;
		this.k = k;
		this.a1 = 1 / (1 + g * (g + k));
		this.a2 = g * this.a1;
		this.a3 = g * this.a2;
	}
	step(x) {
		const v3 = x - this.ic2;
		const v1 = this.a1 * this.ic1 + this.a2 * v3;
		const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
		this.ic1 = 2 * v1 - this.ic1;
		this.ic2 = 2 * v2 - this.ic2;
		this.bp = v1;
		this.hp = x - this.k * v1 - v2;
		return v2;
	}
}

/** Renders `seconds` of a voice: `fn(t, i)` returns one mono sample. */
function voice(seconds, fn) {
	const n = Math.max(1, Math.round(seconds * SR));
	const out = new Float32Array(n);
	for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
	return out;
}

// --- Instruments ---

function kick() {
	let ph = 0;
	return voice(0.5, (t) => {
		ph += (TAU * (44 + 120 * Math.exp(-t * 30))) / SR;
		const body = Math.sin(ph) * Math.exp(-t * 6.5);
		const click = noise() * Math.exp(-t * 400) * 0.35;
		return Math.tanh(1.7 * (body + click));
	});
}

function clap() {
	const f = new Svf(1500, 1.1);
	return voice(0.45, (t) => {
		let env = 0;
		for (const o of [0, 0.011, 0.022]) if (t >= o) env = Math.max(env, Math.exp(-(t - o) * 190));
		if (t > 0.03) env = Math.max(env, 0.55 * Math.exp(-(t - 0.03) * 16));
		f.step(noise() * env);
		return f.bp * 2.4;
	});
}

function snare(gain = 1) {
	const f = new Svf(1900, 0.9);
	let ph = 0;
	return voice(0.2, (t) => {
		ph += (TAU * 190) / SR;
		f.step(noise());
		return gain * (f.bp * 1.6 * Math.exp(-t * 26) + Math.sin(ph) * 0.4 * Math.exp(-t * 40));
	});
}

function hat(open = false) {
	const f = new Svf(8000, 0.8);
	return voice(open ? 0.3 : 0.07, (t) => {
		f.step(noise());
		return f.hp * Math.exp(-t * (open ? 11 : 65));
	});
}

function crash(len = 2.6) {
	const f = new Svf(5000, 0.7);
	return voice(len, (t) => {
		f.step(noise());
		return f.hp * Math.exp(-t * 2.1) * (1 - Math.exp(-t * 400));
	});
}

const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
const tri = (ph) => 1 - 4 * Math.abs(ph - Math.floor(ph + 0.5));
const square = (ph) => (ph % 1 < 0.5 ? 1 : -1);

function bass(midi, len) {
	const f = new Svf(400, 1.4);
	const fr = hz(midi);
	let ph = 0;
	let sub = 0;
	return voice(len + 0.04, (t, i) => {
		ph += fr / SR;
		sub += fr / 2 / SR;
		if (i % 16 === 0) f.set(220 + 1600 * Math.exp(-t * 14));
		const env = Math.min(1, t * 400) * (t > len ? Math.max(0, 1 - (t - len) * 25) : 1);
		return env * (f.step(saw(ph)) * 0.8 + Math.sin(TAU * sub) * 0.55);
	});
}

function padNote(midi, len, detune, cutoff = 2200) {
	const f = new Svf(cutoff, 0.8);
	const fr = hz(midi) * 2 ** (detune / 1200);
	let ph = (noise() + 1) / 2;
	return voice(len + 0.35, (t) => {
		ph += fr / SR;
		const env = Math.min(1, t / 0.09) * (t > len ? Math.max(0, 1 - (t - len) / 0.35) : 1);
		return env * f.step(saw(ph));
	});
}

function pluck(midi, len, bright = 1) {
	const f = new Svf(4000, 1.6);
	const fr = hz(midi);
	let ph = 0;
	let ph2 = 0;
	return voice(len + 0.18, (t, i) => {
		const vib = t > 0.18 ? 1 + 0.0035 * Math.sin(TAU * 5.6 * t) : 1;
		ph += (fr * vib) / SR;
		ph2 += (fr * 1.003 * vib) / SR;
		if (i % 16 === 0) f.set(bright * (900 + 5200 * Math.exp(-t * 9)));
		const env = Math.min(1, t * 330) * (0.45 + 0.55 * Math.exp(-t * 7)) * (t > len ? Math.max(0, 1 - (t - len) / 0.18) : 1);
		return env * f.step(0.55 * saw(ph) + 0.45 * square(ph2));
	});
}

function arpNote(midi) {
	const fr = hz(midi);
	let ph = 0;
	return voice(0.16, (t) => {
		ph += fr / SR;
		return tri(ph) * Math.exp(-t * 16) * Math.min(1, t * 500);
	});
}

function bell(midi, len = 1.8) {
	const fr = hz(midi);
	return voice(len, (t) => {
		const idx = 2.2 * Math.exp(-t * 3);
		return (Math.sin(TAU * fr * t + idx * Math.sin(TAU * fr * 3.5 * t)) + 0.25 * Math.sin(TAU * fr * 2 * t) * Math.exp(-t * 4)) * Math.exp(-t * 2.6) * Math.min(1, t * 800);
	});
}

// --- Sound effects ---

const SFX = {
	/** Air moving past: a band of noise sweeping up then down. */
	whoosh(len = 0.7) {
		const f = new Svf(500, 1.8);
		return voice(len, (t, i) => {
			const x = t / len;
			if (i % 16 === 0) f.set(400 * 2 ** (4 * Math.sin(Math.PI * x)));
			f.step(noise());
			return f.bp * Math.sin(Math.PI * x) ** 1.5 * 1.4;
		});
	},
	/** A nut landing: a short upward blip. */
	pop() {
		let ph = 0;
		return voice(0.12, (t) => {
			ph += (TAU * (320 + 900 * Math.min(1, t / 0.05))) / SR;
			return Math.sin(ph) * Math.exp(-t * 32);
		});
	},
	plink(midi = 88) {
		return voice(0.3, (t) => (Math.sin(TAU * hz(midi) * t) + 0.4 * Math.sin(TAU * hz(midi + 19) * t)) * Math.exp(-t * 16) * Math.min(1, t * 900));
	},
	/** Two quick square notes, the universal sound of getting paid. */
	coin() {
		return voice(0.45, (t) => {
			const fr = t < 0.075 ? 988 : 1319;
			const env = t < 0.075 ? 1 : Math.exp(-(t - 0.075) * 7);
			return square(fr * t) * env * 0.5;
		});
	},
	chime() {
		const out = new Float32Array(Math.round(2.4 * SR));
		[81, 85, 88, 93].forEach((m, k) => mixInto(out, bell(m, 2.2), Math.round(k * 0.06 * SR), 0.5));
		return out;
	},
	tick(midi = 84) {
		return voice(0.09, (t) => square(hz(midi) * t) * Math.exp(-t * 55) * 0.6);
	},
	toggle() {
		return voice(0.25, (t) => {
			const click = noise() * Math.exp(-t * 600) * 0.8;
			const boop = t > 0.03 ? Math.sin(TAU * (700 - 1200 * (t - 0.03)) * (t - 0.03)) * Math.exp(-(t - 0.03) * 20) : 0;
			return click + boop * 0.7;
		});
	},
	/** Lightning: a crackle and a falling saw. */
	zap() {
		let ph = 0;
		const f = new Svf(3000, 0.9);
		return voice(0.5, (t) => {
			ph += (2600 * Math.exp(-t * 9) + 60) / SR;
			f.step(noise() * (Math.random() < 0.3 ? 1 : 0.1));
			return Math.tanh(2.5 * (saw(ph) * 0.5 + f.bp)) * Math.exp(-t * 6);
		});
	},
	impact() {
		let ph = 0;
		const sub = voice(1.6, (t) => {
			ph += (TAU * (62 * Math.exp(-t * 1.2) + 30)) / SR;
			return Math.sin(ph) * Math.exp(-t * 2.4);
		});
		mixInto(sub, crash(1.6), 0, 0.35);
		return sub;
	},
	/** Paper and pen: a short scratch, for the signed receipt. */
	scribble() {
		const f = new Svf(2500, 2);
		return voice(0.35, (t) => {
			f.step(noise());
			return f.bp * (0.5 + 0.5 * Math.sin(TAU * 22 * t)) * Math.sin((Math.PI * t) / 0.35);
		});
	},
};

function mixInto(out, src, at, gain = 1) {
	for (let i = 0; i < src.length && at + i < out.length; i++) if (at + i >= 0) out[at + i] += src[i] * gain;
}

// --- Arrangement ---

const PROG = [
	{ root: 45, pad: [57, 60, 64, 69] }, // Am
	{ root: 41, pad: [53, 57, 60, 65] }, // F
	{ root: 48, pad: [55, 60, 64, 67] }, // C
	{ root: 43, pad: [55, 59, 62, 67] }, // G
];

/** The hook, as [beat, length, note] per bar. Bars 1 and 3 share a rhythm so it sticks. */
const HOOK = [
	[[0, 0.5, 76], [0.5, 0.5, 76], [1, 0.5, 79], [1.5, 0.75, 81], [2.5, 0.5, 79], [3, 0.75, 76]],
	[[0, 0.5, 72], [0.5, 0.5, 74], [1, 0.5, 76], [1.5, 1, 72], [3, 0.5, 74], [3.5, 0.5, 76]],
	[[0, 0.5, 79], [0.5, 0.5, 79], [1, 0.5, 81], [1.5, 0.75, 84], [2.5, 0.5, 81], [3, 0.75, 79]],
	[[0, 0.5, 74], [0.5, 0.5, 76], [1, 0.75, 79], [2, 0.5, 74], [2.5, 1.25, 71]],
	[[0, 0.5, 79], [0.5, 0.5, 81], [1, 0.5, 83], [1.5, 2.25, 81]],
];
const hookBar = (n) => HOOK[n % 8 === 7 ? 4 : n % 4];

const GROUP = { intro: 'intro', build: 'build', stop: 'stop', drop: 'drop', lift: 'drop', outro: 'outro' };

/**
 * sections: [{ kind: 'intro'|'build'|'stop'|'drop'|'lift'|'outro', beats }] in order.
 * hits: [{ t: seconds, kind: one of SFX, gain?, arg? }].
 * Returns { left, right } at SR, with a tail for the last notes to ring out.
 */
export function soundtrack({ bpm = 124, sections, hits = [], tail = 2.5 }) {
	const spb = 60 / bpm;
	const beats = sections.reduce((s, x) => s + x.beats, 0);
	const n = Math.ceil((beats * spb + tail) * SR);
	const bus = () => ({ L: new Float32Array(n), R: new Float32Array(n) });
	const drums = bus();
	const music = bus();
	const ducked = bus();
	const lead = bus();
	const send = bus();
	const fx = bus();
	const kicks = [];

	const at = (beat) => Math.round(beat * spb * SR);
	/** Equal-power pan, -1 left to 1 right. */
	function put(b, src, beatOrSample, gain = 1, pan = 0, isSample = false) {
		const s = isSample ? beatOrSample : at(beatOrSample);
		const l = Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
		const r = Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
		mixInto(b.L, src, s, gain * l);
		mixInto(b.R, src, s, gain * r);
	}

	const cache = new Map();
	const once = (key, make) => cache.get(key) ?? cache.set(key, make()).get(key);
	const K = () => once('kick', kick);
	const C = () => once('clap', clap);
	const H = (open) => once(`hat${open}`, () => hat(open));

	let beat = 0;
	let group;
	let groupStart = 0;
	for (const [si, sec] of sections.entries()) {
		const g = GROUP[sec.kind];
		if (g !== group) {
			group = g;
			groupStart = beat;
		}
		const next = sections[si + 1];
		for (let b = beat; b < beat + sec.beats; b += 4) {
			const barLen = Math.min(4, beat + sec.beats - b);
			const barN = Math.floor((b - groupStart) / 4);
			const chord = PROG[barN % 4];
			const last = b + 4 >= beat + sec.beats;
			const isFinal = sec.kind === 'outro' && last && si === sections.length - 1;

			if (isFinal) {
				// The ending: one big Am, then let it ring.
				put(drums, K(), b, 1);
				put(drums, crash(3.5), b, 0.5);
				put(fx, SFX.impact(), b, 0.6);
				for (const [k, m] of PROG[0].pad.entries()) {
					put(music, padNote(m, 1.6, -9), b, 0.09, -0.6 + k * 0.4);
					put(music, padNote(m, 1.6, 9), b, 0.09, 0.6 - k * 0.4);
				}
				put(music, bass(33, 1.4), b, 0.5);
				put(lead, pluck(81, 1.2), b, 0.26);
				put(send, bell(93, 3), b, 0.12);
				put(fx, bell(81, 3), b, 0.12);
				continue;
			}

			// Pads, every section but the stop's last half.
			const padCut = { intro: 1300, build: 1800, stop: 900, drop: 2600, outro: 2600 }[g];
			for (const [k, m] of chord.pad.entries()) {
				put(ducked, padNote(m, barLen * spb - 0.05, -8, padCut), b, 0.055, -0.5 + k * 0.33);
				put(ducked, padNote(m, barLen * spb - 0.05, 8, padCut), b, 0.055, 0.5 - k * 0.33);
			}

			if (g === 'stop') {
				// Snare roll, 8ths then 16ths then 32nds, getting louder into the drop.
				for (let s = 0; s < barLen; s += 0.25) {
					const step = s < 2 ? 0.5 : s < 3 ? 0.25 : 0.125;
					for (let u = s; u < s + 0.25 && u < barLen - 0.25; u += step) put(drums, snare(), b + u, 0.18 + 0.4 * (u / barLen));
				}
				// Riser: noise opening up and a saw gliding up.
				const len = barLen * spb;
				const f = new Svf(300, 1.2);
				let ph = 0;
				put(
					fx,
					voice(len, (t, i) => {
						const x = t / len;
						if (i % 16 === 0) f.set(300 * 2 ** (5 * x));
						ph += (110 * 2 ** (3 * x)) / SR;
						return (f.step(noise()) * 0.8 + saw(ph) * 0.2) * x * x;
					}),
					b,
					0.35,
				);
				continue;
			}

			// Kicks and claps.
			const kickBeats = g === 'intro' ? [0, 2.5] : [0, 1, 2, 3];
			for (const k of kickBeats) if (k < barLen) {
				put(drums, K(), b + k, g === 'intro' ? 0.7 : 0.95);
				kicks.push(at(b + k));
			}
			for (const k of [1, 3]) if (k < barLen) {
				put(drums, C(), b + k, g === 'intro' ? 0.3 : 0.42, 0.05);
				put(send, C(), b + k, 0.12);
			}
			// Hats: offbeat opens in the drop, steady 16ths that grow through the build.
			const hatStep = g === 'intro' ? 0.5 : 0.25;
			for (let h = 0; h < barLen; h += hatStep) {
				const offbeat = h % 1 === 0.5;
				const vel = g === 'build' ? 0.06 + 0.06 * ((b - beat + h) / sec.beats) : offbeat ? 0.11 : 0.06;
				put(drums, H(offbeat && g !== 'intro'), b + h, vel, 0.3 * Math.sin(h * 3));
			}

			// Bass: pumping eighths in the build and drop, held roots in the intro.
			if (g === 'intro') put(music, bass(chord.root - 12, barLen * spb - 0.1), b, 0.32);
			else
				for (let e = 0; e < barLen; e += 0.5) {
					const up = e === 3.5 && g !== 'build';
					put(ducked, bass(chord.root + (up ? 12 : 0), 0.5 * spb - 0.03), b + e, e % 1 === 0 ? 0.24 : 0.36);
				}

			// Arp: chord tones an octave up, 16ths.
			if (g !== 'intro') {
				const tones = [...chord.pad.slice(0, 3).map((m) => m + 12), chord.pad[0] + 24];
				for (let a = 0, k = 0; a < barLen; a += 0.25, k++) put(ducked, arpNote(tones[[0, 1, 2, 3, 2, 1, 2, 3][k % 8]]), b + a, g === 'build' ? 0.05 : 0.065, k % 2 ? 0.45 : -0.45);
			}

			// The hook: darker in the intro, full in the drop and outro, doubled on bells when lifted.
			if (g === 'intro' || g === 'drop' || g === 'outro') {
				for (const [o, len, m] of hookBar(barN)) {
					if (o >= barLen) continue;
					put(lead, pluck(m, len * spb, g === 'intro' ? 0.55 : 1), b + o, 0.2);
					if (sec.kind === 'lift' || g === 'outro') put(fx, bell(m + 12, 0.9), b + o, 0.05, 0.2);
				}
			}

			// Section starts: a crash on every drop.
			if (b === beat && (g === 'drop' || g === 'outro') && sections[si - 1] && GROUP[sections[si - 1].kind] !== g) {
				put(drums, crash(), b, 0.4);
				put(fx, SFX.impact(), b, 0.45);
			}
			if (b === beat && sec.kind === 'lift') put(drums, crash(), b, 0.3);
		}
		// A whoosh into each new group, so cuts land on something.
		if (next && GROUP[next.kind] !== g && GROUP[next.kind] !== 'drop') put(fx, SFX.whoosh(0.6), beat + sec.beats - 0.45 / spb, 0.25);
		beat += sec.beats;
	}

	for (const h of hits) {
		const make = SFX[h.kind];
		if (!make) throw new Error(`unknown sound effect ${h.kind}`);
		put(fx, make(h.arg), Math.round(h.t * SR), h.gain ?? 0.5, h.pan ?? 0, true);
	}

	// Sidechain: everything melodic ducks under each kick.
	const duck = new Float32Array(n).fill(1);
	for (const k of kicks) for (let i = 0; i < 0.3 * SR && k + i < n; i++) duck[k + i] = Math.min(duck[k + i], 1 - 0.6 * Math.exp(-i / SR / 0.1));
	for (let i = 0; i < n; i++) {
		ducked.L[i] *= duck[i];
		ducked.R[i] *= duck[i];
		lead.L[i] *= 0.75 + 0.25 * duck[i];
		lead.R[i] *= 0.75 + 0.25 * duck[i];
	}

	// Ping-pong dotted-eighth delay on the lead.
	const d = Math.round(0.75 * spb * SR);
	for (let i = d; i < n; i++) {
		lead.L[i] += lead.R[i - d] * 0.32;
		lead.R[i] += lead.L[i - d] * 0.32;
	}
	for (let i = 0; i < n; i++) {
		send.L[i] += lead.L[i] * 0.3 + ducked.L[i] * 0.15;
		send.R[i] += lead.R[i] * 0.3 + ducked.R[i] * 0.15;
	}
	const wet = { L: reverb(send.L, 0), R: reverb(send.R, 23) };

	const left = new Float32Array(n);
	const right = new Float32Array(n);
	let peak = 0;
	for (let i = 0; i < n; i++) {
		left[i] = drums.L[i] + music.L[i] + ducked.L[i] + lead.L[i] + fx.L[i] * 1.1 + wet.L[i] * 0.3;
		right[i] = drums.R[i] + music.R[i] + ducked.R[i] + lead.R[i] + fx.R[i] * 1.1 + wet.R[i] * 0.3;
		peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
	}
	// Gentle saturation on the loudest peaks only; loudness is set when the video is muxed.
	const drive = 1.4;
	const fade = Math.round(0.6 * SR);
	for (let i = 0; i < n; i++) {
		const f = (i > n - fade ? (n - i) / fade : 1) * (0.92 / Math.tanh(drive));
		left[i] = Math.tanh((drive * left[i]) / peak) * f;
		right[i] = Math.tanh((drive * right[i]) / peak) * f;
	}
	return { left, right };
}

/** A small Schroeder reverb: four damped combs into two allpasses. */
function reverb(x, spread) {
	const out = new Float32Array(x.length);
	for (const len of [1116, 1188, 1277, 1356]) {
		const buf = new Float32Array(len + spread);
		let idx = 0;
		let lp = 0;
		for (let i = 0; i < x.length; i++) {
			const y = buf[idx];
			lp = y * 0.75 + lp * 0.25;
			buf[idx] = x[i] + lp * 0.8;
			idx = (idx + 1) % buf.length;
			out[i] += y * 0.25;
		}
	}
	for (const len of [556, 441]) {
		const buf = new Float32Array(len + spread);
		let idx = 0;
		for (let i = 0; i < out.length; i++) {
			const b = buf[idx];
			const y = -out[i] + b;
			buf[idx] = out[i] + b * 0.5;
			idx = (idx + 1) % buf.length;
			out[i] = y;
		}
	}
	return out;
}

export function writeWav(path, { left, right }) {
	const n = left.length;
	const buf = Buffer.alloc(44 + n * 4);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + n * 4, 4);
	buf.write('WAVEfmt ', 8);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20);
	buf.writeUInt16LE(2, 22);
	buf.writeUInt32LE(SR, 24);
	buf.writeUInt32LE(SR * 4, 28);
	buf.writeUInt16LE(4, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(n * 4, 40);
	for (let i = 0; i < n; i++) {
		buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
		buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
	}
	writeFileSync(path, buf);
}

// Standalone: a preview of the full arrangement.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const out = process.argv[2] ?? 'soundtrack-preview.wav';
	const sections = [
		{ kind: 'intro', beats: 8 },
		{ kind: 'build', beats: 8 },
		{ kind: 'stop', beats: 4 },
		{ kind: 'drop', beats: 16 },
		{ kind: 'lift', beats: 8 },
		{ kind: 'drop', beats: 8 },
		{ kind: 'outro', beats: 12 },
	];
	const spb = 60 / 124;
	const hits = [
		{ t: 16 * spb, kind: 'toggle' },
		{ t: 22 * spb, kind: 'coin' },
		{ t: 30 * spb, kind: 'whoosh' },
		{ t: 37 * spb, kind: 'chime', gain: 0.6 },
		...[0, 1, 2, 3].map((k) => ({ t: (38 + k) * spb, kind: 'tick', arg: 84 + k * 3 })),
		{ t: 48 * spb, kind: 'scribble' },
		{ t: 54 * spb, kind: 'zap' },
	];
	writeWav(out, soundtrack({ sections, hits }));
	console.log(out);
}
