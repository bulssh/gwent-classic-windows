import json, sys
import numpy as np
from PIL import Image
im=np.array(Image.open(sys.argv[1]).convert('RGB')).astype(int); d=json.load(open(sys.argv[2]))
for i,r in enumerate(d['rows']):
    x,y,w,h=r['box']; cx=int(x+w/2); cy=int(y+h/2)
    c=im[cy-40:cy+40, cx-40:cx+30]
    R,G,B=c[...,0],c[...,1],c[...,2]
    blue=(B>170)&(G>170)&(R>140)&(B>R+10)
    gold=(R>170)&(G>120)&(B<120)
    disc=blue|gold
    ys,xs=np.nonzero(disc)
    dy0,dy1=np.percentile(ys,0.5),np.percentile(ys,99.5); dx0,dx1=np.percentile(xs,0.5),np.percentile(xs,99.5)
    ccx,ccy=(dx0+dx1)/2,(dy0+dy1)/2; rad=min(dx1-dx0,dy1-dy0)/2
    yy,xx=np.mgrid[0:c.shape[0],0:c.shape[1]]
    inside=(xx-ccx)**2+(yy-ccy)**2 < (rad*0.8)**2
    dark=(R<60)&(G<60)&(B<60)&inside
    ty,tx=np.nonzero(dark)
    tcy=(ty.min()+ty.max())/2; tcx=(tx.min()+tx.max())/2
    print(i,'disc',round(ccx-40,1),round(ccy-40,1),'r',round(rad,1),'digits',round(tcx-40,1),round(tcy-40,1),'offset', round(tcx-ccx,1), round(tcy-ccy,1), 'h',ty.max()-ty.min(),'w',tx.max()-tx.min())
