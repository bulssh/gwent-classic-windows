import sys
from PIL import Image, ImageDraw
G='game/img/lg/'
names=sys.argv[2].split(',')
tiles=[]
for n in names:
    im=Image.open(G+n+'.jpg').convert('RGB').resize((410,775)).crop((0,0,410,580))
    d=ImageDraw.Draw(im)
    for x in range(0,410,50): d.line([(x,0),(x,580)],fill=(255,0,0) if x%100==0 else (255,160,160),width=1)
    for y in range(0,580,50): d.line([(0,y),(410,y)],fill=(0,0,255) if y%100==0 else (160,160,255),width=1)
    d.rectangle([0,0,140,18],fill=(0,0,0)); d.text((3,3),n[:24],fill=(255,255,0))
    tiles.append(im)
cols=4; W,H=410,580
sheet=Image.new('RGB',(W*cols,H*((len(tiles)+cols-1)//cols)),(0,0,0))
for i,t in enumerate(tiles): sheet.paste(t,((i%cols)*W,(i//cols)*H))
sheet.save(sys.argv[1])
