"use strict"

// History of the games played (kept in this computer's local storage): result, factions and
// leaders, scores of each round, difficulty. Opened by the history button (anticlockwise arrow,
// top right of the deck screen and of the board).
// Loaded after options.js.

const History = (() => {

	const KEY = "gc-history";
	const MAX = 300;
	const stage = document.getElementById("stage");

	function load() {
		try {
			const list = JSON.parse(localStorage.getItem(KEY) || "[]");
			return Array.isArray(list) ? list : [];
		} catch (e) {
			return [];
		}
	}

	function save(list) {
		try {
			localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
		} catch (e) {}
	}

	// Called at the end of a game (result "win", "lose", "draw") or when the player leaves a game
	// in progress ("abandon")
	function record(result, extra) {
		try {
			if (typeof player_me === "undefined" || !player_me || !player_op)
				return;
			const side = p => ({
				faction: p.deck_data.faction,
				leader: p.deck_data.leader.name,
				name: p.name,
			});
			const entry = {
				date: new Date().toISOString(),
				result,
				difficulty: Settings.difficulty.get(),
				me: side(player_me),
				op: side(player_op),
				rounds: game.roundHistory.map(r => [r.score_me, r.score_op]),
			};
			if (extra)
				Object.assign(entry, extra);
			const list = load();
			list.push(entry);
			save(list);
			refresh();
		} catch (e) {
			console.warn("history:", e);
		}
	}

	// ---------- panel ----------

	const panel = document.createElement("section");
	panel.id = "history";
	panel.className = "hide";
	panel.innerHTML = `
<div class="opt-panel hist-panel">
	<header><h1></h1><button class="opt-close"></button></header>
	<div class="hist-summary"></div>
	<div class="hist-factions"></div>
	<div class="hist-table-wrap">
		<table class="hist-table">
			<thead><tr><th data-k="history.date"></th><th data-k="history.result"></th><th data-k="history.you"></th><th data-k="history.opponent"></th><th data-k="history.rounds"></th><th data-k="history.difficulty"></th></tr></thead>
			<tbody></tbody>
		</table>
		<p class="hist-empty" data-k="history.empty"></p>
	</div>
	<footer><button class="hist-clear" data-k="history.clear"></button><span><kbd data-k="key.escape"></kbd><span data-k="opt.close"></span></span></footer>
</div>`;
	stage.appendChild(panel);
	const $ = sel => panel.querySelector(sel);
	$("h1").textContent = t("history.title");
	panel.querySelectorAll("[data-k]").forEach(e => e.textContent = t(e.dataset.k));
	$(".opt-close").addEventListener("click", () => close());
	panel.addEventListener("pointerdown", e => { if (e.target === panel) close(); });
	$(".hist-clear").addEventListener("click", async () => {
		if (!load().length)
			return;
		if (await ui.confirm(t("history.title"), t("history.clearConfirm"))) {
			save([]);
			refresh();
		}
	});

	const FACTIONS = ["realms", "nilfgaard", "monsters", "scoiatael", "skellige"];
	const resultText = r => r === "abandon" ? t("history.abandon") : r === "interrupted" ? t("history.interrupted") : t("history." + r).replace(/\s*!$/, "");

	function leaderName(faction, name) {
		const card = card_dict.find(c => c.row === "leader" && c.deck === faction && c.name === name);
		return card ? cardName(card) : name;
	}

	function sideCell(s) {
		const td = document.createElement("td");
		const box = document.createElement("span");
		box.className = "hist-side";
		td.appendChild(box);
		const shield = document.createElement("span");
		shield.className = "hist-shield";
		shield.style.backgroundImage = iconURL("deck_shield_" + s.faction);
		const text = document.createElement("span");
		text.textContent = leaderName(s.faction, s.leader);
		box.append(shield, text);
		td.title = factionName(s.faction);
		return td;
	}

	function refresh() {
		if (panel.classList.contains("hide"))
			return;
		const list = load();
		const count = r => list.filter(g => g.result === r).length;
		const wins = count("win"), losses = count("lose") + count("abandon"), draws = count("draw");
		const played = list.length - count("interrupted");
		const rate = played ? Math.round(wins * 100 / played) : 0;
		$(".hist-summary").innerHTML = "";
		for (const [label, value, cls] of [
			[t("history.games"), list.length, ""],
			[t("history.wins"), wins, "win"],
			[t("history.losses"), losses, "lose"],
			[t("history.draws"), draws, "draw"],
			[t("history.rate"), rate + " %", ""],
		]) {
			const d = document.createElement("div");
			d.className = "hist-stat " + cls;
			d.innerHTML = "<b></b><span></span>";
			d.children[0].textContent = value;
			d.children[1].textContent = label;
			$(".hist-summary").appendChild(d);
		}
		// wins and losses with each of the player's factions
		$(".hist-factions").innerHTML = "";
		for (const f of FACTIONS) {
			const games = list.filter(g => g.me.faction === f);
			const d = document.createElement("div");
			d.className = "hist-faction" + (games.length ? "" : " none");
			d.title = t("history.factionTip", factionName(f));
			d.innerHTML = '<span class="hist-shield"></span><span></span>';
			d.children[0].style.backgroundImage = iconURL("deck_shield_" + f);
			d.children[1].textContent = games.filter(g => g.result === "win").length + " – " + games.filter(g => g.result === "lose" || g.result === "abandon").length;
			$(".hist-factions").appendChild(d);
		}

		const body = $(".hist-table tbody");
		body.innerHTML = "";
		const fmt = new Intl.DateTimeFormat(LANG === "fr" ? "fr-FR" : "en-GB", {dateStyle: "short", timeStyle: "short"});
		for (const g of list.slice().reverse()) {
			const tr = document.createElement("tr");
			const date = document.createElement("td");
			date.textContent = fmt.format(new Date(g.date));
			const res = document.createElement("td");
			res.className = "hist-result " + g.result;
			res.textContent = resultText(g.result);
			const rounds = document.createElement("td");
			rounds.className = "hist-rounds";
			for (const [a, b] of g.rounds) {
				const r = document.createElement("span");
				r.className = a > b ? "won" : a < b ? "lost" : "";
				r.textContent = a + " – " + b;
				rounds.appendChild(r);
			}
			const diff = document.createElement("td");
			diff.textContent = t("difficulty." + g.difficulty);
			const op = sideCell(g.op);
			if (g.online) {
				const tag = document.createElement("span");
				tag.className = "hist-online";
				tag.textContent = t("history.online", g.opName || "?");
				op.firstChild.appendChild(tag);
				diff.textContent = t("history.onlineMode");
			}
			tr.append(date, res, sideCell(g.me), op, rounds, diff);
			body.appendChild(tr);
		}
		$(".hist-empty").classList.toggle("hide", list.length > 0);
		$(".hist-table").classList.toggle("hide", list.length === 0);
		$(".hist-clear").disabled = list.length === 0;
	}

	function isOpen() {
		return !panel.classList.contains("hide");
	}

	function open() {
		if (isOpen())
			return;
		if (Options.isOpen())
			Options.close();
		panel.classList.remove("hide");
		refresh();
		$(".hist-table-wrap").scrollTop = 0;
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

	document.getElementById("open-history").addEventListener("click", () => open());

	return {record, open, close, isOpen, refresh, get games() { return load(); }};
})();
