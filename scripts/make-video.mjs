// Cuts the launch video from the screencast that scripts/record-demo.mjs saves in .demo-capture/.
// 4:5 for the timeline, 30 fps, every cut on the beat of an original soundtrack (scripts/soundtrack.mjs),
// with the app's own nuts and mascot animated over two phones. Optional real-phone footage goes in
// right after the opening.
//
// Needs: a recorded .demo-capture/, `npm run build` (for the fonts), Chrome (CHROME) and ffmpeg.
// Run:   node scripts/make-video.mjs
// Env:   PHONE_CLIP=path/to/clip.mp4   real footage of the two phones (PHONE_CLIP_START=seconds to skip)
//        OUT=docs/demo.mp4             where to write the video
//        FPS=30                        lower for a quick draft
//        STILLS=3.5,12,20              only render frames at these seconds, as PNGs in .demo-capture/stills
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import WebSocket from '../stage0/node_modules/ws/wrapper.mjs';
import { soundtrack, writeWav } from './soundtrack.mjs';

const CAPTURE = '.demo-capture';
const OUT = process.env.OUT ?? 'docs/demo.mp4';
const FPS = Number(process.env.FPS ?? 30);
const STILLS = process.env.STILLS?.split(',').map(Number);
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CLIP = process.env.PHONE_CLIP;
const CLIP_START = Number(process.env.PHONE_CLIP_START ?? 0);
const BPM = 124;
const SPB = 60 / BPM;
const W = 1080;
const H = 1350;
const PORT = 9334;
const work = mkdtempSync(join(tmpdir(), 'squirrel-video-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ffmpeg = (args) => {
	const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
	if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
};

if (!existsSync(join(CAPTURE, 'capture.json'))) throw new Error(`No ${CAPTURE}/capture.json: run scripts/record-demo.mjs first`);
const cap = JSON.parse(readFileSync(join(CAPTURE, 'capture.json'), 'utf8'));
const M = (name, ms = 0) => {
	if (cap.marks[name] === undefined) throw new Error(`The capture has no "${name}" moment: re-record it`);
	return cap.marks[name] + ms;
};
const has = (name) => cap.marks[name] !== undefined;

// --- Real-phone footage, if given: frames at the video's rate, whole bars long ---

let clipBeats = 0;
let clipFrames = 0;
if (CLIP) {
	const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', CLIP], { encoding: 'utf8' });
	const len = Number(probe.stdout) - CLIP_START;
	if (!(len > 0)) throw new Error(`Couldn't read ${CLIP}`);
	clipBeats = Math.min(24, Math.max(4, Math.round(len / SPB / 4) * 4));
	const dir = join(CAPTURE, 'clip');
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir);
	ffmpeg(['-ss', String(CLIP_START), '-i', CLIP, '-t', String(clipBeats * SPB), '-vf', `fps=${FPS},scale=1280:1280:force_original_aspect_ratio=decrease`, '-q:v', '2', join(dir, '%05d.jpg')]);
	clipFrames = readdirSync(dir).length;
	console.log(`clip: ${clipFrames} frames, ${clipBeats} beats`);
}

// --- The edit: scenes in beats, each mapping its own time onto the capture's clock ---

const cashout = has('cashout:quote')
	? [[4, M('cashout:start')], [6.5, M('cashout:quote')]]
	: [];
const SCENES = [
	{ id: 'hook', beats: 8, music: 'intro', layout: 'none' },
	CLIP && { id: 'clip', beats: clipBeats, music: 'build', layout: 'none', badge: 'Real phones', title: 'Two phones. Zero bars.', hi: ['Zero', 'bars.'], sub: 'Filmed for real, airplane mode on.' },
	{ id: 'stash', beats: 8, music: 'build', layout: 'listener', badge: '1 · Before you go', title: 'Stash nuts in a jar', hi: ['jar'], sub: "Each nut is locked to the creator's key.", map: [[0, M('fill:open')], [2.5, M('fill:pour')], [3.5, M('fill:filled')]] },
	{ id: 'offline', beats: 4, music: 'stop', layout: 'both', badge: '2 · On the train', title: 'Airplane mode on', hi: ['Airplane'], sub: 'Both phones. No signal from here on.', map: [[0, M('offline:start', -500)], [1.25, M('offline:start')], [2.2, M('offline:on')]] },
	{ id: 'stream', beats: 8, music: 'drop', layout: 'listener', badge: '3 · Listen', title: 'Stream sats as you listen', hi: ['Stream', 'sats'], sub: '8 sats a minute, capped per episode, sent later.', map: [[0, M('stream:start')], [3, M('stream:on')], [6, M('stream:nut')]] },
	{ id: 'gift', beats: 12, music: 'drop', layout: 'listener', badge: '4 · Gift', title: 'Gift the moment', hi: ['moment'], sub: '32 sats, a note, and the second that moved you.', map: [[0, M('gift:start')], [2, M('gift:type')], [6, M('gift:typed')], [7, M('gift:send')], [9, M('gift:qr')]] },
	{ id: 'handover', beats: 4, music: 'drop', layout: 'both', badge: '4 · Gift', title: 'Hand it over as a QR', hi: ['QR'], sub: 'Phone to phone. No internet involved.', map: [[0, M('gift:qr', 300)], [4, M('gift:done')]] },
	{ id: 'verify', beats: 12, music: 'lift', layout: 'creatorCard', badge: '5 · Verify', title: 'Verified. Zero signal.', hi: ['Zero', 'signal.'], sub: "The creator's phone checks it all by itself.", map: [[0, M('verify:ok', -600)], [2, M('verify:ok')]] },
	{ id: 'receipt', beats: 8, music: 'drop', layout: 'both', badge: '6 · Receipt', title: 'A signed receipt, back', hi: ['signed'], sub: "Checked on the listener's phone, still offline.", map: [[0, M('receipt:start')], [2, M('receipt:qr')], [5, M('receipt:check', -300)], [5.6, M('receipt:check')]] },
	{ id: 'cashout', beats: 8, music: 'drop', layout: 'creator', badge: '7 · Later, online', title: 'Redeem, then Lightning', hi: ['Lightning'], sub: 'One swap at the mint. Fees shown before paying.', map: [[0, M('redeem:start')], [1, M('redeem:online')], [3, M('redeem:done')], ...cashout] },
	{ id: 'outro', beats: 16, music: 'outro', layout: 'none' },
].filter(Boolean);

let beat = 0;
for (const s of SCENES) {
	s.start = beat * SPB;
	s.dur = s.beats * SPB;
	beat += s.beats;
	if (!s.map) continue;
	// Scene seconds ↔ capture ms, piecewise linear through the anchors, real time after the last.
	const pts = s.map.map(([b, c]) => [b * SPB, c]);
	for (let i = 1; i < pts.length; i++) pts[i][1] = Math.max(pts[i][1], pts[i - 1][1] + 1);
	s.ct = (x) => {
		if (x <= pts[0][0]) return pts[0][1];
		for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (x - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0]);
		return pts.at(-1)[1] + (x - pts.at(-1)[0]) * 1000;
	};
	s.inv = (c) => {
		if (c <= pts[0][1]) return s.start + pts[0][0];
		for (let i = 1; i < pts.length; i++) if (c <= pts[i][1]) return s.start + pts[i - 1][0] + ((c - pts[i - 1][1]) * (pts[i][0] - pts[i - 1][0])) / (pts[i][1] - pts[i - 1][1]);
		return s.start + pts.at(-1)[0] + (c - pts.at(-1)[1]) / 1000;
	};
}
const sc = (id) => SCENES.find((s) => s.id === id);
const at = (id, beats) => sc(id).start + beats * SPB;
const totalBeats = beat;
const duration = totalBeats * SPB + 0.8;

// --- Moments the animation and the sound effects hit ---

const ev = {
	hookPlane: at('hook', 3.5),
	hookGoggles: at('hook', 4.2),
	hookHop: at('hook', 6),
	offlineToggle: at('offline', 1),
	offlineStatus: at('offline', 1.25),
	streamNut: sc('stream').inv(M('stream:nut')),
	giftSend: sc('gift').inv(M('gift:send')),
	flyStart: at('handover', 1.25),
	flyEnd: at('handover', 3),
	verifyOk: sc('verify').inv(M('verify:ok')),
	checks: [3, 4, 5, 6].map((b) => at('verify', b)),
	rflyStart: at('receipt', 2.6),
	rflyEnd: at('receipt', 4.3),
	receiptOk: sc('receipt').inv(M('receipt:check', 600)),
	online: sc('cashout').inv(M('redeem:online')),
	redeemDone: sc('cashout').inv(M('redeem:done')),
	zap: sc('cashout').inv(has('cashout:quote') ? M('cashout:quote') : M('redeem:done')),
};
const QR = JSON.parse(process.env.QR ?? '{"L":{"center":0.47,"top":0.3,"bottom":0.64},"R":{"center":0.42,"top":0.26,"bottom":0.58}}');
const plan = {
	spb: SPB,
	ev,
	qr: QR,
	scenes: SCENES.map(({ id, start, dur, beats, music, layout, badge, title, hi, sub }) => ({ id, start, dur, beats, music, layout, badge, title, hi, sub })),
	punches: [
		{ side: 'L', t: ev.streamNut },
		{ side: 'L', t: ev.giftSend },
		{ side: 'R', t: ev.flyEnd },
		{ side: 'R', t: ev.verifyOk },
		{ side: 'L', t: ev.rflyEnd },
		{ side: 'R', t: ev.zap },
	],
	glows: [
		{ side: 'R', t: ev.verifyOk },
		{ side: 'L', t: ev.receiptOk },
		{ side: 'R', t: ev.zap },
	],
	scans: [
		{ side: 'L', from: at('handover', 0.1), to: ev.flyStart, top: QR.L.top, bottom: QR.L.bottom },
		{ side: 'R', from: at('receipt', 2.1), to: ev.rflyStart, top: QR.R.top, bottom: QR.R.bottom },
	],
	footnote: `App footage: Squirrel's production build on two offline browser profiles${CLIP ? ', plus real phones' : ''}. Test sats.`,
};

const hits = [
	...[0, 0.5, 1, 1.5, 2].map((b) => ({ t: at('hook', b), kind: 'pop', gain: 0.22 })),
	...[4, 4.5, 5].map((b) => ({ t: at('hook', b), kind: 'pop', gain: 0.22 })),
	{ t: ev.hookPlane - 0.1, kind: 'whoosh', arg: 0.6, gain: 0.45 },
	{ t: ev.hookGoggles, kind: 'plink', arg: 91, gain: 0.3 },
	...Array.from({ length: 10 }, (_, k) => ({ t: sc('stash').inv(M('fill:filled')) + 0.15 + k * 0.11, kind: 'plink', arg: 84 + ((k * 5) % 12), gain: 0.16, pan: ((k % 3) - 1) * 0.3 })),
	{ t: ev.offlineToggle, kind: 'toggle', gain: 0.6 },
	{ t: ev.streamNut, kind: 'coin', gain: 0.32 },
	{ t: ev.giftSend, kind: 'pop', gain: 0.4 },
	{ t: ev.flyStart - 0.1, kind: 'whoosh', arg: 0.7, gain: 0.5 },
	{ t: ev.flyEnd, kind: 'pop', gain: 0.45 },
	{ t: ev.verifyOk, kind: 'chime', gain: 0.55 },
	...ev.checks.map((t, k) => ({ t, kind: 'tick', arg: 84 + k * 3, gain: 0.28 })),
	{ t: at('receipt', 2), kind: 'scribble', gain: 0.4 },
	{ t: ev.rflyStart - 0.1, kind: 'whoosh', arg: 0.7, gain: 0.45 },
	{ t: ev.rflyEnd, kind: 'plink', arg: 93, gain: 0.4 },
	{ t: ev.online, kind: 'toggle', gain: 0.45 },
	{ t: ev.redeemDone, kind: 'coin', gain: 0.28 },
	{ t: ev.zap, kind: 'zap', gain: 0.5 },
	...[4, 4.5, 5, 5.5, 6].map((b) => ({ t: at('outro', b), kind: 'pop', gain: 0.2 })),
];

/** Which capture frame each phone shows at video time t, and how fast the capture is playing. */
const framesOf = (side) => cap.frames[side].map((f) => ({ ...f, url: `/${CAPTURE}/${f.file}` }));
const frames = { L: framesOf('listener'), R: framesOf('creator') };
const mapped = SCENES.filter((s) => s.map);
function captureTime(t) {
	const s = SCENES.findLast((x) => t >= x.start) ?? SCENES[0];
	if (s.map) return s.ct(t - s.start);
	const before = mapped.findLast((x) => x.start < s.start);
	return before ? before.ct(before.dur) : mapped[0].ct(0);
}
function pick(list, ct) {
	let lo = 0;
	let hi = list.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (list[mid].t <= ct) lo = mid;
		else hi = mid - 1;
	}
	return list[lo].url;
}
function frameAt(t) {
	const ct = captureTime(t);
	const s = SCENES.findLast((x) => t >= x.start) ?? SCENES[0];
	const speed = s.map ? (captureTime(t + 0.1) - ct) / 100 : 1;
	const clip = s.id === 'clip' ? `/${CAPTURE}/clip/${String(Math.min(clipFrames, Math.floor((t - s.start) * FPS) + 1)).padStart(5, '0')}.jpg` : null;
	return { L: pick(frames.L, ct), R: pick(frames.R, ct), speedL: s.layout === 'listener' ? speed : 1, speedR: s.layout === 'creator' ? speed : 1, clip };
}

// --- A static server for the stage, the capture and the fonts ---

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const root = resolve('.');
const server = createServer((req, res) => {
	const file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
	if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
		res.writeHead(404).end();
		return;
	}
	res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'max-age=3600' });
	createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const css = readdirSync('.next/static/chunks').filter((f) => f.endsWith('.css')).map((f) => readFileSync(join('.next/static/chunks', f), 'utf8')).join('');
const fontUrl = (family) => {
	const rule = css.match(new RegExp(`@font-face\\{font-family:${family};[^}]*U\\+\\?\\?[^}]*\\}`))?.[0];
	const file = rule?.match(/url\(\.\.\/media\/([^)]+)\)/)?.[1];
	if (!file) throw new Error(`No ${family} font in .next: run npm run build`);
	return `/.next/static/media/${file}`;
};

// --- Chrome ---

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(work, 'profile')}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => chrome.kill());
let version;
for (let i = 0; i < 50 && !version; i++) version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json(), () => sleep(200));
if (!version) throw new Error('Chrome did not start');
const ws = new WebSocket(version.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
await new Promise((r) => ws.once('open', r));
let nextId = 0;
const pending = new Map();
ws.on('message', (data) => {
	const msg = JSON.parse(data.toString());
	if (!msg.id || !pending.has(msg.id)) return;
	const { resolve: ok, reject } = pending.get(msg.id);
	pending.delete(msg.id);
	if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`));
	else ok(msg.result);
});
const send = (method, params = {}, sessionId) =>
	new Promise((ok, reject) => {
		const id = ++nextId;
		pending.set(id, { resolve: ok, reject });
		ws.send(JSON.stringify({ id, method, params, sessionId }));
	});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cmd = (method, params) => send(method, params, sessionId);
await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const run = async (expression) => {
	const r = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
	return r.result.value;
};
await cmd('Page.navigate', { url: `${origin}/scripts/video/stage.html` });
for (let i = 0; i < 100 && !(await run(`document.readyState === 'complete' && typeof init === 'function'`).catch(() => false)); i++) await sleep(100);
await run(`(() => {
	const s = document.createElement('style');
	s.textContent = "@font-face { font-family: Fredoka; font-weight: 300 700; src: url(${fontUrl('Fredoka')}) format('woff2'); } @font-face { font-family: Geist; font-weight: 100 900; src: url(${fontUrl('Geist')}) format('woff2'); }";
	document.head.append(s);
	return Promise.all([document.fonts.load('600 40px Fredoka'), document.fonts.load('400 20px Geist')]).then(() => true);
})()`);
await run(`init(${JSON.stringify(plan)})`);

const shot = async () => Buffer.from((await cmd('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64');
const renderAt = (t) => run(`render(${t}, ${JSON.stringify(frameAt(t))})`);

if (STILLS) {
	const dir = join(CAPTURE, 'stills');
	mkdirSync(dir, { recursive: true });
	for (const t of STILLS) {
		await renderAt(t);
		await sleep(30);
		writeFileSync(join(dir, `${t.toFixed(2)}.png`), await shot());
		console.log(join(dir, `${t.toFixed(2)}.png`));
	}
} else {
	const wav = join(work, 'soundtrack.wav');
	writeWav(wav, soundtrack({ bpm: BPM, sections: SCENES.map((s) => ({ kind: s.music, beats: s.beats })), hits }));
	mkdirSync('docs', { recursive: true });
	const total = Math.ceil(duration * FPS);
	const enc = spawn(
		'ffmpeg',
		['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-t', duration.toFixed(3), '-movflags', '+faststart', OUT],
		{ stdio: ['pipe', 'inherit', 'inherit'] },
	);
	const started = Date.now();
	for (let f = 0; f < total; f++) {
		await renderAt(f / FPS);
		if (!enc.stdin.write(await shot())) await once(enc.stdin, 'drain');
		if (f % (FPS * 5) === 0) console.log(`frame ${f}/${total} (${Math.round((Date.now() - started) / 1000)}s)`);
	}
	enc.stdin.end();
	const [code] = await once(enc, 'exit');
	if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
	console.log(`${OUT}: ${duration.toFixed(1)}s, ${(statSync(OUT).size / 1e6).toFixed(1)} MB`);
}

ws.close();
chrome.kill();
server.close();
await Promise.race([once(chrome, 'exit'), sleep(5000)]);
// Chrome's crash handler can hold a file for a moment after Chrome exits.
try {
	rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
} catch {
	console.warn(`Couldn't remove ${work}: delete it once Chrome has closed`);
}
