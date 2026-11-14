import json, re
en=json.load(open('tools/w3s/en.json')); fr=json.load(open('tools/w3s/fr.json'))
cards=json.load(open('cards.json'))
qm=json.load(open('quote_match2.json'))
abm=json.load(open('ab_match.json'))
QUOTE=('"','“','„','<i>')
GW=[(1043440,1043700),(1060700,1061200),(1062980,1063000),(1065000,1065300),(1070300,1070330),(1084300,1085300),(1085650,1085670),
    (1134700,1135000),(1192100,1192200),(1199790,1199830),(1209260,1209300),(1213810,1213830),(1223050,1223060)]
ingw=lambda i: any(a<=i<=b for a,b in GW)
def isq(s): return s.strip().startswith(QUOTE)
idx={}
for k,v in en.items(): idx.setdefault(v.strip().lower(),[]).append(int(k))
def lookup(name):
    ids=sorted(idx.get(name.strip().lower(),[]), key=lambda i:(not ingw(i), -i))
    return ids[0] if ids else None
def clean(s):
    s=s.replace('<br>','\n')
    s=re.sub(r'</?i>','',s)
    return s.strip()
NB=' '
leaders={}
EPI={'Foltest':'Foltest','Emhyr var Emreis':'Emhyr var Emreis','Francesca Findabair':'Francesca Findabair','Eredin':'Eredin'}
# rotation of the 4 Francesca quotes in fr.w3strings (FR text at id k translates EN text at id k+1)
fr_rot={1070311:1070310,1070312:1070311,1070313:1070312,1070310:1070313}
fixq={'neutral_cow.jpg':1134846,'neutral_chort.jpg':1134848}
alias={'Arachas- Behemoth':'Arachas Behemoth','Cerys - Clan Drummond Shield Maiden':'Clan Drummond Shield Maiden',
       'Clan Brokva Archer':'Clan Brokvar Archer','Schirru':'Schirrú',"Gaunter O'Dimm - Darkness":"Gaunter O'Dimm: Darkness"}
names={}; titles={}; quotes={}; src={}
names_en={}; titles_en={}; quotes_en={}
for c in cards:
    n=c['name']
    if n in names: continue
    img=c['deck']+'_'+c['filename']+'.jpg'
    qid=fixq.get(img, qm[img]['id'])
    quotes[n]=clean(fr[str(fr_rot.get(qid,qid))])
    quotes_en[n]=clean(en[str(qid)])
    nm=None; how=''
    if c['row']=='leader' and ' - ' in n:
        base,epi=[p.strip() for p in n.split(' - ',1)]
        hos=lookup(base+'<br>'+epi)
        if hos:
            b,e=fr[str(hos)].split('<br>'); how='hos'
            be,ee=en[str(hos)].split('<br>')
        else:
            bi=lookup(base); ei=lookup(epi)
            b,e=fr[str(bi)],fr[str(ei)]; how=f'{bi}+{ei}'
            be,ee=en[str(bi)],en[str(ei)]
        titles_en[n]=f'{be}\n{ee}'
        names[n]=f'{b}{NB}: {e}'; titles[n]=f'{b}\n{e}'; src[n]=how
        continue
    # name just before the quote
    for j in (1,2,3):
        s=en.get(str(qid-j))
        if s is None: continue
        if not isq(s) and len(s)<80: nm=qid-j; how='prev'
        break
    if nm is not None:
        a=alias.get(n,n).strip().lower().replace(' - ',': ').replace('- ',' ')
        if en[str(nm)].strip().lower()!=a and en[str(nm)].strip().lower()!=n.strip().lower():
            how='prev?('+en[str(nm)]+')'
    if nm is None or how.startswith('prev?'):
        cand=alias.get(n, n.strip().replace(' - ',': '))
        li=lookup(cand)
        if li: nm=li; how='lookup'
    if nm is None: raise SystemExit('no name for '+n)
    names[n]=clean(fr[str(nm)]); src[n]=how
    names_en[n]=clean(en[str(nm)])
for n in names:
    print(f'{src[n]:12s} {n:40s} -> {names[n]!r}  | {quotes[n][:50]!r}')
json.dump({'names':names,'titles':titles,'quotes':quotes},open('gen.json','w'),ensure_ascii=False,indent=1)

# ---- manual corrections ----
names['Mysterious Elf']=fr['1065285']      # card title printed on the card is "Avallac'h"
names_en['Mysterious Elf']=en['1065285']
names_en['Roach']='Roach'
names['Roach']=fr['1072034'] if en.get('1072034')=='Roach' else 'Ablette'
assert names['Mysterious Elf']=="Avallac'h", names['Mysterious Elf']

F=lambda i: clean(fr[str(i)])
def am(k): return F(abm['abilities.'+k]['id'])
abilities={
 'clear':[F(1085105),am('clear')], 'frost':[F(1085102),am('frost')], 'fog':[F(1085103),am('fog')], 'rain':[F(1085104),am('rain')],
 'storm':[F(1199798),am('storm')], 'hero':[F(1085124),am('hero')], 'decoy':[F(1085101),am('decoy')], 'horn':[F(1085099),am('horn')],
 'scorch_unit':[F(1085100),am('scorch_unit')], 'mardroeme':[F(1192130),am('mardroeme')], 'berserker':[F(1192132),am('berserker')],
 'vildkarrl':['',''], 'scorch':[F(1085100),am('scorch')],
 'scorch_c':[F(1085100)+NB+': combat rapproché',am('scorch_c')], 'scorch_r':[F(1134740),am('scorch_r')], 'scorch_s':[F(1134916),am('scorch_s')],
 'agile':[F(1085106),am('agile')], 'muster':[F(1085108),am('muster')], 'spy':[F(1085110),am('spy')], 'medic':[F(1085107),am('medic')],
 'morale':[F(1085112),am('morale')], 'bond':[F(1085111),am('bond')], 'avenger':[F(1214909),am('avenger')], 'avenger_kambi':[F(1214909),am('avenger_kambi')],
 'cerys':[F(1192148),F(1192149)],
}
for k,v in abm.items():
    kind,key=k.split('.',1)
    if kind=='abilities' and key not in abilities:
        abilities[key]=['',F(v['id'])]
factions_fr={'realms':[F(1084331),F(1085184)],'nilfgaard':[F(1084329),F(1085183)],'monsters':[F(1084330),F(1085186)],
             'scoiatael':[F(1084332),F(1085185)],'skellige':[F(1192146),F(1192147)]}
ui={ 'notif.me-first':1084314,'notif.op-first':1084315,'notif.me-coin':1084314,'notif.op-coin':1084315,'notif.round-start':1084322,
 'notif.me-pass':1084324,'notif.op-pass':1084325,'notif.win-round':1084318,'notif.lose-round':1084319,'notif.draw-round':1084320,
 'notif.me-turn':1084316,'notif.op-turn':1084317,'notif.north':1084323,'notif.monsters':1084326,'notif.nilfgaard':1084321,
 'notif.skellige-me':1192150,'notif.skellige-op':1192154,'end.draw':1084344,'end.win':1084334,'end.lose':1084335,'end.drawTitle':1084343,
 'passed':1084328,'deck.start':1084894,'deck.inDeck':1086436,'deck.total':1084553,'deck.units':1086244,'deck.special':1084470,
 'deck.strength':1084552,'deck.heroes':1084469,'deck.leader':1090466,'leader.ability':1192134,'tip.playLeader':1084549,
 'redraw':1084471,'carousel.discard':1084463,'carousel.draw':1084473,'carousel.opponentHand':1084472,
 'leader.cancelled-me':1084348,'leader.cancelled-op':1084349,'deck.chooseLeader':1084554,
}
# deck screen filters and options panel: official wording in both languages
ui_both={'deck.collection':1086515,'filter.all':1084464,'filter.close':1084465,'filter.ranged':1084466,'filter.siege':1084467,
 'filter.weather':1084468,'filter.hero':1084469,'filter.special':1084470,'deck.changeLeader':1086516,
 'opt.title':1066021,'opt.display':1066051,'opt.displayMode':1109408,'opt.windowed':1109441,'opt.borderless':1109442,
 'opt.fullscreen':1109443,'opt.musicVolume':1066048,'opt.sfxVolume':1066047,'opt.language':1084952,'opt.difficulty':1086759,
 'difficulty.easy':1066034,'difficulty.normal':1066035,'difficulty.hard':1066036,'opt.character':539938,'opt.on':1066029,
 'opt.off':1066030,'opt.close':147145,'opt.quit':1066024,'opt.sound':1066038,'key.examine':319097,'key.select':173873,
 'end.mainMenu':1083169,'key.hold':1083802,'pass.hint':1084550,'history.stats':1190790,'history.win':1084334,'history.lose':1084335,'history.draw':1084343}
ui.update(ui_both)
ui_fr={k:F(v) for k,v in ui.items()}
ui_en={k:clean(en[str(v)]) for k,v in ui_both.items()}
def js(o): return json.dumps(o, ensure_ascii=False, indent='\t')
out=['"use strict"','',
 '// Official texts of The Witcher 3 (Gwynt), French and English: card names, card quotes, abilities, factions and',
 '// game messages, read from the French string table (content0/fr.w3strings) of the player\'s own copy',
 '// of the game. Generated by tools/fr/gen_i18n.py, do not edit by hand.','',
 'const CARD_NAMES_FR = '+js(names)+';','',
 '// two-line titles printed on large leader cards',
 'const CARD_TITLES_FR = '+js(titles)+';','',
 'const CARD_QUOTES_FR = '+js(quotes)+';','',
 'const ABILITIES_FR = '+js(abilities)+';','',
 'const FACTIONS_FR = '+js(factions_fr)+';','',
 'const I18N_FR_OFFICIAL = '+js(ui_fr)+';','',
 'const I18N_EN_OFFICIAL = '+js(ui_en)+';','',
 '// English texts printed on the cards of the English version (the pictures carry no text)',
 'const CARD_TITLES_EN = '+js({**{k:v for k,v in names_en.items() if k not in titles_en}, **titles_en})+';','',
 'const CARD_QUOTES_EN = '+js(quotes_en)+';','']
open('game/i18n_data.js','w').write('\n'.join(out))
print(js(ui_fr)); print(js(abilities)[:3000])
