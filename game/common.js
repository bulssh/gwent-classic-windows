"use strict"

Array.prototype.remove = function(elem)
{
	const index = this.indexOf(elem);
	if (index !== -1)
		this.splice(index, 1);
}

function isEmpty(obj)
{
	for (const property in obj)
	{
		if (Object.hasOwn(obj, property))
			return false;
	}
	return true;
}

class RGBA
{
	constructor(r, g, b, a = 1)
	{
		this.r = r;
		this.g = g;
		this.b = b;
		this.a = a;
	}
	setAlpha(a)
	{
		this.a = a;
	}
	toString()
	{
		const hasAlpha = this.a < 1;
		return (hasAlpha ? "rgba(" : "rgb(") 
		+ this.r + ',' + this.g + ',' + this.b
		+ (hasAlpha ? "," + this.a : "")
		+ ")";
	}
}

// returns val or the min/max it is closest to. Flips inverted min/max values.
function clamp(min, max, val)
{
	if (min > max)
		return clamp(max, min, val);
	return Math.min(max, Math.max(min, val));
}

// Returns the linear interpolation of t from a to b (unclamped)
function lerp(a, b, t)
{
	return (1-t)*a + t*b;
}

// Returns the normalized value of t from the range [a,b]
function inverseLerp(a, b, t)
{
	return (t - a) / (b - a);
}

// Returns the lerp() of [y,z] using the normalized value of t in [a,b] as the param
function map(a, b, y, z, t)
{
	return lerp(y, z, inverseLerp(a, b, t));
}


// Returns true if n is an Number
function isNumber(n) { 
	return !isNaN(parseFloat(n)) && isFinite(n);
}

// Returns true if s is a String
function isString(s){
	return typeof(s) === 'string' || s instanceof String;
}

// Interprets passed string as an interger. Empty strings return 0, null string return NaN
function toInteger(str)
{
	if (str === '')
		return 0;
	else if (!str)
		return NaN;
	return Number.parseInt(str);
}

// Returns a random integer in the range [0,n)
function randomInt(n)  {
	return Math.floor(Math.random() * n);
}

// Length in stage units: 1 = 1% of the 16:9 stage width (see --vw in style.css)
function vw(n) {
	return "calc(" + n + " * var(--vw))";
}

// Pixel size of 1% of the stage width
function stageUnitPx() {
	return document.getElementById("stage").getBoundingClientRect().width / 100;
}

// ---------- random numbers ----------
// Solo games use Math.random. An online game must draw exactly the same numbers on both computers:
// each "stream" (the game itself, the host, the guest) is then a seeded generator, so that the
// numbers do not depend on the order in which the two players' effects interleave.
const Rng = (() => {
	// string -> 32-bit seeds (xmur3) and a small fast generator (sfc32)
	function seeds(str) {
		let h = 1779033703 ^ str.length;
		for (let i = 0; i < str.length; i++) {
			h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
			h = (h << 13) | (h >>> 19);
		}
		return () => {
			h = Math.imul(h ^ (h >>> 16), 2246822507);
			h = Math.imul(h ^ (h >>> 13), 3266489909);
			return (h ^= h >>> 16) >>> 0;
		};
	}
	function sfc32(a, b, c, d) {
		return () => {
			a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
			let t = (a + b) | 0;
			a = b ^ (b >>> 9);
			b = (c + (c << 3)) | 0;
			c = (c << 21) | (c >>> 11);
			d = (d + 1) | 0;
			t = (t + d) | 0;
			c = (c + t) | 0;
			return (t >>> 0) / 4294967296;
		};
	}
	function seeded(str) {
		const s = seeds(str);
		const next = sfc32(s(), s(), s(), s());
		for (let i = 0; i < 12; i++)
			next();
		return next;
	}

	let streams = null; // {game, host, guest} during an online game

	return {
		// starts the streams of an online game (same seed on both computers)
		start(seed) {
			streams = {game: seeded(seed + "/game"), host: seeded(seed + "/host"), guest: seeded(seed + "/guest")};
		},
		stop() {
			streams = null;
		},
		get seeded() {
			return !!streams;
		},
		// number in [0, 1) for the whole game (coin toss)
		game() {
			return streams ? streams.game() : Math.random();
		},
		// number generator of the cards of a player (deck shuffles, random units...)
		of(player) {
			if (!streams || !player || !player.role)
				return Math.random;
			return streams[player.role];
		},
		seeded_: seeded,
	};
})();

// Stable order of cards for the random choices of online games (containers may list the same
// cards in a different order on the two computers: graves filled by simultaneous animations...)
function cardKey(card) {
	return card.name + "|" + card.faction + "|" + card.filename;
}
function canonicalOrder(cards) {
	return cards.slice().sort((a, b) => cardKey(a) < cardKey(b) ? -1 : cardKey(a) > cardKey(b) ? 1 : 0);
}
