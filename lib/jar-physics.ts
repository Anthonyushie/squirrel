// Tiny 2D verlet physics for nuts in a jar: circles, gravity, glass walls with rounded bottom
// corners. Pure and synchronous; the Jar component owns the animation loop.

export type Body = {
	id: number;
	amount: number;
	r: number;
	x: number;
	y: number;
	px: number;
	py: number;
	/** Rolling angle in radians, integrated from horizontal travel. */
	angle: number;
	/** Dropped in from above and hasn't hit anything yet. */
	falling: boolean;
};

/** The inside of the glass, in the jar's SVG units. Open at the top. */
export type Bounds = { left: number; right: number; floor: number; corner: number };

const DAMPING = 0.992;
const ITERATIONS = 4;
const FLOOR_FRICTION = 0.82;
/** Below this summed movement per body for a few frames, the jar goes to sleep. */
const REST = 0.015;

export class JarSim {
	bodies: Body[] = [];
	gx = 0;
	gy = 0.42;
	private nextId = 1;
	private still = 0;

	constructor(public bounds: Bounds) {}

	add(amount: number, r: number, x: number, y: number, falling: boolean) {
		const b: Body = { id: this.nextId++, amount, r, x, y, px: x, py: y, angle: 0, falling };
		this.bodies.push(b);
		this.still = 0;
		return b;
	}

	remove(id: number) {
		this.bodies = this.bodies.filter((b) => b.id !== id);
		this.wake();
	}

	wake() {
		this.still = 0;
	}

	get asleep() {
		return this.still > 20;
	}

	/** Lays bodies out in rows from the floor and relaxes them, so a jar opens already settled. */
	pack(rand: () => number) {
		const { left, right, floor } = this.bounds;
		let x = left;
		let rowTop = floor;
		let rowHeight = 0;
		for (const b of this.bodies) {
			if (x + 2 * b.r > right) {
				x = left + rand() * 6;
				rowTop -= rowHeight * 0.86;
				rowHeight = 0;
			}
			b.x = x + b.r;
			b.y = rowTop - b.r - rand() * 2;
			b.px = b.x;
			b.py = b.y;
			b.angle = rand() * Math.PI * 2;
			b.falling = false;
			x += 2 * b.r + rand() * 3;
			rowHeight = Math.max(rowHeight, 2 * b.r);
		}
		// Position-only relaxation: no velocity builds up, so nothing jumps on first paint.
		for (let i = 0; i < 90; i++) {
			this.step();
			for (const b of this.bodies) {
				b.px = b.x;
				b.py = b.y;
			}
		}
		this.still = 99;
	}

	/** Advances one frame. Returns bodies that landed this frame (for clinks and haptics). */
	step(): Body[] {
		const landed: Body[] = [];
		for (const b of this.bodies) {
			const vx = (b.x - b.px) * DAMPING;
			const vy = (b.y - b.py) * DAMPING;
			b.px = b.x;
			b.py = b.y;
			b.x += vx + this.gx;
			b.y += vy + this.gy;
		}

		const n = this.bodies.length;
		for (let k = 0; k < ITERATIONS; k++) {
			for (let i = 0; i < n; i++) {
				const a = this.bodies[i];
				for (let j = i + 1; j < n; j++) {
					const b = this.bodies[j];
					const dx = b.x - a.x;
					const dy = b.y - a.y;
					const min = a.r + b.r;
					const d2 = dx * dx + dy * dy;
					if (d2 >= min * min || d2 < 1e-6) continue;
					const d = Math.sqrt(d2);
					// Heavier (bigger) nuts move less.
					const wa = b.r * b.r / (a.r * a.r + b.r * b.r);
					const push = (min - d) / d;
					a.x -= dx * push * wa;
					a.y -= dy * push * wa;
					b.x += dx * push * (1 - wa);
					b.y += dy * push * (1 - wa);
					if (k === 0) {
						if (a.falling && !b.falling) land(a, landed);
						if (b.falling && !a.falling) land(b, landed);
					}
				}
			}
			for (const b of this.bodies) this.walls(b, landed, k === 0);
		}

		let motion = 0;
		for (const b of this.bodies) {
			const dx = b.x - b.px;
			motion += Math.abs(dx) + Math.abs(b.y - b.py);
			b.angle += dx / b.r;
		}
		this.still = motion < REST * Math.max(1, n) ? this.still + 1 : 0;
		return landed;
	}

	private walls(b: Body, landed: Body[], detect: boolean) {
		const { left, right, floor, corner } = this.bounds;
		if (b.x - b.r < left) b.x = left + b.r;
		if (b.x + b.r > right) b.x = right - b.r;
		if (b.y + b.r > floor) {
			b.y = floor - b.r;
			b.px = b.x - (b.x - b.px) * FLOOR_FRICTION;
			if (detect && b.falling) land(b, landed);
		}
		// Rounded bottom corners: keep the nut inside the quarter circle.
		const cy = floor - corner;
		if (b.y > cy) {
			const cx = b.x < left + corner ? left + corner : b.x > right - corner ? right - corner : undefined;
			if (cx !== undefined) {
				const dx = b.x - cx;
				const dy = b.y - cy;
				const d = Math.hypot(dx, dy);
				const max = corner - b.r;
				if (d > max && d > 0) {
					b.x = cx + (dx / d) * max;
					b.y = cy + (dy / d) * max;
				}
			}
		}
	}
}

function land(b: Body, landed: Body[]) {
	b.falling = false;
	if (b.y - b.py > 1.2) landed.push(b);
}

/** Small deterministic generator, so a jar packs the same way on every render. */
export function seeded(seed: number) {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return (s >>> 0) / 4294967296;
	};
}
