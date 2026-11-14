import sys, threading, functools, http.server, socketserver, json
from playwright.sync_api import sync_playwright
game_dir='game'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
httpd=socketserver.ThreadingTCPServer(("127.0.0.1",0),functools.partial(Q,directory=game_dir)); port=httpd.server_address[1]
threading.Thread(target=httpd.serve_forever,daemon=True).start()
lang=sys.argv[1] if len(sys.argv)>1 else 'fr'
FAKE=json.dumps([
 {"date":"2026-10-20T19:12:00Z","result":"win","difficulty":"normal","me":{"faction":"realms","leader":"Foltest - Lord Commander of the North","name":"Geralt"},"op":{"faction":"nilfgaard","leader":"Emhyr var Emreis - Emperor of Nilfgaard","name":"Emhyr var Emreis"},"rounds":[[0,0],[40,37],[91,78]]},
 {"date":"2026-10-21T20:40:00Z","result":"lose","difficulty":"hard","me":{"faction":"monsters","leader":"Eredin - Commander of the Red Riders","name":"Ciri"},"op":{"faction":"skellige","leader":"Crach an Craite","name":"Crach an Craite"},"rounds":[[55,61],[38,40]]},
 {"date":"2026-10-21T21:05:00Z","result":"draw","difficulty":"easy","me":{"faction":"scoiatael","leader":"Francesca Findabair - Queen of Dol Blathanna","name":"Geralt"},"op":{"faction":"realms","leader":"Foltest - The Siegemaster","name":"Foltest"},"rounds":[[50,50],[30,30]]}
])
with sync_playwright() as p:
    b=p.chromium.launch(args=["--mute-audio"])
    pg=b.new_page(viewport={"width":1920,"height":1080})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)+" @ "+str(e.stack)[:600]))
    pg.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
    pg.add_init_script(f"localStorage.setItem('gc-language','{lang}'); localStorage.setItem('gc-last-faction','realms'); localStorage.setItem('gc-music-offered','1'); localStorage.setItem('gc-notifications','false'); if(!sessionStorage.getItem('x')){{localStorage.setItem('gc-history', {json.dumps(FAKE)}); sessionStorage.setItem('x','1');}}")
    pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(1200)
    pg.evaluate("Game.prototype.coinToss = async function(){ if(!this.firstPlayer) this.firstPlayer = player_me; }")
    pg.keyboard.press('Enter'); pg.wait_for_timeout(4000)
    pg.evaluate("Carousel.curr && Carousel.curr.cancel()")
    pg.wait_for_function("ui.canPass()", timeout=20000)
    # short press: no pass
    pg.keyboard.down('Space'); pg.wait_for_timeout(300); pg.keyboard.up('Space'); pg.wait_for_timeout(300)
    short=pg.evaluate("player_me.passed")
    pg.keyboard.down('Space'); pg.wait_for_timeout(450)
    pg.screenshot(path='pass_hold.png', clip={"x":1500,"y":980,"width":420,"height":100})
    pg.wait_for_timeout(700); pg.keyboard.up('Space'); pg.wait_for_timeout(300)
    longp=pg.evaluate("player_me.passed")
    # leave the game: recorded as abandoned
    pg.wait_for_timeout(1500)
    pg.evaluate("game.exitGame()"); pg.wait_for_timeout(400)
    pg.evaluate("Popup.curr.selectNo()"); pg.wait_for_timeout(800)
    n=pg.evaluate("History.games.length"); last=pg.evaluate("History.games.at(-1)")
    pg.click('#open-history'); pg.wait_for_timeout(500)
    pg.screenshot(path=f'history_{lang}.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    print('short press passed', short, 'long press passed', longp, 'history', n, json.dumps(last)[:300], 'open after esc', pg.evaluate("History.isOpen()"), 'errors', errs)
    b.close()
httpd.shutdown()
