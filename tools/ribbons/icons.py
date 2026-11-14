"""Badges of the neutral, special and weather cards, cut out so they can be drawn above a faction ribbon."""
import numpy as np, os, json, colorsys
from PIL import Image, ImageFilter
import cv2
G='game'
OUT=G+'/img/ribbon'
cards=json.load(open('tools/fr/cards.json'))
W,H=410,775
SLOTS=[(57,60,58),(57,252,52),(57,385,52)]
yy,xx=np.mgrid[0:H,0:W]
def circle(cx,cy,r): return (xx-cx)**2+(yy-cy)**2 <= r*r
done=set(); report=[]
for c in cards:
    if c['deck'] not in ('neutral','special','weather') or c['row']=='leader':
        continue
    key=c['deck']+'_'+c['filename']
    if key in done: continue
    done.add(key)
    im=Image.open(f'{G}/img/lg/{key}.jpg').convert('RGB').resize((W,H), Image.LANCZOS)
    a=np.asarray(im)
    hsv=cv2.cvtColor(a, cv2.COLOR_RGB2HSV).astype(int)   # H 0..180
    orange=(hsv[...,0]>=5)&(hsv[...,0]<=28)&(hsv[...,1]>110)&(hsv[...,2]>90)
    mask=np.zeros((H,W),bool); present=[]
    unit=c['row'] in ('close','ranged','siege','agile')
    abil=[x for x in c['ability'].split() if x!='hero']
    wanted=[0]+([1] if unit else [])+([2] if unit and abil else [])
    for i in wanted:
        cx,cy,r=SLOTS[i]
        mask|=circle(cx,cy,r+2); present.append(i)
    # hero: golden sunburst around the strength badge
    if 'hero' in c['ability']:
        zone=(xx<160)&(yy<240)
        gold=orange&zone
        n,lab=cv2.connectedComponents(gold.astype(np.uint8),8)
        keep=np.zeros_like(gold)
        for k in range(1,n):
            comp=lab==k
            if (comp&circle(57,60,75)).any() and comp.sum()>30:
                keep|=comp
        keep=cv2.dilate(keep.astype(np.uint8), np.ones((5,5),np.uint8))>0
        # rays are on the upper left part only
        mask|=keep&(yy<230)
    alpha=Image.fromarray((mask*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    al=np.asarray(alpha)
    rgb=a.copy(); rgb[al==0]=0
    rgba=np.dstack([rgb, al])
    ys,xs=np.nonzero(al)
    Image.fromarray(rgba,'RGBA').save(f'{OUT}/icons_{key}.png', optimize=True)
    report.append((key, present, 'hero' in c['ability'], c['ability']))
for r in report: print(r)
