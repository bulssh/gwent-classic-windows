import json, re
from rapidfuzz import process, fuzz
en=json.load(open('tools/w3s/en.json')); fr=json.load(open('tools/w3s/fr.json'))
ocr=json.load(open('ocr.json'))
def norm(s):
    s=s.lower().replace('’',"'").replace('‘',"'")
    s=re.sub(r'<[^>]+>',' ',s)
    s=re.sub(r"[^a-z0-9' ]+",' ',s)
    return re.sub(r'\s+',' ',s).strip()
QUOTE=('"','“','„','<i>')
cands={k:norm(v) for k,v in en.items() if v.strip().startswith(QUOTE) and len(v)<=320}
keys=list(cands.keys()); vals=[cands[k] for k in keys]
res={}
for f,txt in ocr.items():
    lines=[l for l in txt.split('\n') if l.strip()]
    best=None
    for skip in (0,1,2,3):
        q=norm(' '.join(lines[skip:]))
        if len(q)<4: continue
        for m in process.extract(q, vals, scorer=fuzz.ratio, limit=3):
            if best is None or m[1]>best[1]: best=(keys[m[2]], m[1], skip)
    k=best[0]
    res[f]={'id':int(k),'score':round(best[1]),'en':en[k],'fr':fr.get(k)}
json.dump(res,open('quote_match2.json','w'),indent=1,ensure_ascii=False)
old=json.load(open('quote_match.json'))
for f in res:
    if old[f]['id']!=res[f]['id'] or res[f]['score']<90:
        print(f, old[f]['id'], old[f]['score'], '->', res[f]['id'], res[f]['score'], res[f]['en'][:60], '| prev', en.get(str(res[f]['id']-1),'')[:30])
