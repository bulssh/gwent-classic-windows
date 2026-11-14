import threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright
from PIL import Image
game_dir='game'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
h=socketserver.ThreadingTCPServer(("127.0.0.1",0),functools.partial(Q,directory=game_dir)); port=h.server_address[1]
threading.Thread(target=h.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(args=["--mute-audio"])
    pg=b.new_page(viewport={"width":1600,"height":900}, device_scale_factor=2)
    pg.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
    pg.add_init_script("localStorage.setItem('gc-language','fr'); localStorage.setItem('gc-notifications','false');")
    pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(800)
    pg.evaluate("Game.prototype.coinToss = async function () { this.firstPlayer = player_me; }; document.getElementById('start-game').click(); 0")
    pg.wait_for_function("!!Carousel.curr", timeout=20000); pg.evaluate("Carousel.curr.cancel()"); pg.wait_for_timeout(2500)
    pg.evaluate("FX.shatterGem(document.getElementById('gem2-me'))")
    frames=[]
    pg.wait_for_timeout(150); pg.screenshot(path='g.png', clip={"x":220,"y":545,"width":140,"height":90}); frames.append(Image.open('g.png').copy())
    pg.wait_for_timeout(260)
    pg.evaluate("window.__an = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('gem-shard')); window.__an.forEach(a => a.pause()); window.__an.length")
    print(pg.evaluate("[...document.querySelectorAll('.gem-shards, .gem-shard')].map(e => [e.className, e.offsetLeft, e.offsetTop, e.offsetWidth, e.offsetHeight, getComputedStyle(e).top, getComputedStyle(e).height, getComputedStyle(e).marginBottom])"))
    print(pg.evaluate("(() => { const g = document.getElementById('gem2-me'); const r = g.getBoundingClientRect(); return [r.x, r.y, r.width, r.height, getComputedStyle(g).position, getComputedStyle(g.querySelector('.gem-shards')).position]; })()"))
    for t in [0, 120, 250, 400, 600, 800]:
        pg.evaluate(f"window.__an.forEach(a => a.currentTime = {t})"); pg.wait_for_timeout(50)
        pg.screenshot(path='g.png', clip={"x":220,"y":545,"width":140,"height":90}); frames.append(Image.open('g.png').copy())
    W,H=frames[0].size; c=Image.new('RGB',(W*len(frames),H))
    for i,f in enumerate(frames): c.paste(f,(i*W,0))
    c.save('gem_frames.png')
    b.close()
h.shutdown()
