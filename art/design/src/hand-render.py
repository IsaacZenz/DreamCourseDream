import sys,json
from PIL import Image, ImageDraw
P=json.load(open('/home/user/DreamCourseDream/art/palette.json'))['ramps']
hx=lambda s:tuple(int(s[i:i+2],16) for i in (1,3,5))+(255,)
RAMP={'S':('tan',2,3,4),'G':('orange',2,3,4),'T':('purple',1,2,3)}
g=[l.rstrip('\n') for l in open(sys.argv[1]) if l.strip()]
H,W=len(g),len(g[0]); assert all(len(r)==W for r in g),[len(r) for r in g]
at=lambda x,y:g[y][x] if 0<=x<W and 0<=y<H else '.'
img=Image.new('RGBA',(W,H),(0,0,0,0))
for y in range(H):
  for x in range(W):
    c=g[y][x]
    if c=='.': continue
    if c=='K': img.putpixel((x,y),hx(P['grey'][0])); continue
    r,d,m,l=RAMP[c.upper()]
    # B2: light on the top/left edge, shadow on the bottom/right edge, base inside
    up,lf,dn,rt=at(x,y-1),at(x-1,y),at(x,y+1),at(x+1,y)
    shade=m
    E=lambda c:c in 'K.'
    if E(up) and not E(dn): shade=l
    elif E(dn) and not E(up): shade=d
    elif E(rt) and not E(lf) and not E(up): shade=d
    img.putpixel((x,y),hx(P[r][shade]))
img.save(sys.argv[2])
