"""Targeted regression tests for specific gwent-classic bugs.
Usage: python3 targeted.py <game_dir>   -> prints one line per test: name, verdict, details
Each test returns {ok: bool, info: ...}; ok=True means correct (fixed) behaviour.
"""
import sys, json, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

game_dir = sys.argv[1]
only = sys.argv[2].split(',') if len(sys.argv) > 2 else None

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=game_dir))
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

HELPERS = r"""
window.__errs = [];
window.addEventListener('error', e => __errs.push(String(e.message)));
window.addEventListener('unhandledrejection', e => __errs.push('rej: ' + (e.reason && (e.reason.message || e.reason))));
const SPEED = 5;
const rSI = window.setInterval.bind(window), rST = window.setTimeout.bind(window);
window.setTimeout = (f, ms, ...a) => rST(f, (ms||0)/SPEED, ...a);
window.setInterval = (f, ms, ...a) => rSI(f, Math.max(1,(ms||0)/SPEED), ...a);
const oFade = window.fade; window.fade = (a,e,d) => oFade(a,e,d/SPEED);
window.wait = ms => new Promise(r => rST(r, ms));
window.until = async (pred, max = 15000) => { const t = Date.now(); while (!pred()) { if (Date.now() - t > max) throw new Error('until timeout: ' + pred); await wait(20); } };
window.idx = name => card_dict.findIndex(c => c.name === name);
window.mk = (name, p) => new Card(card_dict[idx(name)], p);
window.myTurnReady = () => game.state === GameState.PLAYING && game.currPlayer === player_me && !player_me.passed
	&& document.getElementById('stats-me').classList.contains('current-turn') && !document.querySelector('main').classList.contains('noclick') && !Carousel.curr;
window.setupGame = async () => {
	Game.prototype.coinToss = async function () { if (!this.firstPlayer) this.firstPlayer = player_me; };
	document.getElementById('start-game').click();
	await until(() => Carousel.curr);           // mulligan carousel
	Carousel.curr.cancel();
	await until(myTurnReady);
};
0;
"""

TESTS = {
"resume_popup_keeps_control": r"""
	await setupGame();
	document.getElementById('exit-game').click();
	await until(() => Popup.curr);
	Popup.curr.selectYes();                 // "Resume"
	await wait(300);
	const blocked = document.querySelector('main').classList.contains('noclick');
	return {ok: !blocked, info: {mainNoclick: blocked}};
""",
"new_game_no_duplicate_leader_or_grave": r"""
	await setupGame();
	player_op.grave.addCard(player_op.deck.removeCard(0));   // previous game's discard
	const oldGrave = player_op.grave;
	game.endGame();
	await wait(300);
	document.getElementById('end-screen').getElementsByTagName('button')[2].click();   // New Game
	await until(() => Carousel.curr);
	Carousel.curr.cancel();
	await until(myTurnReady);
	const leaders = document.querySelectorAll('#leader-op .leader-container > .card').length;
	document.getElementById('grave-op').click();
	await wait(200);
	const shown = Carousel.curr ? Carousel.curr.container : null;
	const stale = shown === oldGrave;
	if (Carousel.curr) Carousel.curr.cancel();
	return {ok: leaders === 1 && !stale, info: {leaderCards: leaders, staleGraveShown: stale}};
""",
"avenger_token_leaves_grave": r"""
	await setupGame();
	const row = board.getRow(null || mk('Cow', player_me), 'ranged', player_me);
	const cow = mk('Cow', player_me);
	await row.addCard(cow);
	await board.toGrave(cow, row);
	await wait(400);
	const close = board.getRow(cow, 'close', player_me);
	const bdf = close.cards.find(c => c.name === 'Bovine Defense Force');
	if (!bdf) return {ok: false, info: 'no token summoned'};
	await board.toGrave(bdf, close);
	await wait(700);
	const inGrave = player_me.grave.cards.includes(bdf);
	return {ok: !inGrave, info: {tokenStillInGrave: inGrave, grave: player_me.grave.cards.map(c => c.name)}};
""",
"avenger_token_decoyed_does_not_eat_grave": r"""
	await setupGame();
	player_me.grave.addCard(mk('Vesemir', player_me));
	const cow = mk('Cow', player_me);
	const ranged = board.getRow(cow, 'ranged', player_me), close = board.getRow(cow, 'close', player_me);
	await ranged.addCard(cow);
	await board.toGrave(cow, ranged);
	await wait(400);
	const bdf = close.cards.find(c => c.name === 'Bovine Defense Force');
	await board.toHand(bdf, close);           // e.g. decoyed back to hand
	await wait(700);
	const names = player_me.grave.cards.map(c => c.name);
	return {ok: names.includes('Vesemir') && names.includes('Cow') && __errs.length === 0, info: {grave: names, errs: __errs}};
""",
"decoy_not_buffed_by_morale": r"""
	await setupGame();
	const row = board.getRow(mk('Kaedweni Siege Expert', player_me), 'siege', player_me);
	await row.addCard(mk('Kaedweni Siege Expert', player_me));   // strength 1, morale
	const before = row.total;
	await row.addCard(mk('Decoy', player_me));
	return {ok: row.total === before, info: {before, after: row.total}};
""",
"music_toggle_offline_no_crash": r"""
	let err = null;
	try { ui.toggleMusic(); } catch (e) { err = String(e); }
	return {ok: err === null, info: err};
""",
"deck_import_with_warning": r"""
	ui.confirm = async () => true;     // user clicks Yes: "Continue importing deck?"
	let err = null, res;
	const vesemir = idx('Vesemir');   // neutral, max 1 copy
	try { res = await dm.loadDeck({faction: 'realms', leader: 24, cards: [[vesemir, 3], [idx('Kaedweni Siege Expert'), 1]]}, false); }
	catch (e) { err = String(e); }
	return {ok: !err && !!res && res.cards.find(c => c.index === vesemir).count === 1, info: {err, res}};
""",
"deck_import_persists_after_reload": r"""
	const deck = {faction: 'nilfgaard', leader: 57, cards: [[idx('Vesemir'), 1], [idx('Black Infantry Archer'), Math.min(2, Number(card_dict[idx('Black Infantry Archer')].count))]]};
	await dm.loadPlayerDeck(deck, true);
	return {ok: true, info: dm.deckToJSON(), reload: true};
""",
"skellige_storm_ai_weight": r"""
	await setupGame();
	// AI (op) has strong ranged+siege units, human has nothing: Storm must look bad for the AI
	const ai = player_op.controller;
	for (const n of ['Black Infantry Archer', 'Black Infantry Archer'])
		await board.getRow(mk(n, player_op), 'ranged', player_op).addCard(mk(n, player_op));
	const storm = mk('Skellige Storm', player_op);
	const w = ai.weightWeather(storm);
	return {ok: w !== 1 && w < 0, info: {weight: w}};
""",
"ai_eredin_king_no_weather_no_hang": r"""
	await setupGame();
	const leader = new Card(card_dict[idx('Eredin - King of the Wild Hunt')], player_op);
	player_op.deck.cards.filter(c => c.row === 'weather').forEach(c => player_op.deck.removeCard(c));
	let err = null, w;
	try { w = player_op.controller.weightLeader(leader, player_op.controller.getMaximums(), player_op.controller.getBoardData()); }
	catch (e) { err = String(e); }
	return {ok: !err && w >= 0, info: {weight: w, err}};
""",
"realms_draw_with_empty_deck": r"""
	await setupGame();
	game.roundStart = [];
	factions.realms.factionAbility(player_op);
	while (player_op.deck.cards.length) player_op.deck.removeCard(0);
	game.roundCount = 2; game.roundHistory = [{winner: player_op}];
	__errs.length = 0;
	let err = null;
	try { await game.runEffects(game.roundStart); } catch (e) { err = String(e); }
	await wait(300);
	return {ok: !err && __errs.length === 0, info: {err, errs: __errs}};
""",
"hand_dom_matches_model_after_redraw": r"""
	await setupGame();
	const before = player_me.hand.cards.map(c => c.name);
	await player_me.deck.swap(player_me.hand, player_me.hand.cards[0]);
	await player_me.deck.swap(player_me.hand, player_me.hand.cards[3]);
	const model = player_me.hand.cards.map(c => c.elem);
	const dom = [...document.getElementById('hand-row').children];
	const same = model.length === dom.length && model.every((e, i) => e === dom[i]);
	return {ok: same, info: {model: player_me.hand.cards.map(c => c.name)}};
""",
"weather_overlay_survives_quick_reapply": r"""
	await setupGame();
	const frost1 = mk('Biting Frost', player_me), clear = mk('Clear Weather', player_me), frost2 = mk('Biting Frost', player_me);
	await weather.addCard(frost1);
	await weather.addCard(clear);
	await weather.addCard(frost2);
	await wait(800);
	const elem = board.row[3].elem_parent.getElementsByClassName('row-weather')[0];
	const visible = elem.classList.contains('frost') && !elem.classList.contains('hide');
	return {ok: board.row[3].effects.weather && visible, info: {effect: board.row[3].effects.weather, cls: elem.className}};
""",
"mardroeme_multi_berserker_no_hang": r"""
	await setupGame();
	userInteracted = true; Settings.soundEffects.enable();
	const ranged = board.getRow(mk('Young Berserker', player_me), 'ranged', player_me);
	for (let i = 0; i < 3; i++) await ranged.addCard(mk('Young Berserker', player_me));
	const m = mk('Mardroeme', player_me);
	player_me.hand.addCard(m);
	const r = await Promise.race([player_me.playCardToRow(m, ranged).then(() => 'done'), wait(15000).then(() => 'HANG')]);
	return {ok: r === 'done', info: {result: r, row: ranged.cards.map(c => c.name)}};
""",
"customize_then_start_no_duplicate_leader": r"""
	await setupGame();
	game.returnToCustomization();
	await wait(200);
	document.getElementById('start-game').click();
	await until(() => Carousel.curr);
	Carousel.curr.cancel();
	await until(myTurnReady);
	const me = document.querySelectorAll('#leader-me .leader-container > .card').length;
	const op = document.querySelectorAll('#leader-op .leader-container > .card').length;
	return {ok: me === 1 && op === 1, info: {me, op}};
""",
"muster_pulls_from_deck_only": r"""
	await setupGame();
	const n = "Gaunter O'Dimm - Darkness";
	[...player_me.hand.cards].filter(c => c.name.startsWith("Gaunter")).forEach(c => player_me.hand.removeCard(c));
	[...player_me.deck.cards].filter(c => c.name.startsWith("Gaunter")).forEach(c => player_me.deck.removeCard(c));
	const a = mk(n, player_me), b = mk(n, player_me), c = mk(n, player_me);
	player_me.hand.addCard(a); player_me.hand.addCard(b); player_me.deck.addCard(c);
	await player_me.playCard(a);
	await wait(1500);
	const row = board.getRow(a, 'ranged', player_me);
	return {ok: row.cards.includes(a) && row.cards.includes(c) && player_me.hand.cards.includes(b), info: {onRow: row.cards.filter(x => x.name === n).length, inHand: player_me.hand.cards.includes(b)}};
""",
"hard_ai_does_not_decoy_to_win": r"""
	await setupGame();
	Settings.difficulty.set('hard');
	const ai = player_op.controller;
	// opponent (human) passed and leads by 5; AI has a Decoy and a 6-strength unit
	[...player_op.hand.cards].forEach(c => player_op.hand.removeCard(c));
	const d = mk('Decoy', player_op), u = mk('Vesemir', player_op);
	player_op.hand.addCard(d); player_op.hand.addCard(u);
	const filler = mk('Prince Stennis', player_op); // 5 points on AI side? (spy goes to human side) -> use plain units
	const h1 = mk('Siegfried of Denesle', player_me); await board.getRow(h1, 'close', player_me).addCard(h1);
	const v = mk('Yarpen Zigrin', player_op); await board.getRow(v, 'close', player_op).addCard(v);
	player_me.setPassed(true);
	const opts = player_op.hand.cards.map(c => ({kind: 'card', card: c, weight: Math.max(0, ai.weightCard(c, ai.getMaximums(), ai.getBoardData()))}));
	opts.push({kind: 'pass', weight: 0});
	player_op.health = 1; // decisive round
	const choice = ai.chooseHard(player_op, opts);
	return {ok: choice.card === u, info: {choice: choice.kind === 'pass' ? 'pass' : choice.card.name, totals: [player_me.total, player_op.total]}};
""",
"right_click_views_card": r"""
	await setupGame();
	const c = player_me.hand.cards[0];
	const r = c.elem.getBoundingClientRect();
	const evt = new MouseEvent('contextmenu', {bubbles: true, cancelable: true, button: 2, clientX: r.left + r.width/2, clientY: r.top + r.height/2});
	c.elem.dispatchEvent(evt);
	await wait(200);
	const viewing = !document.getElementById('zoom').classList.contains('hide');
	return {ok: evt.defaultPrevented && viewing, info: {prevented: evt.defaultPrevented, viewing}};
""",
}

results = {}
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--mute-audio"])
    for name, body in TESTS.items():
        if only and name not in only:
            continue
        ctx = browser.new_context(viewport={"width": 1600, "height": 900})
        page = ctx.new_page()
        page.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
        page.add_init_script("if (!sessionStorage.getItem('init')) { localStorage.clear(); localStorage.setItem('gc-last-faction','realms'); localStorage.setItem('gc-notifications','false'); sessionStorage.setItem('init','1'); }")
        page.goto(f"http://127.0.0.1:{port}/index.html")
        page.wait_for_timeout(300)
        page.evaluate(HELPERS)
        try:
            r = page.evaluate("async () => {" + body + "}")
            if r.get("reload"):
                before = r["info"]
                page.reload(); page.wait_for_timeout(500)
                after = page.evaluate("dm.deckToJSON()")
                r = {"ok": before == after, "info": {"before": before, "after": after}}
        except Exception as e:
            r = {"ok": False, "info": "EXCEPTION " + str(e)[:300]}
        results[name] = r
        print(("PASS " if r["ok"] else "FAIL ") + name + "  " + json.dumps(r["info"])[:400], flush=True)
        ctx.close()
    browser.close()
httpd.shutdown()
