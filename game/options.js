"use strict"

// Settings panel, opened by the gear of the deck screen (or Escape there) and by the gear of the
// game board: display mode, music and sound effects, difficulty, game messages, language,
// character portrait and deck files.
// Also draws the portraits next to the scores: the character chosen by the player (cosmetic only)
// and the leader of the opponent's deck.
// Loaded after music.js.

const Options = (() => {

	const invoke = window.__TAURI__?.core?.invoke;
	const desktop = typeof invoke === "function";
	const stage = document.getElementById("stage");

	const store = {
		get(key, def) {
			try {
				const v = localStorage.getItem(key);
				return v === null ? def : v;
			} catch (e) {
				return def;
			}
		},
		set(key, v) {
			try { localStorage.setItem(key, v); } catch (e) {}
		},
	};

	const inDeckMenu = () => !document.getElementById("deck-customization").classList.contains("hide");

	// ---------- portraits ----------

	// id (img/portraits/<id>.jpg, cropped from the card of the character), short names fr / en
	const CHARACTERS = [
		["geralt", "Geralt", "Geralt"],
		["ciri", "Ciri", "Ciri"],
		["yennefer", "Yennefer", "Yennefer"],
		["triss", "Triss", "Triss"],
		["dandelion", "Jaskier", "Dandelion"],
		["zoltan", "Zoltan", "Zoltan"],
		["vesemir", "Vesemir", "Vesemir"],
		["regis", "Régis", "Regis"],
		["avallach", "Avallac'h", "Avallac'h"],
		["olgierd", "Olgierd", "Olgierd"],
		["gaunter", "Gaunter de Meuré", "Gaunter O'Dimm"],
		["keira", "Keira Metz", "Keira Metz"],
		["roche", "Vernon Roche", "Vernon Roche"],
		["dijkstra", "Dijkstra", "Dijkstra"],
		["philippa", "Philippa", "Philippa"],
		["iorveth", "Iorveth", "Iorveth"],
		["eithne", "Eithné", "Eithné"],
		["letho", "Letho", "Letho"],
		["cerys", "Cerys", "Cerys"],
		["ermion", "Sac-à-souris", "Ermion"],
	];

	const portraitURL = id => "img/portraits/" + id + ".jpg";

	function character() {
		const id = store.get("gc-character", "geralt");
		const c = CHARACTERS.find(c => c[0] === id) || CHARACTERS[0];
		return {id: c[0], name: LANG === "fr" ? c[1] : c[2], img: portraitURL(c[0])};
	}

	// Portrait of a leader (card_dict data): its face, its name without the epithet
	function leaderPortrait(leader) {
		return {
			name: cardLargeTitle(leader).split("\n")[0],
			img: portraitURL(leader.deck + "_" + leader.filename),
		};
	}

	// Portrait and name next to the score of a player
	function showPortrait(player) {
		if (!player)
			return;
		// online: the character chosen by the other player, with his name
		const online = player.tag === "op" && typeof Online !== "undefined" && Online.active;
		const p = player.tag === "me" ? (typeof Online !== "undefined" && Online.active ? Object.assign(character(), {name: Online.myName}) : character())
			: online ? {name: Online.peerName || player.name, img: portraitURL(CHARACTERS.some(c => c[0] === Online.peerCharacter) ? Online.peerCharacter : "geralt")}
			: leaderPortrait(player.deck_data.leader);
		player.name = p.name;
		document.getElementById("name-" + player.tag).textContent = p.name;
		const img = document.querySelector("#stats-" + player.tag + " .profile-img");
		img.style.backgroundImage = "url('" + p.img + "')";
		img.classList.add("has-portrait");
	}

	// ---------- display mode ----------

	const MODES = desktop ? ["windowed", "borderless", "fullscreen"] : ["windowed", "fullscreen"];
	const savedMode = store.get("gc-display", null);
	let displayMode = MODES.includes(savedMode) ? savedMode : "windowed";

	async function setDisplay(mode, startup = false) {
		if (!MODES.includes(mode))
			return;
		if (mode !== "fullscreen")
			store.set("gc-display-window", mode); // the mode F11 comes back to
		displayMode = mode;
		store.set("gc-display", mode);
		refresh();
		if (desktop) {
			try {
				await invoke("set_display_mode", {mode, startup});
			} catch (e) {
				console.warn("display mode:", e);
			}
		} else if (!startup) {
			if (mode === "fullscreen")
				document.documentElement.requestFullscreen?.().catch(() => {});
			else if (document.fullscreenElement)
				document.exitFullscreen().catch(() => {});
		}
	}

	// F11 / Alt+Enter
	function toggleFullscreen() {
		if (displayMode === "fullscreen")
			setDisplay(store.get("gc-display-window", "windowed"));
		else
			setDisplay("fullscreen");
	}

	if (!desktop)
		document.addEventListener("fullscreenchange", () => {
			displayMode = document.fullscreenElement ? "fullscreen" : "windowed";
			refresh();
		});

	// ---------- panel ----------

	const panel = document.createElement("section");
	panel.id = "options";
	panel.className = "hide";
	panel.innerHTML = `
<div class="opt-panel">
	<header><h1 data-k="opt.title"></h1><button class="opt-close" data-k-title="opt.close"></button></header>
	<div class="opt-columns">
		<div class="opt-col">
			<section class="opt-group">
				<h2 data-k="opt.display"></h2>
				<div class="opt-row"><span class="opt-label" data-k="opt.displayMode"></span><div class="opt-seg" data-seg="display"></div></div>
				<p class="opt-hint" data-hint="display"></p>
			</section>
			<section class="opt-group">
				<h2 data-k="opt.sound"></h2>
				<div class="opt-row"><span class="opt-label" data-k="tip.music"></span><div class="opt-seg" data-seg="music"></div></div>
				<div class="opt-row"><span class="opt-label" data-k="opt.musicVolume"></span><div class="opt-range" data-range="music"><input type="range" min="0" max="100" step="1"><span></span></div></div>
				<p class="opt-hint opt-music-source"></p>
				<div class="opt-actions" data-actions="music"></div>
				<div class="opt-row"><span class="opt-label" data-k="tip.sfx"></span><div class="opt-seg" data-seg="sfx"></div></div>
				<div class="opt-row"><span class="opt-label" data-k="opt.sfxVolume"></span><div class="opt-range" data-range="sfx"><input type="range" min="0" max="100" step="1"><span></span></div></div>
			</section>
		</div>
		<div class="opt-col">
			<section class="opt-group">
				<h2 data-k="opt.game"></h2>
				<div class="opt-row"><span class="opt-label" data-k="opt.difficulty"></span><div class="opt-seg" data-seg="difficulty"></div></div>
				<div class="opt-row"><span class="opt-label" data-k="tip.notifications"></span><div class="opt-seg" data-seg="messages"></div></div>
				<div class="opt-row"><span class="opt-label" data-k="opt.language"></span><div class="opt-seg" data-seg="language"></div></div>
				<p class="opt-hint" data-hint="language"></p>
			</section>
			<section class="opt-group">
				<h2 data-k="opt.character"></h2>
				<div class="opt-chars"></div>
				<p class="opt-hint opt-char-name"></p>
			</section>
			<section class="opt-group" data-group="deck">
				<h2 data-k="opt.deck"></h2>
				<div class="opt-actions" data-actions="deck"></div>
			</section>
		</div>
	</div>
	<footer><span><kbd data-k="key.escape"></kbd><span data-k="opt.close"></span></span></footer>
</div>`;
	stage.appendChild(panel);
	const $ = sel => panel.querySelector(sel);

	panel.querySelectorAll("[data-k]").forEach(e => e.textContent = t(e.dataset.k));
	panel.querySelectorAll("[data-k-title]").forEach(e => e.setAttribute("aria-label", t(e.dataset.kTitle)));
	$(".opt-close").addEventListener("click", () => close());
	// a click on the dark backdrop closes the panel
	panel.addEventListener("pointerdown", e => { if (e.target === panel) close(); });

	const click = () => AudioManager.playSFX("ui_card_bank");

	// segmented choices: [value, label, tooltip]
	const segs = {
		display: {
			items: () => MODES.map(m => [m, t("opt." + m)]),
			get: () => displayMode,
			set: v => setDisplay(v),
		},
		music: {
			items: () => [[true, t("opt.on")], [false, t("opt.off")]],
			get: () => Settings.music.isEnabled(),
			set: v => { if (v !== Settings.music.isEnabled()) ui.toggleMusic(); },
		},
		sfx: {
			items: () => [[true, t("opt.on")], [false, t("opt.off")]],
			get: () => Settings.soundEffects.isEnabled(),
			set: v => { if (v !== Settings.soundEffects.isEnabled()) ui.toggleSFX(); },
		},
		difficulty: {
			items: () => ["easy", "normal", "hard"].map(l => [l, t("difficulty." + l), t("difficulty." + l + ".tip")]),
			get: () => Settings.difficulty.get(),
			set: v => Settings.difficulty.set(v),
		},
		messages: {
			items: () => [[true, t("opt.on")], [false, t("opt.off")]],
			get: () => Settings.notifications.isEnabled(),
			set: v => { if (v !== Settings.notifications.isEnabled()) ui.toggleNotifications(); },
		},
		language: {
			items: () => [["fr", "Français"], ["en", "English"]],
			get: () => LANG,
			set: v => { if (v !== LANG) setLanguage(v); },
			disabled: () => !inDeckMenu(),
		},
	};

	for (const [name, seg] of Object.entries(segs)) {
		const elem = $('[data-seg="' + name + '"]');
		for (const [value, label, tip] of seg.items()) {
			const b = document.createElement("button");
			b.textContent = label;
			b.gcValue = value;
			if (tip)
				b.setAttribute("data-title", tip);
			b.addEventListener("click", () => {
				if (b.disabled || seg.get() === value)
					return;
				click();
				seg.set(value);
				refresh();
			});
			b.addEventListener("mouseenter", CLICK_EVENT_SFX);
			elem.appendChild(b);
		}
		seg.elem = elem;
	}

	// volume sliders
	const ranges = {
		music: {get: () => Music.volume, set: v => Music.setVolume(v)},
		sfx: {get: () => AudioManager.volume, set: v => AudioManager.setVolume(v)},
	};
	for (const [name, r] of Object.entries(ranges)) {
		const box = $('[data-range="' + name + '"]');
		r.input = box.querySelector("input");
		r.value = box.querySelector("span");
		r.input.addEventListener("input", () => {
			r.set(r.input.value / 100);
			showRange(r);
		});
		if (name === "sfx")
			r.input.addEventListener("change", () => AudioManager.playSFX("ui_card"));
		box.addEventListener("wheel", e => {
			e.preventDefault();
			const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
			if (!d)
				return;
			r.set(Math.min(1, Math.max(0, r.get() + (d < 0 ? 0.05 : -0.05))));
			showRange(r);
		}, {passive: false});
	}
	function showRange(r) {
		const v = Math.round(r.get() * 100);
		r.input.value = v;
		r.input.style.setProperty("--fill", v + "%");
		r.value.textContent = v + " %";
	}

	// characters
	const chars = $(".opt-chars");
	for (const [id, fr, en] of CHARACTERS) {
		const b = document.createElement("button");
		b.className = "opt-char";
		b.style.backgroundImage = "url('" + portraitURL(id) + "')";
		b.gcId = id;
		b.setAttribute("aria-label", LANG === "fr" ? fr : en);
		b.addEventListener("click", () => {
			if (store.get("gc-character", "geralt") === id)
				return;
			click();
			store.set("gc-character", id);
			if (typeof player_me !== "undefined" && player_me)
				showPortrait(player_me);
			refresh();
		});
		b.addEventListener("mouseenter", () => {
			CLICK_EVENT_SFX();
			$(".opt-char-name").textContent = LANG === "fr" ? fr : en;
		});
		b.addEventListener("mouseleave", () => refresh());
		chars.appendChild(b);
	}

	function actionButtons(elem, list) {
		const key = list.map(a => a[0] + a[2]).join();
		if (elem.dataset.key === key)
			return;
		elem.dataset.key = key;
		elem.innerHTML = "";
		for (const [label, fn, disabled] of list) {
			const b = document.createElement("button");
			b.textContent = t(label);
			b.disabled = !!disabled;
			b.addEventListener("click", e => {
				e.stopPropagation();
				fn();
			});
			b.addEventListener("mouseenter", CLICK_EVENT_SFX);
			elem.appendChild(b);
		}
	}

	function refresh() {
		if (!panel || panel.classList.contains("hide"))
			return;
		for (const seg of Object.values(segs)) {
			const disabled = seg.disabled ? seg.disabled() : false;
			for (const b of seg.elem.children) {
				b.classList.toggle("selected", b.gcValue === seg.get());
				b.disabled = disabled;
			}
		}
		for (const r of Object.values(ranges))
			showRange(r);
		$('[data-hint="display"]').textContent = t("opt.hint." + displayMode);
		$('[data-hint="language"]').textContent = inDeckMenu() ? "" : t("opt.languageInGame");
		$('[data-hint="language"]').classList.toggle("hide", inDeckMenu());

		// music source and actions (desktop app)
		$(".opt-music-source").textContent = Music.status;
		const busy = Music.busy;
		actionButtons($('[data-actions="music"]'), !Music.desktop ? [] : [
			["music.extract", () => Music.extractFromTW3(), busy],
			["music.import", () => Music.importFiles(), busy],
			["music.folder", () => Music.openFolder(), busy],
			...(Music.mode === "local" ? [["music.clear", () => Music.clearLocal(), busy]] : []),
		]);

		const me = character();
		for (const b of chars.children)
			b.classList.toggle("selected", b.gcId === me.id);
		$(".opt-char-name").textContent = me.name + " · " + t("opt.characterHint");

		$('[data-group="deck"]').classList.toggle("hide", !inDeckMenu());
		actionButtons($('[data-actions="deck"]'), [
			["deck.upload", () => { close(); document.getElementById("add-file").click(); }],
			["deck.download", () => { close(); dm.downloadDeck(); }],
		]);
	}

	function isOpen() {
		return !panel.classList.contains("hide");
	}

	function open() {
		if (isOpen())
			return;
		if (typeof History !== "undefined" && History.isOpen())
			History.close();
		panel.classList.remove("hide");
		refresh();
		AudioManager.playSFX("menu_opening");
		panel.animate([{opacity: 0}, {opacity: 1}], {duration: 180, easing: "ease-out"});
		$(".opt-panel").animate([{opacity: 0, transform: "translateY(calc(0.8 * var(--vw))) scale(0.985)"}, {opacity: 1, transform: "none"}],
			{duration: 240, easing: "cubic-bezier(.2,.8,.3,1)"});
	}

	function close() {
		if (!isOpen())
			return;
		const a = panel.animate([{opacity: 1}, {opacity: 0}], {duration: 150, easing: "ease-in"});
		a.onfinish = () => panel.classList.add("hide");
		AudioManager.playSFX("ui_card_bank");
	}

	function toggle() {
		isOpen() ? close() : open();
	}

	Music.onChange(refresh);

	// gear buttons and quit button
	document.getElementById("open-options").addEventListener("click", () => open());
	const quit = document.getElementById("quit-app");
	if (desktop) {
		quit.classList.remove("hide");
		quit.addEventListener("click", async () => {
			if (await ui.confirm(t("quit.title"), t("quit.text")))
				invoke("quit_app").catch(e => console.warn(e));
		});
	}
	["open-options", "open-history", "quit-app"].forEach(id => document.getElementById(id).addEventListener("mouseenter", CLICK_EVENT_SFX));

	// the saved display mode (the window may have been restored differently); without a saved
	// mode (first launch of this version), the current state of the window is kept
	if (desktop) {
		if (MODES.includes(savedMode))
			setDisplay(displayMode, true);
		else
			window.__TAURI__.window?.getCurrentWindow?.().isFullscreen?.()
				.then(full => { displayMode = full ? "fullscreen" : "windowed"; })
				.catch(() => {});
	}

	return {open, close, toggle, isOpen, refresh, toggleFullscreen, setDisplay, character, leaderPortrait, showPortrait,
		get displayMode() { return displayMode; }, characters: CHARACTERS.map(c => c[0])};
})();
