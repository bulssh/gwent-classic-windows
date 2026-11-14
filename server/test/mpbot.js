// Test bot for online games: plays the local side through the real UI paths (preview + row,
// decoy target, pass, leader click, carousels), so that every move goes through the network hooks.
(() => {
	const SPEED = window.__SPEED || 4;
	const realSetInterval = window.setInterval.bind(window);
	const realSetTimeout = window.setTimeout.bind(window);
	// game timers are accelerated, long ones (network timeouts) are not
	window.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, (ms || 0) >= 3000 ? ms : (ms || 0) / SPEED, ...a);
	window.setInterval = (fn, ms, ...a) => realSetInterval(fn, (ms || 0) >= 3000 ? ms : Math.max(1, (ms || 0) / SPEED), ...a);
	const origFade = window.fade;
	window.fade = (a, e, d) => origFade(a, e, d / SPEED);
	window.__errors = [];
	window.__stats = {turns: 0, lastProgress: Date.now(), moves: []};
	window.addEventListener('error', e => window.__errors.push('error: ' + (e.error && e.error.stack || e.message)));
	window.addEventListener('unhandledrejection', e => window.__errors.push('rejection: ' + (e.reason && (e.reason.stack || e.reason))));
	const progress = () => window.__stats.lastProgress = Date.now();
	const ev = {stopPropagation() {}};
	const rnd = n => Math.floor(Math.random() * n);
	const log = m => window.__stats.moves.push(m);

	async function myTurn() {
		window.__stats.turns++;
		const hand = player_me.hand.cards;
		if (player_me.leaderAvailable && Math.random() < 0.2) {
			log('leader ' + player_me.leader.name);
			player_me.elem_leader.dispatchEvent(new MouseEvent('click', {bubbles: true}));
			return;
		}
		if (hand.length === 0 || (Math.random() < (window.__PASSP ?? 0.1) && game.roundCount < 3) || (player_op.passed && player_me.total > player_op.total)) {
			log('pass');
			ui.passRound();
			return;
		}
		for (let tries = 0; tries < 8; tries++) {
			const card = hand[rnd(hand.length)];
			ui.showPreview(card);
			if (card.name === 'Decoy') {
				const targets = [3, 4, 5].flatMap(i => board.row[i].cards.filter(c => c.isUnit()).map(c => [c, board.row[i]]));
				if (!targets.length) { ui.cancel(); continue; }
				const [targ, row] = targets[rnd(targets.length)];
				log('decoy ' + targ.name);
				await ui.selectRow(row);
				await ui.selectCard(targ);
				return;
			}
			if (card.faction === 'weather') { log('weather ' + card.name); await ui.selectRow(weather); return; }
			if (card.name === 'Scorch') { log('scorch'); await ui.selectRow(board.row[3]); return; }
			if (card.isSpecial()) {
				const rows = [3, 4, 5].map(i => board.row[i]).filter(r => r.special === null);
				if (!rows.length) { ui.cancel(); continue; }
				log('special ' + card.name);
				await ui.selectRow(rows[rnd(rows.length)]);
				return;
			}
			let row;
			if (card.row === 'agile')
				row = board.getRow(card, Math.random() < 0.5 ? 'close' : 'ranged', player_me);
			else
				row = board.getRow(card, card.row, player_me);
			log('play ' + card.name + ' -> ' + row.type);
			await ui.selectRow(row);
			return;
		}
		log('pass (no move)');
		ui.passRound();
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
					// redraw: sometimes keep the hand
					if (cc.title === t('redraw') && Math.random() < 0.3) { cc.cancel(); progress(); return; }
					cc.index = rnd(cc.indices.length);
					cc.update();
					Promise.resolve(cc.select(ev)).catch(fail).finally(() => { cc.__p = false; });
					progress();
				}
				return;
			}
			if (game.placedEffectsActive && ui.previewCard && document.getElementById('click-background').classList.contains('noclick')) {
				const c = ui.previewCard;
				log('row for ' + c.name);
				ui.selectRow(board.getRow(c, Math.random() < 0.5 ? 'close' : 'ranged', player_me));
				progress();
				return;
			}
			if (game.state === GameState.END_SCREEN && !document.getElementById('end-screen').classList.contains('hide')) {
				window.__done = true;
				window.__result = document.getElementById('end-screen').children[0].className;
				progress();
				return;
			}
			if (game.state !== GameState.PLAYING) return;
			if (game.currPlayer !== player_me || player_me.passed) return;
			if (window.__turnSeq === handledSeq) return;
			if (document.querySelector('main').classList.contains('noclick')) return;
			if (!document.getElementById('stats-me').classList.contains('current-turn')) return;
			if (ui.previewCard) return;
			handledSeq = window.__turnSeq;
			Promise.resolve(myTurn()).catch(fail);
			progress();
		} catch (e) { fail(e); }
	}, 40);
})();
