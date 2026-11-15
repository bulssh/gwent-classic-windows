"use strict"

// Network link of the online 1v1 mode.
//  - matchmaking: a WebSocket to the room <code> of the Cloudflare Worker (see gwent-signal/)
//  - game messages: a WebRTC DataChannel straight between the two computers (STUN only),
//    or, when no direct path exists (strict NAT, UDP blocked), through the same WebSocket used as a
//    relay. The switch is automatic, also in the middle of a game.
//  - every game message carries a sequence number: nothing is lost or applied twice when the link
//    changes (each side asks the other to resend what it missed).
// Loaded before online.js.

const Net = (() => {

	const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no I, O, 0, 1
	const ICE_SERVERS = [
		{urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]},
	];
	const DIRECT_TIMEOUT = 9000;       // no direct link after this: relay
	const PING_EVERY = 4000;
	const LINK_TIMEOUT = 14000;        // nothing received for this long: the link is dead
	const PEER_GONE_AFTER = 45000;     // the other player is considered gone after this

	let url = "";                      // base URL of the Worker (wss://...)
	let code = null, role = null;
	let seatKey = "";                  // secret given by the room on the first connection, needed to come back
	let ws = null, wsAlive = false, wsClosing = false, wsRetry = 0;
	let pc = null, dc = null;
	let transport = "none";            // "p2p" | "relay" | "none"
	let peerPresent = false;           // the other player is there (room or direct link)
	let peerOnSocket = false;          // ... and connected to the room
	let directTimer = null, pingTimer = null;
	let lastHeard = 0, peerLostAt = 0;
	let seqOut = 0, lastIn = 0;
	const sent = [];                   // messages sent (resent after a change of link)
	const listeners = {};
	let rtcAvailable = typeof RTCPeerConnection === "function";

	const emit = (event, data) => (listeners[event] || []).forEach(f => { try { f(data); } catch (e) { console.error(e); } });
	const on = (event, f) => (listeners[event] = listeners[event] || []).push(f);

	function randomCode() {
		const bytes = new Uint8Array(6);
		crypto.getRandomValues(bytes);
		return [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join("");
	}

	function normalizeCode(text) {
		return String(text || "").toUpperCase().split("").filter(c => ALPHABET.includes(c)).join("").slice(0, 6);
	}

	function wsURL(rejoin) {
		let base = url.trim().replace(/\/+$/, "");
		if (/^https?:/i.test(base))
			base = base.replace(/^http/i, "ws");
		else if (!/^wss?:/i.test(base))
			base = "wss://" + base;
		// unencrypted connections only to a server on this computer (development)
		if (/^ws:/i.test(base) && !/^ws:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(base))
			base = base.replace(/^ws:/i, "wss:");
		return base + "/room/" + code + "?role=" + role + (rejoin ? "&rejoin=1&key=" + encodeURIComponent(seatKey) : "");
	}

	function setTransport(t) {
		if (transport === t)
			return;
		transport = t;
		emit("transport", t);
		// the other side may have missed messages while the link changed
		if (t !== "none")
			control({t: "sync", last: lastIn});
	}

	// ---------- WebSocket to the room ----------

	function openSocket(rejoin) {
		return new Promise((resolve, reject) => {
			let settled = false;
			const socket = new WebSocket(wsURL(rejoin));
			ws = socket;
			wsClosing = false;
			const timeout = setTimeout(() => {
				if (!settled) {
					settled = true;
					try { socket.close(); } catch (e) {}
					reject(new Error("timeout"));
				}
			}, 10000);
			socket.onmessage = e => {
				let m;
				try { m = JSON.parse(e.data); } catch (err) { return; }
				if (m.t === "error") {
					if (!settled) {
						settled = true;
						clearTimeout(timeout);
						reject(new Error(m.reason));
					} else
						emit("error", m.reason);
					return;
				}
				if (m.t === "joined") {
					if (typeof m.key === "string")
						seatKey = m.key;
					settled = true;
					clearTimeout(timeout);
					wsAlive = true;
					wsRetry = 0;
					resolve(m);
					if (m.peer)
						peerArrived(rejoin);
					return;
				}
				onSocketMessage(m);
			};
			socket.onerror = () => {
				if (!settled) {
					settled = true;
					clearTimeout(timeout);
					reject(new Error("network"));
				}
			};
			socket.onclose = () => {
				if (ws !== socket)
					return;
				wsAlive = false;
				if (!settled) {
					settled = true;
					clearTimeout(timeout);
					reject(new Error("network"));
				}
				if (transport === "relay")
					setTransport("none");
				// keep the room: come back (network change, sleep...)
				if (!wsClosing && code)
					setTimeout(reconnectSocket, Math.min(8000, 500 * 2 ** wsRetry++));
			};
		});
	}

	async function reconnectSocket() {
		if (!code || wsAlive || wsClosing)
			return;
		try {
			await openSocket(true);
			if (transport !== "p2p")
				useRelayIfPossible();
		} catch (e) {
			if (e.message === "no-room" || e.message === "expired" || e.message === "bad-key") {
				emit("closed", e.message === "bad-key" ? "no-room" : e.message);
				return;
			}
			setTimeout(reconnectSocket, Math.min(8000, 500 * 2 ** wsRetry++));
		}
	}

	function wsSend(obj) {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(obj));
			return true;
		}
		return false;
	}

	function onSocketMessage(m) {
		if (m.t === "pong")
			return;
		if (m.t === "peer") {
			if (m.present)
				peerArrived(m.rejoin);
			else {
				// the other player's room connection dropped (it may still be linked directly: it is
				// gone when the direct link closes too)
				peerOnSocket = false;
				if (!(dc && dc.readyState === "open"))
					peerGone();
			}
			return;
		}
		if (m.t === "signal")
			return onSignal(m.data);
		if (m.t === "relay")
			return receive(m.data);
	}

	function peerGone() {
		if (!peerPresent)
			return;
		peerPresent = false;
		peerLostAt = 0;
		closeDirect();
		if (transport !== "none")
			setTransport("none");
		emit("peer", false);
	}

	function peerArrived(rejoin) {
		const was = peerPresent;
		peerPresent = peerOnSocket = true;
		lastHeard = Date.now();
		if (!rejoin) {
			// a new player (not the same one coming back): numbering starts again, the game layer
			// sends its state again
			seqOut = lastIn = 0;
			sent.length = 0;
			emit("peer-new");
		}
		if (!was)
			emit("peer", true);
		// a new direct link is negotiated each time the other player (re)appears, unless one exists
		if (transport !== "p2p")
			startDirect();
	}

	// ---------- WebRTC ----------

	function closeDirect() {
		clearTimeout(directTimer);
		if (dc) { dc.onclose = dc.onmessage = dc.onopen = null; try { dc.close(); } catch (e) {} }
		if (pc) { pc.onicecandidate = pc.onconnectionstatechange = pc.ondatachannel = null; try { pc.close(); } catch (e) {} }
		dc = pc = null;
	}

	function setupChannel(channel) {
		dc = channel;
		dc.onopen = () => {
			clearTimeout(directTimer);
			setTransport("p2p");
		};
		dc.onmessage = e => {
			let m;
			try { m = JSON.parse(e.data); } catch (err) { return; }
			receive(m);
		};
		dc.onclose = () => {
			if (dc !== channel)
				return;
			dc = null;
			if (!peerOnSocket) {
				peerGone();
				return;
			}
			if (transport === "p2p")
				useRelayIfPossible();
			// try to get a direct link again (the host makes a new offer)
			if (role === "host")
				setTimeout(() => {
					if (code && transport !== "p2p" && peerPresent && wsAlive)
						startDirect();
				}, 3000);
		};
	}

	function startDirect() {
		closeDirect();
		if (!rtcAvailable) {
			useRelayIfPossible();
			return;
		}
		try {
			pc = new RTCPeerConnection({iceServers: ICE_SERVERS});
		} catch (e) {
			rtcAvailable = false;
			useRelayIfPossible();
			return;
		}
		const conn = pc;
		pc.onicecandidate = e => {
			if (e.candidate)
				wsSend({t: "signal", data: {candidate: e.candidate.toJSON()}});
		};
		pc.onconnectionstatechange = () => {
			if (pc !== conn)
				return;
			if (["failed", "disconnected", "closed"].includes(conn.connectionState) && transport === "p2p")
				useRelayIfPossible();
		};
		if (role === "host") {
			setupChannel(pc.createDataChannel("gwent", {ordered: true}));
			pc.createOffer()
				.then(offer => conn.setLocalDescription(offer))
				.then(() => wsSend({t: "signal", data: {sdp: conn.localDescription.toJSON()}}))
				.catch(e => { console.warn("webrtc offer:", e); useRelayIfPossible(); });
		} else {
			pc.ondatachannel = e => setupChannel(e.channel);
		}
		// no direct link in time: the room relays the messages (the direct attempt goes on)
		directTimer = setTimeout(() => {
			if (transport !== "p2p")
				useRelayIfPossible();
		}, DIRECT_TIMEOUT);
	}

	async function onSignal(data) {
		try {
			if (data.sdp) {
				if (data.sdp.type === "offer") {
					if (role !== "guest")
						return;
					startDirectAsGuest();
					await pc.setRemoteDescription(data.sdp);
					const answer = await pc.createAnswer();
					await pc.setLocalDescription(answer);
					wsSend({t: "signal", data: {sdp: pc.localDescription.toJSON()}});
					flushCandidates();
				} else if (pc) {
					await pc.setRemoteDescription(data.sdp);
					flushCandidates();
				}
			} else if (data.candidate) {
				if (pc && pc.remoteDescription)
					await pc.addIceCandidate(data.candidate);
				else if (pendingCandidates.length < 50)
					pendingCandidates.push(data.candidate);
			}
		} catch (e) {
			console.warn("webrtc signal:", e);
		}
	}
	let pendingCandidates = [];
	function flushCandidates() {
		const list = pendingCandidates;
		pendingCandidates = [];
		list.forEach(c => pc.addIceCandidate(c).catch(() => {}));
	}
	// the guest waits for the host's offer: (re)create its connection when one arrives
	function startDirectAsGuest() {
		if (pc && !pc.remoteDescription && pc.signalingState === "stable")
			return;
		startDirect();
	}

	function useRelayIfPossible() {
		if (transport === "p2p" && dc && dc.readyState === "open")
			return;
		if (wsAlive && peerPresent)
			setTransport("relay");
		else {
			setTransport("none");
			if (!wsAlive)
				reconnectSocket();
		}
	}

	// ---------- messages ----------

	// game message: numbered, kept for a resend, sent on the best link
	function send(type, data = {}) {
		const msg = Object.assign({type, seq: ++seqOut}, data);
		sent.push(msg);
		transmit(msg);
		return msg;
	}

	// control message (not numbered)
	function control(msg) {
		transmit(Object.assign({ctl: true}, msg));
	}

	function transmit(msg) {
		if (transport === "p2p" && dc && dc.readyState === "open") {
			try {
				dc.send(JSON.stringify(msg));
				return true;
			} catch (e) {
				useRelayIfPossible();
			}
		}
		if (transport === "relay" || (transport !== "p2p" && wsAlive && peerPresent))
			return wsSend({t: "relay", data: msg});
		return false;
	}

	function receive(m) {
		lastHeard = Date.now();
		if (peerLostAt) {
			peerLostAt = 0;
			emit("peer", true);
		}
		if (m.ctl) {
			if (m.t === "ping")
				control({t: "pong"});
			else if (m.t === "sync") {
				// resend what the other side did not get
				for (const msg of sent)
					if (msg.seq > m.last)
						transmit(msg);
			}
			return;
		}
		if (!Number.isSafeInteger(m.seq) || m.seq < 1)
			return; // not a message of the game
		if (m.seq <= lastIn)
			return; // already received (resent after a change of link)
		if (m.seq > lastIn + 1) {
			control({t: "sync", last: lastIn});
			return; // a message is missing: wait for it to be resent
		}
		lastIn = m.seq;
		emit("message", m);
	}

	function heartbeat() {
		if (!code)
			return;
		if (wsAlive)
			wsSend({t: "ping"});
		if (transport !== "none")
			control({t: "ping"});
		const silent = Date.now() - lastHeard;
		if (transport === "p2p" && silent > LINK_TIMEOUT)
			useRelayIfPossible();
		if (peerPresent && silent > LINK_TIMEOUT && !peerLostAt) {
			peerLostAt = Date.now();
			emit("peer-silent", true);
		}
		if (peerLostAt && Date.now() - peerLostAt > PEER_GONE_AFTER - LINK_TIMEOUT)
			peerGone();
	}

	// ---------- public ----------

	async function open(serverURL, asRole, roomCode) {
		close();
		seatKey = "";
		url = serverURL;
		role = asRole;
		seqOut = lastIn = 0;
		sent.length = 0;
		peerPresent = peerOnSocket = false;
		lastHeard = Date.now();
		if (asRole === "host") {
			// a free code (the room refuses codes already in use)
			for (let i = 0; i < 6; i++) {
				code = randomCode();
				try {
					await openSocket(false);
					break;
				} catch (e) {
					code = null;
					if (e.message !== "code-in-use" || i === 5)
						throw e;
				}
			}
		} else {
			code = normalizeCode(roomCode);
			try {
				await openSocket(false);
			} catch (e) {
				code = null;
				throw e;
			}
		}
		pingTimer = setInterval(heartbeat, PING_EVERY);
		return code;
	}

	function close() {
		clearInterval(pingTimer);
		closeDirect();
		wsClosing = true;
		if (ws) {
			try { ws.close(1000, "bye"); } catch (e) {}
		}
		ws = null;
		wsAlive = false;
		code = null;
		role = null;
		peerPresent = peerOnSocket = false;
		peerLostAt = 0;
		pendingCandidates = [];
		if (transport !== "none") {
			transport = "none";
			emit("transport", "none");
		}
	}

	return {
		open, close, send, on, normalizeCode,
		get code() { return code; },
		get role() { return role; },
		get transport() { return transport; },
		get peerPresent() { return peerPresent; },
		get connected() { return transport !== "none"; },
		// tests: disable WebRTC (relay only) / break the direct link
		set rtcAvailable(v) { rtcAvailable = !!v; },
		dropDirect() { if (dc) dc.close(); },
		dropSocket() { if (ws) ws.close(4100, "test"); },   // test: lose the room connection (the player comes back with his key)
		ALPHABET,
	};
})();
