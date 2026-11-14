"use strict"

var factions = {
	realms: {
		name: "Northern Realms",
		factionAbility: player => game.roundStart.push( async () => {
			// FIX: drawing from an empty deck threw and froze the start of the round
			if (game.roundCount > 1 && game.roundHistory[game.roundCount-2]?.winner === player && player.deck.cards.length > 0) {
				await player.deck.draw(player.hand);
				await ui.notification("north", 1200);
			}
			return false;
		}),
		description: "Draw a card from your deck whenever you win a round."
	},
	nilfgaard: {
		name: "Nilfgaardian Empire",
		description: "Wins any round that ends in a draw."
	},
	monsters: {
		name: "Monsters",
		factionAbility: player => game.roundEnd.push(() => {
			let units = board.row.filter( (r,i) => player === player_me ^ i < 3)
				.reduce((a,r) => r.cards.filter(c => c.isUnit()).concat(a), []);
			if (units.length === 0)
				return;
			// online games: same choice on both computers (stable order, seeded draw)
			if (Rng.seeded)
				units = canonicalOrder(units);
			const card = units[Math.floor(Rng.of(player)() * units.length)];
			card.noRemove = true;
			game.roundStart.push( async () => {
				await ui.notification("monsters", 1200);
				delete card.noRemove;
				return true; 
			});
			return false;
		}),
		description: "Keeps a random Unit Card out after each round."
	},
	scoiatael: {
		name: "Scoia'tael",
		factionAbility: player => game.gameStart.push( async () => {
			let notif = "";
			if (player === player_me) {
				await ui.popup(t("scoia.first"), () => game.firstPlayer = player, t("scoia.opponent"), () => game.firstPlayer = player.opponent(), t("scoia.title"), t("scoia.text"), 0.55);
				notif = game.firstPlayer.tag + "-first";
				if (typeof Online !== "undefined" && Online.active)
					Online.local("ScoiaFirst", {first: game.firstPlayer === player});
			} else if (typeof Online !== "undefined" && Online.isRemote(player)) {
				// online: the other player decides
				const m = await Online.next("ScoiaFirst");
				if (!m)
					return true;
				game.firstPlayer = m.first ? player : player.opponent();
				notif = m.first ? "scoiatael" : game.firstPlayer.tag + "-first";
			} else if (player.hand instanceof HandAI) {
				if (Math.random() < 0.5) {
					game.firstPlayer = player;
					notif = "scoiatael";
				} else {
					game.firstPlayer = player.opponent();
					notif = game.firstPlayer.tag + "-first";
				}
			} else {
				//sleepUntil(game.firstPlayer); //TODO online
			}
			await ui.notification(notif,1200);
			return true;
		}),
		description: "Decides who takes first turn."
	},
	skellige: {
		name: "Skellige",
		factionAbility: player => game.roundStart.push( async () => {
			if (game.roundCount != 3)
				return false;
			const currPlayer = game.currPlayer;
			game.currPlayer = player;
			await ui.notification("skellige-" + player.tag, 1200);
			if (player.controller instanceof ControllerAI)
			{
				await Promise.all(player.grave.findCardsRandom(c => c.isUnit(), 2).map(c => board.toRow(c, player.grave)));
			}
			else
			{
				await factions['skellige'].helper(player);
				await factions['skellige'].helper(player);
			}
			game.currPlayer = currPlayer;
			return true;
		}),
		helper: async player => {
			const units = player.grave.findCardsRandom(c => c.isUnit(), 1, Rng.of(player));
			if (units.length === 0)
				return;
			const card = units[0];
			if (card.row === 'agile')
			{
				const selectedRow = await ui.waitForRowSelection(card);
				if (selectedRow)
				{
					await board.moveTo(card, selectedRow, player.grave);
				}
			}
			else
			{
				await board.toRow(card, player.grave);
			}
		},
		description: "2 random cards from the graveyard are placed on the battlefield at the start of the third round."
	}
}