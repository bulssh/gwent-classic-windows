import json
from PIL import Image, ImageDraw
G='game/img/lg/'
OUT='game/img/portraits/'
import os; os.makedirs(OUT, exist_ok=True)
# card picture, crop centre (x, y) and side, in the 410x775 template
P={
 # characters the player can choose
 'geralt':('neutral_geralt',230,140,190), 'ciri':('neutral_ciri',215,115,180), 'yennefer':('neutral_yennefer',215,195,170),
 'triss':('neutral_triss',270,115,170), 'zoltan':('neutral_zoltan',235,135,190), 'dandelion':('neutral_dandelion',240,120,180),
 'vesemir':('neutral_vesemir',230,125,190), 'regis':('neutral_emiel',240,135,180), 'avallach':('neutral_mysterious_elf',215,135,180),
 'olgierd':('neutral_olgierd',290,140,190), 'gaunter':('neutral_gaunter_odimm',285,130,180), 'keira':('realms_keira',235,100,170),
 'roche':('realms_vernon',255,135,180), 'iorveth':('scoiatael_iorveth',255,130,180), 'cerys':('skellige_cerys',185,160,160),
 'letho':('nilfgaard_letho',232,105,170), 'dijkstra':('realms_dijkstra',250,110,180), 'philippa':('realms_philippa',190,145,170),
 'ermion':('skellige_ermion',228,185,170), 'eithne':('scoiatael_eithne',250,130,180),
 # leaders (opponent portrait = leader of its deck)
 'realms_foltest_copper':('realms_foltest_copper',210,100,160), 'realms_foltest_silver':('realms_foltest_silver',155,245,160),
 'realms_foltest_bronze':('realms_foltest_bronze',220,140,170), 'realms_foltest_gold':('realms_foltest_gold',220,225,180),
 'realms_foltest_son_of_medell':('realms_foltest_son_of_medell',210,145,160),
 'nilfgaard_emhyr_gold':('nilfgaard_emhyr_gold',260,240,160), 'nilfgaard_emhyr_silver':('nilfgaard_emhyr_silver',140,165,170),
 'nilfgaard_emhyr_bronze':('nilfgaard_emhyr_bronze',310,165,170), 'nilfgaard_emhyr_copper':('nilfgaard_emhyr_copper',200,185,190),
 'nilfgaard_emhyr_invader_of_the_north':('nilfgaard_emhyr_invader_of_the_north',180,170,200),
 'monsters_eredin_gold':('monsters_eredin_gold',190,115,180), 'monsters_eredin_silver':('monsters_eredin_silver',280,120,170),
 'monsters_eredin_bronze':('monsters_eredin_bronze',280,100,170), 'monsters_eredin_copper':('monsters_eredin_copper',275,115,180),
 'monsters_eredin_the_treacherous':('monsters_eredin_the_treacherous',230,120,180),
 'scoiatael_francesca_gold':('scoiatael_francesca_gold',240,195,200), 'scoiatael_francesca_silver':('scoiatael_francesca_silver',295,100,120),
 'scoiatael_francesca_bronze':('scoiatael_francesca_bronze',290,85,130), 'scoiatael_francesca_copper':('scoiatael_francesca_copper',180,190,150),
 'scoiatael_francesca_hope_of_the_aen_seidhe':('scoiatael_francesca_hope_of_the_aen_seidhe',190,170,150),
 'skellige_crach_an_craite':('skellige_crach_an_craite',165,150,150), 'skellige_king_bran':('skellige_king_bran',190,100,160),
}
tiles=[]
for key,(img,cx,cy,side) in P.items():
    im=Image.open(G+img+'.jpg').convert('RGB').resize((410,775), Image.LANCZOS)
    h=side/2
    box=(max(0,cx-h), max(0,cy-h), min(410,cx+h), min(775,cy+h))
    c=im.crop(tuple(int(v) for v in box)).resize((256,256), Image.LANCZOS)
    c.save(OUT+key+'.jpg', quality=88)
    t=c.resize((128,128)); d=ImageDraw.Draw(t); d.rectangle([0,0,127,12],fill=(0,0,0)); d.text((2,1),key[:20],fill=(255,255,0)); tiles.append(t)
cols=8
sheet=Image.new('RGB',(128*cols,128*((len(tiles)+cols-1)//cols)))
for i,t in enumerate(tiles): sheet.paste(t,((i%cols)*128,(i//cols)*128))
sheet.save('crops_sheet.png')
json.dump({k:v[0] for k,v in P.items()}, open('portraits.json','w'))
