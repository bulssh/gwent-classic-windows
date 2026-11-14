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
    pg=b.new_page(viewport={"width":1600,"height":900})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
    pg.add_init_script(f"localStorage.setItem('gc-language','{lang}'); localStorage.setItem('gc-last-faction','realms'); localStorage.setItem('gc-music-offered','1');")
    pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'd2_{lang}.png')
    pg.click('#card-bank-head .list-filter[data-filter="ranged"]'); pg.wait_for_timeout(400)
    pg.click('#card-deck-head .list-filter[data-filter="hero"]'); pg.wait_for_timeout(400)
    pg.hover('#card-bank .card-lg:not(.hide)'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'd2_{lang}_filters.png')
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(90)
    pg.screenshot(path=f'd2_{lang}_fadeout.png')
    pg.wait_for_timeout(200)
    pg.screenshot(path=f'd2_{lang}_fadein.png')
    pg.wait_for_timeout(600)
    pg.keyboard.press('ArrowRight'); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(800)
    f=pg.evaluate("dm.faction")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    pg.screenshot(path=f'd2_{lang}_options.png')
    pg.hover('.opt-char:nth-child(5)'); pg.wait_for_timeout(200)
    pg.click('.opt-char:nth-child(5)'); pg.wait_for_timeout(200)
    ch=pg.evaluate("localStorage.getItem('gc-character')")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    opened=pg.evaluate("Options.isOpen()")
    print('faction', f, 'char', ch, 'options open after esc', opened, 'errors', errs)
    b.close()
httpd.shutdown()
