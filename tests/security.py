"""Security regression tests: text coming from the network or from a file never becomes markup.
Usage: python3 tests/security.py game"""
import sys, json, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

game_dir = sys.argv[1] if len(sys.argv) > 1 else "game"

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=game_dir))
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

PAYLOAD = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>'
CHECK = r"""
async payload => {
	window.__pwned = 0;
	ui.message("version " + payload, payload);
	await new Promise(r => setTimeout(r, 500));
	const popup = document.getElementById("popup");
	const res = {pwned: window.__pwned, tags: popup.querySelectorAll("img, script").length,
		text: popup.querySelector("p").textContent.slice(0, 40),
		br: safeHTML("a<br>b <b>c</b>")};
	Popup.curr && Popup.curr.selectYes();
	return res;
}
"""
ok = True
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--mute-audio"])
    page = browser.new_page()
    page.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
    page.goto(f"http://127.0.0.1:{port}/index.html")
    page.wait_for_timeout(500)
    r = page.evaluate(CHECK, PAYLOAD)
    passed = r["pwned"] == 0 and r["tags"] == 0 and r["br"] == "a<br>b <b>c</b>"
    ok &= passed
    print(("PASS " if passed else "FAIL ") + "popup_escapes_markup  " + json.dumps(r))
    browser.close()
httpd.shutdown()
sys.exit(0 if ok else 1)
