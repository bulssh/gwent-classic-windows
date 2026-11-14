"use strict"

// Input layer: card zoom (right click / two-finger tap / long press), touchpad scrolling,
// keyboard shortcuts and protection against page zoom or scroll.
// Loaded after gwent.js.

const Input = (() => {

	const stage = document.getElementById("stage");

	// ---------- card zoom ----------

	const zoom = document.createElement("section");
	zoom.id = "zoom";
	zoom.className = "hide";
	zoom.innerHTML = '<div class="card-lg"></div><div class="card-description"><div></div><h1></h1><p></p></div><p class="zoom-hint"></p>';
	stage.appendChild(zoom);
	const zoomCard = zoom.children[0];
	const zoomDesc = zoom.children[1];
	const zoomHint = zoom.children[2];
	let zoomOpenedAt = 0;

	function isVisible(elem) {
		if (!elem || !elem.isConnected)
			return false;
		for (let e = elem; e && e !== document.body; e = e.parentElement) {
			if (e.classList.contains("hide"))
				return false;
			const st = getComputedStyle(e);
			if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0)
				return false;
		}
		return elem.getClientRects().length > 0;
	}

	function containsPoint(rect, x, y) {
		return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
	}

	// The card object (Card, or card_dict data) represented by an element, if any
	function cardOf(elem) {
		return elem.gcCard || elem.gcCardData || null;
	}

	// Finds the card under the pointer by geometry: works even on cards that are not clickable
	// at that moment (board cards, opponent turn...)
	function cardAt(x, y) {
		let scope;
		if (Popup.curr)
			return null;
		if (Carousel.curr)
			scope = document.getElementById("carousel");
		else if (!document.getElementById("deck-customization").classList.contains("hide"))
			scope = document.getElementById("deck-customization");
		else
			scope = document.querySelector("main");
		const candidates = [...scope.querySelectorAll(".card, .card-lg")].filter(e => cardOf(e));
		let best = null;
		for (const e of candidates) {
			const r = e.getBoundingClientRect();
			if (!containsPoint(r, x, y))
				continue;
			// inside a scrolling list: the point must also be inside the visible part of the list
			const list = e.closest("#card-bank, #card-deck");
			if (list && !containsPoint(list.getBoundingClientRect(), x, y))
				continue;
			if (!isVisible(e))
				continue;
			best = e; // document order ~ painting order: keep the last (topmost) one
		}
		lastFaction = best ? best.gcFaction : undefined;
		return best ? cardOf(best) : null;
	}
	let lastFaction;

	function openZoom(card, faction = lastFaction) {
		if (!card)
			return false;
		const data = card instanceof Card ? card : new Card(card, null);
		setLargeCardImage(zoomCard, data, card instanceof Card && card.holder ? undefined : faction);
		ui.setDescription(data, zoomDesc);
		zoomHint.textContent = t("zoom.hint");
		zoom.classList.remove("hide");
		zoomOpenedAt = Date.now();
		AudioManager.playSFX("ui_card");
		return true;
	}

	function closeZoom() {
		if (zoom.classList.contains("hide"))
			return false;
		zoom.classList.add("hide");
		return true;
	}

	function zoomOpen() {
		return !zoom.classList.contains("hide");
	}

	document.addEventListener("contextmenu", e => {
		if (e.target instanceof HTMLInputElement)
			return;
		e.preventDefault();
		e.stopPropagation();
		if (closeZoom())
			return;
		openZoom(cardAt(e.clientX, e.clientY));
	}, true);

	// Any click closes the zoom without triggering anything underneath
	["pointerdown", "mousedown", "click"].forEach(type => document.addEventListener(type, e => {
		if (!zoomOpen())
			return;
		if (e.button === 2)
			return; // handled by contextmenu
		e.preventDefault();
		e.stopPropagation();
		if (type === "click" && Date.now() - zoomOpenedAt > 150)
			closeZoom();
	}, true));

	// ---------- touchpad / mouse wheel ----------

	let wheelAccum = 0;
	let wheelLock = 0;
	document.addEventListener("wheel", e => {
		// pinch-zoom on a touchpad arrives as ctrl+wheel: never zoom the page
		if (e.ctrlKey) {
			e.preventDefault();
			return;
		}
		if (zoomOpen()) {
			e.preventDefault();
			closeZoom();
			return;
		}
		if (Carousel.curr && !Carousel.curr.elem.classList.contains("hide")) {
			e.preventDefault();
			const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1;
			const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
			wheelAccum += d;
			const now = Date.now();
			if (Math.abs(wheelAccum) >= 50 && now >= wheelLock) {
				Carousel.curr.shift(null, Math.sign(wheelAccum));
				wheelAccum = 0;
				wheelLock = now + 90;
			}
			return;
		}
		// the deck lists scroll natively, nothing else may scroll
		if (!e.target.closest || !e.target.closest("#card-bank, #card-deck"))
			e.preventDefault();
	}, {passive: false, capture: true});

	// Safari/WebKit pinch gestures
	["gesturestart", "gesturechange"].forEach(type => document.addEventListener(type, e => e.preventDefault(), {passive: false}));
	// double-tap zoom / browser drag of images
	document.addEventListener("dragstart", e => e.preventDefault());
	document.addEventListener("dblclick", e => e.preventDefault());

	// Clicking the black side bars cancels a selection like a click on the background
	document.addEventListener("click", e => {
		if (!stage.contains(e.target) && ui.previewCard && !document.getElementById("click-background").classList.contains("noclick"))
			ui.cancel();
	});

	// ---------- keyboard ----------

	// F11 / Alt+Enter: full screen <-> the window mode chosen in the settings (options.js)
	function toggleFullscreen() {
		Options.toggleFullscreen();
	}

	const deckMenuOpen = () => !document.getElementById("deck-customization").classList.contains("hide");

	// ---------- pass: hold the space bar (or the pass hint) like in TW3 ----------

	const HOLD_MS = 900;
	const passHint = document.getElementById("pass-button");
	let hold = null;

	function startHold(source) {
		if (hold || !ui.canPass())
			return;
		const anim = passHint.querySelector(".pass-progress").animate(
			[{transform: "scaleX(0)"}, {transform: "scaleX(1)"}], {duration: HOLD_MS, easing: "linear", fill: "forwards"});
		passHint.classList.add("holding");
		hold = {source, anim};
		anim.onfinish = () => {
			if (!hold || hold.anim !== anim)
				return;
			stopHold();
			ui.passRound();
		};
	}

	function stopHold() {
		if (!hold)
			return;
		hold.anim.cancel();
		hold = null;
		passHint.classList.remove("holding");
	}

	passHint.addEventListener("pointerdown", e => {
		if (e.button !== 0)
			return;
		e.preventDefault();
		startHold("pointer");
	});
	["pointerup", "pointercancel", "pointerleave"].forEach(type => passHint.addEventListener(type, () => { if (hold?.source === "pointer") stopHold(); }));
	document.addEventListener("keyup", e => { if (e.code === "Space" && hold?.source === "key") stopHold(); });
	window.addEventListener("blur", stopHold);

	function inGame() {
		return game.state === GameState.PLAYING && document.getElementById("deck-customization").classList.contains("hide");
	}

	document.addEventListener("keydown", e => {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)
			return;
		const key = e.key;
		if (key === "F11" || (key === "Enter" && e.altKey)) {
			e.preventDefault();
			toggleFullscreen();
			return;
		}
		// no browser zoom with the keyboard either
		if (e.ctrlKey && ["+", "-", "=", "0", "Add", "Subtract"].includes(key)) {
			e.preventDefault();
			return;
		}
		if (zoomOpen()) {
			if (["Escape", "Enter", " ", "Backspace"].includes(key)) {
				e.preventDefault();
				closeZoom();
			}
			return;
		}
		if (Popup.curr) {
			if (key === "Escape" && Popup.curr.escapeIsYes) {
				e.preventDefault();
				Popup.curr.selectYes();
			}
			return;
		}
		if (Options.isOpen() || History.isOpen() || Online.isOpen()) {
			if (key === "Escape") {
				e.preventDefault();
				Options.close();
				History.close();
				Online.close();
			}
			return;
		}
		const c = Carousel.curr;
		if (c && !c.elem.classList.contains("hide")) {
			if (key === "ArrowLeft" || key === "ArrowUp") { e.preventDefault(); c.shift(null, -1); }
			else if (key === "ArrowRight" || key === "ArrowDown") { e.preventDefault(); c.shift(null, 1); }
			else if (key === "Enter" || key === " ") { e.preventDefault(); c.select(null); }
			else if (key === "Escape") { e.preventDefault(); c.cancel(); }
			return;
		}
		// deck menu (TW3 keys): arrows change the faction, Enter starts the game, Escape opens the settings
		if (deckMenuOpen()) {
			if (key === "ArrowLeft" || key === "ArrowRight") {
				e.preventDefault();
				dm.cycleFaction(key === "ArrowLeft" ? -1 : 1);
			} else if (key === "Enter" && !e.repeat) {
				e.preventDefault();
				dm.startNewGame();
			} else if (key === "Escape") {
				e.preventDefault();
				Options.open();
			}
			return;
		}
		if (e.code === "Space") {
			e.preventDefault();
			if (!e.repeat && inGame())
				startHold("key");
			return;
		}
		if (key === "Escape") {
			e.preventDefault();
			if (ui.previewCard && !document.getElementById("click-background").classList.contains("noclick"))
				ui.cancel();
			else if (inGame() && game.currPlayer === player_me && !document.querySelector("main").classList.contains("noclick"))
				game.exitGame();
		}
	});

	return {openZoom, closeZoom, zoomOpen, cardAt, toggleFullscreen};
})();
