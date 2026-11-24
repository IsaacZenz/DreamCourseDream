import sys, math
exec(open('big.py').read())
a=math.radians(-58)
parts=[
 dict(k='tube',g=(4.6,20.3,1.3,21.3,0.95,0.35),c=SH),                   # tail
 dict(k='tube',g=(6.0,21.4,9.2,21.6,0.8,0.7),c=SK),                     # back foot
 dict(k='dome',g=(10.2,16.8,1.9,2.8),c=SK),                             # belly / thigh
 dict(k='dome',g=(6.3,16.7,3.5,3.0),c=SH,hb=[15,17]),                   # banded hips
 dict(k='rdome',g=(6.6,10.6,5.3,3.4,a),c=SH),                           # tilted shell
 dict(k='dome',g=(8.7,7.0,1.0,1.8),c=SH,line=[4]),                      # plate behind the head
 dict(k='tube',g=(11.9,9.2,11.8,14.2,1.0,0.95),c=SK,line=[4,3]),        # neck and chest
 dict(k='tube',g=(12.0,11.2,13.6,12.9,0.75,0.7),c=SK,line=[6,4]),       # arm
 dict(k='dome',g=(14.0,13.1,0.8,0.7),c=SK,line=[7]),                    # paw
 dict(k='tube',g=(10.8,17.6,11.4,21.2,1.0,0.9),c=SK,line=[2,3]),        # front leg
 dict(k='tube',g=(11.0,21.5,12.6,21.6,0.75,0.6),c=SK),                  # front foot
 dict(k='dome',g=(11.4,3.6,0.9,1.3),c=SK),                              # back ear
 dict(k='dome',g=(13.9,3.4,0.9,1.3),c=SK),                              # front ear
 dict(k='dome',g=(12.8,6.8,2.9,2.6),c=SK,line=[5,4]),                   # head
 dict(k='tube',g=(14.3,7.4,16.4,7.4,1.15,0.7),c=SK),                    # snout
 dict(k='dome',g=(11.4,3.8,0.42,0.78),c='ppp'),                         # inner ears
 dict(k='dome',g=(13.9,3.6,0.42,0.78),c='ppp'),
 # the face
 flat('dome',(13.0,6.6,0.65,0.9),'e'),                                  # eye
 flat('dome',(12.8,6.25,0.25,0.25),'w'),                                # shine
 flat('dome',(13.6,8.0,0.6,0.35),'p'),                                  # blush
 flat('dome',(16.3,7.25,0.38,0.4),'e'),                                 # nose
 flat('tube',(14.6,8.55,16.0,8.45,0.1,0.1),'i'),                        # mouth
]
rows=render(parts)
write(sys.argv[1],rows)
