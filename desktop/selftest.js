// Run inside the packaged app (debug build, GWENT_SELFTEST=1): checks loading, Tauri APIs, a game start
(async () => {
	const out = {};
	const wait = ms => new Promise(r => setTimeout(r, ms));
	try {
		out.url = location.href;
		out.lang = typeof LANG !== "undefined" ? LANG : null;
		out.tauri = !!window.__TAURI__;
		out.dialogSave = !!(window.__TAURI__ && window.__TAURI__.dialog && window.__TAURI__.dialog.save);
		out.invoke = !!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);
		out.windowApi = !!(window.__TAURI__ && window.__TAURI__.window && window.__TAURI__.window.getCurrentWindow);
		out.stage = (() => { const r = document.getElementById("stage").getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })();
		out.scroll = [document.scrollingElement.scrollHeight, document.scrollingElement.clientHeight];
		out.factionTitle = document.querySelector("#faction-title h1").textContent;
		out.containerQueries = CSS.supports("container-type: size");
		// write through the Rust command
		await window.__TAURI__.core.invoke("write_text_file", {path: "/tmp/gwent_selftest_deck.json", contents: dm.deckToJSON()});
		out.writeOk = true;
		// start a game
		Game.prototype.coinToss = async function () { if (!this.firstPlayer) this.firstPlayer = player_me; };
		document.getElementById("start-game").click();
		for (let i = 0; i < 100 && !Carousel.curr; i++) await wait(100);
		out.mulligan = !!Carousel.curr;
		if (Carousel.curr) Carousel.curr.cancel();
		for (let i = 0; i < 150 && !(game.currPlayer === player_me && document.getElementById("stats-me").classList.contains("current-turn")); i++) await wait(100);
		out.myTurn = game.currPlayer === player_me;
		out.hand = player_me.hand.cards.length;
		// right-click zoom
		const c = player_me.hand.cards[0].elem.getBoundingClientRect();
		document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2).dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true, clientX: c.left + c.width / 2, clientY: c.top + c.height / 2}));
		await wait(300);
		out.zoom = !document.getElementById("zoom").classList.contains("hide");
		Input.closeZoom();
		// portraits, settings panel, display modes (Rust command)
		out.portraits = [document.getElementById("name-me").textContent, document.getElementById("name-op").textContent,
			document.querySelector("#stats-me .profile-img").style.backgroundImage];
		Options.open();
		await wait(400);
		out.optionsOpen = Options.isOpen();
		out.displayButtons = [...document.querySelectorAll('[data-seg="display"] button')].map(b => b.textContent);
		out.display = [];
		for (const mode of ["borderless", "fullscreen", "windowed"]) {
			try {
				await window.__TAURI__.core.invoke("set_display_mode", {mode, startup: false});
				await wait(400);
				out.display.push(mode + ":" + window.innerWidth + "x" + window.innerHeight);
			} catch (e) {
				out.display.push(mode + ":ERR " + e);
			}
		}
		Options.close();
		await wait(300);
		History.open();
		await wait(400);
		out.historyOpen = History.isOpen();
		History.close();
		out.passHint = !!document.getElementById("pass-button") && document.getElementById("pass-button").textContent.replace(/\s+/g, " ").trim();
		out.corner = [...document.querySelectorAll("#corner-buttons > button")].map(b => getComputedStyle(b).display !== "none");
		// online: open a room on the local matchmaking server (wrangler dev) when it runs
		try {
			game.returnToCustomization();
			await wait(500);
			localStorage.setItem("gc-online-server", "ws://127.0.0.1:8787");
			Online.open();
			await Online.create();
			out.onlineCode = Net.code;
			out.onlineScreen = Online.screen;
			out.rtc = typeof RTCPeerConnection;
			Online.leave(true);
		} catch (e) {
			out.onlineError = String(e);
		}
	} catch (e) {
		out.exception = String(e && (e.stack || e));
	}
	out.errors = window.__selftestErrors || [];
	await window.__TAURI__.core.invoke("selftest_report", {report: JSON.stringify(out)});
})();
