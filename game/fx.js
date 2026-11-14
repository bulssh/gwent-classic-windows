"use strict"

// Visual effects in the spirit of The Witcher 3 gwent board:
//  - a canvas layer for particles (embers when a card lands, golden flare for heroes)
//  - the life gem cracking then shattering when a round is lost
//  - a played card first shown on the right, then flying to its place on the board
// Loaded after gwent.js (used by it at run time only).

const FX = (() => {

	const stage = document.getElementById("stage");
	const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

	// ---------- particles ----------

	const canvas = document.createElement("canvas");
	canvas.id = "fx-layer";
	stage.appendChild(canvas);
	const ctx = canvas.getContext("2d");
	let particles = [];
	let running = false;
	let lastTime = 0;
	let scale = 1;

	function fitCanvas() {
		const r = stage.getBoundingClientRect();
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}
		scale = dpr;
	}
	window.addEventListener("resize", fitCanvas);

	// rectangle of an element in canvas pixels
	function canvasRect(elem) {
		const s = stage.getBoundingClientRect(), r = elem.getBoundingClientRect();
		return {x: (r.left - s.left) * scale, y: (r.top - s.top) * scale, w: r.width * scale, h: r.height * scale};
	}

	const rand = (a, b) => a + Math.random() * (b - a);

	function spawn(p) {
		particles.push(p);
		if (!running) {
			running = true;
			lastTime = performance.now();
			requestAnimationFrame(frame);
		}
	}

	function frame(now) {
		const dt = Math.min(0.05, (now - lastTime) / 1000);
		lastTime = now;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.globalCompositeOperation = "lighter";
		particles = particles.filter(p => (p.age += dt) < p.life);
		for (const p of particles) {
			if (p.age < 0)
				continue;
			p.vx *= 1 - p.drag * dt;
			p.vy = p.vy * (1 - p.drag * dt) + p.gravity * dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			const k = p.age / p.life;
			const alpha = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * p.alpha;
			const size = p.size * (p.shrink ? 1 - 0.6 * k : 1);
			const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
			g.addColorStop(0, `rgba(${p.core},${alpha})`);
			g.addColorStop(0.35, `rgba(${p.color},${alpha * 0.7})`);
			g.addColorStop(1, `rgba(${p.color},0)`);
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalCompositeOperation = "source-over";
		if (particles.length)
			requestAnimationFrame(frame);
		else {
			running = false;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}
	}

	// embers around a card that has just been placed on the board
	function landing(elem, strong = false) {
		if (reduced || !elem || !elem.isConnected)
			return;
		fitCanvas();
		const r = canvasRect(elem);
		if (!r.w)
			return;
		const unit = r.w / 40;
		const count = strong ? 46 : 24;
		for (let i = 0; i < count; i++) {
			// along the border of the card, mostly the sides and the bottom
			const side = Math.random();
			let x, y;
			if (side < 0.35) { x = r.x + rand(-0.05, 0.08) * r.w; y = r.y + rand(0.1, 1) * r.h; }
			else if (side < 0.7) { x = r.x + rand(0.92, 1.05) * r.w; y = r.y + rand(0.1, 1) * r.h; }
			else { x = r.x + rand(0, 1) * r.w; y = r.y + r.h * rand(0.9, 1.04); }
			spawn({
				x, y,
				vx: rand(-14, 14) * unit,
				vy: rand(-55, -18) * unit,
				gravity: -6 * unit,
				drag: 1.6,
				size: rand(1.1, 2.6) * unit * (strong ? 1.2 : 1),
				life: rand(0.55, 1.1),
				age: -rand(0, 0.12),
				alpha: rand(0.65, 1),
				color: "255,150,40",
				core: "255,236,170",
				shrink: true
			});
		}
		// soft dust puff
		for (let i = 0; i < (strong ? 10 : 6); i++) {
			spawn({
				x: r.x + rand(0.1, 0.9) * r.w, y: r.y + r.h * rand(0.75, 1),
				vx: rand(-20, 20) * unit, vy: rand(-12, -2) * unit,
				gravity: 0, drag: 2.2,
				size: rand(6, 11) * unit, life: rand(0.5, 0.8), age: 0,
				alpha: 0.12, color: "200,170,120", core: "220,200,160", shrink: false
			});
		}
	}

	// small burst of sparks from the centre of an element
	function sparks(elem, color, core, count) {
		if (reduced || !elem || !elem.isConnected)
			return;
		fitCanvas();
		const r = canvasRect(elem);
		if (!r.w)
			return;
		const unit = r.w / 12;
		for (let i = 0; i < count; i++) {
			const a = rand(0, Math.PI * 2), v = rand(20, 60) * unit;
			spawn({
				x: r.x + r.w / 2, y: r.y + r.h / 2,
				vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10 * unit,
				gravity: 60 * unit, drag: 3,
				size: rand(0.25, 0.6) * unit, life: rand(0.35, 0.7), age: 0,
				alpha: 1, color, core, shrink: true
			});
		}
	}

	// golden flare rising along a hero card
	function hero(elem) {
		if (reduced || !elem || !elem.isConnected)
			return;
		fitCanvas();
		const r = canvasRect(elem);
		if (!r.w)
			return;
		const unit = r.w / 40;
		for (let i = 0; i < 70; i++) {
			const left = Math.random() < 0.5;
			spawn({
				x: r.x + (left ? rand(-0.06, 0.12) : rand(0.88, 1.06)) * r.w,
				y: r.y + r.h * rand(0.55, 1.05),
				vx: rand(-6, 6) * unit,
				vy: rand(-120, -60) * unit,
				gravity: -10 * unit,
				drag: 1.2,
				size: rand(1.2, 3) * unit,
				life: rand(0.7, 1.3),
				age: -rand(0, 0.45),
				alpha: rand(0.7, 1),
				color: "255,125,20",
				core: "255,240,190",
				shrink: true
			});
		}
		elem.classList.remove("fx-hero");
		void elem.offsetWidth;
		elem.classList.add("fx-hero");
		setTimeout(() => elem.classList.remove("fx-hero"), 1400);
	}

	// small flash on any card landing on the board
	function land(elem) {
		if (!elem)
			return;
		elem.classList.remove("fx-land");
		void elem.offsetWidth;
		elem.classList.add("fx-land");
		setTimeout(() => elem.classList.remove("fx-land"), 700);
	}

	// ---------- life gem ----------

	// The red gem cracks, then shatters and leaves the empty socket
	function shatterGem(gem) {
		if (!gem || !gem.classList.contains("gem-on"))
			return;
		if (reduced || !gem.getClientRects().length) {
			gem.classList.remove("gem-on");
			return;
		}
		const fx = document.createElement("div");
		fx.className = "gem-fx";
		fx.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none">'
			+ '<path d="M50 48 L38 22 L33 9 M50 48 L71 30 L80 22 M50 48 L46 70 L40 88 M50 48 L27 55 L14 60 M50 48 L66 64 L79 77" /></svg>';
		gem.appendChild(fx);
		gem.classList.add("gem-cracking");
		setTimeout(() => {
			sparks(gem, "255,60,60", "255,210,200", 16);
			gem.classList.remove("gem-cracking", "gem-on");
			fx.remove();
			const shards = document.createElement("div");
			shards.className = "gem-shards";
			// pieces cut around the centre of the gem
			const cuts = [
				[[50, 48], [38, 22], [33, 0], [100, 0], [80, 22], [71, 30]],
				[[50, 48], [71, 30], [80, 22], [100, 0], [100, 77], [79, 77], [66, 64]],
				[[50, 48], [66, 64], [79, 77], [100, 77], [100, 100], [40, 100], [40, 88], [46, 70]],
				[[50, 48], [46, 70], [40, 88], [40, 100], [0, 100], [0, 60], [14, 60], [27, 55]],
				[[50, 48], [27, 55], [14, 60], [0, 60], [0, 0], [33, 0], [33, 9], [38, 22]],
			];
			for (const poly of cuts) {
				const s = document.createElement("div");
				s.className = "gem-shard";
				s.style.clipPath = "polygon(" + poly.map(([x, y]) => x + "% " + y + "%").join(",") + ")";
				shards.appendChild(s);
				const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length - 50;
				const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length - 48;
				const len = Math.hypot(cx, cy) || 1;
				const dist = rand(35, 70), rot = rand(-150, 150);
				const ux = cx / len, uy = cy / len;
				s.animate([
					{transform: "translate(0,0) rotate(0deg) scale(1)", opacity: 1, filter: "brightness(1.7)"},
					{offset: 0.18, transform: `translate(${ux * 8}%, ${uy * 8}%) rotate(${rot * 0.1}deg) scale(1)`, opacity: 1, filter: "brightness(1.2)"},
					{offset: 0.55, opacity: 0.9},
					{transform: `translate(${ux * dist}%, ${uy * dist + 45}%) rotate(${rot}deg) scale(0.6)`, opacity: 0, filter: "brightness(0.8)"}
				], {duration: 900, easing: "cubic-bezier(0.3, 0.5, 0.5, 1)", fill: "forwards"});
			}
			gem.appendChild(shards);
			setTimeout(() => shards.remove(), 950);
		}, 380);
	}

	// ---------- played card: shown on the right, then flies to the board ----------

	let launch = null;

	// Remembers where the large preview of the card is, before the preview is hidden
	function launchFromPreview(card) {
		const preview = document.querySelector(".card-preview > .card-lg");
		if (reduced || !preview || !preview.getClientRects().length)
			return;
		const s = stage.getBoundingClientRect(), r = preview.getBoundingClientRect();
		if (!r.width)
			return;
		launch = {card, left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height, time: Date.now()};
	}

	function pendingLaunch(card) {
		if (!launch || launch.card !== card || Date.now() - launch.time > 4000)
			return null;
		const l = launch;
		launch = null;
		return l;
	}

	// Where the card element will be once added to the container (measured with a placeholder)
	function landingRect(card, dest) {
		const s = stage.getBoundingClientRect();
		let parent, index;
		if (dest instanceof Row && card.isSpecial()) {
			parent = dest.elem_special;
			index = 0;
		} else {
			parent = dest.elem;
			index = dest.getSortedIndex ? dest.getSortedIndex(card) : dest.cards.length;
		}
		if (!parent)
			return null;
		const ph = document.createElement("div");
		ph.className = card.elem.className;
		ph.style.visibility = "hidden";
		const ref = [...parent.children].filter(e => e.classList.contains("card"))[index] || null;
		parent.insertBefore(ph, ref);
		const r = ph.getBoundingClientRect();
		ph.remove();
		if (!r.width)
			return null;
		return {left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height};
	}

	async function flyToBoard(card, dest, from) {
		const to = landingRect(card, dest);
		if (!to)
			return false;
		card.gcFlying = true;
		card.elem.style.visibility = "hidden";
		const ghost = document.createElement("div");
		ghost.className = "card-lg card-ghost";
		setLargeCardImage(ghost, card);
		Object.assign(ghost.style, {left: from.left + "px", top: from.top + "px", width: from.width + "px", height: from.height + "px"});
		const small = document.createElement("div");
		small.className = "card-ghost-small";
		small.style.backgroundImage = card.elem.style.backgroundImage;
		ghost.appendChild(small);
		stage.appendChild(ghost);
		const dx = to.left + to.width / 2 - (from.left + from.width / 2);
		const dy = to.top + to.height / 2 - (from.top + from.height / 2);
		const sx = to.width / from.width, sy = to.height / from.height;
		const duration = 460;
		const move = ghost.animate([
			{transform: "translate(0, 0) scale(1, 1)"},
			{transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`}
		], {duration, easing: "cubic-bezier(0.55, 0.05, 0.6, 1)", fill: "forwards"});
		small.animate([{opacity: 0}, {opacity: 0, offset: 0.45}, {opacity: 1}], {duration, fill: "forwards"});
		await move.finished.catch(() => {});
		ghost.remove();
		return true;
	}

	// Called by translateTo: true when the card was flown from the right side of the board
	async function playedCard(card, source, dest) {
		if (!(dest instanceof Row || dest instanceof Weather))
			return false;
		const from = pendingLaunch(card);
		if (!from)
			return false;
		return await flyToBoard(card, dest, from);
	}

	// The card element reached its container: show it again, with its landing effects
	function arrived(card, container) {
		if (card.gcFlying) {
			delete card.gcFlying;
			card.elem.style.visibility = "";
		}
		if (!(container instanceof Row || container instanceof Weather))
			return;
		requestAnimationFrame(() => {
			land(card.elem);
			landing(card.elem, card.isHero && card.isHero());
			if (card.isHero && card.isHero())
				hero(card.elem);
		});
	}

	return {landing, hero, land, sparks, shatterGem, launchFromPreview, playedCard, arrived};
})();
