"""Recolour recovered pixel art into the Royal scheme: each source colour -> a palette shade by role and lightness."""
from PIL import Image
import json, colorsys, sys
from collections import deque, Counter
pal=json.load(open('/home/user/DreamCourseDream/art/palette.json'))['ramps']
hx=lambda h:tuple(int(h[i:i+2],16) for i in (1,3,5))
RAMP={'skin':('tan',[2,3,4]),'gold':('gold',[2,3,4]),'teal':('purple',[1,2,3]),'dark':('purple',[0,1,1])}
def role(c):
    r,g,b=c; h,l,s=colorsys.rgb_to_hls(r/255,g/255,b/255)
    if l<0.085: return 'ink'
    if l<0.36 and 0.66<h<0.9: return 'bg'
    if 0.38<h<0.6 and s>0.12: return 'teal'
    if 0.08<h<0.17 and s>0.75 and l<0.66: return 'gold'
    if l<0.30: return 'dark'
    return 'skin'
def recolour(src,dst):
    g=Image.open(src).convert('RGB'); W,H=g.size
    R=[[role(g.getpixel((x,y))) for x in range(W)] for y in range(H)]
    bg=[[False]*W for _ in range(H)]; q=deque([(x,y) for x in range(W) for y in (0,H-1)]+[(x,y) for y in range(H) for x in (0,W-1)])
    while q:
        x,y=q.popleft()
        if not(0<=x<W and 0<=y<H) or bg[y][x] or R[y][x]!='bg': continue
        bg[y][x]=True; q.extend([(x+1,y),(x-1,y),(x,y+1),(x,y-1)])
    # thin the ink to one pixel (B2): ink that touches no coloured part is not a line
    for _ in range(2):
        drop=[]
        for y in range(H):
            for x in range(W):
                if bg[y][x] or R[y][x]!='ink': continue
                nb=[(x+dx,y+dy) for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)) if 0<=x+dx<W and 0<=y+dy<H]
                if not any(not bg[v][u] and R[v][u] not in ('ink','bg') for u,v in nb): drop.append((x,y))
        for x,y in drop:
            nb=[(x+dx,y+dy) for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)) if 0<=x+dx<W and 0<=y+dy<H]
            if any(bg[v][u] for u,v in nb) or x in (0,W-1) or y in (0,H-1): bg[y][x]=True
    # thin thick inner lines to one pixel (Zhang-Suen thinning on the ink that is not the outer edge)
    def isink(x,y): return 0<=x<W and 0<=y<H and not bg[y][x] and R[y][x]=='ink'
    changed=True
    while changed:
        changed=False
        for step in (0,1):
            rm=[]
            for y in range(H):
                for x in range(W):
                    if not isink(x,y): continue
                    if any(0<=x+dx<W and 0<=y+dy<H and bg[y+dy][x+dx] for dx,dy in ((1,0),(-1,0),(0,1),(0,-1))): continue  # keep the outline
                    p=[isink(x,y-1),isink(x+1,y-1),isink(x+1,y),isink(x+1,y+1),isink(x,y+1),isink(x-1,y+1),isink(x-1,y),isink(x-1,y-1)]
                    b=sum(p); a=sum((not p[i]) and p[(i+1)%8] for i in range(8))
                    if 2<=b<=6 and a==1:
                        if step==0 and not(p[0] and p[2] and p[4]) and not(p[2] and p[4] and p[6]): rm.append((x,y))
                        if step==1 and not(p[0] and p[2] and p[6]) and not(p[0] and p[4] and p[6]): rm.append((x,y))
            for x,y in rm:
                c=Counter(R[y+dy][x+dx] for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)) if 0<=x+dx<W and 0<=y+dy<H and not bg[y+dy][x+dx] and R[y+dy][x+dx] not in ('ink','bg'))
                if c: R[y][x]=c.most_common(1)[0][0]; changed=True
    # colours used per role, darkest to lightest -> the role's three shades
    cols={}
    for y in range(H):
        for x in range(W):
            if not bg[y][x] and R[y][x] not in ('ink','bg'): cols.setdefault(R[y][x],Counter())[g.getpixel((x,y))]+=1
    lv={}
    for rl,cnt in cols.items():
        main=[c for c,n in cnt.items() if n>=2] or list(cnt)
        ls=sorted(main,key=lambda c:0.3*c[0]+0.59*c[1]+0.11*c[2])
        def near(c,ls=ls):
            l=0.3*c[0]+0.59*c[1]+0.11*c[2]
            k=min(range(len(ls)),key=lambda i:abs(0.3*ls[i][0]+0.59*ls[i][1]+0.11*ls[i][2]-l))
            return 1 if len(ls)==1 else round(2*k/(len(ls)-1))
        lv[rl]=near
    out=Image.new('RGBA',(W,H),(0,0,0,0))
    for y in range(H):
        for x in range(W):
            if bg[y][x]: continue
            rl=R[y][x]
            if rl in ('ink','bg'): out.putpixel((x,y),hx(pal['grey'][0])+(255,)); continue
            ramp,sh=RAMP[rl]
            def other(dx,dy):
                u,v=x+dx,y+dy
                return not(0<=u<W and 0<=v<H) or bg[v][u] or R[v][u]!=rl
            k=1
            if other(0,-1) or other(-1,0): k=2
            elif other(0,1) or other(1,0): k=0
            out.putpixel((x,y),hx(pal[ramp][sh[k]])+(255,))
    out.save(dst)
for a,b in zip(sys.argv[1::2],sys.argv[2::2]): recolour(a,b)
