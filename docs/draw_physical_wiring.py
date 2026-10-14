from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
W,H=2800,1900
im=Image.new('RGB',(W,H),'#f5f7fa');d=ImageDraw.Draw(im)
font='C:/Windows/Fonts/malgun.ttf';bold='C:/Windows/Fonts/malgunbd.ttf'
def text(x,y,s,size=28,color='#172b40',b=False):d.text((x,y),s,font=ImageFont.truetype(bold if b else font,size),fill=color)
def box(rect,fill='#ffffff',outline='#c8d2de',r=20):d.rounded_rectangle(rect,r,fill,outline,width=3)
def wire(points,color,width=6):d.line(points,fill=color,width=width,joint='curve')
def dot(x,y,c):d.ellipse((x-7,y-7,x+7,y+7),fill=c)
red='#dc3535';black='#27333f';blue='#147cd1';green='#20834a';purple='#8c42c7';orange='#d56c08'
text(80,40,'ESP32 스마트팜 · 실제 GPIO 핀 배선도',52,b=True)
text(80,115,'NodeMCU ESP-32S 38핀 · 보드 앞면 / 안테나 위, USB 아래',30)
text(80,163,'전원선은 3V3·5V·GND 공통망 표기   |   선 교차에 점이 없으면 서로 연결되지 않음',24)
# exact board
box((1030,245,1600,1475),'#222d38','#17202a')
box((1140,275,1490,430),'#131a21','#6a7f8d',5)
wire([(1160,405),(1160,305),(1220,305),(1220,390),(1280,390),(1280,305),(1340,305),(1340,390),(1400,390),(1400,305),(1470,305)],'#c8aa57',8)
box((1170,445,1460,725),'#adb8c2','#71808b',4);text(1200,500,'ESP-WROOM-32',27,b=True);text(1210,620,'ESP32',40,b=True)
text(1160,790,'NodeMCU',38,'#ffffff',True);text(1180,850,'ESP-32S',34,'#ffffff',True)
box((1240,1365,1400,1490),'#b8c1ca','#65717c',10);text(1250,1400,'USB',37)
left=['3V3','EN','VP / 36','VN / 39','P34','P35','P32','P33','P25','P26','P27','P14','P12','GND','P13','SD2 / 9','SD3 / 10','CMD / 11','5V']
right=['GND','P23','P22','TX / 1','RX / 3','P21','GND','P19','P18','P5','P17','P16','P4','P0','P2','P15','SD1 / 8','SD0 / 7','CLK / 6']
L={};R={};start=470;step=48
for labels,x,side in [(left,1010,'L'),(right,1620,'R')]:
 for i,label in enumerate(labels):
  y=start+i*step
  d.rectangle((x-12,y-12,x+12,y+12),fill='#d9b35f',outline='#715a28',width=2)
  d.ellipse((x-5,y-5,x+5,y+5),fill='#1d2732')
  text(1048 if side=='L' else 1475,y-17,label,23,'#ffffff')
  (L if side=='L' else R)[label]=(x,y)
# local shared power symbol endpoints
def net(x,y,name):
 c=red if name in ('3V3','5V') else black
 wire([(x,y),(x+80,y)],c);dot(x,y,c);text(x+90,y-19,name,26,c,True)
def terminal(x,y,name):dot(x,y,black);text(x-120,y-19,name,25)
# left components with no ambiguous real sensor pin order
box((65,255,570,520));text(95,275,'DHT11 온습도 모듈',31,b=True)
box((100,340,220,475),'#36a8d3','#16677d',8)
for yy in range(355,470,20):
 for xx in range(114,215,23):d.rectangle((xx,yy,xx+10,yy+9),fill='#175b74')
text(250,340,'VCC',25);net(370,365,'3V3');text(250,390,'GND',25);net(370,415,'GND');text(250,440,'DATA',25);dot(550,463,blue)
wire([(550,463),(700,463),(700,225),(1730,225),(1730,R['P4'][1]),R['P4']],blue)
# soil
box((65,590,570,875));text(95,610,'정전식 토양 수분 센서',30,b=True)
box((110,680,225,840),'#222831','#56616e',10);text(112,745,'SOIL',24,'#ffffff')
text(250,675,'VCC',25);net(370,700,'3V3');text(250,725,'GND',25);net(370,750,'GND');text(250,775,'AOUT',25);dot(550,800,green)
wire([(550,800),(780,800),(780,L['P34'][1]),L['P34']],green)
text(95,840,'3.3V 전원 / 출력 범위 확인 기준',20)
# water
box((65,960,570,1345));text(95,980,'Grove 수위 센서 (10cm)',30,b=True)
box((105,1045,200,1310),'#1666a0','#1d445e',6)
for yy in range(1060,1295,20):d.rectangle((112,yy,193,yy+8),fill='#d6e7ee')
text(250,1050,'VCC',25);net(370,1075,'3V3');text(250,1100,'GND',25);net(370,1125,'GND');text(250,1150,'SDA',25);dot(550,1175,green)
text(250,1210,'SCL',25);dot(550,1235,purple)
wire([(550,1175),(730,1175),(730,1530),(1690,1530),(1690,R['P21'][1]),R['P21']],green)
wire([(550,1235),(760,1235),(760,1570),(1770,1570),(1770,R['P22'][1]),R['P22']],purple)
# right LDR exact electrical pin terminals and breadboard distinct nets
box((1840,255,2725,560));text(1870,275,'조도 센서 + 10kΩ (아날로그)',31,b=True)
text(1870,325,'3V3',26,red,True);wire([(1940,350),(2010,350)],red)
d.ellipse((2010,315,2080,385),fill='#dfd3bd',outline=black,width=3);wire([(2025,330),(2060,330),(2025,350),(2060,350),(2025,370)],black,3)
wire([(2080,350),(2230,350)],orange);dot(2180,350,orange)
box((2230,333,2350,367),'#cfb286','#8b7146',4);text(2235,390,'10kΩ',26)
wire([(2350,350),(2560,350)],black);text(2570,330,'GND',26,black,True)
wire([(2180,350),(2180,475),(1830,475),(1830,1610),(810,1610),(810,L['P35'][1]),L['P35']],orange)
text(1870,505,'분기점 → P35 · LDR와 저항은 극성 없음',24)
# LED
box((1840,620,2725,905));text(1870,640,'표시 LED + 330Ω',31,b=True)
wire([L['P13'],(860,L['P13'][1]),(860,1650),(1800,1650),(1800,740),(2020,740)],'#bd7e00')
text(1880,770,'P13',26,'#bd7e00',True);box((2020,723,2140,757),'#cbb28c','#8d7654',4);text(2020,775,'330Ω',26)
wire([(2140,740),(2310,740)],red);d.ellipse((2310,690,2380,760),fill='#eb3838',outline='#981919',width=3)
wire([(2380,740),(2540,740)],black);text(2550,720,'GND',26,black,True)
text(2240,790,'긴 다리 +',24);text(2460,790,'짧은 다리 (-)',24)
# relay control
box((1840,970,2725,1325));text(1870,990,'팬용 5V 릴레이 · 제어부',31,b=True)
box((2260,1055,2660,1225),'#157ac4','#0a4c80',10);text(2330,1100,'5V RELAY',32,'#ffffff',True)
text(2240,1237,'실측 설정: HIGH=ON / LOW=OFF',22)
for yy,label,c in [(1080,'VCC / +',red),(1140,'GND / (-)',black),(1200,'IN / S',purple)]:
 dot(2250,yy,c);text(2070,yy-40,label,22);wire([(2040,yy),(2250,yy)],c)
text(1900,1060,'5V 공통망',24,red);text(1890,1120,'GND 공통망',24,black)
wire([L['P26'],(900,L['P26'][1]),(900,1690),(1810,1690),(1810,1200),(2040,1200)],purple)
# power common terminals at actual board
wire([L['3V3'],(900,L['3V3'][1])],red);text(870,420,'3V3 공통망',24,red)
wire([L['GND'],(930,L['GND'][1])],black);text(870,1050,'GND 공통망',22,black)
wire([L['5V'],(920,L['5V'][1])],red);text(870,1370,'5V 공통망',24,red)
# isolated fan load wiring actual contact placement isolated loop
box((1840,1360,2725,1790));text(1870,1380,'릴레이 접점부 → DC 12V 팬',31,b=True)
for yy,label in [(1460,'NC'),(1530,'COM'),(1600,'NO')]:
 box((1890,yy-24,1980,yy+24),'#2b75ba','#144b78',4);d.ellipse((1915,yy-15,1945,yy+15),fill='#cbd3d7',outline=black,width=2);text(1990,yy-20,label,25)
text(2110,1440,'NC 비워둠',24)
# supply top, fan bottom right explicit series paths
box((2390,1470,2680,1560),'#e6edf4');text(2420,1480,'12V 전원',26,b=True);text(2430,1520,'1A 이상',24)
dot(2390,1500,red);dot(2680,1500,black);text(2360,1460,'+',28,red);text(2680,1460,'-',28,black)
wire([(1930,1530),(2180,1530),(2180,1500),(2390,1500)],red)
box((2370,1630,2650,1750),'#28333f','#131b24',8);d.ellipse((2435,1640,2570,1740),fill='#5a6874');text(2410,1680,'12V 팬',27,'#ffffff',True)
dot(2370,1660,red);dot(2650,1660,black)
wire([(1930,1600),(2220,1600),(2220,1660),(2370,1660)],red)
wire([(2650,1660),(2700,1660),(2700,1500),(2680,1500)],black)
text(1880,1710,'팬 0.30A · 12V는 접점부에만 연결',23)
# footer / disabled pump
box((65,1420,570,1670),'#e7ebef');text(95,1450,'펌프 미연결',34,b=True);text(95,1510,'GPIO25(P25) 예약',27);text(95,1570,'코드 비활성화 유지',27)
text(80,1760,'공통망: 같은 이름끼리 연결 (3V3끼리 / GND끼리 / 5V끼리)',27,b=True)
text(80,1810,'실제 센서·릴레이의 단자 순서는 기판 표기를 따르세요. 배선 변경 전 USB와 외부 전원을 모두 분리하세요.',25)
text(80,1850,'12V 팬 전원은 ESP32·릴레이 VCC에 연결하지 않습니다. 릴레이 입력 3.3V 호환 확인 기준입니다.',24)
im.save('docs/smartfarm-physical-wiring.png')

