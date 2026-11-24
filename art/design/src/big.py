"""Rollo at any size: parts in 18x24 design units, rendered at SCALE x in the B2 style."""
import math, sys, json
SCALE=float(sys.argv[2]) if len(sys.argv)>2 else 5
W,H=int(18*SCALE),int(24*SCALE)
L=(-0.55,-0.7,0.75); _m=math.sqrt(sum(v*v for v in L)); L=tuple(v/_m for v in L)
SH='234'; SK='abc'
def hit(p,bx,by):
    k,g=p['k'],p['g']
    if k=='dome':
        cx,cy,rx,ry=g; u=(bx-cx)/rx; v=(by-cy)/ry; ca,sa=1,0
    elif k=='rdome':
        cx,cy,rx,ry,a=g; ca,sa=math.cos(a),math.sin(a)
        u=((bx-cx)*ca+(by-cy)*sa)/rx; v=(-(bx-cx)*sa+(by-cy)*ca)/ry
    else:
        x0,y0,x1,y1,r0,r1=g; vx,vy=x1-x0,y1-y0
        t=max(0,min(1,((bx-x0)*vx+(by-y0)*vy)/((vx*vx+vy*vy) or 1))); r=r0+(r1-r0)*t
        u=(bx-(x0+vx*t))/r; v=(by-(y0+vy*t))/r; ca,sa=1,0
    d=u*u+v*v
    if d>1: return None
    return (u*ca-v*sa, u*sa+v*ca, math.sqrt(1-d))
def render(parts):
    ids=[[None]*W for _ in range(H)]; ns=[[None]*W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            bx,by=(x+0.5)/SCALE,(y+0.5)/SCALE
            for k in range(len(parts)-1,-1,-1):
                n=hit(parts[k],bx,by)
                if n: ids[y][x]=k; ns[y][x]=n; break
    out=[['.']*W for _ in range(H)]
    def at(x,y): return ids[y][x] if 0<=x<W and 0<=y<H else None
    for y in range(H):
        for x in range(W):
            k=ids[y][x]
            if k is None: continue
            p=parts[k]; n=ns[y][x]
            if 'flat' in p: out[y][x]=p['flat']; continue
            i=max(0,n[0]*L[0]+n[1]*L[1]+n[2]*L[2])
            # B2: three shades; the lit side top-left, the shadow bottom-right
            s=2 if i>0.86 else (1 if i>0.5 else 0)
            c=p['c'][s]
            bx,by=(x+0.5)/SCALE,(y+0.5)/SCALE
            # ink lines where this part meets a part it is drawn in front of (from the drawing)
            if p.get('line'):
                for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    q=at(x+dx,y+dy)
                    if q is not None and q in p['line']: c='i'
            # bands: horizontal ink lines (hb) and soft vertical stripes (vb), in design units
            for b in p.get('hb',[]):
                if abs(by-(b+0.5))<0.5/SCALE*1.2: c='i'
            # bands across a tilted shell: ink lines at set positions along its long axis
            if p.get('rb') and p['k']=='rdome':
                cx,cy,rx,ry,aa=p['g']; u=((bx-cx)*math.cos(aa)+(by-cy)*math.sin(aa))/rx
                for b in p['rb']:
                    if abs(u-b)<0.55/SCALE/rx*1.3: c='i'
            for b in p.get('vb',[]):
                if abs(bx-(b+0.5))<0.5/SCALE*1.6 and c in '34': c='2'
            out[y][x]=c
    return out
def flat(k,g,ch): return dict(k=k,g=g,c=ch*3,flat=ch)
def write(path,rows):
    keys="""key 2 grey 2
key 3 grey 3
key 4 grey 4
key a tan 2
key b tan 3
key c tan 4
key p pink 3
key i grey 1
key e grey 0
key w grey 4"""
    open(path,'w').write(f"# Rollo design at large size ({W}x{H}, {SCALE}x the game size), for refining before scaling down. Not a game sprite.\ncode: H6\nid: armadillo\nstatus: draft\nsize: {W}x{H}\nanchor: {W//2} {H-2}\noutline: ink\nframes-change: yes\n{keys}\nframe: design\n"+'\n'.join(''.join(r) for r in rows)+'\n')
