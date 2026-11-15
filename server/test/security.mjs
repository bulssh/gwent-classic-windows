// Security tests of the matchmaking server: a third party who knows the room code cannot take a
// player's seat, and a flooding client is disconnected.
// Usage: npm run dev (other terminal), then: node test/security.mjs [http://127.0.0.1:8787]
const base = (process.argv[2] || "http://127.0.0.1:8787").replace(/^http/, "ws");
let failed = 0;
const check = (name, ok, detail = "") => {
	console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  " + detail : ""));
	if (!ok) failed++;
};

function connect(code, query) {
	return new Promise(resolve => {
		const ws = new WebSocket(`${base}/room/${code}?${query}`);
		const out = {ws, messages: [], closed: null};
		ws.onmessage = e => {
			const m = JSON.parse(e.data);
			out.messages.push(m);
			if (m.t === "joined" || m.t === "error")
				resolve(out);
		};
		ws.onclose = e => { out.closed = e.code; resolve(out); };
	});
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const code = Array.from({length: 6}, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");

const host = await connect(code, "role=host");
const hostKey = host.messages[0]?.key;
check("host gets a seat key", /^[0-9a-f-]{36}$/.test(hostKey || ""));
const guest = await connect(code, "role=guest");
const guestKey = guest.messages[0]?.key;
check("guest gets a different seat key", /^[0-9a-f-]{36}$/.test(guestKey || "") && guestKey !== hostKey);

let r = await connect(code, "role=host");
check("second host refused", r.messages[0]?.reason === "code-in-use");
r = await connect(code, "role=guest");
check("third player refused", r.messages[0]?.reason === "room-full");
r = await connect(code, "role=guest&rejoin=1");
check("rejoin without key refused", r.messages[0]?.reason === "bad-key");
r = await connect(code, "role=host&rejoin=1&key=" + guestKey);
check("rejoin with the other player's key refused", r.messages[0]?.reason === "bad-key");
check("players still connected", host.ws.readyState === 1 && guest.ws.readyState === 1);

// the real guest comes back with its key: its old connection is replaced
const back = await connect(code, "role=guest&rejoin=1&key=" + guestKey);
check("rejoin with own key accepted", back.messages[0]?.t === "joined");
for (let i = 0; i < 30 && guest.closed === null; i++)
	await sleep(100);
check("old connection replaced", guest.closed === 4001 || guest.ws.readyState >= 2, "close code " + guest.closed);

// flood: far more messages than a game sends
for (let i = 0; i < 400; i++)
	back.ws.send(JSON.stringify({t: "x", i}));
await sleep(1000);
check("flooding client disconnected", back.closed === 4003, "close code " + back.closed);

// the guest left on purpose: a new guest can take the seat
host.ws.close(1000);
await sleep(300);
const code2 = code.slice(0, 5) + (code[5] === "Z" ? "Y" : "Z");
const h2 = await connect(code2, "role=host");
const g2 = await connect(code2, "role=guest");
g2.ws.close(1000);
await sleep(300);
const g3 = await connect(code2, "role=guest");
check("seat freed after a normal leave", g3.messages[0]?.t === "joined");
h2.ws.close(1000); g3.ws.close(1000);
await sleep(200);
process.exit(failed ? 1 : 0);
