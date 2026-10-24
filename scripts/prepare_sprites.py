"""Split supplied PNG using transparent gutters; normalize uniformly, without repainting."""
import struct,zlib,json
from pathlib import Path
def read(path):
 b=Path(path).read_bytes();p=8;data=b''
 while p<len(b):
  n=struct.unpack('>I',b[p:p+4])[0];t=b[p+4:p+8];v=b[p+8:p+8+n];p+=n+12
  if t==b'IHDR':w,h,depth,color,_,_,interlace=struct.unpack('>IIBBBBB',v)
  if t==b'IDAT':data+=v
 assert depth==8 and color==6 and interlace==0
 raw=zlib.decompress(data);stride=w*4;prev=bytearray(stride);off=0;rows=[]
 for y in range(h):
  f=raw[off];off+=1;r=bytearray(raw[off:off+stride]);off+=stride
  for x in range(stride):
   a=r[x-4] if x>=4 else 0;c=prev[x-4] if x>=4 else 0;u=prev[x]
   if f==1:v=a
   elif f==2:v=u
   elif f==3:v=(a+u)//2
   elif f==4:
    q=a+u-c;pa=abs(q-a);pb=abs(q-u);pc=abs(q-c);v=a if pa<=pb and pa<=pc else u if pb<=pc else c
   else:v=0
   r[x]=(r[x]+v)&255
  rows.append(r);prev=r
 return w,h,rows
def write(path,w,h,rows):
 def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
 Path(path).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\0'+r for r in rows),9))+chunk(b'IEND',b''))
w,h,rows=read('assets/chihuahua-sprites.png')
# Find gutters near the expected 4x4 divisions instead of fractional CSS cells.
ys=[sum(r[x*4+3]>32 for x in range(w)) for r in rows]
xs=[sum(r[x*4+3]>32 for r in rows) for x in range(w)]
def cuts(counts,n):
 result=[0]
 for i in range(1,4):
  center=round(n*i/4);candidates=range(center-40,center+41)
  result.append(min(candidates,key=lambda v:(counts[v],abs(v-center))))
 return result+[n]
xc,yc=cuts(xs,w),cuts(ys,h)
Path('assets/frames').mkdir(exist_ok=True)
report={'source':[w,h],'alphaRange':[min(min(r[3::4]) for r in rows),max(max(r[3::4]) for r in rows)],'columnCuts':xc,'rowCuts':yc,'frames':[]}
for i in range(16):
 col,row=i%4,i//4;x0,x1=xc[col:col+2];y0,y1=yc[row:row+2]
 pts=[(x,y) for y in range(y0,y1) for x in range(x0,x1) if rows[y][x*4+3]>32]
 left=min(x for x,y in pts);right=max(x for x,y in pts)+1;top=min(y for x,y in pts);bottom=max(y for x,y in pts)+1
 # Ignore tiny alpha fringe in bbox; all character pixels remain within a padded crop.
 left=max(x0,left-1);right=min(x1,right+1);top=max(y0,top-1);bottom=min(y1,bottom+1)
 # Same character height, horizontal center, and foot baseline in 320x320 output.
 scale=min(286/(bottom-top),300/(right-left));dw=round((right-left)*scale);dh=round((bottom-top)*scale)
 ox=(320-dw)//2;oy=304-dh;out=[bytearray(320*4) for _ in range(320)]
 for dy in range(dh):
  sy=min(bottom-1,top+int(dy/scale))
  for dx in range(dw):
   sx=min(right-1,left+int(dx/scale));out[oy+dy][(ox+dx)*4:(ox+dx+1)*4]=rows[sy][sx*4:sx*4+4]
 write(f'assets/frames/{i:02}.png',320,320,out)
 report['frames'].append({'index':i,'sourceCell':[x0,y0,x1,y1],'bounds':[left,top,right,bottom],'output':[ox,oy,dw,dh],'baseline':304})
Path('assets/frames/alignment.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
