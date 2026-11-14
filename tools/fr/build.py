import json, re
en=json.load(open('tools/w3s/en.json')); fr=json.load(open('tools/w3s/fr.json'))
cards=json.load(open('cards.json'))
qm=json.load(open('quote_match.json'))
src=open('game/i18n.js').read()
block=src[src.index('const CARD_NAMES_FR'):src.index('};', src.index('const CARD_NAMES_FR'))]
mine=dict(re.findall(r'^\s*"((?:[^"\\]|\\.)*)": "((?:[^"\\]|\\.)*)",', block, re.M))
# manual fixes for low-confidence matches
fix={'neutral_cow.jpg':1134846,'neutral_chort.jpg':1134848}
# Francesca: FR strings are rotated by one relative to EN in the 1070310-1070313 block
fr_override={1070311:1070310,1070312:1070311,1070313:1070312,1070310:1070313}
QUOTE=('"','“','„','<i>')
def isquote(s): return s is not None and s.strip().startswith(QUOTE)
out={}
for c in cards:
    img=(c['deck'])+'_'+c['filename']+'.jpg'
    r=qm.get(img)
    qid=fix.get(img, r and r['id'])
    nm_id=None
    if qid and str(qid-1) in en and not isquote(en[str(qid-1)]): nm_id=qid-1
    fq=fr[str(fr_override.get(qid,qid))]
    out.setdefault(c['name'],{'img':img,'qid':qid,'quote_en':en[str(qid)],'quote_fr':fq,'name_id':nm_id,
        'name_en_off':en.get(str(nm_id)) if nm_id else None,'name_fr_off':fr.get(str(nm_id)) if nm_id else None,'mine':mine.get(c['name'])})
json.dump(out,open('cards_fr.json','w'),indent=1,ensure_ascii=False)
for n,v in out.items():
    off=v['name_fr_off']
    flag='' if off and off.replace('<br>',' : ')==v['mine'] else '  <<<'
    print(f"{n[:40]:40s} | mine={v['mine']!s:45s} | off={off!s}{flag}")
