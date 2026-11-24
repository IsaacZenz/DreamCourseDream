import sys, math
exec(open('sdf.py').read())
P=dict(tilt=-60)
for kv in sys.argv[3:]:
    k,v=kv.split('='); P[k]=float(v)
# one body: head, snout, ears, neck, torso, hips, legs, feet, tail, blended
head=ell(12.8,7.0,2.9,2.6); snout=cap(14.0,7.7,16.4,7.6,1.15,0.62)
ears=[ell(11.5,3.8,0.9,1.4,math.radians(-12)),ell(13.9,3.6,0.9,1.4,math.radians(10))]
torso=ell(9.6,13.6,3.6,5.0,math.radians(-12)); hips=ell(8.4,17.6,3.4,2.9)
legs=[cap(7.2,18.0,7.0,21.0,1.35,1.15),cap(10.4,18.4,10.8,21.0,1.3,1.15)]
feet=[cap(5.6,21.4,8.6,21.5,0.95,0.8),cap(10.0,21.4,13.2,21.5,0.95,0.75)]
tail=cap(5.4,19.6,1.4,21.4,1.05,0.32)
face=union([head,snout],0.9)
trunk=union([face,torso,hips],1.2)
legset=[union([legs[0],feet[0]],0.5),union([legs[1],feet[1]],0.5)]
body=union([trunk,*legset,tail],0.35)
body=lambda x,y,_b=body,_e=ears,_f=face: min(_b(x,y), smin(_f(x,y),min(e(x,y) for e in _e),0.35))
# the shell: a tilted dome over the back, reaching down over the hips and the tail
a=math.radians(P['tilt'])
shell=union([ell(7.4,12.0,6.2,4.2,a),ell(7.2,17.0,3.3,2.6),cap(5.2,19.4,1.6,21.3,0.95,0.32)],1.0)
# the arm in front, reaching forward
arm=union([cap(11.2,11.4,13.2,12.9,0.85,0.8),ell(13.7,13.1,0.9,0.8)],0.5)
out=[['.']*W for _ in range(H)]
reg=[[None]*W for _ in range(H)]
for y in range(H):
    for x in range(W):
        bx,by=(x+0.5)/SCALE,(y+0.5)/SCALE
        db=body(bx,by); ds=shell(bx,by); da=arm(bx,by)
        if da<0: reg[y][x]='arm'
        elif ds<0 and bx<11.0: reg[y][x]='shell'
        elif db<0 or (ds<0): reg[y][x]='body' if db<0 else 'shell'
for y in range(H):
    for x in range(W):
        r=reg[y][x]
        if r is None: continue
        bx,by=(x+0.5)/SCALE,(y+0.5)/SCALE
        if r=='shell':
            n=normal(shell,bx,by,2.4); s=shade(n,0.38,0.8); c='234'[s]
            u=((bx-7.4)*math.cos(a)+(by-12.0)*math.sin(a))/6.2
            for b in (-0.5,-0.25,0.0,0.25,0.5):
                if abs(u-b)<0.55/SCALE/6.2*1.4 and ell(7.4,12.0,6.2,4.2,a)(bx,by)<-0.15: c='i'
        elif r=='arm':
            n=normal(arm,bx,by,1.6); c='abc'[shade(n)]
        else:
            n=normal(body,bx,by,1.8); c='abc'[shade(n,0.38,0.8)]
        # ink only at real edges: where the shell meets the pale body, and round the arm over the body
        nb=[reg[y+dy][x+dx] if 0<=x+dx<W and 0<=y+dy<H else None for dx,dy in ((1,0),(-1,0),(0,1),(0,-1))]
        if r=='shell' and 'body' in nb: c='i'
        if r=='arm' and ('body' in nb or 'shell' in nb): c='i'
        out[y][x]=c
for _ in range(2):
    for y in range(1,H-1):
        for x in range(1,W-1):
            c=out[y][x]
            if c in '.ie': continue
            nb=[out[y-1][x],out[y+1][x],out[y][x-1],out[y][x+1]]
            if all(q==nb[0] for q in nb) and nb[0] not in '.ie' and nb[0]!=c and (nb[0] in 'abc')==(c in 'abc'): out[y][x]=nb[0]
            elif sum(q==c for q in nb)==0:
                same=[q for q in nb if q not in '.ie' and (q in 'abc')==(c in 'abc')]
                if len(same)>=3: out[y][x]=max(set(same),key=same.count)
def dot(cx,cy,rx,ry,ch):
    for y in range(H):
        for x in range(W):
            bx,by=(x+0.5)/SCALE,(y+0.5)/SCALE
            if ((bx-cx)/rx)**2+((by-cy)/ry)**2<=1 and out[y][x]!='.': out[y][x]=ch
# inner ears, eye with shine, blush, nose, mouth
dot(11.5,4.0,0.42,0.85,'p'); dot(13.9,3.8,0.42,0.85,'p')
dot(13.1,6.8,0.62,0.85,'e'); dot(12.9,6.45,0.24,0.24,'w')
dot(13.8,8.2,0.6,0.33,'p'); dot(16.2,7.45,0.4,0.42,'e')
for y in range(H):
    for x in range(W):
        bx,by=(x+0.5)/SCALE,(y+0.5)/SCALE
        if 14.7<bx<15.9 and abs(by-(8.55-0.05*(bx-14.7)))<0.5/SCALE*1.2 and out[y][x]!='.': out[y][x]='i'
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
open(sys.argv[1],'w').write(f"# Rollo design at large size ({W}x{H}): one blended body, shell over it, arm in front. Not a game sprite.\ncode: H6\nid: armadillo\nstatus: draft\nsize: {W}x{H}\nanchor: {W//2} {H-2}\noutline: ink\nframes-change: yes\n{keys}\nframe: design\n"+'\n'.join(''.join(r) for r in out)+'\n')
