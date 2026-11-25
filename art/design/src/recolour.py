from PIL import Image, ImageDraw
import json, colorsys, sys
from collections import deque, Counter
g=Image.open('ref/big-native.png').convert('RGB'); W,H=g.size
pal=json.load(open('/home/user/DreamCourseDream/art/palette.json'))['ramps']
hx=lambda h:tuple(int(h[i:i+2],16) for i in (1,3,5))
def role(c):
    r,gg,b=c; h,l,s=colorsys.rgb_to_hls(r/255,gg/255,b/255)
    if l<0.13: return 'ink'
    if l<0.30 and (0.65<h<0.85): return 'bg'
    if 0.40<h<0.58 and s>0.15: return 'teal'
    if 0.09<h<0.16 and s>0.6 and l<0.72: return 'gold'
    if l<0.38: return 'inner'
    return 'skin'
R=[[role(g.getpixel((x,y))) for x in range(W)] for y in range(H)]
bg=[[False]*W for _ in range(H)]; q=deque()
for x in range(W): q+= [(x,0),(x,H-1)]
for y in range(H): q+= [(0,y),(W-1,y)]
while q:
    x,y=q.popleft()
    if not(0<=x<W and 0<=y<H) or bg[y][x] or R[y][x]!='bg': continue
    bg[y][x]=True; q.extend([(x+1,y),(x-1,y),(x,y+1),(x,y-1)])
for y in range(H):
    for x in range(W):
        if R[y][x]=='bg' and not bg[y][x]: R[y][x]='ink'
# tidy roles: a lone pixel takes the role most of its neighbours have
for _ in range(2):
    for y in range(1,H-1):
        for x in range(1,W-1):
            if bg[y][x]: continue
            nb=[R[y+dy][x+dx] for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)) if not bg[y+dy][x+dx]]
            c=Counter(nb).most_common(1)
            if c and c[0][1]>=3 and R[y][x] not in nb: R[y][x]=c[0][0]
lum={}
for y in range(H):
    for x in range(W):
        if not bg[y][x]: c=g.getpixel((x,y)); lum.setdefault(R[y][x],[]).append(0.3*c[0]+0.59*c[1]+0.11*c[2])
cut={k:(sorted(v)[len(v)//3],sorted(v)[2*len(v)//3]) for k,v in lum.items()}
Lv=[[0]*W for _ in range(H)]
for y in range(H):
    for x in range(W):
        if bg[y][x]: continue
        c=g.getpixel((x,y)); l=0.3*c[0]+0.59*c[1]+0.11*c[2]; a,b=cut[R[y][x]]; Lv[y][x]=0 if l<a else (1 if l<b else 2)
# smooth shade levels inside each role (3x3 majority of the same role), so colour areas are solid (B2)
for _ in range(2):
    new=[r[:] for r in Lv]
    for y in range(H):
        for x in range(W):
            if bg[y][x] or R[y][x] in ('ink',): continue
            vs=[Lv[y+dy][x+dx] for dy in (-1,0,1) for dx in (-1,0,1) if 0<=x+dx<W and 0<=y+dy<H and not bg[y+dy][x+dx] and R[y+dy][x+dx]==R[y][x]]
            new[y][x]=Counter(vs).most_common(1)[0][0]
    Lv=new
def paint(sc):
    im=Image.new('RGBA',(W,H),(0,0,0,0))
    for y in range(H):
        for x in range(W):
            if bg[y][x]: continue
            rl=R[y][x]
            if rl=='ink': col=hx(pal['grey'][0])
            else:
                s=sc[rl]; lv=Lv[y][x]
                col=hx(pal[s[2]][3]) if len(s)>2 and lv==2 else hx(pal[s[0]][s[1][lv]])
            im.putpixel((x,y),col+(255,))
    return im
SCHEMES={
 'AS DRAWN (OUR PALETTE)':{'skin':('tan',[2,3,4]),'gold':('gold',[2,3,4]),'teal':('blue',[1,2,3]),'inner':('brown',[0,1,1])},
 'CLASSIC':{'skin':('tan',[2,3,4]),'gold':('red',[1,2,2],'pink'),'teal':('brown',[1,2,3]),'inner':('brown',[0,0,1])},
 'HERO POP':{'skin':('tan',[2,3,4]),'gold':('red',[1,2,2],'pink'),'teal':('blue',[1,2,3]),'inner':('red',[0,0,1])},
 'EARTHY':{'skin':('tan',[2,3,4]),'gold':('orange',[2,3,4]),'teal':('green',[1,2,3]),'inner':('brown',[0,0,1])},
 'ROYAL':{'skin':('tan',[2,3,4]),'gold':('gold',[2,3,4]),'teal':('purple',[1,2,3]),'inner':('purple',[0,0,1])},
}
Z=7; pad=16
out=Image.new('RGB',(len(SCHEMES)*(W*Z+pad)+pad, H*Z+60+H*2+20),(32,32,44)); d=ImageDraw.Draw(out)
for n,(name,sc) in enumerate(SCHEMES.items()):
    im=paint(sc); x0=pad+n*(W*Z+pad)
    d.text((x0,12),name,fill=(240,232,200),font_size=18)
    big=im.resize((W*Z,H*Z),Image.NEAREST); out.paste(big,(x0,44),big)
    im.save(f'ref/scheme-{n}.png')
out.save('ref/schemes.png'); print(out.size)
