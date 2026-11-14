global.window={}; global.document={};
const fs=require('fs');
let src=fs.readFileSync('game/abilities.js','utf8').replace(/^var ability_dict/m,'global.ability_dict');
try{ eval(src);}catch(e){console.error('ab',e.message)}
let s2=fs.readFileSync('game/factions.js','utf8').replace(/^var factions/m,'global.factions');
try{ eval(s2);}catch(e){console.error('fa',e.message)}
const out={abilities:{},factions:{}};
for(const k in ability_dict) out.abilities[k]={name:ability_dict[k].name, description:ability_dict[k].description};
for(const k in factions) out.factions[k]={name:factions[k].name, description:factions[k].description};
console.log(JSON.stringify(out,null,1));
