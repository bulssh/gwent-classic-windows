import sys, threading, functools, http.server, socketserver, base64, json
from playwright.sync_api import sync_playwright
game_dir='game'
tone=base64.b64encode(open('ogg/tone.ogg','rb').read()).decode()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
httpd=socketserver.ThreadingTCPServer(("127.0.0.1",0),functools.partial(Q,directory=game_dir)); port=httpd.server_address[1]
threading.Thread(target=httpd.serve_forever,daemon=True).start()
MOCK = """
(() => {
  const tone = Uint8Array.from(atob('%s'), c => c.charCodeAt(0));
  const files = new Map(JSON.parse(localStorage.getItem('__files') || '[]').map(n => [n, tone]));
  window.__calls = [];
  window.__TAURI__ = {
    core: { invoke: async (cmd, args, opts) => {
      window.__calls.push(cmd);
      switch (cmd) {
        case 'music_list': return [...files.keys()].map(name => ({name, size: 1}));
        case 'music_read': return tone.buffer.slice(0);
        case 'music_write': files.set(opts.headers['x-name'], args); return null;
        case 'music_clear': files.clear(); return null;
        case 'tw3_find': return window.__tw3 || null;
        case 'tw3_sound_index': return [];
        case 'music_open_folder': return null;
        default: throw 'unknown ' + cmd;
      }
    }},
    dialog: { open: async () => null, save: async () => null },
  };
})();
""" % tone
def run(scenario, setup_js):
    with sync_playwright() as p:
        b=p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required","--mute-audio"])
        pg=b.new_page(viewport={"width":1600,"height":900})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        pg.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
        pg.add_init_script("localStorage.setItem('gc-language','fr');" + setup_js)
        pg.add_init_script(MOCK)
        pg.goto(f"http://127.0.0.1:{port}/index.html"); pg.wait_for_timeout(1500)
        res={}
        res['mode']=pg.evaluate("Music.mode"); res['tracks']=pg.evaluate("Music.tracks")
        res['calls']=pg.evaluate("window.__calls")
        res['popup']=pg.evaluate("Popup.curr ? document.getElementById('popup').innerText : null")
        if res['popup']:
            pg.screenshot(path=f'mus_{scenario}_popup.png')
            pg.evaluate("Popup.curr.selectNo ? Popup.curr.selectNo() : document.querySelectorAll('#popup button')[1].click()")
            pg.wait_for_timeout(500)
        # hover music button
        pg.hover('#toggle-music'); pg.wait_for_timeout(500)
        res['panel']=pg.evaluate("(() => { const p=document.getElementById('volume-music'); return {closed: p.classList.contains('closed'), text: p.innerText}; })()")
        pg.screenshot(path=f'mus_{scenario}.png')
        # wheel on the button lowers the volume
        v0=pg.evaluate("parseFloat(document.querySelector('#volume-music input').value)")
        pg.mouse.wheel(0, 100); pg.wait_for_timeout(200)
        res['wheel']=[v0, pg.evaluate("parseFloat(document.querySelector('#volume-music input').value)")]
        if res['mode']=='local':
            res['playing']=pg.evaluate("[Music.playing, Music.position]")
            pg.click('#toggle-music'); pg.wait_for_timeout(700)
            res['afterToggle']=pg.evaluate("[Music.playing, Settings.music.isEnabled(), document.getElementById('toggle-music').classList.contains('fade')]")
            pg.click('#toggle-music'); pg.wait_for_timeout(700)
            res['afterToggle2']=pg.evaluate("[Music.playing, Settings.music.isEnabled(), document.getElementById('toggle-music').classList.contains('fade')]")
        pg.mouse.move(5,5); pg.wait_for_timeout(700)
        res['panelAfterLeave']=pg.evaluate("document.getElementById('volume-music').classList.contains('closed')")
        pg.hover('#toggle-sfx'); pg.wait_for_timeout(400)
        res['sfx']=pg.evaluate("document.getElementById('volume-sfx').innerText")
        res['errors']=errs
        print(scenario, json.dumps(res, ensure_ascii=False, indent=1))
        b.close()
run('local', "localStorage.setItem('__files', JSON.stringify(['gwynt-novigrad-1.ogg','gwynt-skellige-2.ogg']));")
httpd.shutdown()
