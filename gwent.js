"use strict"

class Enum {constructor(val){this.val = val;} toString(){return this.val;}};

const DURATION_CARD_PLACEMENT = 1000;

const DUR_FADE_STEP = 10;

const CLICK_EVENT_SFX = () => AudioManager.playSFX('ui_card');

const addMouseEnterSFXBySelector = selector => {
	[...document.querySelectorAll(selector)].forEach(e =>
	e.addEventListener('mouseenter', CLICK_EVENT_SFX));
};

class Controller {}

// Makes decisions for the AI opponent player
class ControllerAI {
	constructor(player) {
		this.player = player;
	}
	
	// Collects data and weighs options, then acts according to the difficulty level:
	//  easy   - nearly random choice among the playable options
	//  normal - weighted random choice (original behaviour, without passing while behind)
	//  hard   - deterministic choice with round / card-advantage management
	async startTurn(player){
		if (player.opponent().passed && (player.winning || 
				player.deck.faction === "nilfgaard" && player.total === player.opponent().total) ){
			await player.passRound();
			return;
		}
		const level = Settings.difficulty.get();
		let data_max = this.getMaximums();
		let data_board = this.getBoardData();
		let weights = player.hand.cards.map(c => 
			({kind: "card", card: c, weight: this.weightCard(c, data_max, data_board), action: async () => await this.playCard(c, data_max, data_board)}) );
		if (player.leaderAvailable)
			weights.push( {kind: "leader", weight: this.weightLeader(player.leader, data_max, data_board), action: async () => await player.activateLeader()} );
		weights.push( {kind: "pass", weight: this.weightPass(), action: async () => await player.passRound()} );
		// FIX: weights must never be negative or NaN (e.g. Eredin King of the Wild Hunt with no weather left returned -1)
		weights.forEach(w => w.weight = Math.max(0, Number(w.weight) || 0));

		if (level === "hard") {
			const pick = this.chooseHard(player, weights);
			if (pick) {
				await pick.action();
				return;
			}
			// same options as normal, but the best ones are much more likely
			weights.forEach(w => w.weight = Math.pow(w.weight, 1.6));
		}
		if (level === "easy") {
			// every playable option is almost equally likely
			weights.forEach(w => w.weight = w.kind === "pass" ? w.weight / 3 : (w.weight > 0 ? 6 + Math.sqrt(w.weight) : 0));
		}

		let weightTotal = weights.reduce( (a,c) => a + c.weight, 0);
		if (weightTotal === 0){
			for (let i=0; i<player.hand.cards.length; ++i) {
				let card = player.hand.cards[i];
				if (card.row === "weather" && this.weightWeather(card) > -1 || card.abilities.includes("avenger")) {
					await weights[i].action();
					return;
				}
			}
			await player.passRound();
		} else {
			let rand = Math.random() * weightTotal;
			for (var i=0; i < weights.length; ++i) {
				rand -= weights[i].weight;
				if (rand < 0)
					break;
			}
			await weights[Math.min(i, weights.length - 1)].action();
		}
	}

	// Points an option adds to the AI's total right now (not its strategic value)
	gain(o, player) {
		if (o.kind === "leader")
			return o.weight;
		const c = o.card;
		if (c.name === "Decoy")
			return 0;
		if (c.abilities.includes("spy"))
			return -c.power;
		if (c.name === "Commander's Horn")
			return o.weight * 2;
		if (c.row === "weather" || c.name === "Scorch" || c.name === "Mardroeme")
			return o.weight;
		const row = c.row === "agile" ? this.determineAgileRow(c) : board.getRow(c, c.row, player);
		let pts = (c.abilities.some(a => a === "bond" || a === "morale" || a === "horn")) ? this.weightRowChangeTrue(c, row) : row.calcCardScore(c);
		if (c.abilities.includes("muster")) {
			let i = c.name.indexOf('-');
			let name = c.muster || (i === -1 ? c.name : c.name.substring(0, i));
			pts += player.deck.cards.filter(x => x.name.startsWith(name)).reduce((a, x) => a + x.basePower, 0);
		}
		if (c.abilities.includes("medic")) {
			const units = player.grave.cards.filter(x => x.isUnit());
			pts += units.reduce((a, x) => Math.max(a, x.abilities.includes("spy") ? 0 : x.basePower), 0);
		}
		if (c.abilities.some(a => a.startsWith("scorch")))
			pts += Math.max(0, o.weight - row.calcCardScore(c));
		return pts;
	}

	// Hard difficulty: picks the best option with a simple Gwent strategy
	// (win rounds cheaply, keep card advantage, never waste cards on a lost cause)
	chooseHard(player, options) {
		const op = player.opponent();
		const pass = options.find(o => o.kind === "pass");
		const lead = player.total - op.total;                       // > 0 when the AI is ahead
		const myCards = player.hand.cards.length;
		const opCards = op.hand.cards.length;
		const decisive = player.health === 1;                        // losing this round loses the game
		const opDecisive = op.health === 1;
		const plays = options.filter(o => o.kind !== "pass" && o.weight > 0);
		plays.forEach(o => o.points = this.gain(o, player));
		plays.sort((a, b) => b.weight - a.weight);
		const isSpy = o => o.card && o.card.abilities.includes("spy");
		const isHero = o => o.card && o.card.isHero();
		const spies = plays.filter(isSpy);
		if (!plays.length)
			return pass;

		// smallest set of cards (by points) reaching "need" points
		const cardsToReach = need => {
			const pos = plays.filter(o => o.points > 0).map(o => o.points).sort((a, b) => b - a);
			let sum = 0;
			for (let k = 0; k < pos.length; k++) {
				sum += pos[k];
				if (sum >= need)
					return k + 1;
			}
			return Infinity;
		};
		// cheapest option giving at least "need" points (non-hero, low points first)
		const cheapestWinner = need => plays.filter(o => o.points >= need && !isSpy(o))
			.sort((a, b) => (isHero(a) - isHero(b)) || (a.kind === "leader") - (b.kind === "leader") || a.points - b.points)[0];

		if (op.passed) {
			const need = -lead + (player.deck.faction === "nilfgaard" && op.deck.faction !== "nilfgaard" ? 0 : 1);
			// spies are free card advantage while the round is not decided yet
			if (spies.length && !decisive && myCards > 1)
				return spies[0];
			const k = cardsToReach(need);
			if (k === Infinity)
				return decisive ? (plays.filter(o => !isSpy(o)).sort((a, b) => b.points - a.points)[0] || pass) : pass;
			// winning would cost the whole hand while the opponent keeps more cards: keep them for later
			if (!decisive && k > 3 && myCards - k < opCards)
				return pass;
			const one = cheapestWinner(need);
			if (one)
				return one;
			return plays.filter(o => !isSpy(o)).sort((a, b) => b.points - a.points)[0] || pass;
		}

		// the opponent cannot answer any more: pass as soon as the AI leads
		if (opCards === 0 && !op.leaderAvailable && lead > 0)
			return pass;
		// otherwise: sharpened weighted choice (see startTurn)
		return null;
	}
	
	// Collects data about card with the hightest power on the board
	getMaximums(){
		let rmax = board.row.map(r =>  ({row: r, cards: r.cards.filter(c => c.isUnit()).reduce( (a,c) => 
			(!a.length|| a[0].power < c.power) ? [c] : a[0].power === c.power ? a.concat([c]) : a
		, []) }) );
		
		let max = rmax.filter((r,i) => r.cards.length && i < 3).reduce((a,r) => Math.max(a, r.cards[0].power), 0);
		let max_me = rmax.filter((r,i) => i < 3 && r.cards.length && r.cards[0].power === max).reduce((a,r) => 
			a.concat(r.cards.map(c => ({row:r, card:c})))
		, []);
		
		max = rmax.filter((r,i) => r.cards.length && i > 2).reduce((a,r) => Math.max(a, r.cards[0].power), 0);
		let max_op = rmax.filter((r,i) => i > 2 && r.cards.length && r.cards[0].power === max).reduce((a,r) => 
			a.concat(r.cards.map(c => ({row:r, card:c})))
		, []);
		
		return {rmax: rmax, me: max_me, op: max_op};
	}
	
	// Collects data about the types of cards on the board and in each player's graves
	getBoardData(){
		let data = this.countCards(new CardContainer());
		Object.keys([0,1,2]).map(i => board.row[i]).forEach(r => this.countCards(r, data));
		data.grave_me = this.countCards(this.player.grave);
		data.grave_op = this.countCards(this.player.opponent().grave);
		return data;
	}
	
	// Catalogs the kinds of cards in a given CardContainer
	countCards(container, data){
		data = data ? data : {spy: [], medic: [], bond: {}, scorch: []};
		container.cards.filter(c => c.isUnit()).forEach(c => {
			for (let x of c.abilities) {
				switch (x) {
					case "spy":
					case "medic":
						data[x].push(c);
						break;
					case "scorch_r": case "scorch_c": case "scorch_s":
						data["scorch"].push(c);
						break;
					case "bond":
						if (!data.bond[c.name])
							data.bond[c.name] = 0;
						data.bond[c.name]++;
				}
			}
		});
		return data;
	}
	
	// Swaps a card from the hand with the deck if beneficial
	redraw() {
		if (Settings.difficulty.get() === "easy")
			return; // easy: keeps its opening hand
		const card = this.discardOrder({holder:this.player})[0];
		if (card && card.power < 15) {
			this.player.deck.swap(this.player.hand, card);
		}
	}
	
	// Orders discardable cards from most to least discardable
	discardOrder(card) {
		let cards = [];
		let groups = {};
		let musters = card.holder.hand.cards.filter(c => c.abilities.includes("muster"));
		while (musters.length > 0) {
			let curr = musters.pop();
			let i = curr.name.indexOf('-');
			let name = i === -1 ? curr.name : curr.name.substring(0, i).trim();
			if (!groups[name])
				groups[name] = [];
			let group = groups[name];
			group.push(curr);
			for (let j=musters.length-1; j>=0; j--)
				if (musters[j].name.startsWith(name))
					group.push( musters.splice(j,1)[0] );
		}
		
		for (let group of Object.values(groups)) {
			group.sort(Card.compare);
			group.pop();
			cards.push(...group);
		}
		
		let weathers = card.holder.hand.cards.filter(c => c.row === "weather");
		if (weathers.length > 1){
			weathers.splice(randomInt(weathers.length), 1);
			cards.push(...weathers);
		}
		
		let normal = card.holder.hand.cards.filter(c => c.abilities.length === 0);
		normal.sort(Card.compare);
		cards.push(...normal);
		return cards;
	}
	
	// Tells the Player that this object controls to play a card
	async playCard(c, max, data){
		if (c.name === "Commander's Horn")
			await this.horn(c);
		else if (c.name === "Mardroeme")
			await this.mardroeme(c);
		else if (c.name === "Decoy")
			await this.decoy(c, max, data);
		else if (c.name === "Scorch")
			await this.scorch(c, max, data);
		else
			await this.player.playCard(c);
	}
	
	// Plays a Commander's Horn to the most beneficial row. Assumes at least one viable row.
	async horn(card){
		let rows = [0,1,2].map(i => board.row[i]).filter(r => r.special === null);
		let max_row;
		let max = 0;
		for (let i=0; i<rows.length; ++i) {
			let r = rows[i];
			let dif = [0, 0];
			this.calcRowPower(r, dif, true);
			r.effects.horn++;
			this.calcRowPower(r, dif, false);
			r.effects.horn--;
			let score = dif[1] - dif[0];
			if (max < score){
				max = score;
				max_row = r;
			}
		}
		// FIX: fallback to the first free row instead of crashing on an undefined row
		await this.player.playCardToRow(card, max_row ?? rows[0]);
	}
	
	// Plays a Mardroeme to the most beneficial row. Assumes at least one viable row.
	async mardroeme(card){ // TODO skellige
		let row, max = 0;
		for (let i=1; i<3; i++){
			let curr = this.weightMardroemeRow(card, board.row[i]);
			if (curr > max){
				max = curr;
				row = board.row[i];
			}
		}
		// FIX: fallback to a row without special card instead of crashing on an undefined row
		await this.player.playCardToRow(card, row ?? [board.row[2], board.row[1]].find(r => r.special === null) ?? board.row[2]);
	}
	
	// Selects a card to remove from a Grave. Assumes at least one valid card.
	medic(card, grave){
		let data = this.countCards(grave);
		let targ;
		if (data.spy.length){
			let min = data.spy.reduce( (a,c) => Math.min(a, c.power), Number.MAX_VALUE);
			targ = data.spy.filter(c => c.power === min)[0];
		} else if (data.medic.length) {
			let max = data.medic.reduce( (a,c) => Math.max(a, c.power), -Infinity);
			targ = data.medic.filter(c => c.power === max)[0];
		} else if (data.scorch.length) {
			targ = data.scorch[randomInt(data.scorch.length)];
		} else {
			let units = grave.findCards(c => c.isUnit());
			targ = units.reduce( (a,c) => a.power < c.power ? c : a, units[0] );
		}
		return targ;
	}
	
	// Selects a card to return to the Hand and replaces it with a Decoy. Assumes at least one valid card.
	async decoy(card, max, data) {
		let targ, row;
		if (data.spy.length){
			let min = data.spy.reduce( (a,c) => Math.min(a, c.power), Number.MAX_VALUE);
			targ = data.spy.filter(c => c.power === min)[0];
		} else if (data.medic.length) {
			targ = data.medic[randomInt(data.medic.length)];
		} else if (data.scorch.length) {
			targ = data.scorch[randomInt(data.scorch.length)];
		} else {
			let pairs = max.rmax.filter((r,i) => i<3 && r.cards.length).reduce((a,r) => 
				r.cards.map(c => ({r:r.row, c:c})).concat(a)
			, []);
			let pair = pairs[randomInt(pairs.length)];
			targ = pair.c;
			row = pair.r;
		}
		
		for (let i = 0; !row ; ++i){
			if (board.row[i].cards.indexOf(targ) !== -1){
				row = board.row[i];
				break;
			}
		}
		
		setTimeout(() => board.toHand(targ, row), 1000);
		await this.player.playCardToRow(card, row);
	}
	
	// Tells the controlled Player to play the Scorch card
	async scorch(card, max, data){
		await this.player.playScorch(card);
	}

	// Gets the row that would be best for the passed agile card
	determineAgileRow(card)
	{
		const close = board.getRow(card, "close", card.holder);
		const ranged = board.getRow(card, "ranged", card.holder);
		const vClose = close.getVirtualCopy();
		const vRanged = ranged.getVirtualCopy();
		vClose.cards.push(card);
		vClose.updateState(card, true);
		vRanged.cards.push(card);
		vRanged.updateState(card, true);
		const dif = (vClose.calcScore() - close.calcScore()) - (vRanged.calcScore() - ranged.calcScore());
		return dif > 0 ? close : dif < 0 ? ranged : Math.random() >0.5 ? close : ranged; 
	}

	// Assigns a weight for how likely the conroller is to Pass the round
	weightPass(){
		if (this.player.health === 1)
			return 0;
		let dif = this.player.opponent().total - this.player.total;
		if (dif > 30)
			return 100;
		if (dif < -30 && this.player.opponent().hand.cards.length - this.player.hand.cards.length > 2)
			return 100;
		// FIX: passing while slightly behind simply gave the round away
		if (dif > 0)
			return 0;
		return Math.floor(Math.abs(dif));
	}
	
	// Assigns a weight for how likely the controller is to activate its leader ability
	weightLeader(card, max, data) {
		let w = ability_dict[card.abilities[0]].weight;
		if (ability_dict[card.abilities[0]].weight) {
			let score = w(card, this, max, data);
			return score;
		}
		return 10 + (game.roundCount-1) * 15;
	}
	
	// Assigns a weight for how likely the controller will use a scorch-row card
	weightScorchRow(card, max, row_name) {
		let index = 3 + (row_name==="close" ? 0 : row_name==="ranged" ? 1 : 2);
		if (board.row[index].total < 10)
			return 0;
		let score = max.rmax[index].cards.reduce((a,c) => a + c.power, 0);
		return score;
	}
	
	// Calculates a weight for how likely the conroller will use horn on this row
	weightHornRow(card, row){
		return row.special !== null ? 0 : this.weightRowChange(card, row);
	}
	
	// Calculates weight for playing a card on a given row, min 0
	weightRowChange(card, row){
		return Math.max(0, this.weightRowChangeTrue(card, row));
	}
	
	// Calculates weight for playing a card on the given row
	weightRowChangeTrue(card, row) {
		let dif = [0,0];
		this.calcRowPower(row, dif, true);
		row.updateState(card, true);
		this.calcRowPower(row, dif, false);
		if (!card.isSpecial())
			dif[0] -= row.calcCardScore(card);
		row.updateState(card, false);
		return dif[1] - dif[0];
	}
	
	// Calculates the weight for playing a weather card
	weightWeather(card) {
		let rows;
		if (card.name === "Clear Weather")
			rows = Object.values(weather.types).filter(t => t.count > 0).flatMap(t => t.rows);
		else
			rows = Object.values(weather.types).filter(t => t.count === 0 && card.abilities.includes(t.name)).flatMap(t => t.rows);
		if (!rows.length)
			return 1;
		let dif = [0,0];
		rows.forEach( r => {
			let state = r.effects.weather;
			this.calcRowPower(r, dif, true);
			r.effects.weather = !state;
			this.calcRowPower(r, dif, false);
			r.effects.weather = state;
		});
		return dif[1] - dif[0];
	}
	
	// Calculates the weight for playing a mardroeme card
	weightMardroemeRow(card, row){
		if (card.name === "Mardroeme" && row.special !== null)
			return 0;
		let ermion = card.holder.hand.cards.filter(c => c.name === "Ermion").length > 0;
		if (ermion && card.name !== "Ermion" && row === board.row[1])
			return 0;
		let name = row === board.row[1] ? "Young Berserker" : "Berserker";
		let n = row.cards.filter(c => c.name === name).length;
		let weight = row === board.row[2] ? 10*n : 8*n*n - 2*n
		return Math.max(1, weight);
	}
	
	// Calculates the weight for cards with the medic ability
	weightMedic(data, score, owner){
		let units = owner.grave.findCards(c => c.isUnit());
		let grave = data["grave_" + owner.opponent().tag];
		return !units.length ? Math.min(1,score) : score + (grave.spy.length ? 50 : grave.medic.length ? 15 : grave.scorch.length  ? 10 : this.player.health === 1 ? 1 : 0);
	}
	
	// Calculates the weight for cards with the berserker ability
	weightBerserker(card, row, score){
		if (card.holder.hand.cards.filter(c => c.abilities.includes("mardroeme")).length < 1 && !(row.effects.mardroeme > 0))
			return score;
		score -= card.basePower;
		if (card.row === "close")
			score += 14;
		else {
			let n = 0;
			if (!row.effects.mardroeme)
				n = row.cards.filter(c => c.name === "Young Berserker").length;
			else
				n = row.cards.filter(c => c.name === "Transformed Young Vildkaarl").length;
			score = 8*((n+1)*(n+1) - n*n) + n*score;
		}
		return Math.max(1, score);
	}
	
	// Calculates the weight for a weather card if played from the deck
	weightWeatherFromDeck(card, weather_id) {
		if (card.holder.deck.findCard(c => c.abilities.includes(weather_id)) === undefined)
			return 0;
		return this.weightCard({abilities:[weather_id], row:"weather"});
	}
	
	// Assigns a weights for how likely the controller with play a card from its hand
	weightCard(card, max, data){
		if (card.name === "Decoy")
			return data.spy.length ? 50 : data.medic.length ? 15 : data.scorch.length  ? 10 : max.me.length ? 1 : 0;
		if (card.name === "Commander's Horn") {
			let rows = [0,1,2].map(i => board.row[i]).filter(r => r.special === null);
			if (!rows.length)
				return 0;
			rows = rows.map(r => this.weightHornRow(card, r) );
			return Math.max(...rows)/2;
		}
		
		if (card.abilities) {
			if (card.abilities.includes("scorch")) {
				let power_op = max.op.length ? max.op[0].card.power : 0;
				let power_me = max.me.length ? max.me[0].card.power : 0;
				let total_op = power_op * max.op.length;
				let total_me = power_me * max.me.length;
				return power_me > power_op ? 0 : power_me < power_op ? total_op : Math.max(0, total_op - total_me);
			}
			if (card.abilities.includes("decoy")) {
				return data.spy.length ? 50 : data.medic.length ? 15 : data.scorch.length  ? 10 : max.me.length ? 1 : 0;
			}
			if (card.abilities.includes("mardroeme")) {
				let rows = [1,2].map(i => board.row[i]);
				return Math.max(...rows.map(r => this.weightMardroemeRow(card, r)) );
			}
		}
		
		if (card.row === "weather") {
			return Math.max(0, this.weightWeather(card));
		}
		
		let row;
		if (card.row === 'agile')
			row = this.determineAgileRow(card);
		else
			row = board.getRow(card, card.row === "agile" ? "close" : card.row, this.player);
		let score = row.calcCardScore(card);
		switch(card.abilities[card.abilities.length -1])
		{
			case "bond": 
			case "morale":
			case "horn":
				score = this.weightRowChange(card, row); break;
			case "medic": 
				score = this.weightMedic(data, score, card.holder);	break;
			case "spy": score = 15 + score; break;
			case "muster": score *= 3; break;
			case "scorch_c":
				score = Math.max(1, this.weightScorchRow(card, max, "close")); break;
			case "scorch_r": 
				score = Math.max(1, this.weightScorchRow(card, max, "ranged")); break;
			case "scorch_s":
				score = Math.max(1, this.weightScorchRow(card, max, "siege")); break;
			case "berserker":
				score = this.weightBerserker(card, row, score); break;
			case "avenger": case "avenger_kambi":
				return score + ability_dict[card.abilities[card.abilities.length -1]].weight();
		}
		
		return score;
	}
	
	// Calculates the current power of a row associated with each Player
	calcRowPower(r, dif, add){
		r.findCards(c => c.isUnit()).forEach(c => {
			let p = r.calcCardScore(c); 
			c.holder === this.player ? (dif[0]+= add ? p : -p) : (dif[1]+= add ? p : -p);
		});
	}
}

// Can make actions during turns like playing cards that it owns
class Player {
	constructor(id, name, deck) {
		this.id = id;
		this.tag = (id === 0) ? "me" : "op";
		this.controller = (id === 0) ? new Controller() : new ControllerAI(this);
		
		this.hand = (id === 0) ? new Hand(document.getElementById("hand-row")) : new HandAI();
		this.grave =  new Grave( document.getElementById("grave-" + this.tag));
		this.deck = new Deck(deck.faction, document.getElementById("deck-" + this.tag));
		this.deck_data = deck;
		
		this.leader = new Card(deck.leader, this);
		this.elem_leader = document.getElementById("leader-" + this.tag);
		// FIX: remove the previous game's leader card (New Game / new game from the deck menu showed two leaders)
		this.elem_leader.children[0].replaceChildren();
		this.elem_leader.children[0].appendChild( this.leader.elem );

		this.reset();
		
		this.name = name;
		document.getElementById("name-" + this.tag).textContent = name;
		
		document.getElementById("deck-name-" +this.tag).textContent = factionName(deck.faction);
		let x = document.querySelector("#stats-" +this.tag+ " .profile-img > div > div");
		x.style.backgroundImage = iconURL("deck_shield_" + deck.faction);
	}
	
	// Sets default values
	reset(){
		this.grave.reset();
		this.hand.reset();
		this.deck.reset();
		this.deck.initializeFromID(this.deck_data.cards, this);
		
		this.health = 2;
		this.total = 0;
		this.passed = false;
		this.handsize = 10;
		this.winning = false;
	
		this.enableLeader();
		this.setPassed(false);
		document.getElementById("gem1-" +this.tag).classList.add("gem-on");
		document.getElementById("gem2-" +this.tag).classList.add("gem-on");
	}
	
	// Returns the opponent Player
	opponent(){
		return board.opponent(this);
	}
	
	// Updates the player's total score and notifies the gamee
	updateTotal(n){
		this.total += n;
		document.getElementById("score-total-" + this.tag).children[0].innerHTML = this.total;
		board.updateLeader();
	}
	
	// Puts the player in the winning state
	setWinning(isWinning) {
		if (this.winning ^ isWinning)
			document.getElementById("score-total-" + this.tag).classList.toggle("score-leader");
		this.winning = isWinning;
	}
	
	// Puts the player in the passed state
	setPassed(hasPassed) {
		if (this.passed ^ hasPassed)
			document.getElementById("passed-" + this.tag).classList.toggle("passed");
		this.passed = hasPassed;
	}
	
	// Sets up board for turn
	async startTurn(){
		document.getElementById("stats-" + this.tag).classList.add("current-turn");
		if (this.leaderAvailable)
			this.elem_leader.children[1].classList.remove("hide");
		
		if (this === player_me) {
			document.getElementById("pass-button").classList.remove("noclick");
		}
		
		if (this.controller instanceof ControllerAI) {
			await this.controller.startTurn(this);
		}
	}
	
	// Passes the round and ends the turn
	passRound(){
		this.setPassed(true);
		EventManager.roundPassed.dispatch(this, game.roundCount);
		this.endTurn();
	}
	
	// Plays a scorch card
	async playScorch(card){
		await this.playCardAction(card, async () => await ability_dict["scorch"].activated(card));
	}
	
	// Plays a card to a specific row
	async playCardToRow(card, row){
		await this.playCardAction(card, async () => await board.moveTo(card, row, this.hand));
	}
	
	// Plays a card to the board
	async playCard(card){
		await this.playCardAction(card, async () => await card.autoplay(this.hand));
	}
	
	// Shows a preview of the card being played, plays it to the board and ends the turn
	async playCardAction(card, action){
		ui.showPreviewVisuals(card);
		await sleep(1000);
		FX.launchFromPreview(card);
		ui.hidePreview(card);
		await action();
		this.endTurn();
	}
	
	// Handles end of turn visuals and behavior the notifies the game
	endTurn(){
		if (!this.passed && !this.canPlay())
			this.setPassed(true);
		if (this === player_me){
			document.getElementById("pass-button").classList.add("noclick");
		}
		document.getElementById("stats-" + this.tag).classList.remove("current-turn");
		this.elem_leader.children[1].classList.add("hide");
		game.endTurn()
	}
	
	// Tells the the Player if it won the round. May damage health.
	endRound(win){
		if (!win) {
			if (this.health < 1)
				return;
			FX.shatterGem(document.getElementById("gem" + this.health + "-" +this.tag));
			this.health--;
		}
		this.setPassed(false);
		this.setWinning(false);
	}
	
	// Returns true if the Player can make any action other than passing
	canPlay() {
		return this.hand.cards.length > 0 || this.leaderAvailable;
	}
	
	// Use a leader's Activate ability, then disable the leader
	async activateLeader() {
		ui.showPreviewVisuals(this.leader);
		await sleep(1500);
		ui.hidePreview(this.leader);
		await this.leader.activated[0](this.leader, this);
		this.disableLeader();
		this.endTurn();
	}
	
	// Disable access to leader ability and toggles leader visuals to off state
	disableLeader(){
		this.leaderAvailable = false;
		let elem = this.elem_leader.cloneNode(true);
		this.elem_leader.parentNode.replaceChild(elem, this.elem_leader);
		this.elem_leader = elem;
		this.elem_leader.children[0].classList.add("fade");
		this.elem_leader.children[1].classList.add("hide");
		this.elem_leader.addEventListener("click", async () => await ui.viewCard(this.leader), false);
		this.elem_leader.addEventListener('mouseenter', CLICK_EVENT_SFX);
		this.elem_leader.children[0].setAttribute('data-title', t("tip.viewLeader"));
	}
	
	// Enable access to leader ability and toggles leader visuals to on state
	enableLeader() {
		this.leaderAvailable = this.leader.activated.length > 0;
		let elem = this.elem_leader.cloneNode(true);
		this.elem_leader.parentNode.replaceChild(elem, this.elem_leader);
		this.elem_leader = elem;
		this.elem_leader.children[0].classList.remove("fade");
		this.elem_leader.children[1].classList.remove("hide");
		
		if (this.id === 0 && this.leader.activated.length > 0){
			this.elem_leader.addEventListener("click", 
				async () => await ui.viewCard(this.leader, async () => {
					AudioManager.playSFX('open');
					await this.activateLeader();
		}	), false);
			this.elem_leader.children[0].setAttribute('data-title', t("tip.playLeader"));
		} else {
			this.elem_leader.addEventListener("click", async () => await ui.viewCard(this.leader), false);
		}
		this.elem_leader.addEventListener('mouseenter', CLICK_EVENT_SFX);
		
		// TODO set crown color
	}
	
}

// Handles the adding, removing and formatting of cards in a container
class CardContainer {
	constructor(elem) {
		this.elem = elem;
		this.cards = [];
	}
	
	// Returns the first card that satisfies the predcicate. Does not modify container.
	findCard(predicate){
		for (let i=this.cards.length-1; i>=0; --i)
			if (predicate(this.cards[i]))
				return this.cards[i];
	}
	
	// Returns a list of cards that satisfy the predicate. Does not modify container.
	findCards(predicate){
		return this.cards.filter(predicate);
	}
	
	// Returns a list of up to n cards that satisfy the predicate. Does not modify container.
	findCardsRandom(predicate, n){
		let valid = predicate ? this.cards.filter(predicate) : this.cards;
		if (valid.length === 0)
			return [];
		if (!n || n === 1)
			return [valid[randomInt(valid.length)]];
		let out = [];
		for (let i=Math.min(n, valid.length); i>0 ; --i){
			let index = randomInt(valid.length);
			out.push( valid.splice(index,1)[0] );
		}
		return out;
	}
	
	// Removes and returns a list of cards that satisy the predicate.
	getCards(predicate){
		return this.cards.reduce((a,c,i) => ( predicate(c,i)?[i]:[] ).concat(a), []).map( i => this.removeCard(i));
	}
	
	// Removes and returns a card that satisfies the predicate.
	getCard(predicate) {
		for (let i=this.cards.length-1; i>=0; --i)
			if (predicate(this.cards[i]))
				return this.removeCard(i);
	}
	
	// Removes and returns any cards up to n that satisfy the predicate.
	getCardsRandom(predicate, n) {
		return this.findCardsRandom(predicate, n).map( c => this.removeCard(c) );
	}
	
	// Adds a card to the container along with its associated HTML element.
	addCard(card, index){
		if (!card)
			return;
		index = index ? clamp(0, this.cards.length, index) : 0;
		this.cards.splice(index, 0, card);
		this.addCardElement(card, index);
		this.resize();
	}
	
	// Removes a card from the container along with its associated HTML element.
	removeCard(card, index){
		if (this.cards.length === 0)
			throw "Cannot draw from empty " + this.constructor.name;
		const i = isNumber(card) ? card : this.cards.indexOf(card);
		// FIX: indexOf() === -1 made splice() remove the last card of the container
		if (i < 0 || i >= this.cards.length) {
			console.warn("removeCard: card not in " + this.constructor.name, card);
			return undefined;
		}
		card = this.cards.splice(i, 1)[0];
		this.removeCardElement(card, index?index:0);
		this.resize();
		return card;
	}
	
	// Adds a card to a pre-sorted CardContainer
	addCardSorted(card){
		let i = this.getSortedIndex(card);
		this.cards.splice(i, 0, card);
		return i;
	}
	
	// Returns the expected index of a card in a sorted CardContainer
	getSortedIndex(card){
		for (var i=0; i<this.cards.length; ++i)
			if (Card.compare(card, this.cards[i]) < 0)
				break;
		return i;
	}
	
	// Adds a card to a random index of the CardContainer
	addCardRandom(card){
		this.cards.push(card);
		let index = randomInt(this.cards.length);
		if (index !== this.cards.length-1) {
			let t = this.cards[this.cards.length-1];
			this.cards[this.cards.length-1] = this.cards[index];
			this.cards[index] = t;
		}
		return index;
	}
	
	// Removes the HTML elemenet associated with the card from this CardContainer
	removeCardElement(card, index){
		// FIX: never throw if the element was already moved elsewhere (e.g. a summoned Avenger unit)
		if (this.elem && card.elem.parentNode === this.elem)
			this.elem.removeChild(card.elem);
	}
	
	// Adds the HTML elemenet associated with the card to this CardContainer
	addCardElement(card, index){
		if (card.gcFlying && !(this instanceof Row) && !(this instanceof Weather)) {
			delete card.gcFlying;
			card.elem.style.visibility = "";
		}
		if (this.elem){
			if (index === this.cards.length)
				this.elem.appendChild(card.elem);
			else
				this.elem.insertBefore(card.elem, this.elem.children[index]);
		}
	}
	
	// Empty function to be overried by subclasses that resize their content
	resize(){}
	
	// Modifies the margin of card elements inside a row-like container to stack properly
	resizeCardContainer(overlap_count, gap, coef) {
		let n = this.elem.children.length;
		let param = (n < overlap_count) ?  vw(gap) : defineCardRowMargin(n, coef);
		let children = this.elem.getElementsByClassName("card");
		for (let x of children)
			x.style.marginLeft = x.style.marginRight = param;
		
		function defineCardRowMargin(n, coef = 0){
			return "calc((100% - (" + vw(4.45) + " * " + n + ")) / (2*" +n+ ") - (" + vw(coef) + " * " +n+ "))";
		}
	}
	
	// Allows the row to be clicked
	setSelectable(){
		this.elem.classList.add("row-selectable");
	}
	
	// Disallows teh row to be clicked
	clearSelectable() {
		this.elem.classList.remove("row-selectable");
		for (const card of this.cards)
			card.elem.classList.add("noclick");
	}
	
	// Returns the container to its default, empty state
	reset() {
		while(this.cards.length)
			this.removeCard(0);
		if (this.elem)
			while(this.elem.firstChild)
				this.elem.removeChild(this.elem.firstChild);
		this.cards = [];
	}
	
}

// Contians all used cards in the order that they were discarded
class Grave extends CardContainer {
	constructor(elem) {
		super(elem)
		// FIX: replace the handler of a previous Grave bound to the same element
		if (elem.gcViewHandler)
			elem.removeEventListener("click", elem.gcViewHandler, false);
		elem.gcViewHandler = () => ui.viewCardsInContainer(this);
		elem.addEventListener("click", elem.gcViewHandler, false);
	}
	
	// Override
	addCard(card){
		this.setCardOffset(card, this.cards.length);
		if (card && this.cards.length === 0)
		{
			this.elem.addEventListener('mouseenter', CLICK_EVENT_SFX);
		}
		super.addCard(card, this.cards.length);
	}
	
	// Override
	removeCard(card){
		let n = isNumber(card) ? card : this.cards.indexOf(card);
		if (n < 0 || n >= this.cards.length)
			return undefined;
		if (this.cards.length === 1)
		{
			this.elem.removeEventListener('mouseenter', CLICK_EVENT_SFX);
		}
		return super.removeCard(card, n);
	}
	
	// Override
	removeCardElement(card, index){
		card.elem.style.left = "";
		super.removeCardElement(card, index);
		for (let i=index; i<this.cards.length; ++i){
//			if (!this.cards[i])
//				console.log(i, index, card, this.cards[i]);
			this.setCardOffset(this.cards[i], i);
		}
	}
	
	// Offsets the card element in the deck
	setCardOffset(card, n){
		card.elem.style.left = vw(-0.03 * n);
	}

}

// Contains a randomized set of cards to be drawn from
class Deck extends CardContainer {
	constructor(faction, elem){
		super(elem);
		this.faction = faction;

		this.counter = document.createElement("div");
		this.counter.classList = "deck-counter center";
		this.counter.appendChild( document.createTextNode(this.cards.length) );
		this.elem.appendChild(this.counter);
	}
	
	// Creates duplicates of cards with a count of more than one, then initializes deck
	initializeFromID(card_id_list, player){
		this.initialize(Card.expandIDCounts(card_id_list), player);
	}
	
	// Populates a this deck with a list of card data and associated those cards with the owner of this deck.
	initialize(card_data_list, player){
		for (let i=0; i<card_data_list.length; ++i) {
			let card = new Card(card_data_list[i], player);
			this.addCardRandom(card);
			this.addCardElement();
		}
		this.resize();
	}
	
	// Override
	addCard(card){
		this.addCardRandom(card);
		this.addCardElement();
		this.resize();
	}
	
	// Sends the top card to the passed hand
	async draw(hand){
		// FIX: nothing to draw (Northern Realms bonus, Eredin Destroyer...) instead of an exception
		if (this.cards.length === 0)
			return false;
		if (hand === player_op.hand) {
			hand.addCard(this.removeCard(0));
			return true;
		}
		// FIX: the 10 opening draws run concurrently and all picked cards[0]; it only worked because
		// removing a card that was already gone silently removed the last card of the deck instead.
		// Each draw now reserves its own card.
		const card = this.cards.find(c => !c.gcDrawing);
		if (!card)
			return false;
		card.gcDrawing = true;
		try {
			await board.toHand(card, this);
		} finally {
			delete card.gcDrawing;
		}
		return true;
	}
	
	// Draws a card and sends it to the container before adding a card from the
	// container back to the deck.
	// NOTE: Used only in mulligan and adds card out of order
	swap(container, card){
		if (!card)
			return;
		const index = container.cards.indexOf(card);
		this.addCard(container.removeCard(card));
		const drawnCard = this.removeCard(0);
		container.addCard(drawnCard, index);
	}
	
	// Override
	addCardElement() {
		let elem = document.createElement("div");
		elem.classList.add("deck-card");
		elem.style.backgroundImage = iconURL("deck_back_" + this.faction, "jpg");
		this.setCardOffset(elem, this.cards.length-1);
		this.elem.insertBefore(elem, this.counter);
	}
	
	// Override
	removeCardElement(){
		this.elem.removeChild(this.elem.children[this.cards.length]).style.left = "";
	}
	
	// Offsets the card element in the deck
	setCardOffset(elem, n){
		elem.style.left = vw(-0.03 * n);
	}
	
	// Override
	resize(){
		this.counter.innerHTML = this.cards.length;
		this.setCardOffset(this.counter, this.cards.length);
	}
	
	// Override
	reset() {
		super.reset();
		this.elem.appendChild(this.counter);
	}
}

// Hand used by computer AI. Has an offscreen HTML element for card transitions.
class HandAI extends CardContainer {
	constructor() {
		super(undefined);
		this.counter = document.getElementById("hand-count-op"); 
		this.hidden_elem = document.getElementById("hand-op");
	}
	resize() {this.counter.innerHTML = this.cards.length; }
}

// Hand used by current player
class Hand extends CardContainer {
	constructor(elem){
		super(elem);
		this.counter = document.getElementById("hand-count-me");
	}
	
	// Override
	addCard(card, index){
		if (!card)
			return;
		if (index) {
			// FIX: the element used to be moved to the sorted position while the model kept 'index'
			super.addCard(card, index);
			return;
		}
		const sortedIndex = this.getSortedIndex(card);
		this.addCardSorted(card);
		this.addCardElement(card, sortedIndex);
		this.resize();
	}

	// Sorts the hand (model and HTML) after the initial redraw
	sort(){
		this.cards.sort(Card.compare);
		for (const card of this.cards)
			this.elem.appendChild(card.elem);
		this.resize();
	}
	
	// Override
	resize() {
		this.counter.innerHTML = this.cards.length;
		this.resizeCardContainer(11, 0.075, .00225);
	}
}

// Contains active cards and effects. Calculates the current score of each card and the row.
class Row extends CardContainer {
	constructor(elem) {
		super(elem?.getElementsByClassName("row-cards")[0]);
		this.type = elem?.getAttribute('data-row');
		this.elem_parent = elem;
		this.elem_special = elem?.getElementsByClassName("row-special")[0];
		this.special = null;
		this.total = 0;
		this.effects = {weather:false, halfWeather: false, bond: {}, morale: 0, horn: 0, mardroeme: 0};
		this.elem?.addEventListener("click", () => ui.selectRow(this), true);
		this.elem_special?.addEventListener("click", () => ui.selectRow(this), false, true);
	}
	
	// Returns a copy of the row
	getVirtualCopy(predicate = c=>true)
	{
		const copy = new Row(null);
		copy.type = this.type;
		copy.effects = {...this.effects};
		copy.effects.bond = {...this.effects.bond};
		copy.cards = this.cards.filter(predicate);
		// remove status of filtered out cards
		this.cards.filter(c=>!predicate(c)).forEach(c=>copy.updateState(c, false));
		return copy;
	}
	
	// Override
	async addCard(card) {
		if (card.isSpecial()) {
			this.special = card;
			this.elem_special.appendChild(card.elem);
			FX.arrived(card, this);
		} else {
			let index = this.addCardSorted(card);
			this.addCardElement(card, index);
			this.resize();
			FX.arrived(card, this);
			await this.playPlacementAudio(card);
		}
		this.updateState(card, true);
		game.placedEffectsActive = true;
		for (let x of card.placed) 
			await x(card, this);
		game.placedEffectsActive = false;
		card.elem.classList.add("noclick");
		await sleep(600);
		this.updateScore();
	}

	async playPlacementAudio(card)
	{
		let key;
		if (card.abilities.includes('spy') || card.abilities.includes('vildkarrl'))
			return;
		else if (card.abilities.includes('berserker') && this.effects.mardroeme >= 1)
			return;
		else if (card.abilities.includes('decoy'))
			key = 'decoy';
		else if (card.isHero())
		{
			key = "hero";
		}
		else
		{
			switch(this.type)
			{
				case "siege":
					key = "common_siege"; break;
				case "ranged":
					key = "common_ranged"; break;
				case "close":
					key = "common_close"; break;
				default:
					return;
			}
		}
		if (key)
		{
			return await AudioManager.playSFX(key, DURATION_CARD_PLACEMENT, true);
		}
	}
	
	// Override
	removeCard(card) {
		card = isNumber(card) ? card === -1 ? this.special : this.cards[card] : card;
		// FIX: ignore a card that is not on this row (effects and scores were altered)
		if (!card || (card.isSpecial() ? this.special !== card : !this.cards.includes(card))) {
			console.warn("Row.removeCard: card not on row", card);
			return undefined;
		}
		if (card.isSpecial()) {
			this.special = null;
			this.elem_special.removeChild(card.elem);
		} else {
			super.removeCard(card);
			card.resetPower();
		}
		this.updateState(card, false);
		for (let x of card.removed)
			x(card);
		this.updateScore();
		return card;
	}
	
	// Override
	removeCardElement(card, index) {
		super.removeCardElement(card, index);
		let x = card.elem;
		x.style.marginLeft = x.style.marginRight = "";
		x.classList.remove("noclick");
	}
	
	// Updates a card's effect on the row
	updateState(card, activate){
		this.updateStateEffects(card, activate);
		this.elem_parent?.classList.toggle("row-horn", this.effects.horn > 0);
	}

	updateStateEffects(card, activate){
		for (let x of card.abilities){
			switch (x) {
				case "morale":
				case "horn":
				case "mardroeme": this.effects[x]+= activate ? 1 : -1; break;
				case "bond": 
					if (!this.effects.bond[card.id()])
						this.effects.bond[card.id()] = 0;
					this.effects.bond[card.id()] += activate ? 1 : -1;
					break;
			}
		}
	}
	
	// Activates weather effect and visuals
	addOverlay(overlay){
		this.effects.weather = true;
		const elem = this.elem_parent.getElementsByClassName("row-weather")[0];
		elem.classList.add(overlay);
		fadeIn(elem, 500);
		this.updateScore();
	}
	
	// Deactivates weather effect and visuals
	removeOverlay(overlay){
		this.effects.weather = false;
		const elem = this.elem_parent.getElementsByClassName("row-weather")[0];
		fadeOut(elem, 500).then(done => { if (done) elem.classList.remove(overlay); });
		this.updateScore();
	}
	
	// Override
	resize(){
		this.resizeCardContainer(10, 0.075, .00325);
	}
	
	// Updates the row's score by summing the current power of its cards
	updateScore() {
		let total = 0;
		for (let card of this.cards) {
			total += this.cardScore(card);
		}
		let player = this.elem_parent.parentElement.id === "field-op" ? player_op : player_me;
		player.updateTotal(total - this.total);
		this.total = total;
		this.elem_parent.getElementsByClassName("row-score")[0].innerHTML = this.total;
	}
	
	// Calculates and set the card's current power
	cardScore(card){
		let total = this.calcCardScore(card);
		card.setPower(total);
		return total;
	}

	// Calculate total row score without updating
	calcScore()
	{
		return this.cards.reduce((sum, card) => sum + this.calcCardScore(card), 0);
	}
	
	// Calculates the current power of a card affected by row affects
	calcCardScore(card) {
		if (card.name === "Decoy")
			return 0;
		let total = card.basePower;
		if (card.hero)
			return total;
		if (this.effects.weather)
		{
			const weatherMin = this.effects.halfWeather ? Math.floor(total/2) : 1;
			total = Math.min(weatherMin, total);
		}
		if (game.doubleSpyPower && card.abilities.includes("spy"))
			total *= 2;
		let bond = this.effects.bond[card.id()];
		if (isNumber(bond) && bond > 1)
			total *= Number(bond);
		total += Math.max(0, this.effects.morale + (card.abilities.includes("morale") ? -1 : 0 ));
		if (this.effects.horn - (card.abilities.includes("horn") ? 1 : 0) >  0 )
			total *= 2;
		return total;
	}
	
	// Applies a temporary leader horn affect that is removed at the end of the round
	async leaderHorn(){
		if (this.special !== null)
			return;
		let horn = new Card(card_dict[5], null);
		await this.addCard(horn);
		game.roundEnd.push( () => this.removeCard(horn) );
	}
	
	// Applies a local scorch effect to this row
	async scorch() {
		if (this.total >= 10)
			await Promise.all( this.maxUnits().map( async c => {
				await c.animate("scorch", true, false);
				await board.toGrave(c, this);
			}));
	}
	
	// Removes all cards and effects from this row
	async clear() {
		const toGrave  = this.cards.filter(c => !c.noRemove);
		if (this.special != null)
			toGrave.push(this.special);
		await Promise.all(toGrave.map(async c => await board.toGrave(c, this)));
	}

	// Returns all regular unit cards with the heighest power
	maxUnits(){
		let max = [];
		for (let i=0; i<this.cards.length; ++i){
			let card = this.cards[i];
			if (!card.isUnit())
				continue;
			if (!max[0] || max[0].power < card.power)
				max = [card];
			else if (max[0].power === card.power)
				max.push(card);
		}
		return max;
	}
	
	// Override
	reset(){
		super.reset();
		while(this.special)
			this.removeCard(this.special);
		while(this.elem_special.firstChild)
			this.elem_special.removeChild(this.elem_special.firstChild);
		this.total = 0;
		//["rain","fog","frost"].forEach( w => this.removeOverlay(w) );
		this.effects = {weather:false, halfWeather: false, bond: {}, morale: 0, horn: 0, mardroeme: 0};
	}
}

// Handles how weather effects are added and removed
class Weather extends CardContainer {
	constructor(elem) {
		super(document.getElementById("weather"));
		this.types = {
			rain: {name:"rain", count: 0, rows: []},
			fog: {name:"fog", count: 0, rows: []},
			frost: {name:"frost", count: 0, rows: []}
		}
		let i=0;
		for (let key of Object.keys(this.types))
			this.types[key].rows = [board.row[i], board.row[5-i++]];
		
		this.elem.addEventListener("click",() => ui.selectRow(this), false);
	}
	
	// Adds a card if unique and clears all weather if 'clear weather' card added
	async addCard(card) {
		const isDuplicate = !!this.cards.find(c => c.name === card.name);
		super.addCard(card);
		FX.arrived(card, this);
		AudioManager.playSFX(card.audio);
		card.elem.classList.add("noclick");
		if (card.name === "Clear Weather"){
			// TODO Sunlight animation
			await sleep(500);
			this.clearWeather();
		} else {
			this.changeWeather(card, x => ++this.types[x].count === 1, (r,t) => r.addOverlay(t.name));
			if (isDuplicate)
			{
				await sleep(750);
				await board.toGrave(card, this);
			}
		}
		await sleep(1000);
	}
	
	// Override
	removeCard(card){
		card = super.removeCard(card);
		if (!card)
			return card;
		card.elem.classList.remove("noclick");
		this.changeWeather(card, x => --this.types[x].count === 0, (r,t) => r.removeOverlay(t.name));
		return card;
	}
	
	// Checks if a card's abilities are a weather type. If the predicate is met, perfom the action
	// on the type's associated rows
	changeWeather(card, predicate, action) {
		for (let x of card.abilities) {
			if (x in this.types && predicate(x)){
				for (let r of this.types[x].rows)
					action(r, this.types[x]);
			}
		}
	}
	
	// Removes all weather effects and cards
	async clearWeather() {
		await Promise.all(this.cards.map((c,i)=>this.cards[this.cards.length-i-1]).map(async c => await board.toGrave(c, this)));
	}
	
	// Override
	resize() {
		this.resizeCardContainer(4, 0.075, .045);
	}
	
	// Override
	reset(){
		super.reset();
		Object.keys(this.types).map(t => this.types[t].count = 0);
	}
}

// 
class Board {
	constructor() {
		this.op_score = 0;
		this.me_score = 0;
		this.row = [];
		for (let x=0; x<6; ++x) {
			let elem = document.getElementById( (x<3)?"field-op":"field-me" ).children[x%3];
			this.row[x] = new Row(elem);
		}
	}
	
	// Get the opponent of this Player
	opponent(player){
		return player === player_me ? player_op : player_me;
	}
	
	// Sends and translates a card from the source to the Deck of the card's holder
	async toDeck(card, source){
		await this.moveTo(card, "deck", source);
	}
	
	// Sends and translates a card from the source to the Grave of the card's holder
	async toGrave(card, source){
		await this.moveTo(card, "grave", source);
	}

	// Sends and translates a card from the source to the Hand of the card's holder
	async toHand(card, source) {
		await this.moveTo(card, "hand", source);
	}

	// Sends and translates a card from the source to Weather
	async toWeather(card, source) {
		await this.moveTo(card, weather, source);
	}
	
	// Sends and translates a card from the source to the Deck of the card's combat row
	async toRow(card, source) {
		let row = card.row;
		if (row === "agile")
		{
			if (card.holder.controller instanceof ControllerAI)
			{
				row = card.holder.controller.determineAgileRow(card).type;
			}
			else
			{
				row = "close";
			}
		}
		await this.moveTo(card, row, source);
	}
	
	// Sends and translates a card from the source to a specified row name or CardContainer
	async moveTo(card, dest, source) {
		if (isString(dest))
			dest = this.getRow(card, dest);
		await translateTo(card, source ? source : null, dest);
		// FIX: the card may have left its source during the animation (e.g. pulled by Muster): do not add "undefined"
		const moved = source ? source.removeCard(card) : card;
		if (!moved)
			return;
		await dest.addCard(moved);
	}
	
	// Sends and translates a card from the source to a row name associated with the passed player
	async addCardToRow(card, row_name, player, source) {
		let row = this.getRow(card, row_name, player);
		await translateTo(card, source, row);
		await row.addCard(card);
	}
	
	// Returns the CardCard associated with the row name that the card would be sent to
	getRow(card, row_name, player){
		player = player ? player : card ? card.holder : player_me;
		let isMe = player === player_me;
		let isSpy = card.abilities.includes("spy");
		switch (row_name) {
			case "weather": return weather; break;
			case "close":  return this.row[ isMe^isSpy ? 3 : 2];
			case "ranged": return this.row[ isMe^isSpy ? 4 : 1];
			case "siege":  return this.row[ isMe^isSpy ? 5 : 0];
			case "grave": return player.grave;
			case "deck": return player.deck;
			case "hand": return player.hand;
			default: console.error( card.name + " sent to incorrect row \"" +row_name+ "\" by " +card.holder.name );
		}
	}
	
	// Updates which player currently is in the lead
	updateLeader() {
		let dif = player_me.total - player_op.total;
		player_me.setWinning(dif > 0);
		player_op.setWinning(dif < 0);
	}

	async clearRound()
	{
		await Promise.all([
			await weather.clearWeather(),
			...board.row.map(async row => await row.clear())
		]);
	}
}


class GameStateEnum extends Enum {};
const GameState = Object.freeze({
	CUSTOMIZE: new GameStateEnum(0),
	PLAYING: new GameStateEnum(10),
	END_SCREEN: new GameStateEnum(100)
});

class Game {
	constructor() {
		this.endScreen = document.getElementById("end-screen");
		let buttons = this.endScreen.getElementsByTagName("button");
		this.customize_elem = buttons[0];
		this.rematch_elem = buttons[1];
		this.newGame_elem = buttons[2];
		this.customize_elem.addEventListener("click", () => this.returnToCustomization(), false);
		this.rematch_elem.addEventListener("click", () => this.rematchGame(), false);
		this.newGame_elem.addEventListener("click", () => this.newOpponentGame(), false);
		this.state = GameState.CUSTOMIZE;
		this.reset();
	}
	
	reset() {
		// incremented for every new game: delayed effects of a previous game must not run in the next one
		this.generation = (this.generation || 0) + 1;
		this.firstPlayer = null;
		this.currPlayer = null;
		
		this.gameStart = [];
		this.roundStart = [];
		this.roundEnd = [];
		this.turnStart = [];
		this.turnEnd = [];
		
		this.roundCount = 0;
		this.roundHistory = [];
		
		this.randomRespawn = false;
		this.doubleSpyPower = false;

		this.placedEffectsActive = false; //TODO replace with propper game state
		
		weather.reset();
		board.row.forEach(r => r.reset());
	}
	
	// Sets up player faction abilities and psasive leader abilities
	initPlayers(p1, p2){
		let l1 = ability_dict[p1.leader.abilities[0]];
		let l2 = ability_dict[p2.leader.abilities[0]];
		if (l1 === ability_dict["emhyr_whiteflame"] || l2 === ability_dict["emhyr_whiteflame"]){
			p1.disableLeader();
			p2.disableLeader();
		} else {
			initLeader(p1, l1);
			initLeader(p2, l2);
		}
		if (p1.deck.faction === p2.deck.faction && p1.deck.faction === "scoiatael")
			return;
		initFaction(p1);
		initFaction(p2);
		
		function initLeader(player, leader){
			if (leader.placed)
				leader.placed(player.leader);
			Object.keys(leader).filter(key => game[key]).map(key => game[key].push(leader[key]));
		}
		
		function initFaction(player){
			if (factions[player.deck.faction] && factions[player.deck.faction].factionAbility)
				factions[player.deck.faction].factionAbility(player);
		}
	}

	isPlaying()
	{
		return this.state === GameState.PLAYING;
	}

	setState(newState)
	{
		if (!(newState instanceof GameStateEnum) || this.state === newState)
			return;
		const oldState = this.state;
		this.state = newState;
		EventManager.gameStateChanged.dispatch(oldState, newState);
	}
	
	// Sets initializes player abilities, player hands and redraw
	async startGame() {
		EventManager.gameOpened.dispatch();
		this.initPlayers(player_me, player_op);
		this.setState(GameState.PLAYING);
		AudioManager.playSFX('game_opening');
		await this.runEffects(this.gameStart);
		await this.coinToss();
		AudioManager.playSFX('redraw');
		await Promise.all([...Array(10).keys()].map( async () => {
			await player_me.deck.draw(player_me.hand);
			await player_op.deck.draw(player_op.hand);
		}));
		AudioManager.playSFX("game_start");
		await this.initialRedraw();
		this.currPlayer = this.firstPlayer;
		this.startRound();
	}
	
	// Simulated coin toss to determine who starts game
	async coinToss(){
		if (this.firstPlayer)
			return;
		this.firstPlayer = (Math.random() < 0.5) ? player_me : player_op;
		await ui.notification(this.firstPlayer.tag + "-coin", 1200);
	}
	
	// Allows the player to swap out up to two cards from their iniitial hand
	async initialRedraw(){
		for (let i=0; i< 2; i++)
			player_op.controller.redraw();
		await ui.queueCarousel(player_me.hand, 2, async (c, i) => { 
			AudioManager.playSFX('redraw');
			await player_me.deck.swap(c, c.cards[i]);
		}, c => true, false, true, t("redraw"));
		player_me.hand.sort();
		ui.enablePlayer(false);
	}
	
	// Initiates a new round of the game
	async startRound(){
		this.firstPlayer = this.currPlayer;
		this.roundCount++;
		EventManager.roundStarted.dispatch(this.roundCount, this.currPlayer);
		if (this.roundCount === 1)
			AudioManager.playSFX("round1_start");
		await this.runEffects(this.roundStart);
		
		if ( !player_me.canPlay() )
			player_me.setPassed(true);
		if ( !player_op.canPlay() )
			player_op.setPassed(true);
		
		if (player_op.passed && player_me.passed)
			return this.endRound();
		
		if (this.currPlayer.passed)
			this.currPlayer = this.currPlayer.opponent();
		
		await ui.notification("round-start", 1200);
		AudioManager.playSFX(this.currPlayer === player_me ? "turn_me" : "turn_op");
		await ui.notification(this.currPlayer.tag + "-turn", 1200);
		this.startTurn();
	}
	
	// Starts a new turn. Enables client interraction in client's turn.
	async startTurn() {
		await this.runEffects(this.turnStart);
		ui.enablePlayer(this.currPlayer === player_me);
		this.currPlayer.startTurn();
	}
	
	// Ends the current turn and may end round. Disables client interraction in client's turn.
	async endTurn() {
		if (this.currPlayer === player_me)
			ui.enablePlayer(false);
		await this.runEffects(this.turnEnd);
		if (this.currPlayer.passed)
			await ui.notification(this.currPlayer.tag + "-pass", 1200);
		if (player_op.passed && player_me.passed)
			this.endRound();
		else
		{
			if (!this.currPlayer.opponent().passed)
			{
				this.currPlayer = this.currPlayer.opponent();
				AudioManager.playSFX(this.currPlayer === player_me ? "turn_me" : "turn_op");
				await ui.notification(this.currPlayer.tag + "-turn", 1200);
			}
			await this.startTurn();
		}
	}
	
	// Ends the round and may end the game. Determines final scores and the round winner.
	async endRound() {
		let dif = player_me.total - player_op.total;
		let nilfgaardTie = false;
		if (dif === 0) {
			let nilf_me = player_me.deck.faction === "nilfgaard", nilf_op = player_op.deck.faction === "nilfgaard";
			dif = nilf_me ^ nilf_op ? nilf_me ? 1 : -1 : 0;
			nilfgaardTie = dif !== 0;
		}
		let winner = dif > 0 ? player_me : dif < 0 ? player_op : null;
		let verdict = {winner: winner, score_me: player_me.total, score_op: player_op.total}
		this.roundHistory.push(verdict);
		
		await this.runEffects(this.roundEnd);
		
		player_me.endRound( dif > 0);
		player_op.endRound( dif < 0);
		
		let notificationKey = "";
		if (dif > 0)
		{
			AudioManager.playSFX("round_win");
			notificationKey = "win-round";
		}	
		else if (dif < 0)
		{
			AudioManager.playSFX("round_lose");
			notificationKey = "lose-round";
		}
		else
		{
			AudioManager.playSFX("round_lose");
			notificationKey = "draw-round";
		}

		// TW3: "Nilfgaard faction ability triggered - Nilfgaard wins the tie."
		if (nilfgaardTie)
			await ui.notification("nilfgaard", 1200);
		await Promise.all([
			await board.clearRound(),
			await ui.notification(notificationKey, 1200)
		]);

		EventManager.roundEnded.dispatch(this.roundCount, player_me.total, player_op.total);
		if (player_me.health === 0 || player_op.health === 0)
			this.endGame();
		else
		{
			this.currPlayer = dif < 0 ? player_op : dif > 0 ? player_me : this.firstPlayer;
			this.startRound();
		}
	}
	
	// Sets up and displays the end-game screen
	async endGame() {
		let endScreen = document.getElementById("end-screen");
		let rows = endScreen.getElementsByTagName("tr");
		rows[1].children[0].textContent = player_me.name;
		rows[2].children[0].textContent = player_op.name;
		
		for (let i=1; i<4; ++i) {
			let round = this.roundHistory[i-1];
			rows[1].children[i].innerHTML = round ? round.score_me : 0;
			rows[1].children[i].style.color = round && round.winner === player_me ? "goldenrod" : "";
			
			rows[2].children[i].innerHTML = round ? round.score_op : 0;
			rows[2].children[i].style.color = round && round.winner === player_op ? "goldenrod" : "";
		}
		
		endScreen.children[0].className = "";
		endScreen.children[0].setAttribute("data-text", player_op.health <= 0 && player_me.health <= 0 ? t("end.drawTitle") : player_op.health === 0 ? t("end.win") : t("end.lose"));
		if (player_op.health <= 0 && player_me.health <= 0) {
			endScreen.getElementsByTagName("p")[0].classList.remove("hide");
			AudioManager.playSFX("game_lose");
			endScreen.children[0].classList.add("end-draw");
		} else if (player_op.health === 0){
			AudioManager.playSFX("game_win");
			endScreen.children[0].classList.add("end-win");
		} else {
			AudioManager.playSFX("game_lose");
			endScreen.children[0].classList.add("end-lose");
		}
		
		fadeIn(endScreen, 300);
		ui.enablePlayer(true);
		this.setState(GameState.END_SCREEN);
	}

	exitGame()
	{
		const wasEnabled = !document.getElementsByTagName("main")[0].classList.contains("noclick");
		AudioManager.playSFX('warning');
		ui.popup(
			// FIX: "Resume" must give control back (the board stayed unclickable)
			t("exit.resume"), ()=>ui.enablePlayer(wasEnabled),
			t("exit.exit"), ()=>this.returnToCustomization(),
			t("exit.title") , t("exit.text")
		);
		if (Popup.curr)
			Popup.curr.escapeIsYes = true; 
	}
	
	// Returns the client to the deck customization screen
	returnToCustomization(){
		ui.enablePlayer(false);
		this.reset();
		player_me.reset();
		player_op.reset();
		EventManager.customizationOpened.dispatch();
		this.endScreen.classList.add("hide");
		document.getElementById("deck-customization").classList.remove("hide");
		AudioManager.playSFX('menu_opening');
		this.setState(GameState.CUSTOMIZE);
	}

	newOpponentGame()
	{
		this.reset();
		player_me.reset();
		player_op = new Player(1, t("player.op"), dm.constructOpponentDeck(false));
		this.endScreen.classList.add("hide");
		this.startGame();
	}
	
	// Restarts the last game with the dame decks
	rematchGame(){
		this.reset();
		player_me.reset();
		player_op.reset();
		this.endScreen.classList.add("hide");
		this.startGame();
	}
	
	// Executes effects in list. If effect returns true, effect is removed.
	async runEffects(effects){
		for (let i=effects.length-1; i>=0; --i){
			let effect = effects[i];
			if (await effect())
				effects.splice(i,1)
		}
	}
	
}

// Contians information and behavior of a Card
class Card {

	constructor(card_data, player) {
		this.name = card_data.name;
		this.basePower = this.power = Number(card_data.strength);
		this.faction = card_data.deck;
		this.abilities = (card_data.ability === "") ? [] : card_data.ability.split(" ");
		this.row = (card_data.deck === "weather") ? card_data.deck : card_data.row;
		this.filename = card_data.filename;
		if (card_data.muster)
		{
			this.muster = card_data.muster;
		}
		this.placed = [];
		this.removed = [];
		this.activated = [];
		this.holder = player;
		
		this.hero = false;
		if (this.abilities.length > 0) {
			this.audio = this.abilities[this.abilities.length-1];
			if (this.abilities[0] === "hero") {
				this.hero = true;
				this.abilities.splice(0, 1);
			}
			for (let x of this.abilities) {
				let ab = ability_dict[x];
				if ("placed" in ab) this.placed.push(ab.placed);
				if ("removed" in ab) this.removed.push(ab.removed);
				if ("activated" in ab) this.activated.push(ab.activated);
			}
		}
		
		// texts shown in the description box (localized, see i18n.js)
		const textKey = x => (x === "scorch" && this.isUnit()) || (x === "scorch" && this.hero) ? "scorch_unit"
			: x === "muster" && this.name === "Cerys" ? "cerys" : x;
		if (this.row === "leader")
			this.desc_name = t("leader.ability");
		else if (this.abilities.length > 0)
			this.desc_name = abilityName(textKey(this.abilities[this.abilities.length-1]));
		else if (this.row==="agile")
			this.desc_name = abilityName("agile");
		else if (this.hero)
			this.desc_name = abilityName("hero");
		else
			this.desc_name = "";
		
		this.desc = this.row ==="agile" ? abilityDesc("agile") : "";
		for (let i=this.abilities.length-1; i>=0; --i) {
			this.desc += abilityDesc(textKey(this.abilities[i]));
		}
		if (this.hero)
			this.desc += abilityDesc("hero");
		
		this.elem = this.createCardElem(this);
	}
	
	// Returns the identifier for this type of card
	id() {
		return this.name;
	}
	
	// Sets and displays the current power of this card
	setPower(n){
		if (this.name === "Decoy")
			return;
		let elem = this.elem.children[0].children[0];
		if (n !== this.power) {
			this.power = n;
			elem.innerHTML = this.power;
		}
		elem.style.color = (n>this.basePower) ? "goldenrod" : (n<this.basePower) ? "red" : "";
	}
	
	// Resets the power of this card to default
	resetPower(){
		this.setPower(this.basePower);
	}
	
	// Automatically sends and translates this card to its apropriate row from the passed source
	async autoplay(source){
		await board.toRow(this, source);
	}
	
	// Animates an ability effect
	async animate(name, bFade = true, bExpand = true) {
		AudioManager.playSFX(name);
		if (name === "scorch") {
			return await this.scorch(name);
		}
		let anim = this.elem.children[3];
		anim.style.backgroundImage = iconURL("anim_" + name);
		await sleep(50);
		
		if (bFade) fadeIn(anim, 300);
		if (bExpand) anim.style.backgroundSize = "100% auto";
		await sleep(300);
		
		if (bExpand) anim.style.backgroundSize = "80% auto";
		await sleep(1000);
		
		if (bFade) fadeOut(anim, 300);
		if (bExpand) anim.style.backgroundSize = "40% auto";
		await sleep(300);
		
		anim.style.backgroundImage = "";
	}
	
	// Animates the scorch effect
	async scorch(name){
		let anim = this.elem.children[3];
		anim.style.backgroundSize = "cover";
		anim.style.backgroundImage = iconURL("anim_" + name);
		await sleep(50);
		
		fadeIn(anim, 300);
		await sleep(1300);
		
		fadeOut(anim, 300);
		await sleep(300);
		
		anim.style.backgroundSize = "";
		anim.style.backgroundImage = "";
	}
	
	// Returns true if this is a combat card that is not a Hero
	isUnit(){
		return !this.hero && (this.row === "close" || this.row === "ranged" || this.row === "siege" || this.row === "agile");
	}
	
	// Returns true if card is sent to a Row's special slot
	isSpecial() {
		return this.name === "Commander's Horn" || this.name === "Mardroeme";
	}

	isHero() { return this.hero; }

	// Compares by type then power then name
	static compare(a, b){
		var dif = factionRank(a) - factionRank(b);
		if (dif !== 0)
			return dif;
		dif = a.basePower - b.basePower;
		if (dif && dif !== 0)
			return dif;
		return a.name.localeCompare(b.name);
		
		function factionRank(c){ return c.faction === "special" ? -2 : (c.faction === "weather") ? -1 : 0; }
	}

	// Creates an HTML element based on the card's properties
	createCardElem(card){
		let elem = document.createElement("div");
		elem.style.backgroundImage = smallURL(card.faction + "_" + card.filename);
		elem.classList.add("card");
		elem.setAttribute('data-title', cardName(card));
		elem.gcCard = card;
		elem.addEventListener("click", () => ui.selectCard(card), false);
		// FIX: right click shows the card details (the browser menu used to open in Firefox)
		elem.addEventListener("contextmenu", e => {
			e.preventDefault();
			e.stopPropagation();
			if (!Carousel.curr && !Popup.curr && card.holder)
				ui.viewCard(card);
		}, false);
		
		if (card.row === "leader")
			return elem;
		
		let power = document.createElement("div");
		elem.appendChild(power);
		let bg;
		if (card.hero) {
			bg = "power_hero";
			elem.classList.add("hero");
		} else if (card.faction === "weather") {
			bg = "power_" + card.abilities[0];
		} else if (card.faction === "special") {
			bg = "power_" + card.abilities[0];
			elem.classList.add("special");
		} else {
			bg = "power_normal";
		}
		power.style.backgroundImage = iconURL(bg);
		
		let row = document.createElement("div");
		elem.appendChild(row);
		if (card.row === "close" || card.row === "ranged" || card.row === "siege" || card.row === "agile") {
			let num = document.createElement("div");
			num.appendChild( document.createTextNode(card.basePower) );
			num.classList.add("center");
			power.appendChild(num);
			row.style.backgroundImage = iconURL("card_row_" + card.row);
		}

		let abi = document.createElement("div");
		elem.appendChild(abi);
		if (card.faction !== "special" && card.faction !== "weather" && card.abilities.length > 0) {
			let str =  card.abilities[card.abilities.length-1];
			if (str === "cerys")
				str = "muster";
			if (str.startsWith("avenger"))
				str = "avenger";
			if (str === "scorch_c" || str == "scorch_r" || str === "scorch_s")
				str = "scorch";
			abi.style.backgroundImage = iconURL("card_ability_" + str);
		} else if (card.row === "agile")
			abi.style.backgroundImage = iconURL("card_ability_" + "agile");
		
		elem.appendChild( document.createElement("div") ); // animation overlay
		elem.addEventListener('mouseenter', CLICK_EVENT_SFX);
		return elem;
	}

	
	// Takes ID-Count object pairs and expands to a list of corresponding IDs
	static expandIDCounts(card_id_list)
	{
		return card_id_list.reduce((a,c) => a.concat(clone(c.count, card_dict[c.index])), []);
		function clone(n ,elem) { for (var  i=0, a=[]; i<n; ++i) a.push(elem); return a; }
	}

	// Takes ID-Count object pairs and returns a list of corresponding Cards
	static getCardsFromIdCounts(card_id_list, player)
	{
		return Card.expandIDCounts(card_id_list).map(e => new Card(e, player));
	}
}

// Handles notifications and client interration with menus
class UI {
	constructor() {
		this.carousels = [];
		this.notif_elem = document.getElementById("notification-bar");
		document.getElementById('exit-game').addEventListener('click', ()=>game.exitGame(), false);
		this.preview = document.getElementsByClassName("card-preview")[0];
		this.previewCard = null;
		this.lastRow = null;
		this.toggleSettings = [];
		document.getElementById("pass-button").addEventListener("click", () => {
			player_me.passRound();
			AudioManager.playSFX('pass');
		}, false);
		document.getElementById("click-background").addEventListener("click", () => ui.cancel(), false);
		this.toggleMusic_elem = document.getElementById("toggle-music");
		this.toggleSettings.push(this.toggleMusic_elem);
		this.toggleMusic_elem.addEventListener("click", () => this.toggleMusic(), false);
		this.toggleNotifications_elem = document.getElementById("toggle-notifications");
		this.toggleSettings.push(this.toggleNotifications_elem);
		this.toggleNotifications_elem.addEventListener("click", () => this.toggleNotifications(), false);
		if (!Settings.notifications.isEnabled())
			this.toggleNotifications_elem.classList.add("fade");
		this.toggleSFX_elem = document.getElementById("toggle-sfx");
		this.toggleSettings.push(this.toggleSFX_elem);
		this.toggleSFX_elem.addEventListener('click', () => this.toggleSFX())
		this.toggleLanguage_elem = document.getElementById("toggle-language");
		this.toggleLanguage_elem.innerHTML = LANG === "fr" ? "<b>FR</b>&nbsp;·&nbsp;EN" : "FR&nbsp;·&nbsp;<b>EN</b>";
		this.toggleLanguage_elem.addEventListener("click", () => setLanguage(LANG === "fr" ? "en" : "fr"));
		this.toggleSettings.push(this.toggleLanguage_elem);
		if (!Settings.soundEffects.isEnabled())
			this.toggleSFX_elem.classList.add("fade");

		EventManager.gameOpened.bind(()=>this.toggleSettings.forEach(e=>e.classList.remove('deck-menu')));
		EventManager.customizationOpened.bind(()=>this.toggleSettings.forEach(e=>e.classList.add('deck-menu')));

		[	'.settings-button',
			'.deck-options',
			'#pass-button',
			'#end-screen>button',
			'#op-preview-leader',
			'#opponent-preview button'
		].forEach(addMouseEnterSFXBySelector);
	}
	
	// Enables or disables client interration
	enablePlayer(enable){
		let main = document.getElementsByTagName("main")[0].classList;
		if (enable) main.remove("noclick"); else main.add("noclick");
	}
	
	// Called when client toggles the music (see music.js)
	toggleMusic(){
		Music.toggle();
	}

	toggleNotifications() {
		Settings.notifications.toggle();
		const useNotificaitons = Settings.notifications.isEnabled();
		if (useNotificaitons)
		{
			this.toggleNotifications_elem.classList.remove("fade");
		}
		else
		{
			this.toggleNotifications_elem.classList.add("fade");
		}
	}

	toggleSFX() {
		Settings.soundEffects.toggle();
		const useSFX = Settings.soundEffects.isEnabled();
		if (useSFX)
		{
			this.toggleSFX_elem.classList.remove("fade");
		}
		else
		{
			this.toggleSFX_elem.classList.add("fade");
		}
	}
	
	// Called when the player selects a selectable card
	async selectCard(card) {
		let row = this.lastRow;
		let pCard = this.previewCard;
		if (card === pCard)
			return;
		if (pCard === null || card.holder.hand.cards.includes(card)) {
			this.setSelectable(null, false);
			this.showPreview(card);
		} else if (pCard.name === "Decoy") {
			FX.launchFromPreview(pCard);
			this.hidePreview(card);
			this.enablePlayer(false);
			board.toHand(card, row);
			await board.moveTo(pCard, row, pCard.holder.hand);
			pCard.holder.endTurn();
		}
	}
	
	// Called when the player selects a selectable CardContainer
	async selectRow(row){
		EventManager.rowSelected.dispatch(row, player_me);
		if (game.placedEffectsActive)
		{
			return;
		}
		this.lastRow = row;
		if (this.previewCard === null) {
			await ui.viewCardsInContainer(row);
			return;
		}
		if (this.previewCard.name === "Decoy")
			return;
		let card = this.previewCard;
		let holder = card.holder;
		if (card.name !== "Scorch")
			FX.launchFromPreview(card);
		this.hidePreview();
		this.enablePlayer(false);
		if (card.name === "Scorch"){
			this.hidePreview();
			await ability_dict["scorch"].activated(card);
		} else if (card.name === "Decoy") {
			return;
		} else {
			await board.moveTo(card, row, card.holder.hand);
		}
		holder.endTurn();
	}
	
	// Called when the client cancels out of a card-preview
	cancel(){
		this.hidePreview();
		EventManager.previewCancelled.dispatch();
	}
	
	// Displays a card preview then enables and highlights potential card destinations
	showPreview(card, allowClose = true) {
		this.showPreviewVisuals(card);
		this.setSelectable(card, true);
		AudioManager.playSFX('open');
		if (allowClose)
		{
			document.getElementById("click-background").classList.remove("noclick");
		}
		else
		{
			document.getElementById('leader-me').classList.add("noclick");
			document.getElementById('pass-button').classList.add("noclick");
			player_me.hand.cards.forEach( c => c.elem.classList.add("noclick") );
		}
	}
	
	// Sets up the graphics and description for a card preview
	showPreviewVisuals(card){
		this.previewCard = card;
		this.preview.classList.remove("hide");
		setLargeCardImage(this.preview.getElementsByClassName("card-lg")[0], card);
		let desc_elem = this.preview.getElementsByClassName("card-description")[0];
		this.setDescription(card, desc_elem);
	}
	
	// Hides the card preview then disables and removes highlighting from card destinations
	hidePreview(){
		document.getElementById("click-background").classList.add("noclick");
		player_me.hand.cards.forEach( c => c.elem.classList.remove("noclick") );
		document.getElementById('leader-me').classList.remove("noclick");
		document.getElementById('pass-button').classList.remove("noclick");
		
		this.preview.classList.add("hide");
		this.setSelectable(null, false);
		this.previewCard = null;
		this.lastRow = null;
	}
	
	// Sets up description window for a card
	setDescription(card, desc){
		if (!card)
		{
			desc.children[1].innerHTML = "NULL";
			desc.children[2].innerHTML = "";
			return;
		}
		if (card.hero || card.row === "agile" || card.abilities.length > 0 || card.faction === "faction") {
			desc.classList.remove("hide");
			let str = card.row === "agile" ? "agile" : "";
			if (card.abilities.length)
				str = card.abilities[card.abilities.length-1];
			if (str === "cerys")
				str = "muster";
			if (str.startsWith("avenger"))
				str = "avenger";
			if (str === "scorch_c" || str == "scorch_r" || str === "scorch_s")
				str = "scorch";
			if (card.row === "leader" || card.faction === "faction" || card.abilities.length === 0 && card.row !== "agile")
				desc.children[0].style.backgroundImage = "";
			else
				desc.children[0].style.backgroundImage = iconURL("card_ability_" + str);
			desc.children[1].innerHTML = card.desc_name;
			desc.children[2].innerHTML = card.desc;
		} else {
			desc.classList.add("hide");
		}
	}
	
	// Displayed a timed notification to the client
	async notification(name, duration){
		if (!Settings.notifications.isEnabled())
			return;
		if (!duration)
			duration = 1200;
		const fadeSpeed = 150;
		duration = Math.max(400, duration - 2*fadeSpeed);
		this.notif_elem.children[0].id = "notif-" + name;
		this.notif_elem.children[0].setAttribute("data-text", t("notif." + name));
		await fadeIn(this.notif_elem, fadeSpeed);
		await sleep(duration);
		await fadeOut(this.notif_elem, fadeSpeed);
	}
	
	// Displays a cancellable Carousel for a single card 
	async viewCard(card, action) {
		if (card === null)
			return;
		let container = new CardContainer();
		container.cards.push(card);
		await this.viewCardsInContainer(container, action);
	}
	
	// Displays a cancellable Carousel for all cards in a container
	async viewCardsInContainer(container, action, title) {
		action = action ? action : function() {return this?.cancel?.();};
		await this.queueCarousel(container, 1, action, () => true, false, true, title);
	}
	
	// Displays a Carousel menu of filtered container items that match the predicate.
	// Suspends gameplay until the Carousel is closed. Automatically picks random card if activated for AI player
	async queueCarousel(container, count, action, predicate, bSort, bQuit, title){
		if (game.currPlayer === player_op) {
			if (player_op.controller instanceof ControllerAI)
				for (let i=0; i<count; ++i){
					let cards = container.cards.reduce((a,c,i) => !predicate || predicate(c) ? a.concat([i]) : a, []);
					if (cards.length === 0)
						break;
					await action(container, cards[randomInt(cards.length)]);
				}
			return;
		}
		let carousel = new Carousel(container, count, action, predicate, bSort, bQuit, title);
		if (Carousel.curr === undefined || Carousel.curr === null)
			carousel.start();
		else {
			this.carousels.push(carousel);
			return;
		}
		await sleepUntil( () => this.carousels.length === 0 && !Carousel.curr, 100);
	}
	
	// Starts the next queued Carousel
	quitCarousel(){
		if (this.carousels.length > 0) {
			this.carousels.shift().start();
		}
	}
	
	// Displays a message with a single OK button
	async message(text, title = "") {
		await this.popup("OK", null, null, null, title, text);
	}

	// Asks a yes / no question, resolves true for yes
	async confirm(title, text) {
		let answer = false;
		await this.popup(t("popup.yes"), () => answer = true, t("popup.no"), () => answer = false, title, text);
		return answer;
	}

	// Displays a custom confirmation menu 
	async popup(yesName, yes, noName, no, title, description, alpha = .95) {
		let p = new Popup(yesName, yes, noName, no, title, description, alpha);
		await sleepUntil( () => !Popup.curr) 
	}
	
	// Enables or disables selection and highlighting of rows specific to the card
	setSelectable(card, enable){
		if(!enable) {
			document.querySelectorAll(".gc-target").forEach(e => e.classList.remove("gc-target"));
			for (let row of board.row){
				row.elem.classList.remove("row-selectable");
				row.elem.classList.remove("noclick");
				row.elem_special.classList.remove("row-selectable");
				row.elem_special.classList.remove("noclick");
				row.elem.classList.add("card-selectable");
				
				for (let card of row.cards) {
					card.elem.classList.add("noclick");
				}
			}
			weather.elem.classList.remove("row-selectable");
			weather.elem.classList.remove("noclick");
			return;
		}
		if (card.faction === "weather") {
			for (let row of board.row){
				row.elem.classList.add("noclick");
				row.elem_special.classList.add("noclick");
			}
			weather.elem.classList.add("row-selectable");
			return;
		}
		
		weather.elem.classList.add("noclick");
		
		if (card.name === "Scorch") {
			for (let r of board.row){
				r.elem.classList.add("row-selectable");
				r.elem_special.classList.add("row-selectable");
			}
			return;
		}
		if (card.isSpecial()){
			for (let i=0; i<6; i++){
				let r = board.row[i];
				if (i < 3 || r.special !== null){
					r.elem.classList.add("noclick");
					r.elem_special.classList.add("noclick");
				} else {
					r.elem_special.classList.add("row-selectable");
				}
			}
			return;
		}
		
		board.row.forEach( r => r.elem_special.classList.add("noclick") );
		
		if (card.name === "Decoy"){
			for (let i=0; i<6; ++i) {
				let r = board.row[i];
				let units = r.cards.filter(c => c.isUnit());
				if (i < 3 || units.length === 0) {
					r.elem.classList.add("noclick");
					r.elem_special.classList.add("noclick");
					r.elem.classList.remove("card-selectable");
				} else {
					r.elem.classList.add("row-selectable");
					units.forEach( c => {
						c.elem.classList.remove("noclick");
						c.elem.classList.add("gc-target");
					});
				}
			}
			return;
		}
		
		let currRows = card.row === "agile" ? [board.getRow(card, "close", card.holder), board.getRow(card, "ranged", card.holder)] : [board.getRow(card, card.row, card.holder)];
		for (let i=0; i<6; i++){
			let row = board.row[i];
			if (currRows.includes(row)) {
				row.elem.classList.add("row-selectable");
			} else {
				row.elem.classList.add("noclick");
			}
		}
	}

	// used to handle row selection when resetoring agile units via medics
	async waitForRowSelection(card)
	{
		game.placedEffectsActive = true;
		ui.setSelectable(null, false);
		ui.showPreview(card, false);
		ui.enablePlayer(true);
		let selectedRow = null;
		let bRowSelected = false;
		const rowSelect = event => {
			const {row, player} = event.detail;
			bRowSelected = true;
			selectedRow = row;
		};
		EventManager.rowSelected.bind(rowSelect);
		EventManager.previewCancelled.bind(rowSelect);
		await sleepUntil(() => bRowSelected === true);
		EventManager.rowSelected.unbind(rowSelect);
		EventManager.previewCancelled.unbind(rowSelect);
		ui.hidePreview();
		game.placedEffectsActive = false;
		return selectedRow;
	}
}

// Displays up to 5 cards for the client to cycle through and select to perform an action
// Clicking the middle card performs the action on that card "count" times
// Clicking adejacent cards shifts the menu to focus on that card
class Carousel {
	constructor(container, count, action, predicate, bSort, bExit = false, title) {
		if (count <= 0 || !container || !action || container.cards.length === 0)
			return ;
		this.container = container;
		this.count = count;
		this.action = action ? action : () => this.cancel();
		this.predicate = predicate;
		this.bSort = bSort;
		this.indices = [];
		this.index = 0;
		this.bExit = bExit;
		this.title = title;
		this.cancelled = false;
		
		if (!Carousel.elem) {
			Carousel.elem = document.getElementById("carousel");
			Carousel.elem.children[0].addEventListener("click", () => Carousel.curr.cancel(), false);
			// FIX: registered once instead of once per carousel
			[...Carousel.elem.children[0].children].forEach(e => e.addEventListener("mouseout", evt=>Carousel.curr?.nudge(0)));
		}
		this.elem = Carousel.elem;
		document.getElementsByTagName("main")[0].classList.remove("noclick");
		
		this.elem.children[0].classList.remove("noclick");
		this.previews = this.elem.getElementsByClassName("card-lg");
		this.desc = this.elem.getElementsByClassName("card-description")[0];
		this.title_elem = this.elem.children[2];
		this.elem.children[0].style.setProperty('--carousel-trans-time', "0.25s");
	}
	
	// Initializes the current Carousel
	start(){
		if (!this.elem)
			return;
		this.indices = this.container.cards.reduce((a,c,i)=> (!this.predicate || this.predicate(c)) ? a.concat([i]) : a, []);
		if (this.indices.length <= 0)
			return this.exit();
		if (this.bSort)
			this.indices.sort( (a, b) => Card.compare(this.container.cards[a],this.container.cards[b]) );
		
		this.update();
		Carousel.setCurrent(this);
		
		if (this.title) {
			this.title_elem.innerHTML = this.title;
			this.title_elem.classList.remove("hide");
		} else {
			this.title_elem.classList.add("hide");
		}
		AudioManager.playSFX('open');
		this.elem.classList.remove("hide");
		ui.enablePlayer(true);
	}
	
	// Called by the client to cycle cards displayed by n
	shift(event, n){
		(event || window.event)?.stopPropagation();
		const old = this.index;
		this.index = Math.max(0, Math.min(this.indices.length-1, this.index+n));
		AudioManager.playSFX('ui_card');
		const moved = this.index - old;
		const before = moved ? [...this.previews].map(e => e.classList.contains("hide") ? null : e.getBoundingClientRect()) : null;
		this.update();
		if (moved)
			this.slide(moved, before);
	}

	// Slides the cards to their new places (each slot shows the card of its neighbour after a shift)
	slide(moved, before) {
		const slots = [...this.previews];
		const after = slots.map(e => e.classList.contains("hide") ? null : e.getBoundingClientRect());
		// distance between two neighbouring slots
		let step = 0;
		for (let j = 0; j + 1 < after.length && !step; j++)
			if (after[j] && after[j + 1])
				step = (after[j + 1].left + after[j + 1].width / 2) - (after[j].left + after[j].width / 2);
		if (!step)
			step = (after.find(Boolean)?.width || 0) * 1.1;
		slots.forEach((e, j) => {
			e.getAnimations().filter(a => !(window.CSSTransition && a instanceof CSSTransition)).forEach(a => a.cancel());
			const to = after[j];
			if (!to)
				return;
			const k = j + moved;
			let from = k >= 0 && k < slots.length ? before[k] : null;
			let fadeIn = false;
			if (!from) {
				// a card coming from outside: start one step further, invisible
				fadeIn = true;
				from = {left: to.left + Math.sign(moved) * step, top: to.top, width: to.width, height: to.height};
			}
			const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
			const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
			const sc = from.width / to.width;
			e.animate([
				{transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: fadeIn ? 0 : 1},
				{transform: "none", opacity: 1}
			], {duration: 260, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)"});
		});
		this.desc.animate([{opacity: 0.2}, {opacity: 1}], {duration: 220, easing: "ease-out"});
	}

	// called when mousing over/out of one of the carousel cards
	nudge(offset = 0)
	{
		const parentClasslist = this.elem.children[0].classList;
		parentClasslist.remove('left');
		parentClasslist.remove('right');
		const magnitude = (offset === 2) ? -1 * Math.sign(offset) : -0.6 * offset;
		this.elem.children[0].style.setProperty('--magnitude', magnitude);
		if (offset < 0)
		{
			parentClasslist.add('left');
		} else if (offset > 0)
		{
			parentClasslist.add('right')
		}
	}
	
	// Called by client to perform action on the middle card in focus
	async select(event) {
		(event || window.event)?.stopPropagation();
		--this.count;
		if (this.isLastSelection())
			this.elem.classList.add("hide");
		if (this.count <= 0)
			ui.enablePlayer(false);
		await this.action(this.container, this.indices[this.index]);
		if (this.isLastSelection() && !this.cancelled)
			return this.exit();
		this.update();
	}
	
	// Called by client to exit out of the current Carousel if allowed. Enables player interraction.
	cancel(){
		if (this.bExit){
			this.cancelled = true;
			AudioManager.playSFX('discard');
			this.exit();
		}
		ui.enablePlayer(true);
	}
	
	// Returns true if there are no more cards to view or select
	isLastSelection(){
		return this.count <= 0 || this.indices.length === 0;
	}
	
	// Updates the visuals of the current selection of cards
	update(){
		this.indices = this.container.cards.reduce((a,c,i)=> (!this.predicate || this.predicate(c)) ? a.concat([i]) : a, []);
		if (this.indices.length <= 0)
		{
			return this.exit();
		}
		if (this.index >= this.indices.length)
			this.index =  this.indices.length-1;
		for (let i=0; i<this.previews.length; i++) {
			let curr = this.index - 2 + i;
			if (curr >= 0 && curr < this.indices.length) {
				let card = this.container.cards[this.indices[curr]];
				setLargeCardImage(this.previews[i], card);
				this.previews[i].classList.remove("hide");
				this.previews[i].classList.remove("noclick");
			} else {
				this.previews[i].style.backgroundImage = "";
				this.previews[i].gcCard = this.previews[i].gcCardData = null;
				this.previews[i].classList.add("hide");
				this.previews[i].classList.add("noclick");
			}
		}
		ui.setDescription(this.container.cards[this.indices[this.index]], this.desc);
	}
	
	// Clears and quits the current carousel
	exit() {
		for (let x of this.previews)
			x.style.backgroundImage = "";
		this.elem.classList.add("hide");
		Carousel.clearCurrent();
		ui.quitCarousel();
	}
	
	// Statically sets the current carousel
	static setCurrent(curr) {
		this.curr = curr;
	}
	
	// Statically clears the current carousel
	static clearCurrent() {
		this.curr = null;
	}
}

// Custom confirmation windows
class Popup {
	constructor(yesName, yes, noName, no, header, description, alpha = .95){
		this.yes = yes ? yes : ()=>{};
		this.no = no ? no : ()=>{};
		
		this.elem = document.getElementById("popup");
		let main = this.elem.children[0];
		main.children[0].innerHTML = header ? header : "";
		main.children[1].innerHTML = description ? description : "";
		main.children[2].children[0].textContent = (yesName) ? yesName : t("popup.yes");
		main.children[2].children[1].textContent = (noName) ? noName : t("popup.no");
		// a popup without "no" label shows a single button (messages)
		main.children[2].children[1].classList.toggle("hide", noName === null);

		const bgColor = new RGBA(10, 10, 10, alpha);
		this.elem.style.backgroundColor = bgColor.toString();
		
		this.elem.classList.remove("hide");
		Popup.setCurrent(this);
		ui.enablePlayer(true);
	}
	
	// Sets this as the current popup window
	static setCurrent(curr){ this.curr = curr; }
	
	// Unsets this as the current popup window
	static clearCurrent()  { this.curr = null; }
	
	// Called when client selects the positive aciton
	selectYes() {
		this.clear()
		this.yes();
		return true;
	}
	
	// Called when client selects the negative option
	selectNo() {
		this.clear();
		this.no();
		return false;
	}
	
	// Clears the popup and diables player interraction
	clear() {
		ui.enablePlayer(false);
		this.elem.classList.add("hide");
		Popup.clearCurrent();
	}
	
}

// Screen used to customize, import and export deck contents
class DeckMaker {
	constructor() {
		this.elem = document.getElementById("deck-customization");
		this.bank_elem = document.getElementById("card-bank");
		this.deck_elem = document.getElementById("card-deck");
		this.leader_elem = document.getElementById("card-leader");
		this.leader_elem.children[1].addEventListener("click", () => this.selectLeader(), false);
		this.leader_elem.children[1].addEventListener('mouseenter', CLICK_EVENT_SFX);
		this.loadFactionDeck(Settings.lastFaction.get(), true);

		this.opponentData = Settings.opponentDeckCustom.get();
		this.updatedCustomOpponent();
		document.getElementById('op-preview-clear').addEventListener('click', () => this.clearOpponentDeck());
		document.getElementById('op-preview-open').addEventListener('click', ()=>this.viewOponentCards());
		document.getElementById("add-opponent").addEventListener("change", () => this.uploadOpponentDeck(), false);


		// TW3-like faction selector: arrows and neighbouring shields around the faction name
		document.getElementById("faction-left").addEventListener("click", () => this.cycleFaction(-1), false);
		document.getElementById("faction-right").addEventListener("click", () => this.cycleFaction(1), false);
		["faction-left", "faction-right"].forEach(id => document.getElementById(id).addEventListener("mouseenter", CLICK_EVENT_SFX));
		
		document.getElementById("download-deck").addEventListener("click", () => this.downloadDeck(), false);
		document.getElementById("add-file").addEventListener("change", () => this.uploadPlayerDeck(), false);
		document.getElementById("start-game").addEventListener("click", () => this.startNewGame(), false);
		const diffButtons = [...document.querySelectorAll("#difficulty > button")];
		const showDifficulty = () => diffButtons.forEach(b => b.classList.toggle("selected", b.dataset.level === Settings.difficulty.get()));
		diffButtons.forEach(b => {
			b.addEventListener("click", () => {
				Settings.difficulty.set(b.dataset.level);
				AudioManager.playSFX("ui_card_bank");
				showDifficulty();
			});
			b.addEventListener("mouseenter", CLICK_EVENT_SFX);
		});
		showDifficulty();
		document.getElementById("start-game").addEventListener("mouseenter", CLICK_EVENT_SFX, false);
	}

	loadFactionDeck(faction, force = false)
	{
		if (!this.isValidFaction(faction))
			return;
		if (!this.setFaction(faction, true))
			return;
		const faction_deck = Settings.getFactionSettings(this.faction).get();
		this.setLeader(faction_deck.leader);
		this.makeBank(this.faction, faction_deck.cards);
		this.update();
	}

	isValidFaction(factionName)
	{
		switch(factionName) 
		{
		case "realms": case "nilfgaard": case "monsters": case "scoiatael": case "skellige":
			return true;
		default:
			return false;
		}
	}
	
	// Shows the next (1) or previous (-1) faction
	cycleFaction(step) {
		const order = Object.keys(factions);
		const i = order.indexOf(this.faction);
		this.changeFaction(order[(i + step + order.length) % order.length], step);
	}

	// Loads a faction chosen by the player, with a sliding transition in the direction of the change
	changeFaction(faction, direction = 0) {
		if (!this.isValidFaction(faction) || faction === this.faction)
			return;
		AudioManager.playSFX("ui_card_bank");
		this.loadFactionDeck(faction);
		const title = document.getElementById("faction-title").querySelector("h1");
		const lists = [this.bank_elem, this.deck_elem, document.getElementById("faction-description"), this.leader_elem];
		for (const e of [title, ...lists]) {
			e.classList.remove("slide-from-left", "slide-from-right", "fade-in");
			void e.offsetWidth; // restart the animation
		}
		title.classList.add(direction < 0 ? "slide-from-left" : "slide-from-right");
		lists.forEach(e => e.classList.add("fade-in"));
		this.bank_elem.scrollTop = this.deck_elem.scrollTop = 0;
	}

	// Faction name, shield and the neighbouring factions (dimmed, clickable)
	showFactionHeader(faction_name) {
		const title = document.getElementById("faction-title");
		title.querySelector(".faction-name").textContent = factionName(faction_name);
		title.querySelector(".faction-shield-main").style.backgroundImage = iconURL("deck_shield_" + faction_name);
		const order = Object.keys(factions);
		const i = order.indexOf(faction_name);
		const at = k => order[(i + k + order.length * 2) % order.length];
		const fill = (elem, offsets) => {
			elem.innerHTML = "";
			for (const k of offsets) {
				const f = at(k);
				const b = document.createElement("button");
				b.className = "faction-shield" + (Math.abs(k) === 2 ? " far" : "");
				b.style.backgroundImage = iconURL("deck_shield_" + f);
				b.setAttribute("data-title", factionName(f));
				b.addEventListener("click", () => this.changeFaction(f, Math.sign(k)));
				b.addEventListener("mouseenter", CLICK_EVENT_SFX);
				elem.appendChild(b);
			}
		};
		fill(document.getElementById("faction-prev"), [-2, -1]);
		fill(document.getElementById("faction-next"), [1, 2]);
	}

	// Called when client selects a deck faction. Clears previous cards and makes valid cards available.
	setFaction(faction_name, force){
		if (!faction_name)
			return;
		if (!force && this.faction === faction_name)
			return false;
		this.showFactionHeader(faction_name);
		document.getElementById("faction-description").textContent = factionDesc(faction_name);
		
		this.leaders = 
			card_dict.map((c,i) => ({index: i, card:c}) )
			.filter(c => c.card.deck === faction_name && c.card.row === "leader");
		if (!this.leader || this.faction !== faction_name) {
			this.leader = this.leaders[0];
			setLargeCardImage(this.leader_elem.children[1], this.leader.card);
		}
		this.faction = faction_name;
		Settings.lastFaction.set(faction_name);
		return true;
	}
	
	// Sets current leader and updates UI
	setLeader(index){
		this.leader = this.leaders.filter( l => l.index == index)[0];
		setLargeCardImage(this.leader_elem.children[1], this.leader.card);
	}
	
	// Constructs a bank of cards that can be used by the faction's deck.
	// If a deck is provided, will not add cards to bank that are already in the deck.
	makeBank(faction, deck) {
		this.clear();
		let cards = card_dict.map((c,i) => ({card:c, index:i})).filter(
		p => [faction, "neutral", "weather", "special"].includes(p.card.deck) && p.card.row !== "leader");
		
		cards.sort( function(id1, id2) {
			let a = card_dict[id1.index], b = card_dict[id2.index];
			let c1 = {name: a.name, basePower: -a.strength, faction: a.deck};
			let c2 = {name: b.name, basePower: -b.strength, faction: b.deck};
			return Card.compare(c1, c2);
		});
		
		
		let deckMap = {};
		if (deck){
			for (let i of Object.keys(deck)) deckMap[deck[i].index] = deck[i].count;
		}
		cards.forEach( p => {
			let count = deckMap[p.index] !== undefined ? Number(deckMap[p.index]) : 0;
			this.makePreview(p.index, Number.parseInt(p.card.count) - count, this.bank_elem, this.bank,);
			this.makePreview(p.index, count, this.deck_elem, this.deck);
		});
	}
	
	// Creates HTML elements for the card previews
	makePreview(index, num, container_elem, cards){
		let card_data = card_dict[index];
		
		let elem = document.createElement("div");
		setLargeCardImage(elem, card_data, this.faction);
		elem.classList.add("card-lg");
		let count = document.createElement("div");
		elem.appendChild(count);
		container_elem.appendChild(elem);
		
		let bankID = {index: index, count: num, elem: elem};
		let isBank = cards === this.bank;
		count.innerHTML = bankID.count;
		cards.push(bankID);
		let cardIndex = cards.length-1;
		elem.addEventListener("click", () => this.select(cardIndex, isBank), false);
		elem.addEventListener("mouseenter", CLICK_EVENT_SFX, false);
		return bankID;
	}
	
	// Updates the card preview elements when any changes are made to the deck
	update(){
		for (let x of this.bank) {
			if (x.count)
				x.elem.classList.remove("hide");
			else
				x.elem.classList.add("hide");
		}
		let total = 0, units = 0, special = 0, strength = 0, hero = 0;
		for (let x of this.deck) {
			let card_data = card_dict[x.index];
			if (x.count)
				x.elem.classList.remove("hide");
			else
				x.elem.classList.add("hide");
			total += x.count;
			if (card_data.deck === "special" || card_data.deck === "weather") {
				special += x.count;
				continue;
			}
			units += x.count;
			strength += card_data.strength * x.count;
			if (card_data.ability.split(" ").includes("hero"))
				hero += x.count;
		}
		this.stats = {total: total, units: units, special: special, strength: strength, hero: hero};
		this.updateFauxCard(this.bank_elem);
		this.updateFauxCard(this.deck_elem);
		this.updateStats();
	}

	// updates an empty card element to ensure correct alignment when count%3 == 2
	updateFauxCard(container)
	{
		let fauxCard = container.getElementsByClassName('empty')[0];
		if (!fauxCard)
		{
			fauxCard = document.createElement('div');
			fauxCard.classList.add('card-lg');
			fauxCard.classList.add('empty');
		}
		else
		{
			container.removeChild(fauxCard);
		}
		if (container.querySelectorAll(".card-lg:not(.hide)").length % 3 === 2)
		{
			container.appendChild(fauxCard);
		}
	}
	
	// Updates and displays the statistics describing the cards currently in the deck
	updateStats(){
		let stats = document.getElementById("deck-stats");
		stats.children[1].innerHTML = this.stats.total;
		stats.children[3].innerHTML = this.stats.units +(this.stats.units < 22 ? "/22" : "");
		stats.children[5].innerHTML = this.stats.special + "/10";
		stats.children[7].innerHTML = this.stats.strength;
		stats.children[9].innerHTML = this.stats.hero;
		
		// TW3 colours: unit count red until 22, special count green (red above the limit of 10)
		stats.children[3].classList.toggle("stat-bad", this.stats.units < 22);
		stats.children[5].classList.toggle("stat-bad", this.stats.special > 10);
		stats.children[5].classList.toggle("stat-good", this.stats.special <= 10);
	}
	
	// Opens a Carousel to allow the client to select a leader for their deck
	selectLeader(){
		let container = new CardContainer();
		container.cards = this.leaders.map(c => {
			let card = new Card(c.card, player_me);
			card.data = c;
			return card;
		});
		
		let index = this.leaders.indexOf(this.leader);
		ui.queueCarousel(container, 1, (c,i) => {
			let data = c.cards[i].data;
			this.leader = data;
			setLargeCardImage(this.leader_elem.children[1], data.card);
			Settings.getFactionSettings(this.leader.card.deck).setLeader(this.leader);
			AudioManager.playSFX('ui_card_bank');
		}, () => true, false, true);
		Carousel.curr.index = index;
		Carousel.curr.update();
	}
	
	// Called when client selects s a preview card. Moves it from bank to deck or vice-versa then updates;
	select(index, isBank){
		if (isBank)
		{
			this.add(index, this.deck);
			this.remove(index, this.bank);
			AudioManager.playSFX('ui_card_bank');
		}
		else
		{
			this.add(index, this.bank);
			this.remove(index, this.deck);
			AudioManager.playSFX('discard');
		}
		Settings.getFactionSettings(this.faction).setCards(this.deck.filter(x => x.count > 0));
		this.update();
	}
	
	// Adds a card to container (Bank or deck)
	add(index, cards) {
		let id = cards[index];
		id.elem.children[0].innerHTML = ++id.count;
	}
	
	// Removes a card from container (bank or deck)
	remove(index, cards) {
		let id = cards[index];
		id.elem.children[0].innerHTML = --id.count;
	}
	
	// Removes all elements in the bank and deck
	clear(){
		while (this.bank_elem.firstChild)
			this.bank_elem.removeChild(this.bank_elem.firstChild);
		while (this.deck_elem.firstChild)
			this.deck_elem.removeChild(this.deck_elem.firstChild);
		this.bank = [];
		this.deck = [];
		this.stats = {};
	}
	
	// Verifies current deck, creates the players and their decks, then starts a new game
	startNewGame(){
		let warning = [];
		if (this.stats.units < 22)
			warning.push(t("deck.warnUnits"));
		if (this.stats.special > 10)
			warning.push(t("deck.warnSpecial"));
		if (warning.length)
		{
			AudioManager.playSFX("warning");
			return ui.message(warning.join("<br>"));
		}
		
		const me_deck = { 
			faction: this.faction,
			leader: card_dict[this.leader.index], 
			cards: this.deck.filter(x => x.count > 0)
		};
		const op_deck = this.constructOpponentDeck(true);
		
		player_me = new Player(0, t("player.me"), me_deck);
		player_op = new Player(1, t("player.op"), op_deck);
		
		this.elem.classList.add("hide");
		game.startGame();
	}

	constructOpponentDeck(useCustom = true)
	{
		let op_deck;
		if (!useCustom || isEmpty(dm.opponentData))
		{
			op_deck = JSON.parse( premade_deck[randomInt(Object.keys(premade_deck).length)] );
			op_deck.cards = op_deck.cards.map(c => ({index:c[0], count:c[1]}) );
			const leaders = card_dict.filter(c => c.row === "leader" && c.deck === op_deck.faction);
			op_deck.leader = leaders[randomInt(leaders.length)];
		}
		else
		{
			op_deck = {};
			op_deck.cards = dm.opponentData.cards;
			op_deck.leader = card_dict[dm.opponentData.leader];
			op_deck.faction = op_deck.leader.deck;
		}
		return op_deck;
	}
	
	// Converts the current deck to a JSON string
	deckToJSON(){
		let obj = {
			faction: this.faction,
			leader: this.leader.index, 
			cards: this.deck.filter(x => x.count > 0).map(x => [x.index, x.count] )
		};
		return JSON.stringify(obj);
	}
	
	// Called by the client to downlaod the current deck as a JSON file
	async downloadDeck(){
		let json = this.deckToJSON();
		const tauri = window.__TAURI__;
		if (tauri?.dialog?.save && tauri?.core?.invoke) {
			try {
				const path = await tauri.dialog.save({
					title: t("deck.saveTitle"),
					defaultPath: "GwentDeck-" + this.faction + ".json",
					filters: [{name: "Deck Gwent", extensions: ["json"]}]
				});
				if (path)
					await tauri.core.invoke("write_text_file", {path: path, contents: json});
			} catch (e) {
				ui.message(String(e));
			}
			return;
		}
		let str = "data:text/json;charset=utf-8," + encodeURIComponent(json);
		let hidden_elem = document.getElementById('download-json');
		hidden_elem.href = str;
		hidden_elem.download = "GwentDeck.json";
		hidden_elem.click();
	}

	uploadDeck(id, callback)
	{
		let files = document.getElementById(id).files;
		if (files.length <= 0)
			return false;
		let fr = new FileReader();
		fr.onload = e => {
			try {
				const deck = this.deckFromJSON(e.target.result);
				if (deck)
					callback(deck);
				
			} catch (e) {
				AudioManager.playSFX('warning');
				ui.message(t("deck.badFormat"));
			}
			finally
			{
				document.getElementById(id).value = "";
			}
		}
		fr.readAsText(files.item(0));
	}
	
	// Called by the client to upload a JSON file representing a new deck
	uploadPlayerDeck() {
		this.uploadDeck("add-file", deck => this.loadPlayerDeck(deck, false));
	}

	uploadOpponentDeck()
	{
		this.uploadDeck('add-opponent', deck => this.loadOpponentDeck(deck, false));
	}
	
	// Creates a deck from a JSON file's contents and sets that as the current deck
	// Notifies client with warnings if the deck is invalid
	deckFromJSON(json) {
		let deck;
		try {
			deck = JSON.parse(json);
			return deck;
		} catch (e) {
			AudioManager.playSFX('warning');
			ui.message(t("deck.notParsable"));
			return;
		}
	}

	async loadDeck(deck, silent = true)
	{
		// FIX: the parameter was spelled 'siilent' (ReferenceError on any warning), the warning for
		// too many copies read card_dict[c.index] (always undefined), and answering OK to
		// "Continue importing deck?" cancelled the import while Cancel imported it.
		const refuse = msg => {
			if (!silent) {
				AudioManager.playSFX('warning');
				ui.message(msg);
			}
			return null;
		};
		if (!deck || typeof deck !== "object" || !Array.isArray(deck.cards))
			return refuse(t("deck.badFormat"));
		if (!this.isValidFaction(deck.faction))
			return refuse(t("deck.badFaction", deck.faction));
		const leader = card_dict[deck.leader];
		if (!leader || leader.row !== "leader")
			return refuse(t("deck.badLeader", leader ? cardName(leader) : deck.leader));
		if (deck.faction != leader.deck)
			return refuse(t("deck.leaderFaction", cardName(leader), factionName(deck.faction)));

		let warning = [];
		// check if cards exist and have correct faction & count (duplicate entries are merged)
		const counts = new Map();
		for (const c of deck.cards) {
			const index = Array.isArray(c) ? Number(c[0]) : NaN;
			const card = card_dict[index];
			if (!card) {
				warning.push(t("deck.badId", Array.isArray(c) ? c[0] : c));
				continue;
			}
			if (card.row === "leader" || ![deck.faction, "neutral", "special", "weather"].includes(card.deck)) {
				warning.push(t("deck.wrongFaction", cardName(card), factionName(deck.faction)));
				continue;
			}
			const n = Math.floor(Number(c[1]));
			if (!(n > 0))
				continue;
			counts.set(index, (counts.get(index) || 0) + n);
		}
		const cards = [];
		for (const [index, n] of counts) {
			const max = Number(card_dict[index].count);
			if (n > max)
				warning.push(t("deck.tooMany", n, max, cardName(card_dict[index])));
			if (Math.min(n, max) > 0)
				cards.push({index: index, count: Math.min(n, max)});
		}
		// prompt warning if necessary
		if (warning.length)
		{
			if (silent)
				return null;
			AudioManager.playSFX('warning');
			if (!(await ui.confirm(t("deck.continue"), warning.slice(0, 8).join("<br>") + (warning.length > 8 ? "<br>…" : ""))))
				return null;
		}
		return {faction: deck.faction, leader: Number(deck.leader), cards: cards};
	}

	async loadPlayerDeck(deck, silent = true)
	{
		const loadedDeck = await this.loadDeck(deck, silent);
		if (!loadedDeck)
			return;
		
		// Use deck to update current player faction and cards in deck maker
		this.setFaction(loadedDeck.faction, true);
		if (card_dict[loadedDeck.leader].row === "leader" && loadedDeck.faction === card_dict[loadedDeck.leader].deck){
			this.leader = this.leaders.filter(c => c.index === loadedDeck.leader)[0];
			setLargeCardImage(this.leader_elem.children[1], this.leader.card);
		}
		this.makeBank(loadedDeck.faction, loadedDeck.cards);
		this.update();
		// FIX: the imported deck (and its leader) was never saved and disappeared on restart
		Settings.getFactionSettings(this.faction).set({leader: this.leader.index, cards: this.deck.filter(x => x.count > 0)});
	}

	async loadOpponentDeck(deck, silent = true)
	{
		const loadedDeck = await this.loadDeck(deck, silent);
		if (!loadedDeck)
			return;
		this.opponentData = loadedDeck;
		Settings.opponentDeckCustom.set(loadedDeck);
		this.updatedCustomOpponent();
	}

	async clearOpponentDeck()
	{
		Settings.opponentDeckCustom.clear();
		this.opponentData = Settings.opponentDeckCustom.get();
		this.updatedCustomOpponent();
	}

	updatedCustomOpponent()
	{
		const factionElem = document.getElementById('op-preview-faction');
		const leaderElem = document.getElementById('op-preview-leader');
		const buttons = ['op-preview-clear', 'op-preview-open'].map(id=>document.getElementById(id));
		if (isEmpty(this.opponentData))
		{
			leaderElem.querySelector("p").textContent = t("deck.random");
			[factionElem, ...buttons].forEach(e=>e.classList.add('hide'));
		}
		else
		{
			factionElem.style.setProperty('background-image', iconURL('deck_shield_' + this.opponentData.faction));
			leaderElem.querySelector("p").textContent = cardName(card_dict[this.opponentData.leader]);
			[factionElem, ...buttons].forEach(e=>e.classList.remove('hide'));
		}
	}

	viewOponentCards()
	{
		if (isEmpty(this.opponentData))
			return;
		// const leader = card_dict[this.opponentData.leader];
		const leader = {index: this.opponentData.leader, count:1};
		const container = new CardContainer();
		//container.cards = [leader, ...Card.this.opponentData.cards];
		container.cards = Card.getCardsFromIdCounts([leader, ...this.opponentData.cards]);
		ui.queueCarousel(container, 1, ()=>{}, ()=>true, false, true, t("deck.opponentDeck"));
	}
}

class AudioManager
{
	static source = {};
	static volume = (() => {
		try {
			const v = parseFloat(localStorage.getItem("gc-sfx-volume"));
			return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
		} catch (e) {
			return 1;
		}
	})();

	static setVolume(v)
	{
		AudioManager.volume = Math.min(1, Math.max(0, v));
		try { localStorage.setItem("gc-sfx-volume", String(AudioManager.volume)); } catch (e) {}
	}

	static init()
	{
		[
			'turn_me', 'turn_op', "ui_card", 'ui_card_bank', 'open', 'draw',
			'clear', 'fog', 'frost', 'rain', 
			'horn', 'spy', 'medic', 'morale', 'scorch', 'bond', 'decoy', "mardroeme",
			'hero', 'common_close', 'common_ranged', 'common_siege'
		].forEach(s => AudioManager.source[s] = getAudio(s));
	}

	static async play(key, waitTime = -1, forceWait = false)
	{
		if (AudioManager.source[key])
		{
			const audio = AudioManager.source[key];
			if (!audio)
				return;
			if (audio instanceof Audio)
			{
				audio.volume = AudioManager.volume;
				const isPlaying = audio.currentTime > 0 && !audio.paused && !audio.ended 
				if (isPlaying)
				{
					audio.pause();
					audio.currentTime = 0;
				}
				if (waitTime === -1 || (!forceWait && waitTime >= audio.duration * 1000))
					return await asyncAudio(audio);
				else
				{
					audio.play()?.catch?.(() => {});
					return await sleep(waitTime);
				}
			}
		}
		else
		{
			return await playAudio(key)
		}
	}

	static async playSFX(key, waitTime = -1, forceWait = false)
	{
		if (Settings.soundEffects.isEnabled())
		{
			return await AudioManager.play(key, waitTime, forceWait);
		}
	}
}

class ToggleOption
{
	constructor(key, enableByDefault = true, action = ()=>{})
	{
		this.key = key;
		const saved = localStorage?.getItem(this.key);
		this.enabled = (saved !== null && saved !== undefined) ? saved==="true" : enableByDefault;
		this.action = action;
	}
	isEnabled() { return this.enabled; }
	setEnabled(enable)
	{
		if (this.enabled === enable)
		{
			return;
		}
		this.enabled = enable;
		if (localStorage)
		{
			localStorage.setItem(this.key, this.enabled);
		}
		this.action(this.enabled);
	}
	enable() { this.setEnabled(true); }
	disable() { this.setEnabled(false); }
	toggle() { this.setEnabled(!this.enabled); }
}

class SavedObject
{
	constructor(key, defaultValue = {}, action = ()=>{})
	{
		this.key = key;
		const saved = localStorage?.getItem(this.key);
		if (typeof defaultValue === "string" || defaultValue instanceof String)
			defaultValue = JSON.parse(defaultValue);
		this.obj = (saved !== null && saved !== undefined) ? JSON.parse(saved) : defaultValue;
		this.action = action;
	}
	get()
	{
		return this.obj;
	}
	set(newObj)
	{
		if (!this.key)
		{
			return;
		}
		if (newObj === null || newObj === undefined)
		{
			newObj = {};
		}
		localStorage?.setItem(this.key, JSON.stringify(newObj));
		this.obj = newObj; // FIX: get() returned stale data after set()
		if (this.action)
			this.action(this.obj);
	}
	clear()
	{
		this.obj = {};
		localStorage?.removeItem(this.key);
	}
}

class SavedDeck extends SavedObject
{
	constructor(key, defaultValue = {}, action = ()=>{})
	{
		super(key, defaultValue, action);
	}
	get()
	{
		const temp_deck = {...super.get()};
		if (temp_deck.cards)
		{
			temp_deck.cards = temp_deck.cards.map(c => ({index: c[0], count: c[1]}) );
		}
		return temp_deck;
	}
	set(newObj)
	{
		const temp_deck = {...newObj};
		temp_deck.cards = newObj.cards.map(c => [c.index, c.count]);
		super.set(temp_deck);
	}
	setCards(cards)
	{
		const deck = super.get();
		deck.cards = cards.map(c => [c.index, c.count]);
		super.set(deck);
	}
	setLeader(leader)
	{
		const deck = super.get();
		deck.leader = leader.index;
		super.set(deck);
	}
}

class SavedString
{
	constructor(key, defaultValue = "", action = ()=>{})
	{
		this.key = key;
		let saved = localStorage?.getItem(this.key);
		if (saved === null || saved === undefined)
			saved = defaultValue;
		this.value = saved;
		this.action = action;
	}
	get() { return this.value; }
	set(newValue)
	{
		if (this.value === newValue)
			return;
		this.value = newValue;
		localStorage?.setItem(this.key, newValue);
		if (this.action)
			this.action(this.value);
	}
}

class Settings
{
	static music = new ToggleOption("gc-music", true);
	static notifications = new ToggleOption("gc-notifications", true);
	static soundEffects = new ToggleOption("gc-sound-effects", true);
	static lastFaction = new SavedString("gc-last-faction", "realms"); 
	static difficulty = new SavedString("gc-difficulty", "normal"); 
	static realmsDeck = new SavedDeck("gc-deck-realms", premade_deck[0]);
	static nilfgaardDeck = new SavedDeck("gc-deck-nilfgaard", premade_deck[2]);
	static monstersDeck = new SavedDeck("gc-deck-monsters", premade_deck[4]);
	static scoiataelDeck = new SavedDeck("gc-deck-scoiatael", premade_deck[6]);
	static skelligesDeck = new SavedDeck("gc-deck-skellige", premade_deck[8]);
	static opponentDeckCustom = new SavedDeck("gc-deck-opponent-custom");
	
	static getFactionSettings(factionName)
	{
		switch(factionName) {
			case "realms":
				return Settings.realmsDeck;
			case "nilfgaard":
				return Settings.nilfgaardDeck;
			case "monsters":
				return Settings.monstersDeck;
			case "scoiatael":
				return Settings.scoiataelDeck;
			case "skellige":
				return Settings.skelligesDeck;
		}
		return null;
	}
}

class GameEvent
{
	constructor(id, signature)
	{
		this.id = id;
		this.signature = signature;
		if (!signature)
		{
			throw "Must pass in a signature as an array of param names";
		}
	}
	bind(listenter)
	{
		window.addEventListener(this.id, listenter);
	}
	unbind(listenter)
	{
		window.removeEventListener(this.id, listenter);
	}
	dispatch(...params)
	{
		const detail = {};
		for (let i = 0; i < params.length && i < this.signature.length; i++)
		{
			detail[this.signature[i]] = params[i];
		}
		window.dispatchEvent(new CustomEvent(this.id, {detail: detail}));
	}
}

class EventManager 
{
	static rowSelected;
	static previewCancelled;

	constructor()
	{
		EventManager.rowSelected = new GameEvent("row-selected", ['row', 'player'])
		EventManager.previewCancelled = new GameEvent("preview-cancelled", []);
		EventManager.gameOpened = new GameEvent("game-opened", []);
		EventManager.customizationOpened = new GameEvent('customize-opened', []);
		EventManager.roundPassed = new GameEvent('round-passed', ['player', 'round']);
		EventManager.roundStarted = new GameEvent('round-started', ['round', 'starting-player']);
		EventManager.roundEnded = new GameEvent('round-ended', ['round', 'points-me', 'points-op']);
		EventManager.gameStateChanged = new GameEvent('game-state-changed', ['oldState', 'newState']);
	}
}

// Translates a card between two containers
async function translateTo(card, container_source, container_dest){
	if (!container_dest || !container_source)
		return;
	if (container_dest === player_op.hand && container_source === player_op.deck)
		return;
	if (await FX.playedCard(card, container_source, container_dest))
		return;
	
	let elem = card.elem;
	let source = !container_source ? card.elem : getSourceElem(card, container_source, container_dest);
	let dest = getDestinationElem(card, container_source, container_dest);
	if (!isInDocument(elem))
		source.appendChild(elem);
	let x = trueOffsetLeft(dest) - trueOffsetLeft(elem) +dest.offsetWidth/2 - elem.offsetWidth;
	let y = trueOffsetTop(dest) - trueOffsetTop(elem) +dest.offsetHeight/2 - elem.offsetHeight/2;
	if (container_dest instanceof Row && container_dest.cards.length !== 0 && !card.isSpecial() ){
		x += (container_dest.getSortedIndex(card) === container_dest.cards.length) ? elem.offsetWidth/2 : -elem.offsetWidth/2;
	}
	if (card.holder.controller instanceof ControllerAI)
		x += elem.offsetWidth/2;
	if (container_source instanceof Row && container_dest instanceof Grave && !card.isSpecial()) {
		let mid = trueOffset(container_source.elem, true) + container_source.elem.offsetWidth/2;
		x += trueOffset(elem, true) - mid;
	}
	if (container_source instanceof Row && container_dest === player_me.hand)
		y *= 7/8;
	await translate(elem, x, y);
	
	// Returns true if the element is visible in the viewport
	function isInDocument(elem){
		return elem.getBoundingClientRect().width !== 0;
	}
	
	// Returns the true offset of a nested element in the viewport
	function trueOffset(elem, left){
		let total =0
		let curr = elem;
		while (curr){
			total += (left ? curr.offsetLeft : curr.offsetTop);
			curr = curr.parentElement;
		}
		return total;
	}
	function trueOffsetLeft(elem) {	return trueOffset(elem, true); }
	function trueOffsetTop(elem) { return trueOffset(elem, false); }
	
	// Returns the source container's element to transition from
	function getSourceElem(card, source, dest){
		if (source instanceof HandAI)
			return source.hidden_elem;
		if (source instanceof Deck)
			return source.elem.children[source.elem.children.length-2];
		return source.elem;
	}

	// Returns the destination container's element to transition to
	function getDestinationElem(card, source, dest){
		if (dest instanceof HandAI)
			return dest.hidden_elem;
		if (card.isSpecial() && dest instanceof Row)
			return dest.elem_special;
		if (dest instanceof Row || dest instanceof Hand || dest instanceof Weather){
			if (dest.cards.length === 0)
				return dest.elem;
			let index = dest.getSortedIndex(card);
			let dcard = dest.cards[index === dest.cards.length ? index-1 : index];
			return dcard.elem;
		}
		return dest.elem;
	}
}

// Translates an element by x from the left and y from the top
async function translate(elem, x, y){
	let vw100 = 100 / document.getElementById("dimensions").offsetWidth;
	x*=vw100;
	y*=vw100 ;
	elem.style.transform = "translate(" + vw(x) + ", " + vw(y) + ")";
	let margin = elem.style.marginLeft;
	elem.style.marginRight = vw(-elem.offsetWidth*vw100);
	elem.style.marginLeft = "";
	await sleep(499);
	elem.style.transform = "";
	elem.style.position = "";
	elem.style.marginLeft = margin;
	elem.style.marginRight = margin;
}

// Fades out an element until hidden over the duration. Resolves true if completed, false if interrupted.
function fadeOut(elem, duration) {
	return fade(false, elem, duration);
}

// Fades in an element until opaque over the duration. Resolves true if completed, false if interrupted.
function fadeIn(elem, duration){
	return fade(true, elem, duration);
}

// Fades an element over a duration
// FIX: a new fade cancels the one still running on the same element (two timers used to fight,
// e.g. a weather overlay vanishing although the weather was active), the starting opacity keeps
// its decimals (parseInt turned 0.6 into 0) and a 0 ms duration no longer loops forever.
function fade(fadeIn, elem, dur){
	if (!elem)
		return Promise.resolve(false);
	if (elem.gcCancelFade)
		elem.gcCancelFade();
	return new Promise(res => {
		let startingOpacity = Number.parseFloat(elem.style.opacity);
		if (!Number.isFinite(startingOpacity))
			startingOpacity = fadeIn ? 0 : 1;
		const endOpacity = fadeIn ? 1 : 0;
		const startTime = Date.now();
		const endTime = startTime + Math.max(0, dur || 0);
		if (fadeIn)
			elem.classList.remove('hide');
		let timer;
		const finish = completed => {
			clearInterval(timer);
			if (elem.gcCancelFade === cancel)
				elem.gcCancelFade = null;
			res(completed);
		};
		const cancel = () => finish(false);
		elem.gcCancelFade = cancel;
		timer = setInterval(() => {
			const currTime = Date.now();
			const op = endTime > startTime
				? clamp(startingOpacity, endOpacity, map(startTime, endTime, startingOpacity, endOpacity, currTime))
				: endOpacity;
			elem.style.opacity = op;
			if (op === endOpacity)
			{
				if (!fadeIn)
					elem.classList.add('hide');
				finish(true);
			}
		}, DUR_FADE_STEP);
	});
}

// Sets a large card picture on an element (localized picture without English text in French)
// and remembers which card it shows (used by the zoom on right click)
function setLargeCardImage(elem, card, faction) {
	if (!elem)
		return;
	const deck = card.faction || card.deck;
	const key = deck + "_" + card.filename;
	// neutral, special and weather cards wear the ribbon of the deck they are in (like in TW3)
	if (faction === undefined)
		faction = card.holder?.deck?.faction;
	const neutral = (deck === "neutral" || deck === "special" || deck === "weather") && card.row !== "leader";
	const factionRibbon = neutral && ["realms", "nilfgaard", "monsters", "scoiatael", "skellige"].includes(faction);
	elem.style.backgroundImage = factionRibbon
		? [imgURL("ribbon/icons_" + key, "png"), imgURL("ribbon/ribbon_" + faction, "png"), largeURL(key)].join(", ")
		: largeURL(key);
	elem.gcCard = card instanceof Card ? card : null;
	elem.gcCardData = card instanceof Card ? null : (card.name ? card : null);
	elem.gcFaction = faction;
	const printed = !!card.name && deck !== "faction";
	const ribbon = factionRibbon || (typeof CARD_RIBBONS !== "undefined" && CARD_RIBBONS.has(key));
	const title = printed ? cardLargeTitle(card) : "";
	const quote = printed ? cardQuote(card) : "";
	elem.setAttribute("data-lg-name", title);
	elem.setAttribute("data-lg-quote", quote);
	elem.toggleAttribute("data-lg-quote-italic", !!quote && !/^["“«]/.test(quote));
	elem.toggleAttribute("data-ribbon", ribbon);
	// font sizes (in % of the card width) so that long names and quotes fit the parchment
	if (title) {
		elem.style.setProperty("--lg-name-size", fitFontSize(title, "700", "normal", ribbon ? 69 : 85, 17.4, 1.12, 7.4, 4.4, 2).toFixed(2));
		// deck lists show the name alone, bigger (like the deck builder of TW3)
		elem.style.setProperty("--lg-list-size", fitFontSize(title, "700", "normal", ribbon ? 69 : 85, 24, 1.1, 9.2, 5.5, 2).toFixed(2));
	}
	if (quote)
		elem.style.setProperty("--lg-quote-size", fitFontSize(quote, "500", elem.hasAttribute("data-lg-quote-italic") ? "italic" : "normal",
			87, ribbon ? 17.6 : 19.4, 1.15, 6.4, 4.2, 3).toFixed(2));
	if (printed && !document.fonts.check('700 10px "GC Sans"'))
		document.fonts.ready.then(() => { if (elem.getAttribute("data-lg-name") === title) setLargeCardImage(elem, card, faction); });
}

// Largest font size (in % of the card width) at which the text fits a box of width x height (same unit)
// in at most maxLines lines, measured with the game font
const fitFontSize = (() => {
	const ctx = document.createElement("canvas").getContext("2d");
	const cache = new Map();
	return (text, weight, style, width, height, lineHeight, max, min, maxLines) => {
		const key = [text, weight, style, width, height, max, maxLines, document.fonts.check('700 10px "GC Sans"')].join("|");
		if (cache.has(key))
			return cache.get(key);
		ctx.font = style + " " + weight + " 100px \"GC Sans\", Bahnschrift, sans-serif";
		const space = ctx.measureText(" ").width / 100;
		const paragraphs = text.split("\n").map(p => p.split(/\s+/).filter(w => w).map(w => ctx.measureText(w).width / 100));
		const lines = size => paragraphs.reduce((n, words) => {
			let count = 1, x = 0;
			for (const w of words) {
				const ww = w * size;
				if (x > 0 && x + space * size + ww > width) { count++; x = ww; }
				else x += (x > 0 ? space * size : 0) + ww;
			}
			return n + count;
		}, 0);
		let size = max;
		while (size > min) {
			const n = lines(size);
			if (n <= maxLines && n * size * lineHeight <= height)
				break;
			size -= 0.1;
		}
		size = Math.max(min, size);
		cache.set(key, size);
		return size;
	};
})();

//      Get Image paths   
function iconURL(name, ext = "png"){
	return imgURL("icons/" + name, ext);
}
function largeURL(name, ext="jpg"){
	return imgURL("lg/" + name, ext) // pictures without text: names and quotes are drawn by CSS
}
function smallURL(name, ext="jpg"){
	return imgURL("sm/" + name, ext);
}
function imgURL(path, ext) {
	return "url('img/" + path + "." + ext + "')";
}

// get sound effect path
function audioURL(name, ext = "mp3") {
	if (typeof name === "string" || name instanceof String)
	{
		if (name.includes('.'))
		{
			return "sfx/" + name; 
		}
	}
	else if (name['name'])
	{
		if (name['ext'])
		{
			ext = name['ext'];
		}
		name = name['name'];
	}
	return "sfx/" + name + "." + ext;
}

// Get audio instance
function getAudio(name, ext = "mp3")
{
	const audio = new Audio(audioURL(name, ext));
	audio.volume = AudioManager.volume;
	return audio;
}
// Play sound effect
async function playAudio(name, ext = "mp3")
{
	return await asyncAudio(getAudio(name, ext));
}

function asyncAudio(audio)
{
	if (!userInteracted || !audio)
		return
	return new Promise(resolve => {
		let done = false;
		const finish = () => {
			if (done)
				return;
			done = true;
			clearTimeout(timer);
			audio.removeEventListener('ended', finish);
			audio.removeEventListener('error', finish);
			resolve();
		};
		// FIX: safety net, never wait longer than the clip (or 5 s if its length is unknown)
		const limit = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 + 250 : 5000;
		const timer = setTimeout(finish, limit);
		audio.addEventListener('ended', finish);
		audio.addEventListener('error', finish);
		const p = audio.play();
		if (p && p.catch)
			p.catch(finish);
	});
}

// Pauses execution until the passed number of milliseconds as expired
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
  //return new Promise(resolve => setTimeout(() => {if (func) func(); return resolve();}, ms));
}

// Suspends execution until the predicate condition is met, checking every ms milliseconds
function sleepUntil(predicate, ms) {
	return new Promise(resolve => {
		let timer = setInterval( function () {
			if (predicate()) {
				clearInterval(timer);
				resolve();
			}
		}, ms)
	});
}


/*----------------------------------------------------*/


document.documentElement.classList.add("lang-" + LANG);
applyStaticTranslations();
const eventManager = new EventManager(); 
let userInteracted = false;
var ui = new UI();
var board = new Board();
var weather = new Weather();
var game = new Game();
var player_me, player_op;
AudioManager.init();

ui.enablePlayer(false);
let dm = new DeckMaker();


document.addEventListener('click', () => userInteracted = true, { once: true });
document.addEventListener('contextmenu', e => {
	if (!(e.target instanceof HTMLInputElement))
		e.preventDefault();
});
