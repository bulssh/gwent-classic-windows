import sys, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright
game_dir='game'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
httpd=socketserver.ThreadingTCPServer(("127.0.0.1",0),functools.partial(Q,directory=game_dir)); port=httpd.server_address[1]
threading.Thread(target=httpd.serve_forever,daemon=True).start()
lang=sys.argv[1] if len(sys.argv)>1 else 'fr'
with sync_playwright() as p:
    b=p.chromium.launch(args=["--mute-audio"])
    pg=b.new_page(viewport={"width":1920,"height":1080})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
    pg.add_init_script(f"localStorage.setItem('gc-language','{lang}'); localStorage.setItem('gc-last-faction','realms'); localStorage.setItem('gc-music-offered','1'); localStorage.setItem('gc-notifications','false');")
    pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(1200)
    pg.screenshot(path=f'ig2_deck_{lang}.png', clip={"x":1500,"y":0,"width":420,"height":120})
    pg.evaluate("Game.prototype.coinToss = async function(){ if(!this.firstPlayer) this.firstPlayer = player_me; }")
    pg.keyboard.press('Enter'); pg.wait_for_timeout(4500)
    pg.mouse.move(100, 1000)
    pg.screenshot(path=f'ig2_redraw_{lang}.png')
    # go to the edge of the carousel: empty places
    for i in range(4): pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(120)
    pg.wait_for_timeout(400)
    pg.screenshot(path=f'ig2_redraw_edge_{lang}.png')
    pg.evaluate("Carousel.curr && Carousel.curr.cancel()"); pg.wait_for_timeout(2500)
    # play two cards by script to get boosted/nerfed values
    pg.evaluate("""(async () => {
      const units = player_me.hand.cards.filter(c => c.isUnit());
      for (const c of units.slice(0,3)) { await board.toRow(c, player_me.hand); }
    })()""")
    pg.wait_for_timeout(4000)
    pg.evaluate("""(() => { const cs = board.row.flatMap(r => r.cards).filter(c => c.isUnit() && c.holder === player_me);
       if (cs[0]) cs[0].setPower(cs[0].basePower * 2); if (cs[1]) cs[1].setPower(1); player_op.setPassed(true); player_me.setPassed(true); })()""")
    pg.wait_for_timeout(500)
    pg.mouse.move(100, 1000)
    pg.screenshot(path=f'ig2_board_{lang}.png')
    print('canPass', pg.evaluate("ui.canPass()"), 'errors', errs)
    b.close()
httpd.shutdown()
