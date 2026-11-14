import os, json, sys
from PIL import Image, ImageOps
import pytesseract
D='tools/lg_src/'
out={}
for f in sorted(os.listdir(D)):
    if f.startswith('faction_'): continue
    im=Image.open(D+f).convert('L')
    w,h=im.size
    crop=im.crop((int(0.03*w), int(0.765*h), int(0.97*w), int(0.985*h)))
    crop=crop.resize((crop.width*3, crop.height*3), Image.LANCZOS)
    txt=pytesseract.image_to_string(crop, config='--psm 6')
    out[f]=txt
    print(f, '|', txt.replace('\n',' / '), flush=True)
json.dump(out, open('ocr.json','w'), indent=1, ensure_ascii=False)
