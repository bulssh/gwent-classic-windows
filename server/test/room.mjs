// Protocol test of the room (run against `wrangler dev`)
const base = process.argv[2] || "ws://127.0.0.1:8787";
const open = (code, role, extra = "") => new Promise((resolve) => {
	const ws = new WebSocket(`${base}/room/${code}?role=${role}${extra}`);
	const msgs = [];
	ws.onmessage = e => msgs.push(JSON.parse(e.data));
	ws.onopen = () => setTimeout(() => resolve({ws, msgs}), 150);
	ws.onerror = e => resolve({ws, msgs, error: String(e.message || e.type)});
});
const wait = ms => new Promise(r => setTimeout(r, ms));
const code = "AB" + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[IO01]/g, "X");
const results = {};
const noRoom = await open(code, "guest"); await wait(150); results.guestBeforeHost = noRoom.msgs;
const host = await open(code, "host"); results.hostJoined = host.msgs[0];
const host2 = await open(code, "host"); await wait(150); results.secondHost = host2.msgs;
const guest = await open(code, "guest"); await wait(150);
results.guestJoined = guest.msgs[0]; results.hostSawPeer = host.msgs.at(-1);
guest.ws.send(JSON.stringify({t: "signal", data: {sdp: "x"}})); host.ws.send(JSON.stringify({t: "relay", data: {seq: 1}}));
await wait(200);
results.hostGot = host.msgs.at(-1); results.guestGot = guest.msgs.at(-1);
const third = await open(code, "guest"); await wait(150); results.thirdGuest = third.msgs;
// ping auto-response
host.ws.send('{"t":"ping"}'); await wait(150); results.pong = host.msgs.at(-1);
// guest rejoins (replaces its connection)
const guest2 = await open(code, "guest", "&rejoin=1"); await wait(200);
results.rejoin = guest2.msgs[0]; results.hostAfterRejoin = host.msgs.at(-1);
guest2.ws.close(); await wait(300); results.hostAfterLeave = host.msgs.at(-1);
host.ws.close(); await wait(300);
const reuse = await open(code, "host"); results.codeReusable = reuse.msgs[0]; reuse.ws.close();
console.log(JSON.stringify(results, null, 1));
process.exit(0);
