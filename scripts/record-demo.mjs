// Records docs/demo.gif and the README screenshots from the real app. Two phones are two separate
// headless Chrome profiles against a production build; both go offline before the gift, the
// offline check and the receipt. Headless Chrome has no camera, so each QR's text is handed across
// through the app's own Paste box, which runs exactly the checks a scan does. Uses test sats only
// and never publishes to Nostr.
// Needs: `npm run build && npm start` (BASE, default http://localhost:3000), Chrome (CHROME) and ffmpeg.
// Run: node scripts/record-demo.mjs
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bytesToHex } from '@noble/hashes/utils.js';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import WebSocket from '../stage0/node_modules/ws/wrapper.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TEST_MINT = 'https://testnut.cashudevkit.org';
/** Another mint's invoice to cash out to: the test mint pays its own invoices within seconds. */
const OTHER_MINT = 'https://testnut.cashu.space';
const PORT = 9333;
const work = mkdtempSync(join(tmpdir(), 'squirrel-demo-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Chrome DevTools Protocol, flat sessions over one socket ---

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(work, 'profile')}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
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
	const { resolve, reject } = pending.get(msg.id);
	pending.delete(msg.id);
	if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`));
	else resolve(msg.result);
});
const send = (method, params = {}, sessionId) =>
	new Promise((resolve, reject) => {
		const id = ++nextId;
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ id, method, params, sessionId }));
	});

/** A phone: its own browser context, so its own IndexedDB, keys and wallet. */
async function phone(width = 375, height = 812) {
	const { browserContextId } = await send('Target.createBrowserContext', {});
	const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
	const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
	const cmd = (method, params) => send(method, params, sessionId);
	await Promise.all([cmd('Page.enable'), cmd('Runtime.enable'), cmd('Network.enable')]);
	await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
	await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });

	const p = {
		cmd,
		/** Runs `body` (an async function body) in the page and returns its JSON result. */
		async run(body) {
			const r = await cmd('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
			if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
			return r.result.value;
		},
		val: (expr) => p.run(`return (${expr});`),
		async until(expr, what = expr, timeout = 30000) {
			for (const end = Date.now() + timeout; Date.now() < end; await sleep(150)) if (await p.val(expr).catch(() => false)) return;
			throw new Error(`Timed out waiting for ${what}`);
		},
		async goto(path) {
			await cmd('Page.navigate', { url: BASE + path });
			await p.until(`document.readyState === 'complete' && !!window.squirrelDb`, `${path} to load`);
			await sleep(600);
		},
		/** Clicks the topmost button whose label or text is `label`, or starts with it. */
		async click(label) {
			await p.until(`!!(${findButton(label)})`, `button "${label}"`, 15000);
			await p.run(`const el = ${findButton(label)}; el.scrollIntoView({ block: 'center' }); el.click(); return true;`);
			await sleep(250);
		},
		/** Types into the field whose placeholder starts with `placeholder`, the way React hears it. */
		async fill(placeholder, value) {
			await p.until(`!!document.querySelector(${JSON.stringify(`[placeholder^="${placeholder}"]`)})`, `field "${placeholder}"`, 15000);
			await p.run(`
				const el = document.querySelector(${JSON.stringify(`[placeholder^="${placeholder}"]`)});
				const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
				Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
				el.dispatchEvent(new Event('input', { bubbles: true }));
				return true;`);
			await sleep(150);
		},
		async shot() {
			const { data } = await cmd('Page.captureScreenshot', { format: 'png' });
			return Buffer.from(data, 'base64');
		},
		offline: (offline) => cmd('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }),
	};
	return p;
}

function findButton(label) {
	const l = JSON.stringify(label);
	return `(() => {
		const els = [...document.querySelectorAll('button, [role=radio], [role=switch]')].filter((e) => !e.disabled);
		const text = (e) => (e.textContent ?? '').replace(/\\s+/g, ' ').trim();
		const name = (e) => e.getAttribute('aria-label') ?? '';
		return els.findLast((e) => name(e) === ${l} || text(e) === ${l}) ?? els.findLast((e) => name(e).startsWith(${l}) || text(e).startsWith(${l}));
	})()`;
}

// --- Setup, online: a creator key on one phone, a filled jar and a saved episode on the other ---

const listener = await phone();
const creator = await phone();

console.log('creator: key and mint keys');
await creator.goto('/creator');
await creator.click('Generate creator key');
await creator.until(`(await squirrelDb.list('mintKeys')).some((m) => m.mintUrl === ${JSON.stringify(TEST_MINT)})`, 'mint keys cached');
// A Nostr identity for the creator, so streamed nuts have an npub to queue for. Never published here.
const sk = generateSecretKey();
const creatorNostr = { priv: bytesToHex(sk), pub: getPublicKey(sk) };
await creator.run(`await squirrelDb.setSetting('creatorNostrKeys', ${JSON.stringify(creatorNostr)}); return true;`);
const lockKey = await creator.val(`(await squirrelDb.getSetting('creatorKeys')).pub`);

console.log('listener: settings, sats, jar, episode');
await listener.goto('/listen');
const settings = { mintUrl: TEST_MINT, creatorNpub: nip19.npubEncode(creatorNostr.pub), creatorName: 'Demo creator', creatorLockKey: lockKey, trustedMints: [], creatorRelays: [] };
await listener.run(`await squirrelDb.setSetting('settings', ${JSON.stringify(settings)}); return true;`);
await listener.goto('/listen');
await listener.click('Add sats');
await listener.click('Create invoice');
await listener.until(`(await squirrelDb.list('wallet')).some((w) => w.proofs.length)`, 'test sats minted', 60000);
await listener.click('Done');
await listener.click('Fill jar');
for (let i = 0; i < 6; i++) await listener.click('More 8-sat nuts');
for (let i = 0; i < 2; i++) await listener.click('More 32-sat nuts');
await listener.click('Fill jar with');
await listener.until(`(await squirrelDb.list('jars')).length > 0`, 'jar filled', 60000);
await listener.until(`!!(await squirrelDb.getSetting('feed'))`, 'feed loaded', 60000);
const episode = await listener.val(`(await squirrelDb.getSetting('feed')).episodes.slice(0, 12).sort((a, b) => a.audioBytes - b.audioBytes)[0].title`);
await listener.click(`Download ${episode} for offline`);
await listener.until(`(await squirrelDb.list('episodes')).length > 0`, 'episode saved', 180000);

// --- The demo, offline ---

await listener.goto('/listen');
await creator.goto('/creator');
// Let each page finish its own startup fetches (feed, mint keys) before the network goes.
await sleep(3000);
await listener.offline(true);
await creator.offline(true);
await listener.until(`!navigator.onLine && document.body.innerText.includes('Offline')`, 'listener offline');
await creator.until(`!navigator.onLine && document.body.innerText.includes('Offline')`, 'creator offline');
await sleep(1200);

/** Frames for the GIF: both screens, a caption, which phone is acting, how long it holds. */
const frames = [];
const stills = {};
let left = await listener.shot();
let right = await creator.shot();
const hold = (title, sub, ms, focus) => frames.push({ left, right, title, sub, ms, focus });
/** Captures one phone repeatedly for `ms`, each frame held as long as it really lasted. */
async function burst(p, side, ms, title, sub) {
	const start = Date.now();
	let last = start;
	let img = await p.shot();
	while (Date.now() - start < ms) {
		const next = await p.shot();
		const now = Date.now();
		if (side === 'left') left = img;
		else right = img;
		hold(title, sub, now - last, side);
		last = now;
		img = next;
	}
	if (side === 'left') left = img;
	else right = img;
}

const STEP = {
	offline: ['Two phones, no signal', "The listener filled a jar while online. Every nut in it is already locked to the creator's key."],
	stream: ['Stream sats while you listen', '8 sats per minute played, capped per episode, queued as nutzaps for when there is signal again.'],
	gift: ['Gift mid-episode', 'One nut leaves the jar as a QR code, carrying the message and the moment in the episode.'],
	verify: ['Verified with no network', "Locked to this creator's key, signed by the mint, not expired, not seen before."],
	receipt: ['A signed receipt, checked offline', "The creator's phone signs the nut with their key. The listener's phone checks it against the key its jar was locked to."],
	done: ['Redeem later, online', 'The creator swaps the nuts at the mint in one go, then sends the sats to any Lightning wallet.'],
};

console.log('recording');
hold(...STEP.offline, 2600);

// Streaming: play, open Now playing, stream once a minute; 8x speed so a minute of episode passes quickly.
await listener.click(`Play ${episode}`);
await listener.until(`!!document.querySelector('audio') && !document.querySelector('audio').paused`, 'playback');
await listener.click('Open player:');
await listener.click('Stream sats');
await listener.click('1 min');
await listener.run(`document.querySelector('[role=switch][aria-label="Stream sats"]').scrollIntoView({ block: 'center' }); return true;`);
await sleep(500);
left = await listener.shot();
hold(...STEP.stream, 1600, 'left');
await listener.run(`document.querySelector('audio').playbackRate = 8; return true;`);
await listener.until(`(await squirrelDb.list('gifts')).some((g) => g.streamed)`, 'a streamed nut', 30000);
await sleep(500);
left = await listener.shot();
stills.stream = left;
hold(...STEP.stream, 2400, 'left');
await listener.run(`document.querySelector('audio').playbackRate = 1; return true;`);

// Gift by hand: 32 sats with a message, then the QR.
await listener.click('Minimise');
await listener.click('Gift');
await listener.click('32 sats');
await listener.fill('Danke', 'Listening on the train. Danke!');
await sleep(300);
left = await listener.shot();
hold(...STEP.gift, 1800, 'left');
await listener.click('Gift 32 sats');
await sleep(900);
left = await listener.shot();
hold(...STEP.gift, 1500, 'left');
await listener.click('Show QR (in person)');
await sleep(900);
left = await listener.shot();
hold(...STEP.gift, 2200, 'left');

// The creator verifies the gift's token.
const token = await listener.val(`(await squirrelDb.list('gifts')).find((g) => !g.streamed).token`);
await creator.click('Paste a gift instead');
await creator.fill('cashuB', token);
await creator.click('Verify');
await burst(creator, 'right', 2700, ...STEP.verify);
right = await creator.shot();
stills.verified = right;
hold(...STEP.verify, 2600, 'right');

// The receipt: signed on the creator's phone, checked on the listener's.
await creator.run(`navigator.clipboard.writeText = async (t) => { window.__copied = t; }; return true;`);
await creator.click('Show receipt to listener');
await sleep(900);
right = await creator.shot();
stills.receipt = right;
hold(...STEP.receipt, 2400, 'right');
await creator.click('Copy receipt');
const receipt = await creator.val('window.__copied');
await listener.click('Scan their receipt');
// The scanner offers Paste instead; without a camera API the app goes straight to pasting.
await listener.until(`!!(${findButton('Paste instead')}) || !!document.querySelector('[placeholder^="sqr1"]')`, 'receipt scanner');
if (await listener.val(`!!(${findButton('Paste instead')})`)) await listener.click('Paste instead');
await listener.fill('sqr1', receipt);
await listener.click('Check receipt');
await burst(listener, 'left', 1500, ...STEP.receipt);
left = await listener.shot();
stills.received = left;
hold(...STEP.receipt, 2600, 'left');

// Where things stand: the listener's gifts, the creator's hoard.
await listener.click('Done');
await creator.click('Done');
await sleep(500);
await listener.run(`const h = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Your gifts'); h.scrollIntoView({ block: 'start' }); scrollBy(0, -76); return true;`);
await sleep(500);
left = await listener.shot();
right = await creator.shot();
hold(...STEP.done, 3400);

// --- Stills that aren't in the GIF ---

console.log('stills: moments, cash-out');
// A streamed nut reaches the creator too, so Moments draws its listening lane.
const streamed = await listener.val(`(await squirrelDb.list('gifts')).find((g) => g.streamed).token`);
await creator.click('Paste a gift instead');
await creator.fill('cashuB', streamed);
await creator.click('Verify');
await sleep(3200);
await creator.click('Done');
await sleep(500);
await creator.run(`const h = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Moments'); h.scrollIntoView({ block: 'start' }); scrollBy(0, -76); return true;`);
await sleep(900);
stills.moments = await creator.shot();

// Back online on the creator's phone only: redeem, then quote a Lightning payout.
await creator.offline(false);
await creator.until('navigator.onLine', 'creator online');
await creator.click('Redeem all');
await creator.until(`(await squirrelDb.list('inbox')).every((g) => g.redeemed)`, 'redeemed', 60000);
const invoice = await fetch(`${OTHER_MINT}/v1/mint/quote/bolt11`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: 21, unit: 'sat' }) })
	.then((r) => r.json())
	.then((q) => q.request, () => undefined);
if (invoice) {
	await creator.click('Send to Lightning');
	await creator.fill('you@wallet.com', invoice);
	await creator.click('Get quote');
	await creator.until(`!!${findButton('Send 21 sats')}`, 'a cash-out quote', 30000);
	await sleep(500);
	stills.cashout = await creator.shot();
} else console.log(`skipped the cash-out still: ${OTHER_MINT} gave no invoice`);

// --- Compose: both phones side by side, the step underneath ---

console.log(`composing ${frames.length} frames`);
const css = readdirSync('.next/static/chunks').filter((f) => f.endsWith('.css')).map((f) => readFileSync(join('.next/static/chunks', f), 'utf8')).join('');
const latin = (family) => {
	const rule = css.match(new RegExp(`@font-face\\{font-family:${family};[^}]*U\\+\\?\\?[^}]*\\}`))?.[0];
	const file = rule?.match(/url\(\.\.\/media\/([^)]+)\)/)?.[1];
	return file ? `url(data:font/woff2;base64,${readFileSync(join('.next/static/media', file)).toString('base64')}) format('woff2')` : 'local(Arial)';
};
const W = 820;
const H = 930;
const stage = await phone(W, H);
await stage.cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const { frameTree } = await stage.cmd('Page.getFrameTree');
await stage.cmd('Page.setDocumentContent', {
	frameId: frameTree.frame.id,
	html: `<!doctype html><style>
		@font-face { font-family: Fredoka; font-weight: 300 700; src: ${latin('Fredoka')}; }
		@font-face { font-family: Geist; font-weight: 100 900; src: ${latin('Geist')}; }
		html, body { margin: 0; background: #17120e; }
		.stage { width: ${W}px; height: ${H}px; box-sizing: border-box; padding: 24px 40px 0; display: flex; flex-direction: column; align-items: center; color: #f3ebe1; font-family: Geist, sans-serif; }
		.phones { display: flex; gap: 44px; }
		.phone { display: flex; flex-direction: column; align-items: center; gap: 10px; }
		.label { font: 600 15px Fredoka, sans-serif; color: #a8998a; letter-spacing: 0.02em; }
		.screen { width: 338px; height: 732px; border-radius: 38px; overflow: hidden; box-shadow: 0 0 0 1px #3a2e24, 0 24px 48px -24px #000; transition: opacity 0s; }
		.screen img { width: 100%; display: block; }
		.quiet .screen { opacity: 0.45; }
		.caption { margin-top: 22px; text-align: center; max-width: 700px; }
		h2 { margin: 0; font: 600 27px/1.2 Fredoka, sans-serif; }
		h2 span { color: #f59e0b; margin-right: 8px; }
		p { margin: 7px 0 0; font: 400 15.5px/1.45 Geist, sans-serif; color: #a8998a; }
	</style>
	<div class="stage">
		<div class="phones">
			<div class="phone" id="L"><div class="label">Listener's phone</div><div class="screen"><img id="li"></div></div>
			<div class="phone" id="R"><div class="label">Creator's phone</div><div class="screen"><img id="ri"></div></div>
		</div>
		<div class="caption"><h2><span id="n"></span><span id="t" style="color:inherit;margin:0"></span></h2><p id="s"></p></div>
	</div>`,
});
await sleep(300);

const order = Object.keys(STEP);
const out = join(work, 'frames');
mkdirSync(out);
const list = [];
for (const [i, f] of frames.entries()) {
	const step = order.findIndex((k) => STEP[k][0] === f.title) + 1;
	await stage.run(`
		const set = (id, png) => { const img = document.getElementById(id); img.src = 'data:image/png;base64,' + png; return img.decode(); };
		await Promise.all([set('li', ${JSON.stringify(f.left.toString('base64'))}), set('ri', ${JSON.stringify(f.right.toString('base64'))})]);
		document.getElementById('n').textContent = '${step}/${order.length}';
		document.getElementById('t').textContent = ${JSON.stringify(f.title)};
		document.getElementById('s').textContent = ${JSON.stringify(f.sub)};
		document.getElementById('L').className = 'phone' + (${JSON.stringify(f.focus)} === 'right' ? ' quiet' : '');
		document.getElementById('R').className = 'phone' + (${JSON.stringify(f.focus)} === 'left' ? ' quiet' : '');
		return true;`);
	const name = `f${String(i).padStart(3, '0')}.png`;
	writeFileSync(join(out, name), await stage.shot());
	list.push(`file '${name}'`, `duration ${(Math.max(f.ms, 40) / 1000).toFixed(3)}`);
}
list.push(list[list.length - 2]);
writeFileSync(join(out, 'list.txt'), list.join('\n'));

const ffmpeg = (args) => {
	const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
	if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
};
mkdirSync('docs/screens', { recursive: true });
// Two passes: a palette from every frame, then the GIF. One pass buffers the whole video in memory.
const frames12 = `fps=12,scale=${process.env.GIF_WIDTH ?? W}:-1:flags=lanczos`;
const palette = join(out, 'palette.png');
ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(out, 'list.txt'), '-vf', `${frames12},palettegen=max_colors=160:stats_mode=diff`, palette]);
ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(out, 'list.txt'), '-i', palette, '-lavfi', `${frames12}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, '-loop', '0', 'docs/demo.gif']);
for (const [name, png] of Object.entries(stills)) {
	const src = join(work, `${name}.png`);
	writeFileSync(src, png);
	const file = `docs/screens/${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}.png`;
	ffmpeg(['-i', src, '-vf', 'scale=450:-1:flags=lanczos', file]);
	console.log(file);
}
console.log('docs/demo.gif');

ws.close();
chrome.kill();
await sleep(500);
rmSync(work, { recursive: true, force: true });
