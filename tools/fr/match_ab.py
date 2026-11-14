import json, re
from rapidfuzz import process, fuzz
en=json.load(open('tools/w3s/en.json')); fr=json.load(open('tools/w3s/fr.json'))
ab=json.load(open('ab.json'))
def norm(s):
    s=s.lower().replace('’',"'")
    s=re.sub(r'<[^>]+>',' ',s); s=re.sub(r"[^a-z0-9' ]+",' ',s)
    return re.sub(r'\s+',' ',s).strip()
keys=[k for k,v in en.items() if len(v)<400]; vals=[norm(en[k]) for k in keys]
res={}
for kind in ('abilities','factions'):
    for k,v in ab[kind].items():
        d=v.get('description') or ''
        if not d.strip(): continue
        ms=process.extract(norm(d), vals, scorer=fuzz.ratio, limit=3)
        best=ms[0]; kid=keys[best[2]]
        res[kind+'.'+k]={'id':int(kid),'score':round(best[1]),'en_src':d.strip(),'en':en[kid],'fr':fr[kid],'alts':[(keys[m[2]],round(m[1])) for m in ms[1:]]}
        print(f"{round(best[1]):3d} {kind[:2]}.{k:24s} {kid} | {d.strip()[:60]!r}\n     EN: {en[kid][:90]!r}\n     FR: {fr[kid][:110]!r}")
json.dump(res,open('ab_match.json','w'),indent=1,ensure_ascii=False)
