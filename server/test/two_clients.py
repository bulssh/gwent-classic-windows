# End-to-end test of the online mode: two game clients (two browser profiles) play complete games
# against each other through the local Worker (wrangler dev), each driven by a bot using the UI.
#   python3 two_clients.py <games> [relay|drop] [factionA,factionB]
import sys, json, time, random, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

GAME = 'game'
WORKER = 'ws://127.0.0.1:8787'
BOT = open(__file__.replace('two_clients.py', 'mpbot.js')).read()
games = int(sys.argv[1]) if len(sys.argv) > 1 else 1
mode = sys.argv[2] if len(sys.argv) > 2 else 'p2p'
forced = sys.argv[3].split(',') if len(sys.argv) > 3 else None

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Q, directory=GAME))
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

FACTIONS = ["realms", "nilfgaard", "monsters", "scoiatael", "skellige"]
summary = []
with sync_playwright() as p:
    b = p.chromium.launch(
                          args=["--mute-audio", "--disable-features=WebRtcHideLocalIpsWithMdns"])
    for g in range(games):
        fa, fb = forced if forced else (random.choice(FACTIONS), random.choice(FACTIONS))
        pages = []
        for name, char, faction in (("Alice", "ciri", fa), ("Bob", "vesemir", fb)):
            ctx = b.new_context(viewport={"width": 1280, "height": 720})
            pg = ctx.new_page()
            pg.errs = []
            pg.on("pageerror", lambda e, pg=pg: pg.errs.append(str(e)))
            pg.on("console", lambda m, pg=pg: pg.errs.append("console: " + m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
            pg.on("response", lambda r, pg=pg: pg.errs.append("404 " + r.url) if r.status >= 400 and "favicon" not in r.url else None)
            pg.add_init_script(f"""localStorage.setItem('gc-language','fr'); localStorage.setItem('gc-music-offered','1');
                localStorage.setItem('gc-notifications','false'); localStorage.setItem('gc-online-server','{WORKER}');
                localStorage.setItem('gc-online-name','{name}'); localStorage.setItem('gc-character','{char}');
                localStorage.setItem('gc-last-faction','{faction}');""")
            pg.goto(f"http://127.0.0.1:{port}/index.html")
            pg.wait_for_timeout(700)
            # a random leader for the deck of this faction (covers the leader abilities)
            pg.evaluate("""f => { const ls = card_dict.map((c,i)=>({c,i})).filter(x => x.c.row === 'leader' && x.c.deck === f);
                const l = ls[Math.floor(Math.random()*ls.length)]; Settings.getFactionSettings(f).setLeader({index: l.i}); return l.c.name; }""", faction)
            pg.evaluate("window.__SPEED = 4; window.__PASSP = 0.02")
            pg.evaluate(BOT)
            pg.evaluate("(() => { const s0 = Net.send; Net.send = (t, d) => { window.__sent = window.__sent || {}; window.__sent[t] = (window.__sent[t] || 0) + 1; return s0(t, d); }; })()")
            pages.append(pg)
        A, B = pages
        if mode in ('relay', 'wsdrop'):
            B.evaluate("Net.rtcAvailable = false")
        A.evaluate("Online.open(); Online.create()")
        A.wait_for_function("Online.screen === 'lobby' && !!Net.code", timeout=15000)
        code = A.evaluate("Net.code")
        B.evaluate(f"Online.open(); Online.join('{code.lower()}')")
        B.wait_for_function("Online.screen === 'lobby' && Online.peer && Online.peer.deck", timeout=20000)
        A.wait_for_function("Online.peer && Online.peer.deck && Net.connected", timeout=20000)
        t_link = time.time()
        if mode != 'relay':
            # give the direct link a chance
            try:
                A.wait_for_function("Net.transport === 'p2p'", timeout=12000)
            except Exception:
                pass
        A.screenshot(path=f'/tmp/claude-0/mp_lobby_A_{g}.png')
        B.screenshot(path=f'/tmp/claude-0/mp_lobby_B_{g}.png')
        A.evaluate("Online.toggleReady()"); B.evaluate("Online.toggleReady()")
        A.wait_for_function("Online.canStart()", timeout=10000)
        A.evaluate("Online.hostStart()")
        t0 = time.time()
        dropped = False
        while True:
            time.sleep(1)
            done = [pg.evaluate("!!window.__done") for pg in pages]
            if all(done):
                break
            if mode == 'drop' and not dropped and time.time() - t0 > 25:
                A.evaluate("Net.dropDirect()")
                dropped = True
            if mode == 'wsdrop' and not dropped and time.time() - t0 > 20:
                # both players lose their room connection during a relayed game and come back with their key
                A.evaluate("Net.dropSocket()"); B.evaluate("Net.dropSocket()")
                dropped = True
            idle = max(pg.evaluate("Date.now() - window.__stats.lastProgress") for pg in pages)
            if idle > 60000 or time.time() - t0 > 900:
                print("HANG", [pg.evaluate("({state: String(game.state), curr: game.currPlayer && game.currPlayer.tag, round: game.roundCount, waiting: Net.transport, last: window.__stats.moves.slice(-3)})") for pg in pages])
                break
        res = []
        for pg in pages:
            res.append(pg.evaluate("""({result: window.__result, rounds: game.roundHistory.map(r => [r.score_me, r.score_op]),
                transport: Net.transport, desync: window.__onlineDesync || [], errors: window.__errors.slice(0, 5),
                me: player_me && player_me.deck_data.leader.name, op: player_op && player_op.deck_data.leader.name,
                sent: window.__sent || {}, turns: window.__stats.turns, history: History.games.slice(-1)[0]})"""))
        A.screenshot(path=f'/tmp/claude-0/mp_end_A_{g}.png')
        ra, rb = res
        mirrored = [[y, x] for x, y in rb["rounds"]] == ra["rounds"]
        results_ok = (ra["result"], rb["result"]) in [("end-win", "end-lose"), ("end-lose", "end-win"), ("end-draw", "end-draw")]
        ok = mirrored and results_ok and not ra["desync"] and not rb["desync"] and not A.errs and not B.errs and not ra["errors"] and not rb["errors"]
        line = {"game": g, "ok": ok, "factions": [fa, fb], "leaders": [ra["me"], rb["me"]], "results": [ra["result"], rb["result"]],
                "rounds": ra["rounds"], "mirrored": mirrored, "transport": [ra["transport"], rb["transport"]],
                "desync": ra["desync"] + rb["desync"], "errors": ra["errors"] + rb["errors"] + A.errs[:3] + B.errs[:3],
                "turns": [ra["turns"], rb["turns"]], "sent": [ra["sent"], rb["sent"]], "secs": round(time.time() - t0), "dropped": dropped,
                "history": [ra["history"] and ra["history"].get("result"), rb["history"] and rb["history"].get("result")]}
        print(json.dumps(line), flush=True)
        summary.append(ok)
        for pg in pages:
            pg.context.close()
    b.close()
httpd.shutdown()
print("OK", sum(summary), "/", len(summary))
