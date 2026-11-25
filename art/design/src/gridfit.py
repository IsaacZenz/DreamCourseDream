"""Find the pixel grid (size and offset) of a pixel-art picture region, and sample it back to real pixels."""
from PIL import Image
import sys
def fit(im,box,pmin,pmax):
    x0,y0,x1,y1=box; best=None
    p=pmin
    while p<=pmax:
        for ox in [i*p/8 for i in range(8)]:
            for oy in [i*p/8 for i in range(8)]:
                err=0; n=0
                gx=x0+ox
                while gx+p<x1:
                    gy=y0+oy
                    while gy+p<y1:
                        # compare the cell centre with points near its edges: a well-fitted cell is one colour
                        c=im.getpixel((int(gx+p/2),int(gy+p/2)))
                        for fx,fy in ((0.2,0.2),(0.8,0.2),(0.2,0.8),(0.8,0.8)):
                            d=im.getpixel((int(gx+p*fx),int(gy+p*fy)))
                            err+=sum(abs(a-b) for a,b in zip(c,d)); n+=1
                        gy+=p*2
                    gx+=p*2
                if best is None or err/n<best[0]: best=(err/n,p,ox,oy)
        p+=0.05
    return best
def sample(im,box,p,ox,oy):
    x0,y0,x1,y1=box
    W=int((x1-x0-ox)/p); H=int((y1-y0-oy)/p)
    g=Image.new('RGB',(W,H))
    for j in range(H):
        for i in range(W):
            g.putpixel((i,j),im.getpixel((int(x0+ox+(i+0.5)*p),int(y0+oy+(j+0.5)*p))))
    return g
if __name__=='__main__':
    im=Image.open(sys.argv[1]).convert('RGB')
    box=tuple(int(v) for v in sys.argv[2].split(','))
    pmin,pmax=float(sys.argv[3]),float(sys.argv[4])
    e,p,ox,oy=fit(im,box,pmin,pmax); print('err %.1f pixel %.2f offset %.1f %.1f'%(e,p,ox,oy))
    g=sample(im,box,p,ox,oy); g.save(sys.argv[5]); print(g.size)
