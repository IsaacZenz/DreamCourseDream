import sys, math
exec(open('big.py').read())
a=math.radians(-62)
parts=[
 dict(k='tube',g=(4.4,20.4,1.2,21.4,1.05,0.35),c=SH),                     # tail
 dict(k='tube',g=(5.6,21.3,9.4,21.5,1.0,0.85),c=SK),                      # back foot
 dict(k='tube',g=(7.0,17.0,7.2,21.0,1.4,1.2),c=SK),                       # back leg
 dict(k='dome',g=(10.6,14.4,2.6,4.6),c=SK),                               # belly (pale, at the front)
 dict(k='rdome',g=(7.6,12.0,6.6,4.4,a),c=SH,rb=[-0.55,-0.3,-0.05,0.2,0.45]),  # shell hugging the back, banded
 dict(k='tube',g=(10.6,17.6,11.2,21.0,1.3,1.15),c=SK,line=[3,4]),         # front leg
 dict(k='tube',g=(10.8,21.3,13.6,21.5,1.0,0.8),c=SK),                     # front foot
 dict(k='tube',g=(11.8,11.4,13.8,13.0,0.95,0.85),c=SK,line=[3,4]),        # arm
 dict(k='dome',g=(14.2,13.2,0.95,0.85),c=SK,line=[7]),                    # paw
 dict(k='dome',g=(11.6,3.7,0.95,1.35),c=SK),                              # back ear
 dict(k='dome',g=(14.0,3.5,0.95,1.35),c=SK),                              # front ear
 dict(k='dome',g=(12.9,7.0,3.0,2.7),c=SK,line=[4]),                       # head
 dict(k='dome',g=(12.2,5.0,1.9,1.0),c=SH,line=[11]),                      # head shield
 dict(k='tube',g=(14.5,7.6,16.5,7.6,1.2,0.72),c=SK),                      # snout
 dict(k='dome',g=(11.6,3.9,0.44,0.8),c='ppp'),                            # inner ears
 dict(k='dome',g=(14.0,3.7,0.44,0.8),c='ppp'),
 flat('dome',(13.2,6.9,0.65,0.9),'e'),                                    # eye
 flat('dome',(13.0,6.55,0.25,0.25),'w'),                                  # shine
 flat('dome',(13.8,8.3,0.6,0.35),'p'),                                    # blush
 flat('dome',(16.4,7.45,0.38,0.4),'e'),                                   # nose
 flat('tube',(14.8,8.75,16.1,8.65,0.1,0.1),'i'),                          # mouth
]
write(sys.argv[1],render(parts))
