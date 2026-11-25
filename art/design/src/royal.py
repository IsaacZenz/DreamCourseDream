"""Royal Rollo, redrawn from smooth shapes following the owner's sheet (coordinates on its 47x65 grid).
Parts are drawn back to front; each has one colour ramp; ink between parts; B2 cel shading."""
import math, sys, json
exec(open('sdf.py').read().split("def normal")[0].replace("SCALE=float(sys.argv[2]) if len(sys.argv)>2 else 5\nW,H=int(18*SCALE),int(24*SCALE)",""))
S=float(sys.argv[2]) if len(sys.argv)>2 else 1
W,H=int(47*S),int(65*S)
def normal(f,x,y,depth):
    e=0.1; d=f(x,y)
    gx=(f(x+e,y)-f(x-e,y))/(2*e); gy=(f(x,y+e)-f(x,y-e))/(2*e)
    z=depth*math.sqrt(max(0.0,-d)); n=(gx,gy,z); m=math.sqrt(sum(v*v for v in n)) or 1
    return tuple(v/m for v in n)
def band(f,period,width,slope=0.0,phase=0.0):
    return lambda x,y: f(x,y) if ((y-slope*x+phase)%period)<width else 9.0
R=math.radians
P=[ # name, shape, ramp, base shade
 ('tail',  union([cap(11,48,1.5,52,3.6,1.2)],1),'tan',3),
 ('shell', union([ell(10,40,8.5,13.5,R(-6))],1),'tan',3),
 ('torso', union([ell(24,38,7.2,9.8,R(-12))],1),'tan',3),
 ('feet',  union([cap(12.5,61.2,19.5,61.6,2.1,1.6),cap(28,60.8,36,61.2,2.1,1.6)],1),'tan',3),
 ('pants', union([ell(22.5,46.5,8.5,4.6),cap(18,47,14.5,58.5,4.6,3.0),cap(27,47,31,58,4.6,3.0)],1.5),'purple',2),
 ('hood',  union([ell(16,20.5,10.5,9.5,R(-38)),cap(15,21,36,31.5,7.4,2.2),cap(19,11.5,21,27,5.0,5.0)],2.6),'gold',3),
 ('collar',union([ell(27.5,24.5,5.6,3.6,R(-10))],1),'purple',1),
 ('ears',  union([ell(24.6,6.8,2.6,5.2,R(-14)),ell(33.8,5.8,2.6,5.2,R(12))],1),'tan',3),
 ('head',  union([ell(31.0,15.4,8.6,7.2,R(8)),cap(36,17.6,44.5,19.4,4.6,1.8)],2.4),'tan',3),
 ('arm',   union([cap(30.5,31.5,35.2,41.5,3.3,2.7)],1),'purple',2),
 ('hand',  union([ell(37.4,43.8,2.1,2.3)],1),'tan',3),
]
# details on top of parts: purple bands on the shell and tail, a purple band across the head, purple inner ears
DET=[('shell',band(ell(10,40,8.0,13.0,R(-6)),6.5,2.2,0.25,1.0),'purple',2),
     ('tail',band(cap(11,48,1.5,52,3.0,0.9),5.0,1.8,-1.2,0),'purple',2),
     ('head',lambda x,y: ell(29.8,10.8,7.2,2.6,R(10))(x,y),'purple',2),
     ('ears',lambda x,y: min(ell(24.6,7.4,1.05,3.3,R(-14))(x,y),ell(33.8,6.4,1.05,3.3,R(12))(x,y)),'purple',2)]
pal=json.load(open('/home/user/DreamCourseDream/art/palette.json'))['ramps']
reg=[[None]*W for _ in range(H)]
for y in range(H):
    for x in range(W):
        bx,by=(x+0.5)/S,(y+0.5)/S
        for i in range(len(P)-1,-1,-1):
            if P[i][1](bx,by)<0: reg[y][x]=i; break
out=[[None]*W for _ in range(H)]
for y in range(H):
    for x in range(W):
        i=reg[y][x]
        if i is None: continue
        name,f,ramp,base=P[i]; bx,by=(x+0.5)/S,(y+0.5)/S
        for dn,df,dr,db in DET:
            if dn==name and df(bx,by)<0: ramp,base=dr,db
        n=normal(f,bx,by,1.4)
        li=n[0]*L[0]+n[1]*L[1]+n[2]*L[2]
        s=base+1 if li>0.84 else (base if li>0.42 else base-1)
        out[y][x]=(ramp,max(0,min(4,s)))
        # ink where this part meets a part drawn behind it
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
            u,v=x+dx,y+dy
            if 0<=u<W and 0<=v<H and reg[v][u] is not None and reg[v][u]<i and P[reg[v][u]][0]!=name:
                out[y][x]=('grey',0) if S<2 else ('grey',1)
# face: eye with a shine, nose
def dot(cx,cy,rx,ry,c):
    for y in range(H):
        for x in range(W):
            bx,by=(x+0.5)/S,(y+0.5)/S
            if ((bx-cx)/rx)**2+((by-cy)/ry)**2<=1 and out[y][x]: out[y][x]=c
dot(33.4,16.0,1.3,1.7,('grey',0)); dot(33.0,15.3,0.5,0.5,('grey',4)); dot(44.0,18.9,1.4,1.3,('grey',0))
# rim light: a few cool pixels on the right edge of the hood; shine on the hood
img=__import__('PIL.Image',fromlist=['Image']).new('RGBA',(W,H),(0,0,0,0))
hx=lambda h:tuple(int(h[i:i+2],16) for i in (1,3,5))
for y in range(H):
    for x in range(W):
        if out[y][x]: img.putpixel((x,y),hx(pal[out[y][x][0]][out[y][x][1]])+(255,))
# outer ink outline (as the press adds in the game)
T=max(1,int(round(S*0.67)))
ol=[[False]*W for _ in range(H)]
for y in range(H):
    for x in range(W):
        if out[y][x]: continue
        if any(0<=x+dx<W and 0<=y+dy<H and out[y+dy][x+dx] and out[y+dy][x+dx]!=('ink',) for dx in range(-T,T+1) for dy in range(-T,T+1) if abs(dx)+abs(dy)<=T):
            ol[y][x]=True
for y in range(H):
    for x in range(W):
        if ol[y][x]: img.putpixel((x,y),hx(pal['grey'][0])+(255,))
img.save(sys.argv[1])
