// Injected test bot: plays the human side automatically through the game's own APIs,
// speeds up timers, and records errors / hangs. Test-only, never shipped.
(() => {
	const SPEED = window.__SPEED || 8;
	// scale every page timer uniformly so relative timings (and races) are preserved
	const realSetInterval = window.setInterval.bind(window);
	const realSetTimeout = window.setTimeout.bind(window);
	window.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, (ms || 0) / SPEED, ...a);
	window.setInterval = (fn, ms, ...a) => realSetInterval(fn, Math.max(1, (ms || 0) / SPEED), ...a);
	const origFade = window.fade;
	window.fade = (a, e, d) => origFade(a, e, d / SPEED);

	window.__log = [];
	window.__errors = [];
	window.__stats = { games: 0, turns: 0, lastProgress: Date.now(), results: [], leader: 0, decoy: 0, scorch: 0, special: 0 };
	window.addEventListener('error', e => window.__errors.push('error: ' + (e.error && e.error.stack || e.message)));
	window.addEventListener('unhandledrejection', e => window.__errors.push('unhandledrejection: ' + (e.reason && (e.reason.stack || e.reason))));

	const progress = () => { window.__stats.lastProgress = Date.now(); };
	const ev = { stopPropagation() {} };
	let busy = false;

	async function myTurn() {
		const s = window.__stats;
		s.turns++;
		const hand = player_me.hand.cards;
		// sometimes use leader through the real UI path (click leader -> carousel -> select)
		if (player_me.leaderAvailable && Math.random() < 0.25) {
			s.leader++;
			player_me.elem_leader.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			return;
		}
		if (hand.length === 0 || (!window.__SMART && Math.random() < 0.08 && game.roundCount < 3)) {
			player_me.passRound();
			return;
		}
		let card = hand[randomInt(hand.length)];
		if (window.__SMART) {
			// sensible human-like baseline: spies first, win cheaply, pass when comfortably ahead
			const op = player_op, lead = player_me.total - op.total;
			const units = hand.filter(c => c.isUnit() || c.hero);
			const spies = units.filter(c => c.abilities.includes('spy'));
			if (op.passed && lead > 0) { player_me.passRound(); return; }
			if (!op.passed && player_me.health === 2 && op.health === 2 && lead >= 15 && hand.length >= op.hand.cards.length) { player_me.passRound(); return; }
			if (!op.passed && player_me.health === 2 && lead <= -35 && hand.length <= op.hand.cards.length) { player_me.passRound(); return; }
			if (spies.length) card = spies[0];
			else if (units.length) {
				const sorted = units.slice().sort((a, b) => b.basePower - a.basePower);
				if (op.passed) {
					const need = -lead + 1;
					card = sorted.slice().reverse().find(c => c.basePower >= need) || sorted[0];
				} else card = sorted[Math.min(sorted.length - 1, randomInt(3))];
			}
		}
		if (card.name === 'Decoy') {
			const targets = [3, 4, 5].flatMap(i => board.row[i].cards.filter(c => c.isUnit()).map(c => [c, board.row[i]]));
			if (!targets.length) { player_me.passRound(); return; }
			s.decoy++;
			const [targ, row] = targets[randomInt(targets.length)];
			// real UI path: preview decoy, select row (capture) then card
			ui.showPreview(card);
			await ui.selectRow(row);
			await ui.selectCard(targ);
			return;
		}
		if (card.name === 'Scorch') { s.scorch++; await player_me.playScorch(card); return; }
		if (card.isSpecial()) {
			const rows = [3, 4, 5].map(i => board.row[i]).filter(r => r.special === null);
			if (!rows.length) { player_me.passRound(); return; }
			s.special++;
			await player_me.playCardToRow(card, rows[randomInt(rows.length)]);
			return;
		}
		if (card.row === 'agile') {
			const r = Math.random() < 0.5 ? 'close' : 'ranged';
			await player_me.playCardToRow(card, board.getRow(card, r, player_me));
			return;
		}
		await player_me.playCard(card);
	}

	window.__turnSeq = 0;
	let handledSeq = 0;
	const origStartTurn = Player.prototype.startTurn;
	Player.prototype.startTurn = function (...a) { if (this === player_me) window.__turnSeq++; return origStartTurn.apply(this, a); };
	const fail = e => window.__errors.push('bot: ' + (e && (e.stack || e)));

	realSetInterval(() => {
		if (window.__done) return;
		try {
			if (Popup.curr) { Popup.curr.selectYes(); progress(); return; }
			const cc = Carousel.curr;
			if (cc) {
				if (!cc.__p) {
					cc.__p = true;
					window.__last = 'carousel n=' + cc.container.cards.length;
					Promise.resolve(cc.select(ev)).catch(fail).finally(() => { cc.__p = false; });
					progress();
				}
				return;
			}
			if (game.placedEffectsActive && ui.previewCard && document.getElementById('click-background').classList.contains('noclick')) {
				const c = ui.previewCard;
				ui.selectRow(board.getRow(c, Math.random() < 0.5 ? 'close' : 'ranged', player_me));
				progress();
				return;
			}
			if (game.state === GameState.END_SCREEN && !document.getElementById('end-screen').classList.contains('hide')) {
				const st = window.__stats;
				st.games++;
				st.results.push(document.getElementById('end-screen').children[0].className);
				progress();
				if (st.games >= (window.__GAMES || 3)) { window.__done = true; return; }
				const btn = document.getElementById('end-screen').getElementsByTagName('button')[st.games % 2 ? 2 : 1];
				btn.click();
				return;
			}
			if (game.state !== GameState.PLAYING) return;
			if (game.currPlayer !== player_me || player_me.passed) return;
			if (window.__turnSeq === handledSeq) return;
			if (document.getElementsByTagName('main')[0].classList.contains('noclick')) return;
			if (!document.getElementById('stats-me').classList.contains('current-turn')) return;
			if (ui.previewCard) return;
			handledSeq = window.__turnSeq;
			window.__last = 'myTurn';
			Promise.resolve(myTurn()).catch(fail);
			progress();
		} catch (e) { fail(e); }
	}, 40);
})();
// test-only probe: report cards whose element is not inside the container that holds them
(() => {
	const orig = CardContainer.prototype.removeCardElement;
	CardContainer.prototype.removeCardElement = function (card, index) {
		if (this.elem && card && card.elem.parentNode !== this.elem && !(this instanceof Deck)) {
			const where = [...board.row, weather, player_me.hand, player_op.hand, player_me.grave, player_op.grave].map((c, i) => c.cards.includes(card) ? i : -1).filter(i => i >= 0);
			const parent = card.elem.parentNode ? (card.elem.parentNode.id || card.elem.parentNode.className) : null;
			window.__errors.push('PROBE ' + this.constructor.name + ' remove ' + card.name + ' elemParent=' + parent + ' modelIn=' + JSON.stringify(where) + ' stack=' + new Error().stack.split('\n').slice(2, 7).join(' | '));
		}
		return orig.call(this, card, index);
	};
})();
