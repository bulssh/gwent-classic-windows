import threading, functools, http.server, socketserver, json
from playwright.sync_api import sync_playwright
game_dir='game'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
httpd=socketserver.ThreadingTCPServer(("127.0.0.1",0),functools.partial(Q,directory=game_dir)); port=httpd.server_address[1]
threading.Thread(target=httpd.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(args=["--mute-audio"])
    pg=b.new_page(viewport={"width":1920,"height":1080})
    pg.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
    pg.add_init_script("localStorage.setItem('gc-language','fr'); localStorage.setItem('gc-music-offered','1'); localStorage.setItem('gc-notifications','false');")
    pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(1000)
    pg.evaluate("document.getElementById('deck-customization').classList.add('hide')")
    pg.evaluate("document.querySelectorAll('.row-score').forEach((e,i)=>e.textContent=[10,15,11,7,26,0][i])")
    pg.wait_for_timeout(300)
    rects=pg.evaluate("[...document.querySelectorAll('.row-score')].map(e=>{const r=e.getBoundingClientRect();const t=document.createRange();t.selectNodeContents(e);const q=t.getBoundingClientRect();return {box:[r.x,r.y,r.width,r.height],text:[q.x,q.y,q.width,q.height]}})")
    tot=pg.evaluate("[...document.querySelectorAll('.score-total')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})")
    pg.screenshot(path='rowscore.png')
    json.dump({'rows':rects,'tot':tot},open('rowscore.json','w'))
    print(json.dumps(rects)); print(tot)
    b.close()
httpd.shutdown()
