import json, re
from rapidfuzz import process, fuzz
en=json.load(open('tools/w3s/en.json')); fr=json.load(open('tools/w3s/fr.json'))
ocr=json.load(open('ocr.json'))
def norm(s):
    s=s.lower().replace('’',"'").replace('‘',"'")
    s=re.sub(r'<[^>]+>',' ',s)
    s=re.sub(r"[^a-z0-9' ]+",' ',s)
    return re.sub(r'\s+',' ',s).strip()
cands={k:norm(v) for k,v in en.items() if 8<=len(v)<=320}
keys=list(cands.keys()); vals=[cands[k] for k in keys]
res={}
for f,txt in ocr.items():
    lines=[l for l in txt.split('\n') if l.strip()]
    best=None
    for skip in (1,2,3):
        q=norm(' '.join(lines[skip:]))
        if len(q)<6: continue
        m=process.extractOne(q, vals, scorer=fuzz.ratio)
        if m and (best is None or m[1]>best[1]): best=(keys[m[2]], m[1], skip)
    if best:
        k=best[0]
        res[f]={'id':int(k),'score':round(best[1]),'en':en[k],'fr':fr.get(k),'prev_en':en.get(str(int(k)-1)),'prev_fr':fr.get(str(int(k)-1))}
    else:
        res[f]=None
json.dump(res,open('quote_match.json','w'),indent=1,ensure_ascii=False)
for f,r in res.items():
    if r: print(f"{r['score']:3d} {f:45s} {r['id']} {r['en'][:60]!r} | name? {str(r['prev_en'])[:30]!r}")
    else: print('NONE',f)
