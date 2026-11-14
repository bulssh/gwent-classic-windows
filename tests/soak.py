"""Soak test: serve a gwent-classic folder, let a bot play N games per faction, report errors/hangs.
Usage: python3 soak.py <game_dir> [games_per_faction] [speed]
"""
import sys, time, json, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

game_dir = sys.argv[1]
games = int(sys.argv[2]) if len(sys.argv) > 2 else 3
speed = int(sys.argv[3]) if len(sys.argv) > 3 else 8
factions = sys.argv[4].split(',') if len(sys.argv) > 4 else ["realms", "nilfgaard", "monsters", "scoiatael", "skellige"]
BOT = open(__file__.replace('soak.py', 'bot.js')).read()

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

handler = functools.partial(Quiet, directory=game_dir)
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

summary = {}
with sync_playwright() as p:
    browser = p.chromium.launch(
                                args=["--autoplay-policy=no-user-gesture-required", "--mute-audio"])
    for faction in factions:
        ctx = browser.new_context(viewport={"width": 1600, "height": 900})
        page = ctx.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.type + ": " + m.text) if (m.type == "error" or "removeCard" in m.text) else None)
        page.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)))
        # block network outside localhost (YouTube etc.)
        page.route("**/*", lambda route: route.continue_() if "127.0.0.1" in route.request.url else route.abort())
        import os
        page.add_init_script(f"localStorage.setItem('gc-last-faction', '{faction}'); localStorage.setItem('gc-notifications','false'); localStorage.setItem('gc-difficulty', '{os.environ.get('DIFF','normal')}'); localStorage.setItem('gc-language', '{os.environ.get('LANGG','fr')}');")
        page.goto(f"http://127.0.0.1:{port}/index.html")
        page.wait_for_timeout(500)
        page.evaluate(f"window.__SPEED={speed}; window.__GAMES={games}; window.__SMART={1 if os.environ.get('SMART') else 0};")
        page.evaluate(BOT)
        page.mouse.click(5, 5)  # userInteracted
        page.click("#start-game")
        t0 = time.time()
        hang = None
        while True:
            page.wait_for_timeout(1000)
            st = page.evaluate("({done: !!window.__done, s: window.__stats, idle: Date.now()-window.__stats.lastProgress, errs: window.__errors.length})")
            if st["done"]:
                break
            if st["idle"] > 25000:
                hang = page.evaluate("""({state: String(game.state), round: game.roundCount, curr: game.currPlayer && game.currPlayer.tag,
                    mePassed: player_me && player_me.passed, opPassed: player_op && player_op.passed,
                    carousel: !!Carousel.curr, queued: ui.carousels.length, popup: !!Popup.curr, preview: ui.previewCard && ui.previewCard.name,
                    mainNoclick: document.querySelector('main').classList.contains('noclick'), placed: game.placedEffectsActive,
                    hand: player_me && player_me.hand.cards.map(c=>c && c.name), busy: window.__busy, last: window.__last, cc: Carousel.curr && {count: Carousel.curr.count, idx: Carousel.curr.indices, title: Carousel.curr.title, n: Carousel.curr.container.cards.length, names: Carousel.curr.container.cards.map(c=>c && c.name), cancelled: Carousel.curr.cancelled}, grave: player_me && player_me.grave.cards.map(c=>c && c.name), errs: window.__errors.slice(0,5), turn: document.getElementById("stats-me").classList.contains("current-turn"), opTurn: document.getElementById("stats-op").classList.contains("current-turn"), rows: board.row.map(r=>r.cards.map(c=>c && c.name))})""")
                break
            if time.time() - t0 > 900:
                hang = "timeout"
                break
        res = page.evaluate("({s: window.__stats, e: window.__errors})")
        print("history", page.evaluate("History.games.map(g => g.result + ' ' + g.rounds.map(r => r.join('-')).join(','))"), flush=True)
        summary[faction] = {"stats": res["s"], "errors": res["e"], "console": console_errors[:30], "hang": hang,
                            "secs": round(time.time() - t0)}
        print(faction, json.dumps(summary[faction]), flush=True)
        ctx.close()
    browser.close()
httpd.shutdown()
