"use strict"

// Localisation (fr / en). The French card names, quotes, abilities and game messages come from the
// official French version of The Witcher 3 (Gwynt), see i18n_fr_data.js.
// Internal card names stay in English: they drive game rules (Muster groups, etc.).

const LANG = (() => {
	try {
		const saved = localStorage.getItem("gc-language");
		if (saved === "fr" || saved === "en")
			return saved;
	} catch (e) {}
	return "fr";
})();
document.documentElement.lang = LANG;

const I18N = {
fr: {
	"player.me": "Joueur",
	"player.op": "Adversaire",
	"passed": "Passé",
	"pass": "Passer",
	"tip.exit": "Quitter la partie",
	"tip.viewLeader": "Voir le chef",
	"tip.playLeader": "Jouer le chef",
	"tip.pass": "Passer la manche",
	"tip.discards": "Voir la défausse",
	"tip.music": "Musique",
	"tip.sfx": "Effets sonores",
	"tip.notifications": "Messages de jeu",
	"tip.language": "Language: English",
	"tip.viewOpponent": "Voir le deck adverse",
	"tip.uploadOpponent": "Importer le deck adverse",
	"tip.clearOpponent": "Retirer le deck adverse",
	"round": "Manche {0}",
	"round1": "Manche 1",
	"round2": "Manche 2",
	"round3": "Manche 3",
	"end.draw": "La bataille ne peut se terminer sur une égalité. Vous pouvez rejouer avec les mêmes decks ou abandonner.",
	"end.customize": "Personnaliser",
	"end.rematch": "Revanche",
	"end.newGame": "Nouvelle partie",
	"end.win": "Victoire !",
	"end.lose": "Défaite",
	"end.drawTitle": "Match nul",
	"deck.upload": "Importer un deck",
	"deck.changeFaction": "Changer de faction",
	"deck.download": "Exporter le deck",
	"deck.uploadTip": "Charger un deck depuis un fichier",
	"deck.downloadTip": "Enregistrer ce deck dans un fichier",
	"deck.prevFaction": "Faction précédente (←)",
	"deck.nextFaction": "Faction suivante (→)",
	"deck.collection": "Collection de cartes",
	"deck.inDeck": "Cartes du deck",
	"deck.leader": "Chef",
	"deck.total": "Nombre total de cartes",
	"deck.units": "Nombre de cartes d'unité",
	"deck.special": "Cartes spéciales",
	"deck.strength": "Force totale des unités",
	"deck.heroes": "Cartes de héros",
	"deck.start": "Commencer la partie",
	"deck.opponent": "Deck adverse :",
	"deck.random": "Aléatoire",
	"deck.difficulty": "Difficulté",
	"difficulty.easy": "Facile",
	"difficulty.normal": "Normal",
	"difficulty.hard": "Difficile",
	"difficulty.easy.tip": "L'adversaire joue de façon hasardeuse",
	"difficulty.normal.tip": "L'adversaire joue correctement, avec une part de hasard",
	"difficulty.hard.tip": "L'adversaire joue au mieux : gestion des manches, des cartes et du bluff",
	"deck.warnUnits": "Votre deck doit contenir au moins 22 cartes d'unité.",
	"deck.warnSpecial": "Votre deck ne peut pas contenir plus de 10 cartes spéciales.",
	"deck.badFormat": "Le deck importé n'est pas au bon format.",
	"deck.notParsable": "Le fichier importé n'est pas un deck lisible.",
	"deck.badFaction": "Faction inconnue : « {0} ».",
	"deck.badLeader": "« {0} » ne peut pas être utilisé comme chef.",
	"deck.leaderFaction": "Le chef « {0} » n'appartient pas à la faction « {1} ».",
	"deck.badId": "L'identifiant {0} ne correspond à aucune carte.",
	"deck.wrongFaction": "« {0} » ne peut pas être utilisé dans un deck de la faction « {1} ».",
	"deck.tooMany": "Le deck contient {0} exemplaires de « {2} » alors que {1} sont disponibles.",
	"deck.continue": "Importer le deck malgré tout ?",
	"deck.saveTitle": "Exporter le deck",
	"deck.opponentDeck": "Deck de l'adversaire",
	"redraw": "Choisissez jusqu'à 2 cartes à repiocher.",
	"redraw.done": "Terminer",
	"popup.yes": "Oui",
	"popup.no": "Non",
	"exit.resume": "Reprendre",
	"exit.exit": "Quitter",
	"exit.title": "Quitter la partie en cours ?",
	"exit.text": "Vous reviendrez au menu de personnalisation du deck.",
	"scoia.first": "Commencer",
	"scoia.opponent": "Laisser l'adversaire commencer",
	"scoia.title": "Voulez-vous commencer ?",
	"scoia.text": "L'avantage de faction des Scoia'tael vous permet de décider qui commence.",
	"leader.ability": "Capacité de chef",
	"zoom.hint": "Clic n'importe où pour fermer",
	"notif.me-first": "Vous commencez",
	"notif.op-first": "Votre adversaire commence",
	"notif.me-coin": "Vous commencez",
	"notif.op-coin": "Votre adversaire commence",
	"notif.round-start": "Début de la manche",
	"notif.me-pass": "Vous passez",
	"notif.op-pass": "Votre adversaire passe",
	"notif.win-round": "Vous remportez la manche !",
	"notif.lose-round": "Votre adversaire remporte la manche",
	"notif.draw-round": "La manche se termine par une égalité",
	"notif.me-turn": "À vous de jouer !",
	"notif.op-turn": "Tour de l'adversaire",
	"notif.north": "Capacité de faction des Royaumes du Nord : une carte supplémentaire est piochée.",
	"notif.monsters": "Capacité de faction des Monstres : une unité choisie au hasard reste sur le champ de bataille.",
	"notif.scoiatael": "L'adversaire utilise l'avantage de faction des Scoia'tael pour commencer.",
	"notif.skellige-op": "Capacité de faction de Skellige de l'adversaire !",
	"notif.skellige-me": "Capacité de faction de Skellige !",
	"music.title": "Musique",
	"music.sourceLocal": "Hors ligne · {0} morceaux sur l'ordinateur",
	"music.sourceStream": "En streaming (YouTube)",
	"music.extract": "Extraire de The Witcher 3",
	"music.import": "Importer…",
	"music.folder": "Ouvrir le dossier",
	"music.clear": "Revenir au streaming",
	"music.clearConfirm": "Supprimer la musique enregistrée sur l'ordinateur et revenir au streaming YouTube ?",
	"music.extracting": "Extraction… {0}/{1}",
	"music.pickFolder": "Dossier d'installation de The Witcher 3",
	"music.notFound": "Aucune musique de Gwynt n'a été trouvée dans ce dossier. Choisissez le dossier d'installation de The Witcher 3 (celui qui contient « content »).",
	"music.error": "La musique n'a pas pu être enregistrée : {0}",
	"music.importTitle": "Importer de la musique",
	"music.audioFiles": "Fichiers audio",
	"music.offerTitle": "Musique hors ligne",
	"music.offerText": "The Witcher 3 est installé sur cet ordinateur. Extraire ses 7 musiques de Gwynt (lecture seule, environ 65 Mo) pour les écouter sans connexion, au lieu du streaming YouTube ?",
	"music.offerYes": "Extraire",
	"music.offerNo": "Plus tard",
	"tip.settings": "Paramètres (Échap)",
	"tip.quit": "Quitter",
	"quit.title": "Quitter Gwent Classic ?",
	"quit.text": "Vos decks et vos réglages sont enregistrés automatiquement.",
	"opt.game": "Partie",
	"opt.deck": "Deck",
	"opt.hint.windowed": "Fenêtre redimensionnable, avec sa barre de titre.",
	"opt.hint.borderless": "Fenêtre sans bordure couvrant tout l'écran : on passe instantanément aux autres applications.",
	"opt.hint.fullscreen": "Plein écran. F11 ou Alt+Entrée pour basculer à tout moment.",
	"opt.languageInGame": "La langue se change depuis le menu du deck.",
	"opt.characterHint": "portrait affiché à côté de votre score",
	"key.enter": "Entrée",
	"key.escape": "Échap",
	"key.rightClick": "Clic droit",
	"tip.online": "Partie en ligne",
	"online.title": "Partie en ligne",
	"online.yourName": "Votre nom",
	"online.create": "Créer une partie",
	"online.createHint": "Vous recevez un code à donner à votre adversaire.",
	"online.join": "Rejoindre une partie",
	"online.joinHint": "Saisissez le code reçu de votre adversaire.",
	"online.server": "Serveur de mise en relation :",
	"online.noServer": "Indiquez d'abord l'adresse du serveur de mise en relation (en bas de cette fenêtre).",
	"online.serverHelp": "Pour jouer en ligne, il faut un serveur de mise en relation. L'un des deux joueurs crée le sien, gratuitement, sur son compte Cloudflare (environ 5 minutes, une seule fois), puis donne son adresse à l'autre : vous indiquez tous les deux la même adresse ci-dessus. Le guide pas à pas :",
	"online.enterCode": "Code de la partie",
	"online.back": "Retour",
	"online.validate": "Valider",
	"online.badCode": "Le code compte 6 caractères (lettres et chiffres).",
	"online.connecting": "Connexion au serveur",
	"online.cancel": "Annuler",
	"online.code": "Code :",
	"online.copy": "Copier",
	"online.copied": "Copié !",
	"online.versus": "contre",
	"online.leave": "Quitter le salon",
	"online.start": "Lancer la partie",
	"online.startHint": "Les deux joueurs doivent être prêts.",
	"online.hostStarts": "L'hôte lancera la partie.",
	"online.waitingPeer": "En attente d'un adversaire",
	"online.waitingHost": "En attente de l'hôte",
	"online.giveCode": "Donnez-lui le code ci-dessus.",
	"online.host": "Hôte",
	"online.guest": "Invité",
	"online.deck": "Deck",
	"online.ready": "Prêt",
	"online.isReady": "Prêt",
	"online.notReady": "Pas encore prêt",
	"online.away": "Connexion perdue, en attente de son retour…",
	"online.deckUnits": "deck incomplet : {0}/22 unités",
	"online.deckSpecial": "trop de cartes spéciales : {0}/10",
	"online.link.waiting": "Salon ouvert",
	"online.link.connecting": "Connexion à l'adversaire",
	"online.link.p2p": "Connexion directe (P2P)",
	"online.link.relay": "Connexion par relais",
	"online.error.code-in-use": "Ce code est déjà utilisé, réessayez.",
	"online.error.no-room": "Aucune partie ne porte ce code (ou l'hôte l'a quittée).",
	"online.error.room-full": "Cette partie a déjà deux joueurs.",
	"online.error.expired": "Le salon a expiré.",
	"online.error.network": "Impossible de joindre le serveur. Vérifiez la connexion Internet et l'adresse du serveur.",
	"online.error.timeout": "Le serveur ne répond pas.",
	"online.error.other": "Erreur de connexion : {0}",
	"online.versionMismatch": "Votre adversaire utilise une autre version du jeu ({0}, vous : {1}). Installez la même version des deux côtés.",
	"online.hostLeft": "L'hôte a fermé le salon.",
	"online.opponent.forfeit": "Votre adversaire a abandonné la partie.",
	"online.opponent.left": "Votre adversaire a quitté le salon.",
	"online.opponent.connection": "La connexion avec votre adversaire a été perdue.",
	"online.forfeit": "Abandonner",
	"online.forfeitTitle": "Abandonner la partie ?",
	"online.forfeitText": "Votre adversaire remportera la partie.",
	"online.backToRoom": "Retour au salon",
	"online.desync": "Les deux parties ne sont plus identiques (désynchronisation). Vous pouvez terminer la partie, mais le résultat peut différer chez votre adversaire.",
	"history.online": "en ligne · {0}",
	"history.onlineMode": "En ligne",
	"history.interrupted": "Interrompue",
	"tip.history": "Historique des parties",
	"history.title": "Historique des parties",
	"history.date": "Date",
	"history.result": "Résultat",
	"history.you": "Vous",
	"history.opponent": "Adversaire",
	"history.rounds": "Manches",
	"history.games": "Parties",
	"history.wins": "Victoires",
	"history.losses": "Défaites",
	"history.draws": "Égalités",
	"history.difficulty": "Difficulté",
	"history.factionTip": "{0} : victoires – défaites",
	"history.rate": "Taux de victoire",
	"history.abandon": "Abandon",
	"history.empty": "Aucune partie jouée pour l'instant.",
	"history.clear": "Effacer l'historique",
	"history.clearConfirm": "Effacer définitivement l'historique de toutes les parties ?",
	"key.space": "Espace",
	"pass.holdHint": "(maintenir)",
},
en: {
	"player.me": "Player 1",
	"player.op": "Player 2",
	"passed": "Passed",
	"pass": "Pass",
	"tip.exit": "Exit game",
	"tip.viewLeader": "View leader",
	"tip.playLeader": "Play leader",
	"tip.pass": "Pass round",
	"tip.discards": "View discards",
	"tip.music": "Toggle music",
	"tip.sfx": "Toggle sound effects",
	"tip.notifications": "Toggle game messages",
	"tip.language": "Langue : français",
	"tip.viewOpponent": "View opponent",
	"tip.uploadOpponent": "Upload opponent",
	"tip.clearOpponent": "Clear opponent",
	"round": "Round {0}",
	"round1": "Round 1",
	"round2": "Round 2",
	"round3": "Round 3",
	"end.draw": "The battle cannot end in a draw. You can play a rematch using the same decks or surrender.",
	"end.customize": "Customize",
	"end.rematch": "Rematch",
	"end.newGame": "New Game",
	"end.win": "Victory!",
	"end.lose": "Defeat",
	"end.drawTitle": "Draw",
	"deck.upload": "Upload Deck",
	"deck.changeFaction": "Change Faction",
	"deck.download": "Download Deck",
	"deck.uploadTip": "Load a deck from a file",
	"deck.downloadTip": "Save this deck to a file",
	"deck.prevFaction": "Previous faction (←)",
	"deck.nextFaction": "Next faction (→)",
	"deck.collection": "Card Collection",
	"deck.inDeck": "Cards in Deck",
	"deck.leader": "Leader",
	"deck.total": "Total cards in deck",
	"deck.units": "Number of Unit Cards",
	"deck.special": "Special Cards",
	"deck.strength": "Total Unit Card Strength",
	"deck.heroes": "Hero Cards",
	"deck.start": "Start game",
	"deck.opponent": "Opponent deck:",
	"deck.random": "Random",
	"deck.difficulty": "Difficulty",
	"difficulty.easy": "Easy",
	"difficulty.normal": "Normal",
	"difficulty.hard": "Hard",
	"difficulty.easy.tip": "The opponent plays carelessly",
	"difficulty.normal.tip": "The opponent plays sensibly, with some randomness",
	"difficulty.hard.tip": "The opponent plays its best: round, card and bluff management",
	"deck.warnUnits": "Your deck must have at least 22 unit cards.",
	"deck.warnSpecial": "Your deck must have no more than 10 special cards.",
	"deck.badFormat": "Uploaded deck is not formatted correctly!",
	"deck.notParsable": "Uploaded deck is not parsable!",
	"deck.badFaction": "Unknown deck faction '{0}'.",
	"deck.badLeader": "'{0}' cannot be used as a leader.",
	"deck.leaderFaction": "Leader '{0}' doesn't match deck faction '{1}'.",
	"deck.badId": "ID {0} does not correspond to a card.",
	"deck.wrongFaction": "'{0}' cannot be used in a deck of faction type '{1}'.",
	"deck.tooMany": "Deck contains {0}/{1} available {2} cards.",
	"deck.continue": "Continue importing deck?",
	"deck.saveTitle": "Save deck",
	"deck.opponentDeck": "Opponent's deck",
	"redraw": "Choose up to 2 cards to redraw.",
	"redraw.done": "Done",
	"popup.yes": "Yes",
	"popup.no": "No",
	"exit.resume": "Resume",
	"exit.exit": "Exit",
	"exit.title": "Quit current game?",
	"exit.text": "This will return you to the deck customization menu.",
	"scoia.first": "Go First",
	"scoia.opponent": "Let Opponent Start",
	"scoia.title": "Would you like to go first?",
	"scoia.text": "The Scoia'tael faction perk allows you to decide who will get to go first.",
	"leader.ability": "Leader Ability",
	"zoom.hint": "Click anywhere to close",
	"notif.me-first": "You will go first",
	"notif.op-first": "Your opponent will go first",
	"notif.me-coin": "You will go first",
	"notif.op-coin": "Your opponent will go first",
	"notif.round-start": "Round Start",
	"notif.me-pass": "Round passed",
	"notif.op-pass": "Your opponent has passed",
	"notif.win-round": "You won the round!",
	"notif.lose-round": "Your opponent won the round",
	"notif.draw-round": "The round ended in a draw",
	"notif.me-turn": "Your turn!",
	"notif.op-turn": "Opponent's turn",
	"notif.north": "Northern Realms faction ability triggered - North draws an additional card.",
	"notif.monsters": "Monsters faction ability triggered - one randomly-chosen Monster Unit Card stays on the board",
	"notif.scoiatael": "Opponent used the Scoia'tael faction perk to go first.",
	"notif.skellige-op": "Opponent Skellige Ability Triggered!",
	"notif.skellige-me": "Skellige Ability Triggered!",
	"notif.nilfgaard": "Nilfgaard faction ability triggered - Nilfgaard wins the tie.",
	"carousel.discard": "Choose a card to discard.",
	"carousel.draw": "Choose a card to draw.",
	"carousel.opponentHand": "Randomly selected cards from your opponent's hand",
	"deck.chooseLeader": "Choose a Leader",
	"music.title": "Music",
	"music.sourceLocal": "Offline · {0} tracks on this computer",
	"music.sourceStream": "Streaming (YouTube)",
	"music.extract": "Extract from The Witcher 3",
	"music.import": "Import…",
	"music.folder": "Open folder",
	"music.clear": "Back to streaming",
	"music.clearConfirm": "Delete the music saved on this computer and go back to YouTube streaming?",
	"music.extracting": "Extracting… {0}/{1}",
	"music.pickFolder": "The Witcher 3 install folder",
	"music.notFound": "No gwent music was found in this folder. Choose the install folder of The Witcher 3 (the one containing \"content\").",
	"music.error": "The music could not be saved: {0}",
	"music.importTitle": "Import music",
	"music.audioFiles": "Audio files",
	"music.offerTitle": "Offline music",
	"music.offerText": "The Witcher 3 is installed on this computer. Extract its 7 gwent tracks (read only, about 65 MB) to play them offline instead of streaming them from YouTube?",
	"music.offerYes": "Extract",
	"music.offerNo": "Later",
	"tip.settings": "Settings (Esc)",
	"tip.quit": "Quit",
	"quit.title": "Quit Gwent Classic?",
	"quit.text": "Your decks and settings are saved automatically.",
	"opt.game": "Game",
	"opt.deck": "Deck",
	"opt.hint.windowed": "Resizable window with its title bar.",
	"opt.hint.borderless": "Borderless window covering the whole screen: switching to other applications is instant.",
	"opt.hint.fullscreen": "Full screen. F11 or Alt+Enter toggles it at any time.",
	"opt.languageInGame": "The language can be changed from the deck menu.",
	"opt.characterHint": "portrait shown next to your score",
	"key.enter": "Enter",
	"key.escape": "Esc",
	"key.rightClick": "Right click",
	"tip.online": "Online game",
	"online.title": "Online game",
	"online.yourName": "Your name",
	"online.create": "Create a game",
	"online.createHint": "You get a code to give to your opponent.",
	"online.join": "Join a game",
	"online.joinHint": "Enter the code your opponent gave you.",
	"online.server": "Matchmaking server:",
	"online.noServer": "First enter the address of the matchmaking server (bottom of this window).",
	"online.serverHelp": "Online play needs a matchmaking server. One of the two players creates his own, for free, on his Cloudflare account (about 5 minutes, only once), then gives its address to the other: you both enter the same address above. Step-by-step guide:",
	"online.enterCode": "Game code",
	"online.back": "Back",
	"online.validate": "Join",
	"online.badCode": "The code has 6 characters (letters and digits).",
	"online.connecting": "Connecting to the server",
	"online.cancel": "Cancel",
	"online.code": "Code:",
	"online.copy": "Copy",
	"online.copied": "Copied!",
	"online.versus": "vs",
	"online.leave": "Leave room",
	"online.start": "Start game",
	"online.startHint": "Both players must be ready.",
	"online.hostStarts": "The host will start the game.",
	"online.waitingPeer": "Waiting for an opponent",
	"online.waitingHost": "Waiting for the host",
	"online.giveCode": "Give them the code above.",
	"online.host": "Host",
	"online.guest": "Guest",
	"online.deck": "Deck",
	"online.ready": "Ready",
	"online.isReady": "Ready",
	"online.notReady": "Not ready yet",
	"online.away": "Connection lost, waiting for them to come back…",
	"online.deckUnits": "incomplete deck: {0}/22 units",
	"online.deckSpecial": "too many special cards: {0}/10",
	"online.link.waiting": "Room open",
	"online.link.connecting": "Connecting to the opponent",
	"online.link.p2p": "Direct connection (P2P)",
	"online.link.relay": "Relayed connection",
	"online.error.code-in-use": "This code is already used, try again.",
	"online.error.no-room": "No game has this code (or the host left it).",
	"online.error.room-full": "This game already has two players.",
	"online.error.expired": "The room expired.",
	"online.error.network": "The server cannot be reached. Check the Internet connection and the server address.",
	"online.error.timeout": "The server does not answer.",
	"online.error.other": "Connection error: {0}",
	"online.versionMismatch": "Your opponent uses another version of the game ({0}, yours: {1}). Install the same version on both sides.",
	"online.hostLeft": "The host closed the room.",
	"online.opponent.forfeit": "Your opponent gave up the game.",
	"online.opponent.left": "Your opponent left the room.",
	"online.opponent.connection": "The connection with your opponent was lost.",
	"online.forfeit": "Give up",
	"online.forfeitTitle": "Give up the game?",
	"online.forfeitText": "Your opponent will win the game.",
	"online.backToRoom": "Back to the room",
	"online.desync": "The two games are no longer identical (desynchronization). You can finish the game, but the result may differ for your opponent.",
	"history.online": "online · {0}",
	"history.onlineMode": "Online",
	"history.interrupted": "Interrupted",
	"tip.history": "Game history",
	"history.title": "Game history",
	"history.date": "Date",
	"history.result": "Result",
	"history.you": "You",
	"history.opponent": "Opponent",
	"history.rounds": "Rounds",
	"history.games": "Games",
	"history.wins": "Wins",
	"history.losses": "Losses",
	"history.draws": "Draws",
	"history.difficulty": "Difficulty",
	"history.factionTip": "{0}: wins – losses",
	"history.rate": "Win rate",
	"history.abandon": "Abandoned",
	"history.empty": "No game played yet.",
	"history.clear": "Clear history",
	"history.clearConfirm": "Permanently clear the history of all games?",
	"key.space": "Space",
	"pass.holdHint": "(hold)",
}
};

// official TW3 wording wins over the hand-written strings above
Object.assign(I18N.fr, I18N_FR_OFFICIAL);
Object.assign(I18N.en, I18N_EN_OFFICIAL);

function t(key, ...args) {
	let s = I18N[LANG][key];
	if (s === undefined)
		s = I18N.en[key];
	if (s === undefined)
		return key;
	return s.replace(/\{(\d+)\}/g, (m, i) => args[Number(i)] !== undefined ? args[Number(i)] : m);
}

// Display name of a card (Card instance or card_dict data)
function cardName(card) {
	const name = card && card.name;
	if (!name)
		return "";
	if (LANG === "fr" && CARD_NAMES_FR[name] !== undefined)
		return CARD_NAMES_FR[name];
	return name.trim();
}

// Title printed on a large card (leaders: name and epithet on two lines, like in The Witcher 3)
function cardLargeTitle(card) {
	const name = card && card.name;
	if (!name)
		return "";
	if (LANG === "fr")
		return CARD_TITLES_FR[name] || cardName(card);
	return CARD_TITLES_EN[name] || name.trim();
}

// Quote printed on a large card (the pictures carry no text)
function cardQuote(card) {
	if (!card || !card.name)
		return "";
	return (LANG === "fr" ? CARD_QUOTES_FR : CARD_QUOTES_EN)[card.name] || "";
}

// English texts not present in ability_dict
const ABILITIES_EN = {
	cerys: ["Summon Shield Maidens", "Summons all Shield Maidens from deck and hand. "],
};

function abilityName(key) {
	if (LANG === "fr" && ABILITIES_FR[key])
		return ABILITIES_FR[key][0];
	if (ABILITIES_EN[key])
		return ABILITIES_EN[key][0];
	return ability_dict[key] && ability_dict[key].name || "";
}

function abilityDesc(key) {
	if (LANG === "fr" && ABILITIES_FR[key])
		return ABILITIES_FR[key][1] + " ";
	if (ABILITIES_EN[key])
		return ABILITIES_EN[key][1];
	return ability_dict[key] && ability_dict[key].description || "";
}

// ---------- factions ----------
function factionName(f) {
	if (LANG === "fr" && FACTIONS_FR[f])
		return FACTIONS_FR[f][0];
	return factions[f] ? factions[f].name : f;
}

function factionDesc(f) {
	if (LANG === "fr" && FACTIONS_FR[f])
		return FACTIONS_FR[f][1];
	return factions[f] ? factions[f].description : "";
}

// Applies translations to static HTML: data-i18n (text) and data-i18n-title (tooltip)
function applyStaticTranslations(root = document) {
	root.querySelectorAll("[data-i18n]").forEach(e => e.textContent = t(e.getAttribute("data-i18n")));
	root.querySelectorAll("[data-i18n-title]").forEach(e => e.setAttribute("data-title", t(e.getAttribute("data-i18n-title"))));
}

function setLanguage(lang) {
	try {
		localStorage.setItem("gc-language", lang);
	} catch (e) {}
	location.reload();
}
