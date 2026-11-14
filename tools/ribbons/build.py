"""Faction ribbons for neutral, special and weather cards (TW3 shows them in the colours of the deck).
Outputs (game/img/ribbon/):
  ribbon_<faction>.png   ribbon overlay (alpha) computed from the faction cards
  icons_<card>.png       badges of a neutral/special/weather card, drawn again above the ribbon
"""
import numpy as np, os, json, re, sys
from PIL import Image, ImageFilter
import cv2
G='game'
OUT=G+'/img/ribbon'; os.makedirs(OUT, exist_ok=True)
cards=json.load(open('tools/fr/cards.json'))
info={c['deck']+'_'+c['filename']: c for c in cards}
ribbons=set(json.loads(re.search(r'new Set\((.*)\)', open(G+'/card_ribbons.js').read()).group(1)))
W,H=410,775
def load(name, folder='lg'):
    return np.asarray(Image.open(f'{G}/img/{folder}/{name}.jpg').convert('RGB').resize((W,H), Image.LANCZOS)).astype(np.float32)

SLOTS=[(57,60,58),(57,252,52),(57,385,52)]   # badge centres and radii (410x775 template)
yy,xx=np.mgrid[0:H,0:W]
def circle(cx,cy,r): return (xx-cx)**2+(yy-cy)**2 <= r*r

PERIOD=None
for fac in ['realms','nilfgaard','monsters','scoiatael','skellige']:
    names=sorted(n for n in ribbons if n.startswith(fac+'_'))
    stack=np.stack([load(n) for n in names])
    med=np.median(stack,axis=0)
    std=stack.std(axis=0).mean(axis=2)
    hero=[i for i,n in enumerate(names) if 'hero' in info.get(n,{}).get('ability','')]
    norm=[i for i in range(len(names)) if i not in hero]
    med_h=np.median(stack[hero],axis=0); med_n=np.median(stack[norm],axis=0)
    region=(xx<128)&(yy<int(0.915*H))
    mask=(std<14)&region
    # parchment zone: the banner is the same on hero (yellow) and normal (white) parchment
    parch=yy>=int(0.765*H)
    same=np.abs(med_h-med_n).mean(axis=2)<16
    mask&=~parch|same
    # badges are not part of the ribbon
    for cx,cy,r in SLOTS: mask&=~circle(cx,cy,r)
    # ribbon columns, from a zone that is visible on cards without ability icon
    rows=range(450,560)
    cols=np.array([np.nonzero(mask[y,:128])[0] for y in rows], dtype=object)
    xl=int(np.median([c.min() for c in cols if len(c)])); xr=int(np.median([c.max() for c in cols if len(c)]))
    # vertical period of the stripes/chain, by autocorrelation of the visible zone
    if PERIOD is None or True:
        band=med[440:570, xl:xr+1].mean(axis=2)
        best=(1e9,0)
        for p in range(20,120):
            a=med[440:570-0, xl:xr+1]; b=med[440-p:570-p, xl:xr+1]
            d=np.abs(a-b).mean()
            if d<best[0]: best=(d,p)
        period=best[1]
    # fill the ribbon under the badges and their shadows (y 100..450) from the same ribbon further down
    fill=np.zeros((H,W),bool); fill[100:450, xl:xr+1]=True
    near=np.zeros((H,W),bool)
    for cx,cy,r in SLOTS[1:]: near|=circle(cx,cy,r+14)
    need=fill&(~mask|near)
    rib=med.copy()
    for y in range(100,450):
        for x in np.nonzero(need[y])[0]:
            sy=y+period*((450-y)//period+1)
            while sy<565 and not mask[sy,x]: sy+=period
            if sy<565:
                rib[y,x]=med[sy,x]
    alpha=(mask|fill).astype(np.float32)
    alpha[:100,:]=np.where(mask[:100,:],1,0)
    # soften the edges
    a8=Image.fromarray((alpha*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    al=np.asarray(a8); rgb=np.clip(rib,0,255).astype(np.uint8); rgb[al==0]=0
    rgba=np.dstack([rgb, al])
    Image.fromarray(rgba,'RGBA').save(f'{OUT}/ribbon_{fac}.png', optimize=True)
    print(fac, len(names), 'heroes', len(hero), 'cols', xl, xr, 'period', period)
