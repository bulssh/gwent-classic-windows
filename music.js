"use strict"

// Background music and volume controls.
//  - desktop app: plays the audio files of its music folder (the gwent music extracted from the
//    player's own copy of The Witcher 3, or imported files) - nothing is downloaded again
//  - otherwise (or while the folder is empty): the YouTube "Gwent Full Mix" stream
// Hovering the music / sound effects buttons shows a volume slider (wheel / touchpad works too).
// Loaded after gwent.js.

const Music = (() => {

	const invoke = window.__TAURI__?.core?.invoke;
	const desktop = typeof invoke === "function";

	// gwent music of The Witcher 3 (ids of the sound cache, see music\gwent_game and toussaint\gwent)
	const TW3_TRACKS = [
		["13090987", "gwynt-novigrad-1.ogg"],
		["3961972", "gwynt-novigrad-2.ogg"],
		["9131862", "gwynt-skellige-1.ogg"],
		["552019", "gwynt-skellige-2.ogg"],
		["10122256", "gwynt-skellige-3.ogg"],
		["120828287", "gwynt-toussaint-1.ogg"],
		["805624", "gwynt-toussaint-2.ogg"],
	];
	const YOUTUBE_ID = "UE9fPWy1_o4";

	const load = (key, def) => {
		try {
			const v = parseFloat(localStorage.getItem(key));
			return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : def;
		} catch (e) {
			return def;
		}
	};
	const save = (key, v) => {
		try { localStorage.setItem(key, String(v)); } catch (e) {}
	};

	let volume = load("gc-music-volume", 0.6);
	let mode = "none";          // "local" | "stream" | "none"
	let tracks = [];            // local file names
	let order = [];
	let index = -1;
	let objectURL = null;
	let failures = 0;
	let busy = false;           // extraction / import running
	let youtube = null;
	let youtubeReady = false;
	const audio = new Audio();
	audio.preload = "auto";

	const button = () => document.getElementById("toggle-music");
	const enabled = () => Settings.music.isEnabled();

	function updateButton() {
		button()?.classList.toggle("fade", !enabled() || mode === "none");
		Panels.refresh();
	}

	// ---------- local files ----------

	const MIME = {ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav", m4a: "audio/mp4"};

	function shuffle(list) {
		const a = list.slice();
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	let fadeTimer = null;
	function fadeTo(target, ms) {
		clearInterval(fadeTimer);
		return new Promise(resolve => {
			const start = audio.volume, t0 = performance.now();
			fadeTimer = setInterval(() => {
				const k = Math.min(1, (performance.now() - t0) / ms);
				audio.volume = Math.min(1, Math.max(0, start + (target - start) * k));
				if (k >= 1) {
					clearInterval(fadeTimer);
					resolve();
				}
			}, 30);
		});
	}

	async function playNext() {
		if (mode !== "local" || !tracks.length)
			return;
		index++;
		if (index >= order.length) {
			const last = order[order.length - 1];
			order = shuffle(tracks);
			if (order.length > 1 && order[0] === last)
				order.push(order.shift());
			index = 0;
		}
		const name = order[index];
		try {
			const buffer = await invoke("music_read", {name});
			const ext = name.split(".").pop().toLowerCase();
			if (objectURL)
				URL.revokeObjectURL(objectURL);
			objectURL = URL.createObjectURL(new Blob([buffer], {type: MIME[ext] || "audio/ogg"}));
			audio.src = objectURL;
			audio.volume = 0;
			if (enabled()) {
				await audio.play();
				fadeTo(volume, 1500);
			}
			failures = 0;
		} catch (e) {
			console.warn("music:", name, e);
			if (++failures < tracks.length)
				setTimeout(playNext, 200);
		}
	}

	audio.addEventListener("ended", () => playNext());
	audio.addEventListener("error", () => {
		if (mode === "local" && ++failures < tracks.length)
			setTimeout(playNext, 200);
	});

	async function startLocal(list) {
		stopStream();
		tracks = list;
		order = shuffle(tracks);
		index = -1;
		failures = 0;
		mode = "local";
		updateButton();
		await playNext();
	}

	// ---------- YouTube stream (fallback) ----------

	function loadStream() {
		mode = "stream";
		updateButton();
		if (youtube || document.getElementById("youtube-api"))
			return;
		const s = document.createElement("script");
		s.id = "youtube-api";
		s.src = "https://www.youtube.com/iframe_api";
		s.async = true;
		document.body.appendChild(s);
	}

	function onYouTubeReady() {
		if (mode !== "stream" || youtube)
			return;
		youtube = new YT.Player("youtube", {
			videoId: YOUTUBE_ID,
			playerVars: {autoplay: 1, controls: 0, loop: 1, playlist: YOUTUBE_ID, rel: 0, version: 3, modestbranding: 1},
			events: {
				onReady: () => {
					youtubeReady = true;
					youtube.setVolume(Math.round(volume * 100));
					if (enabled())
						youtube.playVideo();
				}
			}
		});
	}

	function stopStream() {
		if (youtube && youtubeReady)
			youtube.stopVideo();
		if (youtube) {
			try { youtube.destroy(); } catch (e) {}
			youtube = null;
			youtubeReady = false;
			// the API replaced the placeholder by an iframe: put a placeholder back
			if (!document.getElementById("youtube")) {
				const d = document.createElement("div");
				d.id = "youtube";
				document.body.prepend(d);
			}
		}
	}

	// ---------- public controls ----------

	async function toggle() {
		Settings.music.setEnabled(!enabled());
		if (mode === "local") {
			if (enabled()) {
				if (!audio.src)
					await playNext();
				else {
					audio.play().catch(() => {});
					fadeTo(volume, 500);
				}
			} else {
				await fadeTo(0, 400);
				audio.pause();
			}
		} else if (mode === "stream" && youtubeReady) {
			if (enabled())
				youtube.playVideo();
			else
				youtube.pauseVideo();
		}
		updateButton();
	}

	function setVolume(v) {
		volume = Math.min(1, Math.max(0, v));
		save("gc-music-volume", volume);
		if (mode === "local") {
			clearInterval(fadeTimer);
			if (!audio.paused)
				audio.volume = volume;
		} else if (youtubeReady) {
			youtube.setVolume(Math.round(volume * 100));
		}
	}

	async function refreshLocal() {
		const list = (await invoke("music_list")).map(f => f.name);
		if (list.length)
			await startLocal(list);
		else {
			audio.pause();
			audio.removeAttribute("src");
			tracks = [];
			loadStream();
		}
	}

	// Extracts the gwent music of The Witcher 3 (read only) into the music folder
	async function extractFromTW3(root) {
		if (!desktop || busy)
			return false;
		busy = true;
		try {
			if (!root)
				root = await invoke("tw3_find");
			if (!root) {
				root = await window.__TAURI__.dialog.open({directory: true, title: t("music.pickFolder")});
				if (!root)
					return false;
			}
			const entries = await invoke("tw3_sound_index", {root, ids: TW3_TRACKS.map(x => x[0])});
			if (!entries.length) {
				await ui.message(t("music.notFound"), t("music.title"));
				return false;
			}
			Panels.status(t("music.extracting", 0, entries.length));
			const codebooks = new Wem2Ogg.Codebooks(new Uint8Array(await (await fetch("data/packed_codebooks_aoTuV_603.bin")).arrayBuffer()));
			let done = 0;
			for (const e of entries) {
				const wem = new Uint8Array(await invoke("tw3_read", {cache: e.cache, offset: e.offset, size: e.size}));
				const {ogg} = Wem2Ogg.convert(wem, codebooks);
				const name = TW3_TRACKS.find(x => x[0] === e.id)[1];
				await invoke("music_write", ogg, {headers: {"x-name": name}});
				Panels.status(t("music.extracting", ++done, entries.length));
				await sleep(0);
			}
			await refreshLocal();
			return true;
		} catch (e) {
			console.error(e);
			await ui.message(t("music.error", String(e && e.message || e)), t("music.title"));
			return false;
		} finally {
			busy = false;
			Panels.refresh();
		}
	}

	async function importFiles() {
		if (!desktop || busy)
			return;
		const picked = await window.__TAURI__.dialog.open({
			multiple: true,
			title: t("music.importTitle"),
			filters: [{name: t("music.audioFiles"), extensions: ["ogg", "oga", "opus", "mp3", "flac", "wav", "m4a"]}]
		});
		const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
		if (!paths.length)
			return;
		busy = true;
		try {
			await invoke("music_import", {paths});
			await refreshLocal();
		} catch (e) {
			await ui.message(t("music.error", String(e)), t("music.title"));
		} finally {
			busy = false;
			Panels.refresh();
		}
	}

	async function clearLocal() {
		if (!desktop || busy || !tracks.length)
			return;
		if (!await ui.confirm(t("music.title"), t("music.clearConfirm")))
			return;
		await fadeTo(0, 300);
		audio.pause();
		await invoke("music_clear");
		await refreshLocal();
	}

	async function init() {
		if (!desktop) {
			loadStream();
			return;
		}
		try {
			const list = (await invoke("music_list")).map(f => f.name);
			if (list.length) {
				await startLocal(list);
				return;
			}
		} catch (e) {
			console.warn(e);
		}
		loadStream();
		// first launch: offer to use the music of the installed game instead of the stream
		let asked = false;
		try { asked = localStorage.getItem("gc-music-offered") === "1"; } catch (e) {}
		if (asked)
			return;
		const root = await invoke("tw3_find").catch(() => null);
		if (!root)
			return;
		await sleepUntil(() => !Popup.curr, 200);
		try { localStorage.setItem("gc-music-offered", "1"); } catch (e) {}
		let yes = false;
		await ui.popup(t("music.offerYes"), () => yes = true, t("music.offerNo"), null, t("music.offerTitle"), t("music.offerText"));
		if (yes)
			await extractFromTW3(root);
	}

	// ---------- hover panels (volume sliders) ----------

	const Panels = (() => {
		const stage = document.getElementById("stage");
		const panels = {};
		let statusText = "";

		function make(id, title, getVolume, setVol, extra) {
			const p = document.createElement("div");
			p.className = "volume-pop closed";
			p.id = "volume-" + id;
			p.innerHTML = '<div class="vp-head"><span class="vp-title"></span><span class="vp-value"></span></div>'
				+ '<input type="range" min="0" max="100" step="1">'
				+ (extra ? '<div class="vp-source"></div><div class="vp-actions"></div>' : '');
			p.querySelector(".vp-title").textContent = title;
			const range = p.querySelector("input");
			const value = p.querySelector(".vp-value");
			const show = v => {
				range.value = Math.round(v * 100);
				value.textContent = Math.round(v * 100) + " %";
				range.style.setProperty("--fill", Math.round(v * 100) + "%");
			};
			range.addEventListener("input", () => {
				setVol(range.value / 100);
				show(range.value / 100);
			});
			// sound effect preview when releasing the slider
			range.addEventListener("change", () => { if (id === "sfx") AudioManager.playSFX("ui_card"); });
			stage.appendChild(p);
			panels[id] = {elem: p, show: () => show(getVolume()), extra, setVol, getVolume};
			return p;
		}

		function attach(id, btn) {
			const panel = panels[id];
			let hideTimer = null;
			const open = () => {
				clearTimeout(hideTimer);
				refresh();
				place(panel.elem, btn);
				panel.elem.classList.remove("closed");
			};
			let dragging = false;
			const close = () => {
				clearTimeout(hideTimer);
				hideTimer = setTimeout(() => {
					if (!dragging && !panel.elem.matches(":hover") && !btn.matches(":hover"))
						panel.elem.classList.add("closed");
				}, 350);
			};
			const range = panel.elem.querySelector("input");
			range.addEventListener("pointerdown", () => dragging = true);
			window.addEventListener("pointerup", () => {
				if (!dragging)
					return;
				dragging = false;
				range.blur();
				close();
			});
			btn.addEventListener("mouseenter", open);
			btn.addEventListener("mouseleave", close);
			panel.elem.addEventListener("mouseenter", open);
			panel.elem.addEventListener("mouseleave", close);
			// two-finger scroll / wheel on the button or the panel changes the volume
			const wheel = e => {
				e.preventDefault();
				const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
				if (!d)
					return;
				panel.setVol(panel.getVolume() + (d < 0 ? 0.05 : -0.05));
				open();
			};
			btn.addEventListener("wheel", wheel, {passive: false});
			panel.elem.addEventListener("wheel", e => { if (e.target.tagName !== "BUTTON") wheel(e); }, {passive: false});
		}

		// above the button, inside the stage
		function place(elem, btn) {
			const s = stage.getBoundingClientRect(), b = btn.getBoundingClientRect();
			const unit = s.width / 100;
			elem.style.left = vw((b.left + b.width / 2 - s.left) / unit);
			elem.style.bottom = vw((s.bottom - b.top) / unit + 0.6);
		}

		function status(text) {
			statusText = text;
			refresh();
		}

		function refresh() {
			listeners.forEach(f => f());
			for (const id in panels) {
				const p = panels[id];
				p.show();
				if (!p.extra)
					continue;
				const source = p.elem.querySelector(".vp-source");
				const actions = p.elem.querySelector(".vp-actions");
				source.textContent = sourceText();
				if (!desktop) {
					actions.innerHTML = "";
					continue;
				}
				const buttons = [
					["music.extract", () => extractFromTW3()],
					["music.import", importFiles],
					["music.folder", openFolder],
				];
				if (mode === "local")
					buttons.push(["music.clear", clearLocal]);
				const key = buttons.map(b => b[0]).join() + busy;
				if (actions.dataset.key !== key) {
					actions.dataset.key = key;
					actions.innerHTML = "";
					for (const [label, fn] of buttons) {
						const b = document.createElement("button");
						b.textContent = t(label);
						b.disabled = busy;
						b.addEventListener("click", e => { e.stopPropagation(); fn(); });
						actions.appendChild(b);
					}
				}
			}
		}

		function sourceText() {
			return busy && statusText ? statusText
				: mode === "local" ? t("music.sourceLocal", tracks.length)
				: mode === "stream" ? t("music.sourceStream") : "";
		}

		return {make, attach, refresh, status, sourceText};
	})();

	// the settings panel follows the state of the music
	const listeners = [];
	function onChange(f) {
		listeners.push(f);
	}

	function openFolder() {
		if (desktop)
			invoke("music_open_folder").catch(e => console.warn(e));
	}

	function setupPanels() {
		Panels.make("music", t("tip.music"), () => volume, setVolume, true);
		Panels.make("sfx", t("tip.sfx"), () => AudioManager.volume, v => AudioManager.setVolume(v), false);
		Panels.attach("music", document.getElementById("toggle-music"));
		Panels.attach("sfx", document.getElementById("toggle-sfx"));
		Panels.refresh();
	}

	setupPanels();
	updateButton();
	init();

	return {toggle, setVolume, onYouTubeReady, extractFromTW3, importFiles, clearLocal, openFolder, onChange, desktop,
		get volume() { return volume; }, get busy() { return busy; }, get status() { return Panels.sourceText(); },
		get mode() { return mode; }, get tracks() { return tracks.slice(); }, get playing() { return mode === "local" && !audio.paused; },
		get position() { return audio.currentTime; }};
})();

// called by the YouTube iframe API once loaded
function onYouTubeIframeAPIReady() {
	Music.onYouTubeReady();
}
