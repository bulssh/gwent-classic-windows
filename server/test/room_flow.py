# Online room flow: game, back to the room, second game, forfeit, leaving the room, bad code.
import sys, json, time, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright
GAME = 'game'
WORKER = 'ws://127.0.0.1:8787'
BOT = open(__file__.replace('room_flow.py', 'mpbot.js')).read()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Q, directory=GAME))
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
out = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=["--mute-audio", "--disable-features=WebRtcHideLocalIpsWithMdns"])
    pages = []
    for name, char, faction in (("Alice", "ciri", "realms"), ("Bob", "vesemir", "monsters")):
        ctx = b.new_context(viewport={"width": 1280, "height": 720})
        pg = ctx.new_page(); pg.errs = []
        pg.on("pageerror", lambda e, pg=pg: pg.errs.append(str(e)))
        pg.add_init_script(f"""localStorage.setItem('gc-language','fr'); localStorage.setItem('gc-music-offered','1');
            localStorage.setItem('gc-notifications','false'); localStorage.setItem('gc-online-server','{WORKER}');
            localStorage.setItem('gc-online-name','{name}'); localStorage.setItem('gc-character','{char}'); localStorage.setItem('gc-last-faction','{faction}');""")
        pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(700)
        pages.append(pg)
    A, B = pages
    # bad code
    B.evaluate("Online.open(); Online.join('ZZZZZ2')"); B.wait_for_timeout(1500)
    out["badCode"] = B.evaluate("[Online.screen, document.querySelector('#online .on-screen[data-screen=join] .on-error').textContent]")
    B.screenshot(path='/tmp/claude-0/flow_badcode.png')
    A.evaluate("Online.open()"); A.wait_for_timeout(300)
    A.screenshot(path='/tmp/claude-0/flow_home.png')
    A.evaluate("Online.create()"); A.wait_for_function("Online.screen === 'lobby' && !!Net.code", timeout=15000)
    A.screenshot(path='/tmp/claude-0/flow_waiting.png')
    code = A.evaluate("Net.code")
    B.evaluate(f"Online.join('{code}')")
    A.wait_for_function("Online.peer && Online.peer.deck && Net.connected", timeout=20000)
    B.wait_for_function("Online.peer && Online.peer.deck && Net.connected", timeout=20000)
    for pg in pages:
        pg.evaluate("window.__SPEED = 4; window.__PASSP = 0.3")
        pg.evaluate(BOT)
    def play_game(tag):
        A.evaluate("Online.toggleReady()"); B.evaluate("Online.toggleReady()")
        A.wait_for_function("Online.canStart()", timeout=10000)
        A.evaluate("Online.hostStart()")
        A.wait_for_function("window.__done", timeout=300000); B.wait_for_function("window.__done", timeout=300000)
        r = [pg.evaluate("[window.__result, game.roundHistory.map(r=>[r.score_me,r.score_op]), (window.__onlineDesync||[]).length]") for pg in pages]
        out[tag] = r
        A.screenshot(path=f'/tmp/claude-0/flow_end_{tag}.png')
        # back to the room (end screen button)
        for pg in pages:
            pg.evaluate("document.querySelector('#end-screen > button').click()")
        A.wait_for_timeout(800)
        for pg in pages:
            pg.evaluate("window.__done = false; window.__result = null")
        out[tag + "_room"] = [pg.evaluate("[Online.screen, Online.isOpen(), Online.me.ready, !!(Online.peer && Online.peer.ready), String(game.state)]") for pg in pages]
    play_game("game1")
    play_game("game2")
    # third game: Bob gives up after a few seconds
    A.evaluate("Online.toggleReady()"); B.evaluate("Online.toggleReady()")
    A.wait_for_function("Online.canStart()", timeout=10000)
    A.evaluate("Online.hostStart()")
    B.wait_for_function("game.state === GameState.PLAYING && game.roundCount >= 1", timeout=60000)
    B.wait_for_timeout(1500)
    B.evaluate("Online.forfeit()")
    A.wait_for_timeout(2500)
    out["forfeit"] = {"A": A.evaluate("[History.games.at(-1).result, Online.screen, String(game.state)]"), "B": B.evaluate("[History.games.at(-1).result, Online.screen]")}
    A.screenshot(path='/tmp/claude-0/flow_forfeit.png')
    # the guest leaves the room
    B.evaluate("Online.leave(true)"); A.wait_for_timeout(1500)
    out["guestLeft"] = A.evaluate("[Online.peer, Online.screen]")
    A.screenshot(path='/tmp/claude-0/flow_guest_left.png')
    # a guest joins again with the same code (fresh session)
    B.reload(); B.wait_for_timeout(800)
    B.evaluate(f"Online.open(); Online.join('{code}')")
    A.wait_for_function("Online.peer && Online.peer.deck", timeout=20000)
    B.wait_for_function("Online.peer && Online.peer.deck", timeout=20000)
    try:
        A.wait_for_function("Net.transport === 'p2p'", timeout=15000)
    except Exception:
        pass
    out["rejoinedLobby"] = [A.evaluate("[Online.peer.name, Net.transport]"), B.evaluate("[Online.peer.name, Net.transport]")]
    out["errors"] = [A.errs[:3], B.errs[:3], A.evaluate("window.__errors.slice(0,3)"), B.evaluate("(window.__errors||[]).slice(0,3)")]
    b.close()
httpd.shutdown()
print(json.dumps(out, indent=1))
