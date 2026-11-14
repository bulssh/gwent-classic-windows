import sys, threading, functools, http.server, socketserver, json
from playwright.sync_api import sync_playwright
game_dir='game'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
h=socketserver.ThreadingTCPServer(("127.0.0.1",0),functools.partial(Q,directory=game_dir)); port=h.server_address[1]
threading.Thread(target=h.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(args=["--mute-audio","--autoplay-policy=no-user-gesture-required"])
    pg=b.new_page(viewport={"width":1600,"height":900})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
    pg.add_init_script("localStorage.setItem('gc-language','fr'); localStorage.setItem('gc-notifications','true'); localStorage.setItem('gc-last-faction','realms');")
    pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(800)
    pg.mouse.click(5,5)
    pg.evaluate("Game.prototype.coinToss = async function () { if (!this.firstPlayer) { this.firstPlayer = player_me; await ui.notification('me-coin', 1200);} }; document.getElementById('start-game').click(); 0")
    pg.wait_for_timeout(450); pg.screenshot(path='fx_coin.png', clip={"x":300,"y":330,"width":1000,"height":240})
    pg.wait_for_function("!!Carousel.curr", timeout=20000); pg.wait_for_timeout(600)
    # carousel slide mid-animation
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(110); pg.screenshot(path='fx_carousel_mid.png')
    pg.wait_for_timeout(400); pg.screenshot(path='fx_carousel_end.png')
    pg.evaluate("Carousel.curr.cancel()"); pg.wait_for_timeout(500)
    pg.wait_for_function("game.currPlayer === player_me && !document.querySelector('main').classList.contains('noclick')", timeout=30000)
    pg.wait_for_timeout(800)
    # play a unit card: click a hand card, then its row
    idx = pg.evaluate("player_me.hand.cards.findIndex(c => c.isUnit() && !c.isHero() && !c.abilities.includes('spy') && c.row !== 'agile')")
    pg.evaluate(f"player_me.hand.cards[{idx}].elem.click()"); pg.wait_for_timeout(400)
    pg.screenshot(path='fx_preview.png')
    row = pg.evaluate(f"(() => {{ const c = player_me.hand.cards[{idx}]; return board.getRow(c, c.row, player_me).elem.getBoundingClientRect().toJSON(); }})()")
    pg.mouse.click(row['x']+row['width']/2, row['y']+row['height']/2)
    pg.wait_for_timeout(230); pg.screenshot(path='fx_fly_mid.png')
    pg.wait_for_timeout(380); pg.screenshot(path='fx_land.png')
    pg.wait_for_timeout(250); pg.screenshot(path='fx_land2.png')
    # opponent turn: wait for its preview and its flight
    pg.wait_for_function("ui.previewCard && game.currPlayer === player_op", timeout=30000)
    pg.wait_for_timeout(500); pg.screenshot(path='fx_op_preview.png')
    pg.wait_for_function("!ui.previewCard", timeout=10000); pg.wait_for_timeout(200); pg.screenshot(path='fx_op_fly.png')
    # horn + hero effects forced
    pg.evaluate("(() => { const r = board.row[3]; const horn = new Card(card_dict[5], player_me); r.addCard(horn); })()")
    pg.wait_for_timeout(900); pg.screenshot(path='fx_horn.png')
    pg.evaluate("(() => { const g = card_dict.findIndex(c => c.name === 'Geralt of Rivia'); const c = new Card(card_dict[g], player_me); board.row[3].addCard(c); })()")
    pg.wait_for_timeout(250); pg.screenshot(path='fx_hero.png')
    # gem shatter
    pg.evaluate("FX.shatterGem(document.getElementById('gem2-me'))")
    pg.wait_for_timeout(200); pg.screenshot(path='fx_gem_crack.png', clip={"x":150,"y":540,"width":250,"height":120})
    pg.wait_for_timeout(330); pg.screenshot(path='fx_gem_shards.png', clip={"x":150,"y":540,"width":250,"height":120})
    pg.wait_for_timeout(700); pg.screenshot(path='fx_gem_end.png', clip={"x":150,"y":540,"width":250,"height":120})
    print('errors', errs)
    b.close()
h.shutdown()
