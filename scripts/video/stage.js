// The launch video's renderer. scripts/make-video.mjs calls init(plan) once, then render(t, frame)
// per frame. Everything on screen is a pure function of t and the plan, so a re-render is identical.

/* global document, window, Path2D */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (html) => {
	const d = document.createElement('div');
	d.innerHTML = html.trim();
	return d.firstElementChild;
};
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, start, dur) => clamp((t - start) / dur);
const E = {
	out: (p) => 1 - (1 - p) ** 3,
	inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2),
	back: (p) => 1 + 2.4 * (p - 1) ** 3 + 1.4 * (p - 1) ** 2,
	in: (p) => p * p * p,
};
/** 0 → 1 → 0 over [start, start + dur]. */
const bump = (t, start, dur) => {
	const p = prog(t, start, dur);
	return p > 0 && p < 1 ? Math.sin(Math.PI * p) : 0;
};
function rand(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let x = Math.imul(a ^ (a >>> 15), a | 1);
		x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	};
}

// --- Art: the app's own nuts, mascot and logo ---

const NUTS = {
	hazelnut: `<path d="M32 12c1.8 0 2.9 1.4 3.6 3.2C44.6 17.4 51 25.2 51 34.5 51 45 42.6 52 32 52s-19-7-19-17.5c0-9.3 6.4-17.1 15.4-19.3.7-1.8 1.8-3.2 3.6-3.2z" fill="var(--nut-rust)"/><path d="M17.5 40c3.2 6.2 8.4 9.4 14.5 9.4S43.3 46.2 46.5 40c-4.3 2.1-9.2 3.2-14.5 3.2S21.8 42.1 17.5 40z" fill="var(--nut-light)" opacity=".5"/><path d="M22 29c1.8-4.4 5.4-7.6 9.6-8.6" fill="none" stroke="var(--nut-light)" stroke-width="3" stroke-linecap="round" opacity=".75"/>`,
	acorn: `<path d="M32 8v6" stroke="var(--nut-shell)" stroke-width="4" stroke-linecap="round"/><path d="M14 27c0-8 8-13 18-13s18 5 18 13v2H14z" fill="var(--nut-shell)"/><path d="M14 27c0-8 8-13 18-13s18 5 18 13" fill="none" stroke="var(--nut-line)" stroke-width="2"/><path d="M17 29h30c0 13-6 22-15 27-9-5-15-14-15-27z" fill="var(--nut-amber)"/><path d="M23 34c0 7 3 12 7 15" fill="none" stroke="var(--nut-light)" stroke-width="3" stroke-linecap="round" opacity=".7"/>`,
	walnut: `<path d="M32 10c12.2 0 21 9.6 21 22.4S44.2 55 32 55s-21-9.8-21-22.6S19.8 10 32 10z" fill="var(--nut-shell)"/><path d="M32 11.5v42" stroke="var(--nut-line)" stroke-width="2.6"/><path d="M21 21c3.2 2.4 4.2 5.6 3 8.8M18.6 36c3.2 1.2 5 4.4 4 8.4M43 21c-3.2 2.4-4.2 5.6-3 8.8M45.4 36c-3.2 1.2-5 4.4-4 8.4M26.5 15.5c1.2 3 .2 5.4-2 7.2M37.5 15.5c-1.2 3-.2 5.4 2 7.2M27 49c-1.4-2.6-1-5 1-7M37 49c1.4-2.6 1-5-1-7" fill="none" stroke="var(--nut-line)" stroke-width="2" stroke-linecap="round"/>`,
};
const nutSvg = (kind, cls = '') => `<svg class="${cls}" viewBox="0 0 64 64">${NUTS[kind]}</svg>`;
const KINDS = ['hazelnut', 'acorn', 'walnut'];

const LOGO = `<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2b1d12"/><path d="M32 8v6" stroke="#8a5a2b" stroke-width="4" stroke-linecap="round"/><path d="M14 27c0-8 8-13 18-13s18 5 18 13v2H14z" fill="#8a5a2b"/><path d="M14 27c0-8 8-13 18-13s18 5 18 13" fill="none" stroke="#6b4320" stroke-width="2"/><path d="M17 29h30c0 13-6 22-15 27-9-5-15-14-15-27z" fill="#f59e0b"/><path d="M23 34c0 7 3 12 7 15" fill="none" stroke="#fde68a" stroke-width="3" stroke-linecap="round" opacity=".7"/></svg>`;

const SQUIRREL = `<svg class="sq" viewBox="0 0 120 140" style="overflow:visible;width:100%;height:100%"><g class="sq-all">
<g class="sq-tail"><path d="M76 126c24 2 40-16 38-42-1.4-20 5-36-4-54C102 14 82 9 74 22c-6 10 2 20 12 16 8-3 12 10 10 22-2 16-6 34-16 50z" fill="var(--nut-rust)"/><path d="M84 31c7-5 17-1 19 9 2 12-3 24-4 38-1 14-4 28-14 40" fill="none" stroke="var(--nut-light)" stroke-width="3.5" stroke-linecap="round" opacity=".4"/></g>
<g class="sq-body"><path d="M40 132c-12-2-14-24-6-40 6-12 18-18 30-16 14 4 22 22 20 38-1 12-10 18-22 18z" fill="var(--nut-rust)"/><ellipse cx="46" cy="108" rx="10.5" ry="17" transform="rotate(12 46 108)" fill="var(--nut-light)" opacity=".88"/><ellipse cx="47" cy="132.5" rx="13" ry="4.5" fill="var(--nut-shell)"/></g>
<g class="sq-arms"><g transform="translate(17 70) scale(0.42)">${NUTS.acorn}</g><path d="M52 86c-6 0-12 1-16 3" fill="none" stroke="var(--nut-rust)" stroke-width="7" stroke-linecap="round"/><path d="M54 92c-6 0-11 0-15 1" fill="none" stroke="var(--nut-rust)" stroke-width="6.5" stroke-linecap="round"/><ellipse cx="33.5" cy="89" rx="4.2" ry="3.8" fill="var(--nut-shell)"/><ellipse cx="36.5" cy="94" rx="4" ry="3.6" fill="var(--nut-shell)"/></g>
<g class="sq-head"><g transform="translate(44 58) scale(1.14) translate(-44 -58)">
<path d="M56 46c-1-8 2-16 6-22 2 6 2 14 0 22z" fill="var(--nut-shell)"/>
<path d="M66 58c0-14-12-20-22-18-12 2-20 10-23 18-2 6 1 11 7 12 8 6 24 8 32 2 4-4 6-8 6-14z" fill="var(--nut-rust)"/>
<path d="M44 44c-2-9-.5-17 3.5-22l2.5-9 2.5 10c3 7 3 14 0 21z" fill="var(--nut-rust)"/><path d="M46.5 40c-1-6 .5-11 3.5-15 2 6 2 10 .5 15z" fill="var(--nut-light)" opacity=".55"/>
<circle cx="35" cy="65" r="6.5" fill="var(--nut-light)" opacity=".5"/>
<g class="sq-eye"><ellipse cx="39" cy="54" rx="3.4" ry="4.2" fill="var(--nut-ink)"/><circle cx="37.9" cy="52.4" r="1.2" fill="#fff"/></g>
<circle cx="21.5" cy="60" r="2.6" fill="var(--nut-ink)"/><path d="M24 66c3 2 6 1.5 8-.5" fill="none" stroke="var(--nut-ink)" stroke-width="1.6" stroke-linecap="round"/>
<g class="sq-goggles"><path d="M28 47c10-6 26-7 38 0" fill="none" stroke="var(--nut-line)" stroke-width="4" stroke-linecap="round"/><circle cx="40" cy="44" r="6.5" fill="var(--nut-light)" fill-opacity=".7" stroke="var(--nut-line)" stroke-width="2.6"/><circle cx="53" cy="42.5" r="5.5" fill="var(--nut-light)" fill-opacity=".7" stroke="var(--nut-line)" stroke-width="2.6"/><path d="M37.5 41.5l3-2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></g>
</g></g></g></svg>`;

// Material Design "flight" icon (Apache 2.0).
const PLANE = (s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`;
const BOLT = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>`;
const TICK = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const STATUS_ICONS = `<span class="icons">
	<svg class="bars" width="20" height="13" viewBox="0 0 20 13" fill="currentColor"><rect x="0" y="9" width="3.5" height="4" rx="1"/><rect x="5.5" y="6" width="3.5" height="7" rx="1"/><rect x="11" y="3" width="3.5" height="10" rx="1"/><rect x="16.5" y="0" width="3.5" height="13" rx="1"/></svg>
	<svg class="wifi" width="18" height="13" viewBox="0 0 18 13" fill="currentColor"><path d="M9 13l2.6-3.2a4.2 4.2 0 0 0-5.2 0zM3.6 6.4l1.6 2a6.1 6.1 0 0 1 7.6 0l1.6-2a8.7 8.7 0 0 0-10.8 0zM.8 3l1.6 2a10.6 10.6 0 0 1 13.2 0l1.6-2A13.2 13.2 0 0 0 .8 3z"/></svg>
	<span class="plane">${PLANE(20)}</span>
	<svg width="28" height="13" viewBox="0 0 28 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".45"/><rect x="2.5" y="2.5" width="17" height="8" rx="2" fill="currentColor"/><rect x="25" y="4.5" width="2" height="4" rx="1" fill="currentColor" opacity=".45"/></svg>
</span>`;

// --- Layout ---

const PHONE_W = 403;
const PHONE_H = 880;
/** Where each phone sits for a scene layout: centre, scale, Y rotation, tag visibility. */
const LAYOUT = {
	none: { L: { x: 292, y: 1900, s: 0.97, ry: 8, tag: 0 }, R: { x: 788, y: 1900, s: 0.97, ry: -8, tag: 0 } },
	both: { L: { x: 292, y: 818, s: 0.97, ry: 9, tag: 1 }, R: { x: 788, y: 818, s: 0.97, ry: -9, tag: 1 } },
	listener: { L: { x: 540, y: 830, s: 1.07, ry: 0, tag: 0 }, R: { x: 1440, y: 830, s: 0.97, ry: -25, tag: 0 } },
	creator: { L: { x: -360, y: 830, s: 0.97, ry: 25, tag: 0 }, R: { x: 540, y: 830, s: 1.07, ry: 0, tag: 0 } },
	creatorCard: { L: { x: -360, y: 830, s: 0.97, ry: 25, tag: 0 }, R: { x: 300, y: 830, s: 1.0, ry: 8, tag: 0 } },
};

let plan;
let S = {};
const nodes = {};

window.init = async (p) => {
	plan = p;
	await document.fonts.ready;
	const world = $('#world');

	for (const side of ['L', 'R']) {
		const phone = el(`<div class="phone">
			<div class="tag"><i></i>${side === 'L' ? "Listener's phone" : "Creator's phone"}</div>
			<div class="glow"></div>
			<div class="bezel"><div class="inner">
				<div class="status"><span>9:41</span>${STATUS_ICONS}</div>
				<img class="screen" alt="">
				<div class="scan"></div>
				<div class="speed"></div>
			</div><div class="island"></div></div>
		</div>`);
		world.append(phone);
		nodes[side] = { root: phone, img: $('.screen', phone), status: $('.status', phone), glow: $('.glow', phone), tag: $('.tag', phone), scan: $('.scan', phone), speed: $('.speed', phone), src: '' };
	}

	nodes.titles = el(`<div id="titles"><div id="badge"></div><div id="title"></div><div id="sub"></div></div>`);
	world.append(nodes.titles);

	nodes.hook = el(`<div id="hook"><div class="l1"></div><div class="l2"></div><div class="sub">Cashu ecash that works with no signal on either phone.</div></div>`);
	nodes.hook.querySelector('.l1').innerHTML = ['Gift', 'sats', 'to', 'a', 'podcast'].map((w) => `<span class="w">${w}</span>`).join('');
	nodes.hook.querySelector('.l2').innerHTML = ['in', 'airplane', 'mode.'].map((w) => `<span class="w">${w}</span>`).join('');
	nodes.hookPlane = el(`<div class="abs" style="color:var(--accent)">${PLANE(120)}</div>`);
	nodes.hook.append(nodes.hookPlane);
	world.append(nodes.hook);

	nodes.mascot = el(`<div class="mascot">${SQUIRREL}</div>`);
	world.append(nodes.mascot);

	nodes.clip = el(`<div id="clip"><img class="back" alt=""><img class="front" alt=""></div>`);
	world.insertBefore(nodes.clip, world.firstChild);

	nodes.toggle = el(`<div id="toggle"><div class="ico">${PLANE(40)}</div><div class="lbl">Airplane mode</div><div class="sw"><div class="knob"></div></div></div>`);
	world.append(nodes.toggle);

	const rows = [
		['Locked to your key', 'P2PK lock · NUT-11'],
		['Signed by the mint', 'DLEQ proof · NUT-12'],
		['Lock still valid', '30-day locktime'],
		['Never seen before', 'No double gifts'],
	];
	nodes.checks = el(`<div id="checks"><h3>${PLANE(20)} Checked offline</h3>${rows.map(([a, b]) => `<div class="row"><div class="tick">${TICK}</div><div class="txt">${a}<span class="spec">${b}</span></div></div>`).join('')}</div>`);
	world.append(nodes.checks);

	nodes.flyer = el(`<div class="fly">${nutSvg('acorn')}</div>`);
	nodes.ghosts = Array.from({ length: 9 }, () => el(`<div class="ghost"></div>`));
	nodes.seal = el(`<div class="fly" style="color:var(--ok);filter:drop-shadow(0 0 22px rgba(74,222,128,.7))"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#0c2a16" stroke="currentColor" stroke-width="5"/><path d="M19 33l9 9 17-19" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`);
	nodes.rings = Array.from({ length: 3 }, () => el(`<div class="ring"></div>`));
	nodes.chip = el(`<div class="chip">${nutSvg('hazelnut')}+8 sats</div>`);
	nodes.bolt = el(`<div class="bolt">${BOLT}</div>`);
	const r = rand(7);
	nodes.confetti = Array.from({ length: 30 }, (_, i) => {
		const n = el(`<div class="confetti">${nutSvg(KINDS[i % 3])}</div>`);
		n.v = { a: (-160 + 140 * r()) * (Math.PI / 180), s: 750 + 750 * r(), spin: (r() - 0.5) * 900, size: 0.6 + 0.7 * r() };
		return n;
	});
	nodes.rain = Array.from({ length: 22 }, (_, i) => {
		const n = el(`<div class="confetti">${nutSvg(KINDS[i % 3])}</div>`);
		n.v = { x: 40 + 1000 * r(), delay: 3.2 * r(), speed: 420 + 300 * r(), spin: (r() - 0.5) * 300, size: 0.7 + 0.6 * r(), sway: r() * 6 };
		return n;
	});
	for (const n of [...nodes.ghosts, nodes.flyer, nodes.seal, ...nodes.rings, nodes.chip, nodes.bolt, ...nodes.confetti, ...nodes.rain]) world.append(n);

	nodes.outro = el(`<div id="outro">
		<div class="logo">${LOGO}</div>
		<div class="word">${[...'Squirrel'].map((c) => `<span>${c}</span>`).join('')}</div>
		<div class="tagline">Stash nuts now, gift them anywhere.</div>
		<div class="pills">${[['Cashu', 'ecash'], ['NUT-11', 'locks'], ['NUT-12', 'DLEQ'], ['NIP-61', 'nutzaps'], ['Lightning', 'cash-out']].map(([a, b]) => `<div class="pill"><b>${a}</b> ${b}</div>`).join('')}</div>
		<div class="url">squirrel-beige.vercel.app</div>
		<div class="tags">#NutNovember · Value4Value · for Nodesignal</div>
		<div class="foot">${plan.footnote}</div>
	</div>`);
	world.append(nodes.outro);

	S.bgNuts = (() => {
		const rr = rand(3);
		return Array.from({ length: 16 }, (_, i) => ({ kind: KINDS[i % 3], x: rr() * 1080, y: rr() * 1350, s: 0.9 + 1.6 * rr(), v: 10 + 22 * rr(), rot: rr() * 6, spin: (rr() - 0.5) * 0.4 }));
	})();
	S.paths = {
		acorn: [new Path2D('M14 27c0-8 8-13 18-13s18 5 18 13v2H14z'), new Path2D('M17 29h30c0 13-6 22-15 27-9-5-15-14-15-27z')],
		hazelnut: [new Path2D('M32 12c1.8 0 2.9 1.4 3.6 3.2C44.6 17.4 51 25.2 51 34.5 51 45 42.6 52 32 52s-19-7-19-17.5c0-9.3 6.4-17.1 15.4-19.3.7-1.8 1.8-3.2 3.6-3.2z')],
		walnut: [new Path2D('M32 10c12.2 0 21 9.6 21 22.4S44.2 55 32 55s-21-9.8-21-22.6S19.8 10 32 10z')],
	};
	return true;
};

const scene = (id) => plan.scenes.find((s) => s.id === id);
const sceneAt = (t) => plan.scenes.findLast((s) => t >= s.start) ?? plan.scenes[0];
const B = () => plan.spb;

// --- Background ---

function background(t, sc) {
	const ctx = $('#bg').getContext('2d');
	ctx.fillStyle = '#17120e';
	ctx.fillRect(0, 0, 1080, 1350);
	const beatPhase = (t / B()) % 1;
	const pulse = sc.music === 'drop' || sc.music === 'lift' ? 0.06 * Math.exp(-beatPhase * 5) : 0;
	const glow = (x, y, r, rgb, a) => {
		const g = ctx.createRadialGradient(x, y, 0, x, y, r);
		g.addColorStop(0, `rgba(${rgb},${a})`);
		g.addColorStop(1, `rgba(${rgb},0)`);
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 1080, 1350);
	};
	glow(540 + 240 * Math.sin(t * 0.31), 520 + 170 * Math.cos(t * 0.23), 760, '245,158,11', 0.13 + pulse);
	glow(540 - 280 * Math.sin(t * 0.27), 1150 + 60 * Math.sin(t * 0.4), 700, '180,83,9', 0.14 + pulse * 0.7);
	for (const n of S.bgNuts) {
		const y = ((n.y - n.v * t) % 1500 + 1500) % 1500 - 75;
		ctx.save();
		ctx.translate(n.x + 18 * Math.sin(t * 0.5 + n.rot), y);
		ctx.rotate(n.rot + n.spin * t);
		ctx.scale(n.s, n.s);
		ctx.translate(-32, -32);
		ctx.fillStyle = 'rgba(245,158,11,0.06)';
		for (const p of S.paths[n.kind]) ctx.fill(p);
		ctx.restore();
	}
}

// --- Phones ---

function layoutAt(t) {
	const sc = sceneAt(t);
	const i = plan.scenes.indexOf(sc);
	const prev = plan.scenes[i - 1];
	const to = LAYOUT[sc.layout];
	const from = LAYOUT[prev?.layout ?? sc.layout];
	const p = E.inOut(prog(t, sc.start, 0.75 * B()));
	const mix = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, lerp(a[k], b[k], p)]));
	return { L: mix(from.L, to.L), R: mix(from.R, to.R) };
}

/** A point on a phone's screen (fractions of the screen), in stage pixels. */
function screenPoint(side, t, fx, fy) {
	const l = layoutAt(t)[side];
	const px = 14 + fx * 375 - PHONE_W / 2;
	const py = 14 + 40 + fy * 812 - PHONE_H / 2;
	return { x: l.x + px * l.s, y: l.y + py * l.s };
}

function phones(t, f) {
	const lay = layoutAt(t);
	const ev = plan.ev;
	for (const side of ['L', 'R']) {
		const n = nodes[side];
		const l = lay[side];
		const phase = side === 'L' ? 0 : 1.7;
		let s = l.s;
		for (const pt of plan.punches.filter((x) => x.side === side)) s *= 1 + 0.045 * bump(t, pt.t, 0.32);
		const y = l.y + 7 * Math.sin(t * 1.5 + phase);
		const rz = 0.7 * Math.sin(t * 1.1 + phase);
		n.root.style.transform = `translate(${l.x - PHONE_W / 2}px, ${y - PHONE_H / 2}px) perspective(1800px) rotateY(${l.ry}deg) rotateZ(${rz}deg) scale(${s})`;
		n.root.style.display = l.y > 1700 || l.x < -300 || l.x > 1400 ? 'none' : '';
		n.tag.style.opacity = l.tag;
		const src = f[side];
		if (src && src !== n.src) {
			n.img.src = src;
			n.src = src;
			S.decodes.push(n.img.decode().catch(() => {}));
		}
		const off = t >= ev.offlineStatus && !(side === 'R' && t >= ev.online);
		n.status.classList.toggle('off', off);
		const g = Math.max(...plan.glows.filter((x) => x.side === side).map((x) => (t >= x.t ? Math.exp(-(t - x.t) * 2.2) * clamp((t - x.t) * 20) : 0)), 0);
		n.glow.style.opacity = g;

		// Scan line over the QR on screen.
		const scan = plan.scans.find((x) => x.side === side && t >= x.from && t < x.to);
		if (scan) {
			const p = (t - scan.from) / 0.6;
			const yy = lerp(scan.top, scan.bottom, 0.5 - 0.5 * Math.cos(Math.PI * p));
			n.scan.style.top = `${40 + yy * 812}px`;
			n.scan.style.opacity = Math.min(1, (t - scan.from) * 8, (scan.to - t) * 8);
		} else n.scan.style.opacity = 0;

		const sp = f[`speed${side}`] ?? 1;
		const show = sp > 1.9 && (side === 'L' ? lay.L.x > 0 && lay.L.x < 1080 : lay.R.x > 0 && lay.R.x < 1080);
		n.speed.style.opacity = show ? 1 : 0;
		if (show) n.speed.textContent = `▶▶ ${Math.round(sp)}× speed`;
	}
}

// --- Titles ---

function titles(t) {
	const sc = sceneAt(t);
	const i = plan.scenes.indexOf(sc);
	const prev = plan.scenes[i - 1];
	const next = plan.scenes[i + 1];
	const box = nodes.titles;
	if (S.titleFor !== sc.id) {
		S.titleFor = sc.id;
		$('#badge').textContent = sc.badge ?? '';
		$('#title').innerHTML = (sc.title ?? '')
			.split(' ')
			.map((w) => `<span class="w${(sc.hi ?? []).includes(w) ? ' hi' : ''}">${w}</span>`)
			.join(' ');
		$('#sub').textContent = sc.sub ?? '';
	}
	box.style.display = sc.title ? '' : 'none';
	if (!sc.title) return;
	const end = sc.start + sc.dur;
	const out = E.in(prog(t, end - 0.3, 0.28));
	const keepBadge = (s) => s && s.badge === sc.badge;
	const badgeIn = keepBadge(prev) ? 1 : E.back(prog(t, sc.start, 0.3));
	const badgeOut = keepBadge(next) ? 0 : out;
	const badge = $('#badge');
	badge.style.opacity = badgeIn * (1 - badgeOut);
	badge.style.transform = `translateY(${(1 - badgeIn) * 20 - badgeOut * 24}px) scale(${0.85 + 0.15 * badgeIn})`;
	const words = [...$('#title').children];
	words.forEach((w, k) => {
		const p = prog(t, sc.start + 0.12 + k * 0.07, 0.45);
		const e = E.back(p);
		w.style.opacity = Math.min(1, p * 2.5) * (1 - out);
		w.style.transform = `translateY(${(1 - e) * 70 - out * 40}px) rotate(${(1 - e) * 9}deg) scale(${0.8 + 0.2 * e})`;
	});
	const sp = E.out(prog(t, sc.start + 0.35 + words.length * 0.07, 0.4));
	const sub = $('#sub');
	sub.style.opacity = sp * (1 - out);
	sub.style.transform = `translateY(${(1 - sp) * 22 - out * 30}px)`;
}

// --- Scenes with their own art ---

function hook(t) {
	const sc = scene('hook');
	const n = nodes.hook;
	const end = sc.start + sc.dur;
	const visible = t < end + 0.1;
	n.style.display = visible ? '' : 'none';
	if (!visible) return;
	const out = E.in(prog(t, end - 0.35, 0.33));
	n.style.opacity = 1 - out;
	n.style.transform = `scale(${1 + 0.12 * out})`;
	const beat = (t - sc.start) / B();
	[...n.querySelectorAll('.l1 .w')].forEach((w, k) => popWord(w, beat, k * 0.5));
	[...n.querySelectorAll('.l2 .w')].forEach((w, k) => popWord(w, beat, 4 + k * 0.5));
	const sp = E.out(prog(beat, 6, 1));
	const sub = n.querySelector('.sub');
	sub.style.opacity = sp;
	sub.style.transform = `translateY(${(1 - sp) * 20}px)`;
	// The plane crosses between the two lines.
	const pp = prog(t, plan.ev.hookPlane, 1.0 * B());
	nodes.hookPlane.style.display = pp > 0 && pp < 1 ? '' : 'none';
	nodes.hookPlane.style.transform = `translate(${lerp(-200, 1180, E.inOut(pp))}px, ${405 - 40 * Math.sin(Math.PI * pp)}px) rotate(90deg)`;
}

function popWord(w, beat, at) {
	const p = prog(beat, at, 0.8);
	const e = E.back(p);
	w.style.opacity = Math.min(1, p * 3);
	w.style.transform = `translateY(${(1 - e) * 90}px) scale(${0.6 + 0.4 * e}) rotate(${(1 - e) * -8}deg)`;
}

function mascot(t) {
	const n = nodes.mascot;
	const hook = scene('hook');
	const outro = scene('outro');
	const ev = plan.ev;
	let x;
	let y;
	let s;
	let o;
	if (t < hook.start + hook.dur + 0.4) {
		const inP = E.back(prog(t, hook.start + 1.5 * B(), 0.5));
		const outP = E.in(prog(t, hook.start + hook.dur - 0.35, 0.4));
		x = 540;
		y = lerp(1500, 1010, inP) + 600 * outP;
		s = 1;
		o = 1;
	} else if (t >= outro.start) {
		const inP = E.back(prog(t, outro.start + 2 * B(), 0.5));
		x = 540;
		y = lerp(1500, 1140, inP);
		s = 0.78;
		o = 1;
	} else {
		n.style.display = 'none';
		return;
	}
	n.style.display = '';
	// Hops on cue, tail wag always, goggles drop in when the plane passes.
	const hops = [ev.hookHop, ev.hookHop + B(), ...[2, 4, 6, 8, 10, 12].map((b) => outro.start + b * B())];
	const hop = Math.max(...hops.map((h) => bump(t, h, 0.42)));
	n.style.transform = `translate(${x - 150}px, ${y - 175 - hop * 50}px) scale(${s * (1 + 0.05 * hop)}, ${s * (1 - 0.04 * hop + 0.06 * hop)})`;
	n.style.opacity = o;
	$('.sq-tail', n).style.transform = `rotate(${-4 + 8 * Math.sin(t * 2.4) + 14 * hop}deg)`;
	$('.sq-head', n).style.transform = `rotate(${-5 * Math.sin(t * 0.9)}deg)`;
	const blink = (t % 2.9) > 2.78 ? 0.1 : 1;
	$('.sq-eye', n).style.transform = `scaleY(${blink})`;
	const cheer = t >= outro.start ? 1 : hop;
	$('.sq-arms', n).style.transform = `rotate(${40 * cheer}deg) translate(${-2 * cheer}px, ${-7 * cheer}px)`;
	const g = E.back(prog(t, ev.hookGoggles, 0.35));
	const goggles = $('.sq-goggles', n);
	goggles.style.opacity = t >= outro.start ? 1 : Math.min(1, g * 3);
	goggles.style.transform = t >= outro.start ? '' : `translateY(${(1 - g) * -30}px)`;
}

function clip(t, f) {
	const sc = scene('clip');
	const n = nodes.clip;
	if (!sc || !f.clip) {
		n.style.display = 'none';
		return;
	}
	n.style.display = '';
	const inP = E.out(prog(t, sc.start, 0.3));
	const outP = E.in(prog(t, sc.start + sc.dur - 0.3, 0.3));
	n.style.opacity = inP * (1 - outP);
	for (const img of n.querySelectorAll('img'))
		if (img.dataset.src !== f.clip) {
			img.src = f.clip;
			img.dataset.src = f.clip;
			S.decodes.push(img.decode().catch(() => {}));
		}
	n.querySelector('.front').style.transform = `scale(${0.94 + 0.06 * inP + 0.03 * ((t - sc.start) / sc.dur)})`;
}

function toggle(t) {
	const sc = scene('offline');
	const n = nodes.toggle;
	const inP = E.back(prog(t, sc.start + 0.1, 0.35));
	const outP = E.in(prog(t, sc.start + sc.dur - 0.45, 0.35));
	const vis = inP > 0 && outP < 1;
	n.style.display = vis ? '' : 'none';
	if (!vis) return;
	n.style.opacity = Math.min(1, inP * 2) * (1 - outP);
	n.style.transform = `scale(${(0.6 + 0.4 * inP) * (1 - 0.3 * outP)})`;
	const on = E.out(prog(t, plan.ev.offlineToggle, 0.16));
	$('.knob', n).style.transform = `translateX(${on * 40}px)`;
	$('.sw', n).style.background = on > 0.5 ? 'var(--accent)' : '#4a3a2c';
	$('.ico', n).style.background = on > 0.5 ? 'var(--accent)' : 'var(--line)';
	$('.ico', n).style.color = on > 0.5 ? '#1a1209' : 'var(--fg)';
}

function checks(t) {
	const sc = scene('verify');
	const n = nodes.checks;
	const inP = E.out(prog(t, sc.start + 0.5 * B(), 0.45));
	const outP = E.in(prog(t, sc.start + sc.dur - 0.35, 0.33));
	const vis = inP > 0 && outP < 1;
	n.style.display = vis ? '' : 'none';
	if (!vis) return;
	n.style.transform = `translateX(${(1 - inP) * 560 + outP * 560}px) rotate(${(1 - inP) * 6}deg)`;
	[...n.querySelectorAll('.row')].forEach((row, k) => {
		const p = prog(t, plan.ev.checks[k], 0.4);
		const e = E.back(p);
		row.querySelector('.tick').style.transform = `scale(${e})`;
		row.querySelector('.txt').style.opacity = Math.min(1, 0.25 + p * 2);
		row.querySelector('.txt').style.transform = `translateX(${(1 - E.out(p)) * 30}px)`;
	});
}

/** The gift (or the receipt) flying from one phone's QR to the other phone. */
function flights(t) {
	const ev = plan.ev;
	const fly = (node, from, to, t0, t1, ghosts) => {
		const p = prog(t, t0, t1 - t0);
		const vis = t >= t0 && t < t1;
		node.style.display = vis ? '' : 'none';
		if (!vis) return false;
		const a = from();
		const b = to();
		const at = (q) => {
			const e = E.inOut(q);
			const cx = (a.x + b.x) / 2;
			const cy = Math.min(a.y, b.y) - 320;
			return { x: (1 - e) ** 2 * a.x + 2 * (1 - e) * e * cx + e * e * b.x, y: (1 - e) ** 2 * a.y + 2 * (1 - e) * e * cy + e * e * b.y };
		};
		const pt = at(p);
		const s = 0.8 + 0.8 * Math.sin(Math.PI * p);
		node.style.transform = `translate(${pt.x}px, ${pt.y}px) scale(${s}) rotate(${360 * E.inOut(p)}deg)`;
		if (ghosts)
			nodes.ghosts.forEach((g, k) => {
				const q = p - (k + 1) * 0.035;
				g.style.display = q > 0 ? '' : 'none';
				const gp = at(Math.max(0, q));
				g.style.transform = `translate(${gp.x}px, ${gp.y}px) scale(${1 - k * 0.09})`;
				g.style.opacity = 0.75 - k * 0.08;
			});
		return true;
	};
	const qrL = () => screenPoint('L', t, 0.5, plan.qr.L.center);
	const qrR = () => screenPoint('R', t, 0.5, plan.qr.R.center);
	const midL = () => screenPoint('L', t, 0.5, 0.45);
	const midR = () => screenPoint('R', t, 0.5, 0.42);
	const a = fly(nodes.flyer, qrL, midR, ev.flyStart, ev.flyEnd, true);
	const b = fly(nodes.seal, qrR, midL, ev.rflyStart, ev.rflyEnd, true);
	if (!a && !b) nodes.ghosts.forEach((g) => (g.style.display = 'none'));

	// Rings where things land.
	const rings = [
		{ t: ev.flyEnd, at: midR, c: 'var(--accent)' },
		{ t: ev.verifyOk, at: () => screenPoint('R', t, 0.5, 0.4), c: 'var(--ok)' },
		{ t: ev.rflyEnd, at: midL, c: 'var(--ok)' },
		{ t: ev.zap, at: () => screenPoint('R', t, 0.5, 0.45), c: 'var(--accent)' },
		{ t: scene('outro').start, at: () => ({ x: 540, y: 255 }), c: 'var(--accent)' },
		{ t: scene('outro').start + 12 * B(), at: () => ({ x: 540, y: 255 }), c: 'var(--accent)' },
	];
	nodes.rings.forEach((r, k) => {
		const live = rings.filter((x) => t >= x.t && t < x.t + 0.7);
		const ring = live[k];
		r.style.display = ring ? '' : 'none';
		if (!ring) return;
		const p = (t - ring.t) / 0.7;
		const rad = 30 + 260 * E.out(p);
		const c = ring.at();
		r.style.borderColor = ring.c;
		r.style.width = r.style.height = `${rad * 2}px`;
		r.style.transform = `translate(${c.x - rad}px, ${c.y - rad}px)`;
		r.style.opacity = 1 - p;
		r.style.borderWidth = `${8 * (1 - p) + 1}px`;
	});
}

function chip(t) {
	const t0 = plan.ev.streamNut;
	const n = nodes.chip;
	const vis = t >= t0 && t < t0 + 1.5;
	n.style.display = vis ? '' : 'none';
	if (!vis) return;
	const p = E.back(prog(t, t0, 0.35));
	const o = 1 - prog(t, t0 + 1.1, 0.4);
	const at = screenPoint('L', t, 0.62, 0.2);
	n.style.transform = `translate(${at.x}px, ${at.y - 80 * prog(t, t0, 1.5)}px) scale(${p})`;
	n.style.opacity = o;
}

function confetti(t) {
	const t0 = plan.ev.verifyOk;
	const origin = screenPoint('R', t0, 0.5, 0.36);
	for (const n of nodes.confetti) {
		const dt = t - t0;
		const vis = dt >= 0 && dt < 1.7;
		n.style.display = vis ? '' : 'none';
		if (!vis) continue;
		const { a, s, spin, size } = n.v;
		const x = origin.x + Math.cos(a) * s * dt;
		const y = origin.y + Math.sin(a) * s * dt + 0.5 * 2400 * dt * dt;
		n.style.transform = `translate(${x}px, ${y}px) rotate(${spin * dt}deg) scale(${size * Math.min(1, dt * 10)})`;
		n.style.opacity = 1 - prog(dt, 1.2, 0.5);
	}
	const o = scene('outro');
	for (const n of nodes.rain) {
		const dt = t - o.start - n.v.delay;
		const vis = dt >= 0;
		n.style.display = vis ? '' : 'none';
		if (!vis) continue;
		const y = -80 + ((n.v.speed * dt) % 1500);
		n.style.transform = `translate(${n.v.x + 30 * Math.sin(dt * 1.5 + n.v.sway)}px, ${y}px) rotate(${n.v.spin * dt}deg) scale(${n.v.size})`;
		n.style.opacity = 0.55;
	}
}

function bolt(t) {
	const t0 = plan.ev.zap;
	const n = nodes.bolt;
	const vis = t >= t0 && t < t0 + 1.6;
	n.style.display = vis ? '' : 'none';
	$('#flash').style.opacity = t >= t0 ? 0.4 * Math.exp(-(t - t0) * 9) : 0;
	if (!vis) return;
	const at = screenPoint('R', t, 0.86, 0.06);
	const p = E.back(prog(t, t0, 0.3));
	const o = 1 - prog(t, t0 + 1.2, 0.4);
	n.style.transform = `translate(${at.x}px, ${at.y}px) scale(${p}) rotate(${(1 - p) * -30 + 4 * Math.sin(t * 20) * Math.exp(-(t - t0) * 4)}deg)`;
	n.style.opacity = o;
}

function outro(t) {
	const sc = scene('outro');
	const n = nodes.outro;
	const vis = t >= sc.start;
	n.style.display = vis ? '' : 'none';
	if (!vis) return;
	const beat = (t - sc.start) / B();
	const final = bump(beat, 12, 0.6);
	const logo = E.back(prog(beat, 0, 0.9));
	$('.logo', n).style.transform = `scale(${logo * (1 + 0.12 * final)}) rotate(${(1 - logo) * -25}deg)`;
	[...n.querySelectorAll('.word span')].forEach((s, k) => {
		const p = prog(beat, 0.6 + k * 0.18, 0.9);
		const e = E.back(p);
		s.style.opacity = Math.min(1, p * 3);
		s.style.transform = `translateY(${(1 - e) * -120}px) scaleY(${0.7 + 0.3 * e})`;
	});
	const fade = (sel, at) => {
		const p = E.out(prog(beat, at, 1.2));
		const x = $(sel, n);
		x.style.opacity = p;
		x.style.transform = `translateY(${(1 - p) * 24}px)`;
	};
	fade('.tagline', 2.6);
	[...n.querySelectorAll('.pill')].forEach((p, k) => {
		const e = E.back(prog(beat, 4 + k * 0.5, 0.8));
		p.style.opacity = Math.min(1, e * 2);
		p.style.transform = `scale(${0.5 + 0.5 * e})`;
	});
	fade('.url', 7);
	fade('.tags', 8);
	fade('.foot', 9);
}

window.render = async (t, f) => {
	S.decodes = [];
	const sc = sceneAt(t);
	background(t, sc);
	phones(t, f);
	titles(t);
	hook(t);
	mascot(t);
	clip(t, f);
	toggle(t);
	checks(t);
	flights(t);
	chip(t);
	confetti(t);
	bolt(t);
	outro(t);
	await Promise.all(S.decodes);
	return true;
};
