import numpy as np, os, json, re
from PIL import Image
G='game'
ribbons=set(json.loads(re.search(r'new Set\((.*)\)', open(G+'/card_ribbons.js').read()).group(1)))
W,H=410,775
def load(name):
    return np.asarray(Image.open(f'{G}/img/lg/{name}.jpg').convert('RGB').resize((W,H), Image.LANCZOS)).astype(np.float32)
out={}
for fac in ['realms','nilfgaard','monsters','scoiatael','skellige']:
    names=sorted(n for n in ribbons if n.startswith(fac+'_'))
    stack=np.stack([load(n) for n in names])
    med=np.median(stack,axis=0); std=stack.std(axis=0).mean(axis=2)
    Image.fromarray(med.astype(np.uint8)).crop((0,0,150,H)).save(f'med_{fac}.png')
    Image.fromarray(np.clip(std*3,0,255).astype(np.uint8)).crop((0,0,150,H)).save(f'std_{fac}.png')
    print(fac, len(names))
