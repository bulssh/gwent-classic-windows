"use strict"

// Online 1v1: screens (create / join a game, room), and the link between the game engine and the
// network.
//
// How the two games stay identical: both computers run the full game engine. Each one is "me"
// (bottom of the board) for its own player and sees the other player as the opponent
// (ControllerRemote instead of the AI). Only the decisions of the players travel: card played and
// its row or target, leader, pass, cards chosen in a carousel (medic, leaders...), rows chosen for
// agile units, the redraw, the Scoia'tael choice. Every random draw (shuffles, coin toss, random
// units...) comes from generators seeded with the same value on both computers (Rng, common.js),
// one per player, so they do not depend on the order in which effects run. Each move carries a
// fingerprint of the board: a difference (it should never happen) is reported.
// Loaded after net.js and options.js.

const GAME_VERSION = "2.3.2";
const ONLINE_PROTOCOL = 1;
// There is no shared matchmaking server: one of the players deploys his own (free Cloudflare Worker,
// see server/README-FR.md) and both enter its address in the online screen.
const ONLINE_DEFAULT_SERVER = "";
const ONLINE_SERVER_GUIDE = "https://github.com/bulssh/gwent-classic-windows/blob/main/server/README-FR.md";

// Opponent played by the other computer: waits for its moves
class ControllerRemote {
	constructor(player) {
		this.player = player;
	}

	redraw() {}

	async startTurn(player) {
		const gen = game.generation;
		const m = await Online.next(["PlayCard", "PlayLeader", "Pass"]);
		if (!m || gen !== game.generation)
			return; // the game was left
		Online.checkState(m.hash, m.type);
		if (m.type === "Pass") {
			player.passRound();
			return;
		}
		if (m.type === "PlayLeader") {
			await player.activateLeader();
			return;
		}
		const card = Online.findCard(player.hand, m.card);
		if (!card)
			return Online.desync("card " + JSON.stringify(m.card));
		if (card.name === "Scorch") {
			await player.playScorch(card);
		} else if (card.name === "Decoy") {
			const row = Online.rowFrom(m.row, player);
			const target = Online.findCard(row, m.target, c => c.isUnit());
			if (!target)
				return Online.desync("decoy target");
			// same steps as for the player who played it (ui.selectCard), after the preview
			ui.showPreviewVisuals(card);
			await sleep(1000);
			FX.launchFromPreview(card);
			ui.hidePreview(card);
			board.toHand(target, row);
			await board.moveTo(card, row, player.hand);
			player.endTurn();
		} else if (m.row) {
			await player.playCardToRow(card, Online.rowFrom(m.row, player));
		} else {
			await player.playCard(card);
		}
	}
}

const Online = (() => {

	const stage = document.getElementById("stage");
	const store = {
		get(key, def) { try { const v = localStorage.getItem(key); return v === null ? def : v; } catch (e) { return def; } },
		set(key, v) { try { localStorage.setItem(key, v); } catch (e) {} },
	};

	let active = false;          // an online game is being played
	let inRoom = false;          // connected to a room (lobby or game)
	let screen = "home";
	const me = {name: "", deck: null, ready: false};
	let peer = null;             // {name, character, deck, deckError, ready, app}
	let queue = [], waiting = null;
	let desyncShown = false;

	// fingerprint of the card data: both computers must have the same cards
	const CARDS_ID = (() => {
		let h = 2166136261;
		const s = card_dict.map(c => c.name + c.deck + c.row + c.strength + c.ability + c.count).join("|");
		for (let i = 0; i < s.length; i++)
			h = Math.imul(h ^ s.charCodeAt(i), 16777619);
		return (h >>> 0).toString(16);
	})();

	const serverURL = () => store.get("gc-online-server", ONLINE_DEFAULT_SERVER).trim();

	function errText(reason) {
		const key = "online.error." + reason;
		const text = t(key);
		return text === key ? t("online.error.other", reason) : text;
	}

	// ---------- link with the engine ----------

	const isRemote = player => active && !!player && player === player_op;

	// players in the same order on both computers: host first
	function ordered() {
		return Net.role === "host" ? [player_me, player_op] : [player_op, player_me];
	}

	function roleOf(id) {
		if (!active)
			return null;
		const mine = Net.role;
		return id === 0 ? mine : (mine === "host" ? "guest" : "host");
	}

	function cardDesc(card) {
		return card ? {n: card.name, f: card.faction, i: card.filename} : null;
	}

	function findCard(container, desc, predicate) {
		if (!container || !desc)
			return null;
		const cards = container.cards || container;
		return cards.find(c => c.name === desc.n && c.faction === desc.f && c.filename === desc.i && (!predicate || predicate(c))) || null;
	}

	// a row seen by the player who acts: his own rows or his opponent's, by type; or the weather
	function rowDesc(row, actor) {
		if (row === weather)
			return "weather";
		const i = board.row.indexOf(row);
		if (i < 0)
			return null;
		const mine = i >= 3; // rows of player_me
		return {side: mine === (actor === player_me) ? "self" : "opp", type: row.type};
	}

	function rowFrom(desc, actor) {
		if (desc === "weather")
			return weather;
		if (!desc)
			return null;
		const ownerIsMe = (desc.side === "self") === (actor === player_me);
		return board.row.find((r, i) => (ownerIsMe ? i >= 3 : i < 3) && r.type === desc.type) || null;
	}

	function fnv(s) {
		let h = 2166136261;
		for (let i = 0; i < s.length; i++)
			h = Math.imul(h ^ s.charCodeAt(i), 16777619);
		return (h >>> 0).toString(36);
	}

	// fingerprint of the board, the same on both computers
	function stateHash() {
		const parts = [game.roundCount];
		for (const p of ordered()) {
			parts.push(p.role, p.health, p.passed ? 1 : 0, p.leaderAvailable ? 1 : 0,
				p.hand.cards.map(cardKey).sort().join(","), p.deck.cards.map(cardKey).join(","));
			for (const type of ["close", "ranged", "siege"]) {
				const row = board.row.find((r, i) => (p === player_me ? i >= 3 : i < 3) && r.type === type);
				parts.push(row.cards.map(c => cardKey(c) + "=" + c.power).sort().join(","), row.special ? cardKey(row.special) : "-");
			}
		}
		parts.push(weather.cards.map(cardKey).sort().join(","));
		return fnv(parts.join(";"));
	}

	function checkState(hash, what) {
		if (!hash)
			return;
		const mine = stateHash();
		if (mine !== hash)
			desync("state before " + what + ": " + hash + " / " + mine);
	}

	function desync(detail) {
		if (!active)
			return;
		console.error("online desync:", detail);
		window.__onlineDesync = (window.__onlineDesync || []).concat([detail]);
		if (desyncShown)
			return;
		desyncShown = true;
		ui.message(t("online.desync"), t("online.title"));
	}

	// a decision of the local player, sent to the other computer
	function local(type, data = {}) {
		if (!active)
			return;
		if (type === "PlayCard" || type === "PlayLeader" || type === "Pass")
			data.hash = stateHash();
		Net.send(type, data);
	}

	// next move of the other player (in the order they were made)
	function next(types) {
		types = [].concat(types);
		return new Promise(resolve => {
			waiting = {types, resolve};
			pump();
		});
	}

	function pump() {
		if (!waiting || !queue.length)
			return;
		const m = queue.shift();
		const w = waiting;
		waiting = null;
		if (!w.types.includes(m.type))
			desync("expected " + w.types.join("/") + ", got " + m.type);
		w.resolve(m);
	}

	function dropWaits() {
		queue = [];
		if (waiting) {
			const w = waiting;
			waiting = null;
			w.resolve(null);
		}
	}

	// ---------- messages ----------

	const GAME_MESSAGES = ["Redraw", "ScoiaFirst", "PlayCard", "PlayLeader", "Pass", "Choice", "RowChoice"];

	Net.on("message", m => {
		if (GAME_MESSAGES.includes(m.type)) {
			if (active) {
				queue.push(m);
				pump();
			}
			return;
		}
		switch (m.type) {
			case "PlayerJoined":
				if (m.protocol !== ONLINE_PROTOCOL || m.cards !== CARDS_ID) {
					ui.message(t("online.versionMismatch", String(m.app || "?").replace(/[^\w.+-]/g, "").slice(0, 16) || "?", GAME_VERSION), t("online.title"));
					leave(true);
					return;
				}
				peer = Object.assign(peer || {}, {name: cleanName(m.name), character: typeof m.character === "string" ? m.character.slice(0, 40) : null, app: String(m.app || "").slice(0, 16), ready: false});
				AudioManager.playSFX("ui_card_bank");
				break;
			case "SelectDeck": {
				peer = peer || {};
				peer.deck = m.deck;
				peer.deckError = deckError(m.deck);
				peer.ready = false;
				break;
			}
			case "SetReady":
				if (peer)
					peer.ready = !!m.ready;
				break;
			case "StartGame":
				if (Net.role === "guest" && typeof m.seed === "string" && m.seed.length <= 64)
					startGame(m.seed);
				break;
			case "Forfeit":
				if (active)
					opponentLeft("forfeit");
				break;
			case "Leave":
				if (active)
					opponentLeft("left");
				peer = null;
				if (Net.role === "guest") {
					leave(false);
					ui.message(t("online.hostLeft"), t("online.title"));
				}
				break;
			case "Lobby":
				if (peer)
					peer.ready = false;
				break;
		}
		render();
	});

	// a (new) opponent arrived in the room: he gets our name, deck and state
	Net.on("peer-new", () => {
		if (!inRoom)
			return;
		peer = null;
		me.ready = false;
		Net.send("PlayerJoined", {protocol: ONLINE_PROTOCOL, app: GAME_VERSION, cards: CARDS_ID, name: me.name, character: Options.character().id});
		Net.send("SelectDeck", {deck: me.deck});
		render();
	});
	Net.on("transport", () => render());
	// the other player's connection: lost (he may come back: shown as away) or back
	Net.on("peer", present => {
		if (!present) {
			if (active)
				opponentLeft("connection");
			if (peer) {
				peer.ready = false;
				peer.away = true;
			}
		} else if (peer)
			peer.away = false;
		render();
	});
	Net.on("peer-silent", () => render());
	Net.on("closed", reason => {
		if (active)
			opponentLeft("connection");
		leave(false);
		ui.message(errText(reason), t("online.title"));
	});

	// ---------- decks ----------

	// problem of a deck for an online game, or "" if it is fine
	function deckError(deck) {
		if (!deck || !Array.isArray(deck.cards))
			return t("deck.badFormat");
		const leader = card_dict[deck.leader];
		if (!leader || leader.row !== "leader" || leader.deck !== deck.faction)
			return t("deck.badFormat");
		let units = 0, special = 0;
		for (const [index, count] of deck.cards) {
			const c = card_dict[index];
			if (!c || c.row === "leader" || ![deck.faction, "neutral", "special", "weather"].includes(c.deck) || !(count > 0) || count > Number(c.count))
				return t("deck.badFormat");
			if (c.deck === "special" || c.deck === "weather")
				special += count;
			else
				units += count;
		}
		if (units < 22)
			return t("online.deckUnits", units);
		if (special > 10)
			return t("online.deckSpecial", special);
		return "";
	}

	// the five decks of the player (one per faction), as built in the deck menu
	function myDecks() {
		return Object.keys(factions).map(f => {
			const d = Settings.getFactionSettings(f).get();
			const deck = {faction: f, leader: Number(d.leader), cards: (d.cards || []).map(c => [c.index, c.count])};
			if (!card_dict[deck.leader] || card_dict[deck.leader].row !== "leader")
				deck.leader = card_dict.findIndex(c => c.row === "leader" && c.deck === f);
			return {faction: f, deck, error: deckError(deck)};
		});
	}

	function deckSummary(deck) {
		const leader = card_dict[deck.leader];
		const count = deck.cards.reduce((a, c) => a + c[1], 0);
		return {leader: leader ? cardName(leader) : "?", count};
	}

	function toGameDeck(deck) {
		return {faction: deck.faction, leader: card_dict[deck.leader], cards: deck.cards.map(c => ({index: c[0], count: c[1]}))};
	}

	function cleanName(s) {
		return String(s || "").replace(/[<>&"]/g, "").trim().slice(0, 20) || t("player.op");
	}

	// ---------- room ----------

	async function create() {
		const url = serverURL();
		if (!url)
			return showError(t("online.noServer"));
		setScreen("connecting");
		try {
			await Net.open(url, "host");
			enterRoom();
		} catch (e) {
			setScreen("home");
			showError(errText(e.message));
		}
	}

	async function join(code) {
		const url = serverURL();
		if (!url)
			return showError(t("online.noServer"));
		code = Net.normalizeCode(code);
		if (code.length !== 6)
			return showError(t("online.badCode"));
		setScreen("connecting");
		try {
			await Net.open(url, "guest", code);
			enterRoom();
		} catch (e) {
			setScreen("join", code);
			showError(errText(e.message));
		}
	}

	function enterRoom() {
		inRoom = true;
		peer = null;
		me.ready = false;
		me.name = cleanName(store.get("gc-online-name", "") || Options.character().name);
		if (!me.deck || deckError(me.deck)) {
			const decks = myDecks();
			const pick = decks.find(d => d.faction === dm.faction && !d.error) || decks.find(d => !d.error) || decks[0];
			me.deck = pick.deck;
		}
		Net.send("PlayerJoined", {protocol: ONLINE_PROTOCOL, app: GAME_VERSION, cards: CARDS_ID, name: me.name, character: Options.character().id});
		Net.send("SelectDeck", {deck: me.deck});
		setScreen("lobby");
	}

	function leave(notify = true) {
		if (notify && inRoom)
			try { Net.send("Leave"); } catch (e) {}
		inRoom = false;
		peer = null;
		me.ready = false;
		dropWaits();
		// let the last message go before closing
		setTimeout(() => Net.close(), notify ? 250 : 0);
		setScreen("home");
	}

	function selectDeck(faction) {
		const d = myDecks().find(x => x.faction === faction);
		if (!d)
			return;
		me.deck = d.deck;
		me.ready = false;
		Net.send("SelectDeck", {deck: me.deck});
		Net.send("SetReady", {ready: false});
		render();
	}

	function toggleReady() {
		if (deckError(me.deck))
			return;
		me.ready = !me.ready;
		Net.send("SetReady", {ready: me.ready});
		AudioManager.playSFX(me.ready ? "ui_card_bank" : "discard");
		render();
	}

	function canStart() {
		return Net.role === "host" && inRoom && !active && Net.connected && peer && !peer.away && peer.deck && !peer.deckError
			&& peer.ready && me.ready && !deckError(me.deck);
	}

	function hostStart() {
		if (!canStart())
			return;
		const seed = [...crypto.getRandomValues(new Uint32Array(4))].map(x => x.toString(36)).join("");
		Net.send("StartGame", {seed});
		startGame(seed);
	}

	// ---------- game ----------

	function startGame(seed) {
		if (active || !peer || !peer.deck)
			return;
		active = true;
		desyncShown = false;
		window.__onlineDesync = [];
		queue = [];
		Rng.start(seed);
		close();
		document.getElementById("end-screen").classList.add("online");
		document.querySelector("#end-screen > button").textContent = t("online.backToRoom");
		game.reset();
		player_me = new Player(0, me.name, toGameDeck(me.deck));
		player_op = new Player(1, peer.name, toGameDeck(peer.deck));
		dm.elem.classList.add("hide");
		AudioManager.playSFX("game_opening");
		game.startGame();
	}

	// the game is over (end screen) or left
	function endGame() {
		active = false;
		Rng.stop();
		dropWaits();
	}

	// the other player left the game in progress
	async function opponentLeft(reason) {
		if (!active)
			return;
		History.record(reason === "forfeit" ? "win" : "interrupted", extraHistory());
		endGame();
		await ui.message(t("online.opponent." + (["forfeit", "connection", "left"].includes(reason) ? reason : "connection")), t("online.title"));
		backToRoom();
	}

	// this player gives up the game in progress
	function forfeit() {
		if (!active)
			return;
		Net.send("Forfeit");
		History.record("abandon", extraHistory());
		endGame();
		backToRoom();
	}

	function extraHistory() {
		return {online: true, opName: peer ? peer.name : ""};
	}

	// back to the room after a game (end screen or a game left)
	function backToRoom() {
		endGame();
		document.getElementById("end-screen").classList.remove("online");
		document.querySelector("#end-screen > button").textContent = t("end.mainMenu");
		game.reset();
		player_me?.reset?.();
		player_op?.reset?.();
		ui.enablePlayer(false);
		EventManager.customizationOpened.dispatch();
		document.getElementById("end-screen").classList.add("hide");
		dm.elem.classList.remove("hide");
		game.setState(GameState.CUSTOMIZE);
		me.ready = false;
		if (inRoom) {
			Net.send("SetReady", {ready: false});
			Net.send("Lobby");
			setScreen("lobby");
			open();
		}
	}

	// ---------- screens ----------

	const panel = document.createElement("section");
	panel.id = "online";
	panel.className = "hide";
	panel.innerHTML = `
<div class="opt-panel online-panel">
	<header><h1 data-k="online.title"></h1><button class="opt-close"></button></header>

	<div class="on-screen" data-screen="home">
		<div class="on-name"><label data-k="online.yourName"></label><input type="text" maxlength="20" spellcheck="false"></div>
		<div class="on-choices">
			<button class="on-choice" data-act="create"><span class="on-icon on-icon-create"></span><b data-k="online.create"></b><span data-k="online.createHint"></span></button>
			<button class="on-choice" data-act="join"><span class="on-icon on-icon-join"></span><b data-k="online.join"></b><span data-k="online.joinHint"></span></button>
		</div>
		<p class="on-error"></p>
		<div class="on-server"><span data-k="online.server"></span> <input type="text" spellcheck="false" placeholder="https://gwent-classic-signal.xxx.workers.dev"></div>
		<div class="on-help">
			<p data-k="online.serverHelp"></p>
			<div class="on-help-link"><code class="on-guide"></code><button data-act="copy-guide" data-k="online.copy"></button></div>
		</div>
	</div>

	<div class="on-screen" data-screen="join">
		<label class="on-code-label" data-k="online.enterCode"></label>
		<input class="on-code-input" type="text" maxlength="8" spellcheck="false" autocomplete="off">
		<p class="on-error"></p>
		<div class="on-actions"><button data-act="back" data-k="online.back"></button><button class="on-main" data-act="validate" data-k="online.validate"></button></div>
	</div>

	<div class="on-screen" data-screen="connecting">
		<p class="on-wait" data-k="online.connecting"></p>
		<div class="on-actions"><button data-act="cancel" data-k="online.cancel"></button></div>
	</div>

	<div class="on-screen" data-screen="lobby">
		<div class="on-room">
			<div class="on-code"><span data-k="online.code"></span><b class="on-code-value"></b><button data-act="copy" data-k="online.copy"></button></div>
			<div class="on-link"><span class="on-dot"></span><span class="on-link-text"></span></div>
		</div>
		<div class="on-players">
			<div class="on-player" data-who="me"></div>
			<div class="on-versus" data-k="online.versus"></div>
			<div class="on-player" data-who="peer"></div>
		</div>
		<div class="on-actions">
			<button data-act="leave" data-k="online.leave"></button>
			<span class="on-start-hint"></span>
			<button class="on-main" data-act="start" data-k="online.start"></button>
		</div>
	</div>
</div>`;
	stage.appendChild(panel);
	const $ = sel => panel.querySelector(sel);
	panel.querySelectorAll("[data-k]").forEach(e => e.textContent = t(e.dataset.k));
	panel.addEventListener("pointerdown", e => { if (e.target === panel && !inRoom) close(); });
	$(".opt-close").addEventListener("click", () => close());

	const nameInput = $('[data-screen="home"] .on-name input');
	nameInput.addEventListener("input", () => store.set("gc-online-name", nameInput.value.trim()));
	const serverInput = $(".on-server input");
	serverInput.addEventListener("change", () => { store.set("gc-online-server", serverInput.value.trim()); render(); });
	const codeInput = $(".on-code-input");
	codeInput.addEventListener("input", () => {
		const v = Net.normalizeCode(codeInput.value);
		if (codeInput.value !== v)
			codeInput.value = v;
		$('[data-act="validate"]').disabled = v.length !== 6;
		showError("");
	});
	codeInput.addEventListener("keydown", e => {
		if (e.key === "Enter" && Net.normalizeCode(codeInput.value).length === 6)
			join(codeInput.value);
		e.stopPropagation();
	});
	[nameInput, serverInput].forEach(i => i.addEventListener("keydown", e => e.stopPropagation()));

	panel.addEventListener("click", e => {
		const b = e.target.closest("[data-act]");
		if (!b || b.disabled)
			return;
		AudioManager.playSFX("ui_card");
		switch (b.dataset.act) {
			case "create": create(); break;
			case "join": setScreen("join"); break;
			case "back": setScreen("home"); break;
			case "validate": join(codeInput.value); break;
			case "cancel": leave(false); break;
			case "leave": leave(true); break;
			case "start": hostStart(); break;
			case "ready": toggleReady(); break;
			case "copy": copyText(Net.code || "", $('[data-act="copy"]')); break;
			case "copy-guide": copyText(ONLINE_SERVER_GUIDE, $('[data-act="copy-guide"]')); break;
		}
	});

	function showError(text) {
		panel.querySelectorAll(".on-error").forEach(e => e.textContent = text || "");
	}

	async function copyText(text, button) {
		let ok = false;
		try {
			await navigator.clipboard.writeText(text);
			ok = true;
		} catch (e) {
			const input = document.createElement("input");
			input.value = text;
			document.body.appendChild(input);
			input.select();
			try { ok = document.execCommand("copy"); } catch (err) {}
			input.remove();
		}
		button.textContent = ok ? t("online.copied") : t("online.copy");
		setTimeout(() => button.textContent = t("online.copy"), 1600);
	}

	function setScreen(name, code = "") {
		screen = name;
		panel.querySelectorAll(".on-screen").forEach(s => s.classList.toggle("hide", s.dataset.screen !== name));
		showError("");
		if (name === "join") {
			codeInput.value = code;
			$('[data-act="validate"]').disabled = code.length !== 6;
			setTimeout(() => codeInput.focus(), 50);
		}
		render();
	}

	function portraitURL(id) {
		return "img/portraits/" + (Options.characters.includes(id) ? id : "geralt") + ".jpg";
	}

	function playerCard(elem, who) {
		const isMe = who === "me";
		const info = isMe ? {name: me.name, character: Options.character().id, deck: me.deck, deckError: deckError(me.deck), ready: me.ready} : peer;
		elem.classList.toggle("waiting", !info);
		if (!info) {
			elem.innerHTML = `<div class="on-wait-peer"><span class="on-spinner"></span><b></b><span></span></div>`;
			elem.querySelector("b").textContent = t(Net.role === "host" ? "online.waitingPeer" : "online.waitingHost");
			elem.querySelector("span:last-child").textContent = Net.role === "host" ? t("online.giveCode") : "";
			return;
		}
		elem.innerHTML = `
			<div class="on-who"><span class="on-portrait"></span><div><b class="on-pname"></b><span class="on-role"></span></div></div>
			<div class="on-deck"></div>
			<div class="on-ready"></div>`;
		elem.querySelector(".on-portrait").style.backgroundImage = "url('" + portraitURL(info.character) + "')";
		elem.querySelector(".on-pname").textContent = info.name || "…";
		elem.classList.toggle("away", !isMe && !!info.away);
		const hostIsMe = Net.role === "host";
		elem.querySelector(".on-role").textContent = t((isMe === hostIsMe) ? "online.host" : "online.guest");
		const deckBox = elem.querySelector(".on-deck");
		if (isMe) {
			const select = document.createElement("select");
			for (const d of myDecks()) {
				const o = document.createElement("option");
				o.value = d.faction;
				const s = deckSummary(d.deck);
				o.textContent = factionName(d.faction) + " — " + s.leader + " (" + s.count + ")" + (d.error ? " · " + d.error : "");
				o.disabled = !!d.error;
				o.selected = me.deck && me.deck.faction === d.faction;
				select.appendChild(o);
			}
			select.addEventListener("change", () => selectDeck(select.value));
			select.addEventListener("keydown", e => e.stopPropagation());
			const label = document.createElement("label");
			label.textContent = t("online.deck");
			deckBox.append(label, select);
		} else if (info.deck && Object.prototype.hasOwnProperty.call(factions, info.deck.faction)) {
			const s = deckSummary(info.deck);
			deckBox.innerHTML = `<label></label><div class="on-deck-summary"><span class="hist-shield"></span><span></span></div>`;
			deckBox.querySelector("label").textContent = t("online.deck");
			deckBox.querySelector(".hist-shield").style.backgroundImage = iconURL("deck_shield_" + info.deck.faction);
			deckBox.querySelector(".on-deck-summary > span:last-child").textContent = factionName(info.deck.faction) + " — " + s.leader + " (" + s.count + ")";
		}
		if (info.deckError) {
			const p = document.createElement("p");
			p.className = "on-deck-error";
			p.textContent = info.deckError;
			deckBox.appendChild(p);
		}
		const ready = elem.querySelector(".on-ready");
		if (isMe) {
			const b = document.createElement("button");
			b.dataset.act = "ready";
			b.className = "on-ready-toggle" + (info.ready ? " on" : "");
			b.innerHTML = `<span class="on-check"></span><span></span>`;
			b.lastChild.textContent = t("online.ready");
			b.disabled = !!info.deckError || !peer;
			ready.appendChild(b);
		} else {
			ready.innerHTML = `<span class="on-ready-state${info.ready ? " on" : ""}"><span class="on-check"></span><span></span></span>`;
			ready.querySelector("span > span:last-child").textContent = t(info.away ? "online.away" : info.ready ? "online.isReady" : "online.notReady");
		}
	}

	function render() {
		document.getElementById("open-online").classList.toggle("in-room", inRoom);
		if (panel.classList.contains("hide") && screen !== "lobby")
			return;
		nameInput.value = store.get("gc-online-name", "") || Options.character().name;
		if (document.activeElement !== serverInput)
			serverInput.value = serverURL();
		$(".on-server").classList.toggle("missing", !serverURL());
		$(".on-help").classList.toggle("hide", !!serverURL());
		$(".on-guide").textContent = ONLINE_SERVER_GUIDE;
		if (screen !== "lobby")
			return;
		$(".on-code-value").textContent = Net.code || "";
		const link = !peer ? "waiting" : Net.transport === "p2p" ? "p2p" : Net.transport === "relay" ? "relay" : "connecting";
		$(".on-link").dataset.link = link;
		$(".on-link-text").textContent = t("online.link." + link);
		playerCard($('[data-who="me"]'), "me");
		playerCard($('[data-who="peer"]'), "peer");
		const start = $('[data-act="start"]');
		start.classList.toggle("hide", Net.role !== "host");
		start.disabled = !canStart();
		$(".on-start-hint").textContent = Net.role === "host"
			? (canStart() ? "" : t("online.startHint"))
			: t("online.hostStarts");
	}

	function isOpen() {
		return !panel.classList.contains("hide");
	}

	function open() {
		if (isOpen())
			return;
		Options.close();
		History.close();
		panel.classList.remove("hide");
		if (!inRoom)
			setScreen("home");
		else
			render();
		AudioManager.playSFX("menu_opening");
		panel.animate([{opacity: 0}, {opacity: 1}], {duration: 180, easing: "ease-out"});
	}

	// closing the window of a room does not leave the room (the corner button opens it again)
	function close() {
		if (!isOpen())
			return;
		panel.classList.add("hide");
	}

	document.getElementById("open-online").addEventListener("click", () => open());
	document.getElementById("open-online").addEventListener("mouseenter", CLICK_EVENT_SFX);

	return {
		// engine
		get active() { return active; }, isRemote, ordered, roleOf, cardDesc, findCard, rowDesc, rowFrom,
		local, next, checkState, desync, stateHash, endGame, forfeit, backToRoom,
		get peerName() { return peer ? peer.name : ""; },
		get myName() { return me.name; },
		get peerCharacter() { return peer ? peer.character : null; },
		extraHistory,
		// screens
		open, close, isOpen, leave,
		get inRoom() { return inRoom; },
		get screen() { return screen; },
		// tests
		create, join, selectDeck, toggleReady, hostStart, canStart,
		get peer() { return peer; }, get me() { return me; },
	};
})();
