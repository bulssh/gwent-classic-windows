const fs=require('fs');
const src=fs.readFileSync('game/cards.js','utf8');
eval(src.replace('var card_dict','global.card_dict'));
console.log(JSON.stringify(card_dict.map(c=>({name:c.name,deck:c.deck,filename:c.filename,ability:c.ability,row:c.row}))));
