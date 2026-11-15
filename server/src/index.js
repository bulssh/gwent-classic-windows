// Gwent Classic - matchmaking ("signalling") server for the online 1v1 mode.
//
// One Durable Object per room, named by its 6-character code. The two players connect to it with
// a WebSocket (wss://<worker>/room/<CODE>?role=host|guest). The room only forwards messages from
// one player to the other:
//   - the WebRTC handshake (offer, answer, ICE candidates), after which the game runs directly
//     between the two computers (DataChannel) and nothing goes through this server any more;
//   - the game messages themselves, only when no direct connection is possible (both players
//     behind strict NATs or firewalls blocking UDP): the room is then a relay.
// Idle WebSockets use the Hibernation API: an open but silent connection costs nothing on the
// Workers Free plan. Nothing is stored except the creation time of the room and one random key per
// player (needed to come back after a network drop), all deleted when the room closes.

import { DurableObject } from "cloudflare:workers";

const CODE = /^[A-HJ-NP-Z2-9]{6}$/;      // no I, O, 0, 1 (easy to mistype)
const ROLES = ["host", "guest"];
const MAX_MESSAGE = 64 * 1024;           // a game message is a few hundred bytes
const ROOM_LIFETIME = 6 * 3600 * 1000;   // a room is closed after 6 hours whatever happens
const HOST_WAIT = 30 * 60 * 1000;        // a room nobody joined is closed after 30 minutes
const EMPTY_GRACE = 2 * 60 * 1000;      // a room left empty by network drops is kept this long
const SEAT_RELEASE = 60 * 1000;           // a guest who vanished without leaving keeps his seat this long
const KEY = /^[0-9a-f-]{36}$/;            // per-player secret given on the first connection
const FLOOD_WINDOW = 10 * 1000;           // a player sending more than FLOOD_MAX messages
const FLOOD_MAX = 300;                    // in FLOOD_WINDOW is disconnected (a game sends a few per second)

const json = (data, status = 200) => new Response(JSON.stringify(data), {
	status,
	headers: {"content-type": "application/json", "access-control-allow-origin": "*"},
});

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname === "/" || url.pathname === "/health")
			return json({service: "gwent-classic-signal", ok: true});
		const match = url.pathname.match(/^\/room\/([A-Za-z0-9]{6})$/);
		if (!match)
			return json({error: "not found"}, 404);
		const code = match[1].toUpperCase();
		if (!CODE.test(code))
			return json({error: "bad code"}, 400);
		if (request.headers.get("Upgrade") !== "websocket")
			return json({error: "websocket expected"}, 426);
		const role = url.searchParams.get("role");
		if (!ROLES.includes(role))
			return json({error: "bad role"}, 400);
		const room = env.ROOMS.get(env.ROOMS.idFromName(code));
		return room.fetch(request);
	},
};

export class Room extends DurableObject {
	constructor(ctx, env) {
		super(ctx, env);
		// answer the keep-alive pings without waking the object up
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
	}

	async fetch(request) {
		const url = new URL(request.url);
		const role = url.searchParams.get("role");
		const rejoin = url.searchParams.get("rejoin") === "1";
		const other = role === "host" ? "guest" : "host";
		const mine = this.ctx.getWebSockets(role);
		const theirs = this.ctx.getWebSockets(other);

		// refusals are sent through an accepted WebSocket so that the client can read the reason
		const refuse = reason => {
			const pair = new WebSocketPair();
			pair[1].accept();
			pair[1].send(JSON.stringify({t: "error", reason}));
			pair[1].close(4000, reason);
			return new Response(null, {status: 101, webSocket: pair[0]});
		};

		let created = await this.ctx.storage.get("created");
		const alive = created && Date.now() - created <= ROOM_LIFETIME;
		let key;
		if (rejoin) {
			// coming back: only the player who received this seat's key can take it again, so knowing
			// the room code is not enough to replace a player and read or forge his messages
			const given = url.searchParams.get("key") || "";
			key = alive && await this.ctx.storage.get("key:" + role);
			if (!key)
				return refuse("no-room");
			if (!KEY.test(given) || given !== key)
				return refuse("bad-key");
		} else if (role === "host") {
			if (mine.length || theirs.length || (alive && await this.ctx.storage.get("key:host")))
				return refuse("code-in-use");
			await this.ctx.storage.deleteAll();
			created = Date.now();
			key = crypto.randomUUID();
			await this.ctx.storage.put({created, "key:host": key});
		} else {
			if (!alive || !this.ctx.getWebSockets("host").length)
				return refuse("no-room");
			// the seat is free if the previous guest left on purpose, or vanished more than a minute ago
			const gone = await this.ctx.storage.get("guestGone");
			if (mine.length || (await this.ctx.storage.get("key:guest") && !(gone && Date.now() - gone > SEAT_RELEASE)))
				return refuse("room-full");
			key = crypto.randomUUID();
			await this.ctx.storage.put("key:guest", key);
			await this.ctx.storage.delete("guestGone");
		}

		// a player coming back (network change, direct link lost) replaces its old connection
		for (const ws of mine)
			ws.close(4001, "replaced");

		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1], [role]);
		pair[1].send(JSON.stringify({t: "joined", role, key, peer: theirs.length > 0}));
		for (const ws of theirs)
			ws.send(JSON.stringify({t: "peer", present: true, rejoin}));
		// end of life of the room (also cancels the short grace period of a room left empty)
		const hasGuest = role === "guest" || await this.ctx.storage.get("key:guest");
		await this.ctx.storage.setAlarm(created + (hasGuest ? ROOM_LIFETIME : HOST_WAIT));
		return new Response(null, {status: 101, webSocket: pair[0]});
	}

	// forwards a message to the other player, as is
	async webSocketMessage(ws, message) {
		if (typeof message !== "string" || message.length > MAX_MESSAGE)
			return;
		// flood guard (counters live in memory: they restart when the object hibernates, which only
		// happens when the room is quiet)
		const now = Date.now();
		this.flood ??= new Map();
		const f = this.flood.get(ws);
		if (!f || now - f.since > FLOOD_WINDOW)
			this.flood.set(ws, {since: now, count: 1});
		else if (++f.count > FLOOD_MAX) {
			this.flood.delete(ws);
			try { ws.close(4003, "flood"); } catch (e) {}
			return;
		}
		const role = this.ctx.getTags(ws)[0];
		const other = role === "host" ? "guest" : "host";
		for (const peer of this.ctx.getWebSockets(other))
			peer.send(message);
	}

	async webSocketClose(ws, code) {
		this.flood?.delete(ws);
		const role = this.ctx.getTags(ws)[0];
		const other = role === "host" ? "guest" : "host";
		if (code !== 4001) {
			for (const peer of this.ctx.getWebSockets(other))
				peer.send(JSON.stringify({t: "peer", present: false}));
			// a guest who closed normally left the room: his seat is free again; after a network
			// drop he keeps it for a while to come back
			if (role === "guest") {
				if (code === 1000 || code === 1005)
					await this.ctx.storage.delete("key:guest");
				else
					await this.ctx.storage.put("guestGone", Date.now());
			}
		}
		try { ws.close(1000, "bye"); } catch (e) {}
		if (this.ctx.getWebSockets().filter(s => s !== ws).length === 0) {
			if (code === 1000 || code === 1005) {
				// the last player left on purpose: the room disappears (the code can be used again)
				await this.ctx.storage.deleteAlarm();
				await this.ctx.storage.deleteAll();
			} else {
				// lost connection: the players have a little time to come back with their keys
				await this.ctx.storage.setAlarm(Date.now() + EMPTY_GRACE);
			}
		}
	}

	async webSocketError(ws) {
		await this.webSocketClose(ws, 1011);
	}

	// end of life of the room
	async alarm() {
		for (const ws of this.ctx.getWebSockets()) {
			try { ws.send(JSON.stringify({t: "error", reason: "expired"})); } catch (e) {}
			try { ws.close(4002, "expired"); } catch (e) {}
		}
		await this.ctx.storage.deleteAll();
	}
}
