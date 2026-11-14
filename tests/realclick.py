"""Real-mouse UI tests (Playwright clicks at element coordinates, like a user).
Usage: python3 realclick.py <game_dir> [test,...] [--shots]"""
import sys, json, threading, functools, http.server, socketserver, os
from playwright.sync_api import sync_playwright

game_dir = sys.argv[1]
only = sys.argv[2].split(',') if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else None
SHOTS = os.environ.get('SHOTS', '/tmp/gwent-shots')
os.makedirs(SHOTS, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=game_dir))
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

SETUP = r"""
window.__errs = [];
window.addEventListener('error', e => __errs.push(String(e.message)));
window.addEventListener('unhandledrejection', e => __errs.push('rej: ' + (e.reason && (e.reason.stack || e.reason))));
window.idx = name => card_dict.findIndex(c => c.name === name);
window.mk = (name, p) => new Card(card_dict[idx(name)], p);
window.myTurnReady = () => game.state === GameState.PLAYING && game.currPlayer === player_me && !player_me.passed
	&& document.getElementById('stats-me').classList.contains('current-turn') && !document.querySelector('main').classList.contains('noclick') && !Carousel.curr;
Game.prototype.coinToss = async function () { if (!this.firstPlayer) this.firstPlayer = player_me; };
0;
"""

def start_game(page):
    page.click('#start-game')
    page.wait_for_function('!!Carousel.curr', timeout=20000)
    page.evaluate('Carousel.curr.cancel()')
    page.wait_for_function('myTurnReady()', timeout=30000)

def center(page, js):
    """bounding box center of an element returned by a JS expression"""
    r = page.evaluate(f"(() => {{ const e = {js}; const b = e.getBoundingClientRect(); return [b.left + b.width/2, b.top + b.height/2, b.width, b.height]; }})()")
    return r

TESTS = {}
def test(fn):
    TESTS[fn.__name__] = fn
    return fn

@test
def decoy_real_clicks(page):
    start_game(page)
    # put a Decoy in hand and a unit on my close row
    page.evaluate("""(async () => {
        const u = mk('Vesemir', player_me);
        await board.getRow(u, 'close', player_me).addCard(u);
        window.__target = u;
        const d = mk('Decoy', player_me); player_me.hand.addCard(d); window.__decoy = d;
    })()""")
    page.wait_for_timeout(800)
    x, y, w, h = center(page, '__decoy.elem')
    page.mouse.click(x, y)
    page.wait_for_timeout(400)
    st1 = page.evaluate("({preview: ui.previewCard && ui.previewCard.name})")
    x, y, w, h = center(page, '__target.elem')
    hit = page.evaluate(f"(() => {{ const e = document.elementFromPoint({x},{y}); return e && (e.id || e.className); }})()")
    page.mouse.click(x, y)
    page.wait_for_timeout(2500)
    st = page.evaluate("""({inHand: player_me.hand.cards.includes(__target), decoyOnRow: board.getRow(__decoy,'close',player_me).cards.includes(__decoy),
        preview: ui.previewCard && ui.previewCard.name, errs: __errs})""")
    page.screenshot(path=SHOTS + '/decoy.png')
    return {"ok": st["inHand"] and st["decoyOnRow"], "info": {"afterHandClick": st1, "elementAtTarget": hit, **st}}

@test
def right_click_board_card(page):
    start_game(page)
    page.evaluate("""(async () => {
        const u = mk('Vesemir', player_me);
        await board.getRow(u, 'close', player_me).addCard(u); window.__target = u;
    })()""")
    page.wait_for_timeout(800)
    x, y, w, h = center(page, '__target.elem')
    page.mouse.click(x, y, button='right')
    page.wait_for_timeout(500)
    st = page.evaluate("({viewing: !!Carousel.curr && Carousel.curr.container.cards[0] === __target, zoom: !document.getElementById('zoom').classList.contains('hide')})")
    return {"ok": st["viewing"] or st["zoom"], "info": st}

@test
def right_click_hand_card(page):
    start_game(page)
    x, y, w, h = center(page, 'player_me.hand.cards[0].elem')
    page.mouse.click(x, y, button='right')
    page.wait_for_timeout(500)
    st = page.evaluate("({viewing: !!Carousel.curr, zoom: !document.getElementById('zoom').classList.contains('hide')})")
    return {"ok": st["viewing"] or st["zoom"], "info": st}

@test
def right_click_during_ai_turn(page):
    start_game(page)
    page.evaluate("""(async () => { const u = mk('Vesemir', player_op); await board.getRow(u, 'close', player_op).addCard(u); window.__target = u; })()""")
    page.wait_for_timeout(600)
    page.evaluate("ui.enablePlayer(false)")  # as during the AI turn
    x, y, w, h = center(page, '__target.elem')
    page.mouse.click(x, y, button='right')
    page.wait_for_timeout(500)
    st = page.evaluate("({viewing: !!Carousel.curr, zoom: !document.getElementById('zoom').classList.contains('hide')})")
    return {"ok": st["viewing"] or st["zoom"], "info": st}

@test
def no_page_scroll(page):
    # 16:10-ish viewport: page must not be scrollable and wheel must not move it
    page.set_viewport_size({"width": 1440, "height": 900})
    page.wait_for_timeout(300)
    st = page.evaluate("({sh: document.scrollingElement.scrollHeight, ch: document.scrollingElement.clientHeight, sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth})")
    page.mouse.move(700, 450)
    page.mouse.wheel(0, 600)
    page.wait_for_timeout(300)
    sy = page.evaluate("window.scrollY + document.scrollingElement.scrollTop")
    start_game(page)
    page.mouse.wheel(0, 600)
    page.wait_for_timeout(300)
    sy2 = page.evaluate("window.scrollY + document.scrollingElement.scrollTop")
    page.screenshot(path=SHOTS + '/viewport_1440x900.png')
    return {"ok": sy == 0 and sy2 == 0 and st["sh"] <= st["ch"] + 1, "info": {**st, "scrollAfterWheel": sy, "inGame": sy2}}

@test
def play_unit_by_clicks(page):
    start_game(page)
    page.evaluate("(() => { const u = mk('Vesemir', player_me); player_me.hand.addCard(u); window.__u = u; })()")
    page.wait_for_timeout(300)
    x, y, w, h = center(page, '__u.elem')
    page.mouse.click(x, y)
    page.wait_for_timeout(300)
    x, y, w, h = center(page, "board.getRow(__u,'close',player_me).elem")
    page.mouse.click(x, y)
    page.wait_for_timeout(2500)
    st = page.evaluate("({onRow: board.getRow(__u,'close',player_me).cards.includes(__u), errs: __errs})")
    return {"ok": st["onRow"], "info": st}

@test
def carousel_wheel_navigation(page):
    # deck menu leader carousel: two-finger scroll should move the selection
    page.click('#card-leader > div')
    page.wait_for_timeout(400)
    i0 = page.evaluate("Carousel.curr.index")
    page.mouse.move(800, 400)
    for _ in range(3):
        page.mouse.wheel(0, 120)
        page.wait_for_timeout(250)
    i1 = page.evaluate("Carousel.curr.index")
    return {"ok": i1 != i0, "info": {"before": i0, "after": i1}}

@test
def deck_lists_scroll_with_wheel(page):
    page.mouse.move(*center(page, "document.getElementById('card-bank')")[:2])
    t0 = page.evaluate("document.getElementById('card-bank').scrollTop")
    page.mouse.wheel(0, 500)
    page.wait_for_timeout(400)
    t1 = page.evaluate("document.getElementById('card-bank').scrollTop")
    return {"ok": t1 > t0, "info": {"before": t0, "after": t1}}

@test
def zoom_closes_without_side_effect(page):
    start_game(page)
    x, y, w, h = center(page, 'player_me.hand.cards[0].elem')
    page.mouse.click(x, y, button='right')
    page.wait_for_timeout(300)
    opened = page.evaluate("!document.getElementById('zoom').classList.contains('hide')")
    page.mouse.click(x, y)              # click on the card under the zoom: must only close it
    page.wait_for_timeout(300)
    st = page.evaluate("({zoom: !document.getElementById('zoom').classList.contains('hide'), preview: ui.previewCard && ui.previewCard.name})")
    return {"ok": opened and not st["zoom"] and st["preview"] is None, "info": {"opened": opened, **st}}

@test
def escape_cancels_selection(page):
    start_game(page)
    x, y, w, h = center(page, 'player_me.hand.cards[0].elem')
    page.mouse.click(x, y)
    page.wait_for_timeout(300)
    sel = page.evaluate("ui.previewCard && ui.previewCard.name")
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)
    after = page.evaluate("ui.previewCard && ui.previewCard.name")
    return {"ok": sel is not None and after is None, "info": {"selected": sel, "after": after}}

@test
def keyboard_carousel(page):
    page.click('#card-leader > div')
    page.wait_for_timeout(400)
    i0 = page.evaluate("Carousel.curr.index")
    page.keyboard.press('ArrowRight'); page.wait_for_timeout(200)
    i1 = page.evaluate("Carousel.curr.index")
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    closed = page.evaluate("!Carousel.curr")
    return {"ok": i1 == i0 + 1 and closed, "info": {"i0": i0, "i1": i1, "closed": closed}}

@test
def ctrl_wheel_no_zoom(page):
    page.mouse.move(700, 400)
    page.keyboard.down('Control'); page.mouse.wheel(0, -300); page.keyboard.up('Control')
    page.wait_for_timeout(300)
    z = page.evaluate("[window.visualViewport.scale, window.devicePixelRatio]")
    return {"ok": z[0] == 1, "info": z}

@test
def leader_activation_by_clicks(page):
    start_game(page)
    x, y, w, h = center(page, "document.querySelector('#leader-me .leader-container')")
    page.mouse.click(x, y); page.wait_for_timeout(500)
    opened = page.evaluate("!!Carousel.curr")
    x, y, w, h = center(page, "document.querySelectorAll('#carousel .card-lg')[2]")
    page.mouse.click(x, y); page.wait_for_timeout(6500)
    st = page.evaluate("({used: !player_me.leaderAvailable, siegeSpecial: board.row[5].special && board.row[5].special.name, specials: board.row.map(r => r.special && r.special.name), round: game.roundCount, mePassed: player_me.passed, opPassed: player_op.passed, siegeElem: board.row[5].elem_special.children.length, horn5: board.row[5].effects.horn, errs: __errs})")
    return {"ok": opened and st["used"], "info": {"opened": opened, **st}}

@test
def medic_by_clicks(page):
    start_game(page)
    page.evaluate("(() => { player_me.grave.addCard(mk('Ves', player_me)); const m = mk('Dun Banner Medic', player_me); player_me.hand.addCard(m); window.__m = m; })()")
    page.wait_for_timeout(300)
    page.mouse.click(*center(page, '__m.elem')[:2]); page.wait_for_timeout(300)
    page.mouse.click(*center(page, "board.getRow(__m,'siege',player_me).elem")[:2]); page.wait_for_timeout(2500)
    opened = page.evaluate("!!Carousel.curr")
    if opened:
        page.mouse.click(*center(page, "document.querySelectorAll('#carousel .card-lg')[2]")[:2]); page.wait_for_timeout(3000)
    st = page.evaluate("({vesOnRow: board.getRow(mk('Ves', player_me),'close',player_me).cards.some(c => c.name === 'Ves'), errs: __errs})")
    return {"ok": opened and st["vesOnRow"], "info": {"carousel": opened, **st}}

@test
def scoiatael_first_choice(page):
    page.evaluate("dm.loadFactionDeck('scoiatael')")
    page.evaluate("Game.prototype.coinToss = Game.prototype.coinToss")
    page.click('#start-game')
    page.wait_for_function('!!Popup.curr', timeout=20000)
    page.wait_for_timeout(300)
    page.mouse.click(*center(page, "document.querySelector('#popup button')")[:2]); page.wait_for_timeout(500)
    st = page.evaluate("({first: game.firstPlayer && game.firstPlayer.tag})")
    return {"ok": st["first"] == "me", "info": st}

results = {}
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--mute-audio"])
    for name, fn in TESTS.items():
        if only and name not in only:
            continue
        ctx = browser.new_context(viewport={"width": 1600, "height": 900})
        page = ctx.new_page()
        page.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
        page.add_init_script("localStorage.clear(); localStorage.setItem('gc-last-faction','realms'); localStorage.setItem('gc-notifications','false');")
        page.goto(f"http://127.0.0.1:{port}/index.html")
        page.wait_for_timeout(400)
        page.evaluate(SETUP)
        try:
            r = fn(page)
        except Exception as e:
            r = {"ok": False, "info": "EXCEPTION " + str(e)[:400]}
        print(("PASS " if r["ok"] else "FAIL ") + name + "  " + json.dumps(r["info"])[:600], flush=True)
        ctx.close()
    browser.close()
httpd.shutdown()
