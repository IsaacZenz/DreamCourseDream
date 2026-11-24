"""Rollo as one smooth body: shapes blended with a smooth union (signed distance fields),
the shell laid over it, the arm in front. B2 shading from the blended shape's normal."""
import math, sys
SCALE=float(sys.argv[2]) if len(sys.argv)>2 else 5
W,H=int(18*SCALE),int(24*SCALE)
L=(-0.55,-0.7,0.75); _m=math.sqrt(sum(v*v for v in L)); L=tuple(v/_m for v in L)
def ell(cx,cy,rx,ry,a=0.0):
    ca,sa=math.cos(a),math.sin(a)
    def f(x,y):
        u=((x-cx)*ca+(y-cy)*sa)/rx; v=(-(x-cx)*sa+(y-cy)*ca)/ry
        return (math.hypot(u,v)-1)*min(rx,ry)
    return f
def cap(x0,y0,x1,y1,r0,r1):
    def f(x,y):
        vx,vy=x1-x0,y1-y0
        t=max(0,min(1,((x-x0)*vx+(y-y0)*vy)/((vx*vx+vy*vy) or 1)))
        return math.hypot(x-(x0+vx*t),y-(y0+vy*t))-(r0+(r1-r0)*t)
    return f
def smin(a,b,k):
    h=max(k-abs(a-b),0)/k if k>0 else 0
    return min(a,b)-h*h*k*0.25
def union(fs,k):
    def f(x,y):
        d=fs[0](x,y)
        for g in fs[1:]: d=smin(d,g(x,y),k)
        return d
    return f
def normal(f,x,y,depth):
    e=0.05; d=f(x,y)
    gx=(f(x+e,y)-f(x-e,y))/(2*e); gy=(f(x,y+e)-f(x,y-e))/(2*e)
    z=depth*math.sqrt(max(0.0,-d))
    n=(gx,gy,z); m=math.sqrt(sum(v*v for v in n)) or 1
    return tuple(v/m for v in n)
def shade(n,lo=0.42,hi=0.82):
    i=n[0]*L[0]+n[1]*L[1]+n[2]*L[2]
    return 2 if i>hi else (1 if i>lo else 0)
