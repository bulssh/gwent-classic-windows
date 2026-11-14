import sys, threading, functools, http.server, socketserver, json
from playwright.sync_api import sync_playwright
game_dir='game'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
httpd=socketserver.ThreadingTCPServer(("127.0.0.1",0),functools.partial(Q,directory=game_dir)); port=httpd.server_address[1]
threading.Thread(target=httpd.serve_forever,daemon=True).start()
MOCK="""
window.__calls = [];
window.__TAURI__ = {core: {invoke: async (cmd, args, opts) => { window.__calls.push([cmd, args]);
  if (cmd === 'music_list') return []; if (cmd === 'tw3_find') return null; return null; }},
  window: {getCurrentWindow: () => ({isFullscreen: async () => true})}, dialog: {open: async () => null, save: async () => null}};
localStorage.setItem('gc-language','fr'); localStorage.setItem('gc-music-offered','1');
"""
with sync_playwright() as p:
    b=p.chromium.launch(args=["--mute-audio"])
    pg=b.new_page(viewport={"width":1600,"height":900})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
    pg.add_init_script(MOCK)
    pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(1200)
    print('initial mode', pg.evaluate("Options.displayMode"), pg.evaluate("__calls.filter(c=>c[0]==='set_display_mode')"))
    pg.click('#open-options'); pg.wait_for_timeout(400)
    pg.screenshot(path='mock_options.png')
    pg.click('[data-seg="display"] button:nth-child(2)'); pg.wait_for_timeout(200)
    print('after borderless', pg.evaluate("[Options.displayMode, localStorage.getItem('gc-display')]"), pg.evaluate("__calls.filter(c=>c[0]==='set_display_mode')"))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.keyboard.press('F11'); pg.wait_for_timeout(200)
    print('after F11', pg.evaluate("Options.displayMode"))
    pg.keyboard.press('F11'); pg.wait_for_timeout(200)
    print('after F11 x2', pg.evaluate("Options.displayMode"))
    pg.click('#quit-app'); pg.wait_for_timeout(500)
    pg.screenshot(path='mock_quit.png')
    pg.click('#popup button'); pg.wait_for_timeout(300)
    print('quit calls', pg.evaluate("__calls.filter(c=>c[0]==='quit_app').length"), 'errors', errs)
    b.close()
httpd.shutdown()
