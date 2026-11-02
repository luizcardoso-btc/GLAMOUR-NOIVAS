import sys, glob, os
import numpy as np
from PIL import Image, ImageFilter
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))+'/'
logo=Image.open(ROOT+'public/img/logo/monograma.webp').convert('RGBA')
logo=logo.crop(logo.getbbox())
def marca(im):
    im=im.convert('RGBA'); W,H=im.size
    lw=max(56,int(min(W,H)*0.13))                     # ~13% do lado menor
    lg=logo.resize((lw,int(lw*logo.height/logo.width)),Image.LANCZOS)
    m=int(min(W,H)*0.035); x=W-lg.width-m; y=H-lg.height-m
    a=np.asarray(lg.split()[3])
    # halo claro + sombra suave para aparecer em fundo claro e escuro
    halo=Image.fromarray(a).filter(ImageFilter.GaussianBlur(lw*0.06))
    sombra=Image.new('RGBA',lg.size,(40,25,10,0)); sombra.putalpha(halo.point(lambda v:int(v*0.55)))
    brilho=Image.new('RGBA',lg.size,(255,250,235,0)); brilho.putalpha(Image.fromarray(a).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2)).point(lambda v:int(v*0.7)))
    camada=Image.new('RGBA',im.size,(0,0,0,0))
    camada.alpha_composite(sombra,(x+max(1,lw//60),y+max(1,lw//60)))
    camada.alpha_composite(brilho,(x,y))
    lg2=lg.copy(); lg2.putalpha(lg.split()[3].point(lambda v:int(v*0.92)))
    camada.alpha_composite(lg2,(x,y))
    return Image.alpha_composite(im,camada).convert('RGB')
arqs=sys.argv[1:] or sorted(glob.glob(ROOT+'originais/vestidos/*.webp'))
for f in arqs:
    nome=os.path.basename(f); im=Image.open(f)
    q=82 if nome.endswith('-card.webp') else 86
    marca(im).save(ROOT+'public/img/vestidos/'+nome,'WEBP',quality=q,method=6)
print(len(arqs),'fotos marcadas')
