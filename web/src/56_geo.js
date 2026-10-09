/* Geometry: line art drawn once on a 2D canvas (unit square, y up) into three layers (red, green, blue channels),
   uploaded as a texture and painted into the ink every frame by geo.frag. Layer 1 turns with Spin, layer 2
   counter-turns, layer 3 stays put, so even a still drawing moves. The fluid carries the ink away and the pattern keeps
   re-forming; on beats it breathes and pushes the flow outward. Animated patterns (3D solids, attractors, chords)
   are redrawn ~20 times a second. Families: Sacred, Chakra, Divine, Solids, Math, Fractal, Psychedelic. */
const GEO_SIZE=1024;
const Geo={
  tex:null,cv:null,x:null,cur:-1,curW:-1,drawT:0,anim:0,thumbs:{},
  init(){
    this.cv=el('canvas');this.cv.width=this.cv.height=GEO_SIZE;this.x=this.cv.getContext('2d',{willReadFrequently:false});
    this.tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.MIRRORED_REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.MIRRORED_REPEAT);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
  },
  /* Draw pattern i into canvas x (size px). t: seconds, for animated patterns. */
  paint(x,i,t,size,lw=1){
    const p=GEO[i];x.setTransform(1,0,0,1,0,0);x.globalCompositeOperation='source-over';x.fillStyle='#000';x.fillRect(0,0,size,size);
    if(!p||!p.draw)return;
    x.setTransform(size*.47,0,0,-size*.47,size/2,size/2);x.globalCompositeOperation='lighter';x.lineCap=x.lineJoin='round';
    const d=makeDrawer(x,size,lw);p.draw(d,t);x.setTransform(1,0,0,1,0,0);
  },
  upload(){gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.cv);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.generateMipmap(gl.TEXTURE_2D)},
  /* Keep the texture current: redraw on pattern / line-width change, and ~20/s for animated patterns. */
  update(dt,E){
    const i=E.geo|0;if(!i){this.cur=0;return false}
    const p=GEO[i],animate=p&&p.anim;this.drawT+=dt*(1+Music.energy*1.5)*(animate?1:0);
    if(i!==this.cur||E.gw!==this.curW||animate&&(this.anim+=dt)>=.05){this.anim=0;this.cur=i;this.curW=E.gw;this.paint(this.x,i,this.drawT,GEO_SIZE,E.gw);this.upload()}
    return true;
  },
  /* Small preview for the picker (data URL, drawn once). */
  thumb(i){if(this.thumbs[i])return this.thumbs[i];const c=el('canvas');c.width=c.height=112;const x=c.getContext('2d');this.paint(x,i,3,112,1);
    const im=x.getImageData(0,0,112,112),d=im.data;for(let k=0;k<d.length;k+=4){const v=Math.min(255,d[k]*.95+d[k+1]*.8+d[k+2]*.6);d[k]=v*.75+d[k+2]*.25;d[k+1]=v*.85;d[k+2]=Math.min(255,v+d[k+2]*.3);d[k+3]=255}
    x.putImageData(im,0,0);return this.thumbs[i]=c.toDataURL()},
  /* Paint into the ink and push the flow. Called once per frame before the simulation step. */
  ring:9,ringW:.08,u:null,line:0,
  /* Outline drawn by compose.frag: three layer colours from the palette, brighter on the beat. */
  composeUniforms(){const u=this.u;if(!u||!this.line)return{uGeoLine:0};return{uGeo:this.tex,uGeoAsp:u.uAspect,uGeoT:[u.uScale,u.uRotA,u.uRotB,this.tile],uGeoLine:this.line,uGeoA:this.cols[0],uGeoB:this.cols[1],uGeoC:this.cols[2],uGeoNest:(GEO[Director.E.geo|0]||{}).fig?0:clamp((Director.cx||0)*1.4-.2,0,1)}},
  inject(dt,E){
    if(App.paused)return;
    const on=this.update(dt,E),M=Music;
    if(M.onBeat&&P.shock>0)this.ring=0;
    this.ring+=dt*(1.2+M.energy*2);
    const shock=P.shock>0&&this.ring<2.2?P.shock*40*(M.downbeat?1.6:1)*Math.exp(-this.ring*1.4):0;
    if(!on)this.line=0;
    if(!on&&!shock)return;
    const a=Engine.sim[0]/Engine.sim[1],asp=[(a>=1?a:1)*Engine.world,(a>=1?1:1/a)*Engine.world];
    const pat=GEO[E.geo|0]||{};this.sway=(this.sway||0)+dt*(.35+M.energy*.8);
    if(pat.fig){this.rotA=this.rotB=Math.sin(this.sway)*.07*Math.sign(E.grot||1)+.04*M.beat*E.gpulse*Math.sin(this.sway*3.1)}   // figures stay whole and upright, swaying
    else{this.rotA=(this.rotA||0)+dt*E.grot*(1+M.energy*1.5);this.rotB=pat.whole||pat.tile?this.rotA:(this.rotB||0)+dt*E.gcnt*(1+M.energy*1.5)}
    this.tile=pat.tile?1:0;
    const breathe=1+E.gpulse*(.06*M.beat+.03*Math.cos(TAU*M.phase)*Math.min(1,M.conf*1.3)+.12*M.drop);
    const u={uGeo:this.tex,uTile:this.tile,uAspect:asp,uScale:E.gsz*.5*breathe,uRotA:this.rotA,uRotB:this.rotB,uOn:on?1:0,
      uTile:0,uRing:this.ring*.55,uRingW:.05+this.ring*.04,uShock:shock,uTime:clock,uCm:E.gcm|0,
      uHue:hueBase+(E.h-hueBase),uHueRange:E.hr,uSat:E.s,...paletteUniforms()};
    this.u=u;
    if(on){const c=[0,.33,.66].map(k=>paletteRGB(E.h+E.hr*(k+clock*.01)).map(z=>z));this.cols=c;
      this.line=E.gline*(.55+.7*M.beat*E.gpulse+.8*M.drop)*(1/(1+.0*E.gsz))}
    if(on){const amt=E.gamt*dt*1.2*(.6+.9*M.beat*E.gpulse+.6*M.drop);
      pass('geo.frag',{...u,uSrc:Engine.dye.r,uMode:0,uAmt:amt,uPush:0,uSwirl:0},Engine.dye.w);Engine.dye.swap()}
    const push=on?E.gpush*(45*M.beat*E.gpulse+20*M.kick+90*M.drop):0,swirl=on?E.gswirl*35*(1+M.energy*1.5):0;
    if(push||swirl||shock){pass('geo.frag',{...u,uSrc:Engine.vel.r,uMode:1,uAmt:0,uPush:push,uSwirl:swirl},Engine.vel.w);Engine.vel.swap()}
  }
};

/* Drawing kit in unit coordinates. Every stroke is drawn twice: a wide faint halo and a crisp core. */
function makeDrawer(x,size,lw){
  const px=1/(size*.47),W=3.6*lw*px*(size/1024)**.35;
  let layer=0,alpha=1,width=1;
  const col=()=>['255,0,0','0,255,0','0,0,255'][layer];
  const stroke=path=>{x.strokeStyle=`rgba(${col()},${.16*alpha})`;x.lineWidth=W*width*3.4;path?x.stroke(path):x.stroke();x.strokeStyle=`rgba(${col()},${alpha})`;x.lineWidth=W*width;path?x.stroke(path):x.stroke()};
  const d={
    TAU,PHI,
    ly(i,a=1,w=1){layer=i;alpha=a;width=w;return d},
    circ(cx,cy,r){x.beginPath();x.arc(cx,cy,Math.abs(r),0,TAU);stroke();return d},
    arc(cx,cy,r,a0,a1){x.beginPath();x.arc(cx,cy,r,a0,a1);stroke();return d},
    seg(a,b,c,e){x.beginPath();x.moveTo(a,b);x.lineTo(c,e);stroke();return d},
    poly(pts,close=true){if(!pts.length)return d;x.beginPath();x.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)x.lineTo(pts[i][0],pts[i][1]);if(close)x.closePath();stroke();return d},
    ngonPts(n,r,rot=0,cx=0,cy=0){const p=[];for(let i=0;i<n;i++){const a=rot+TAU*i/n+Math.PI/2;p.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r])}return p},
    ngon(n,r,rot=0,cx=0,cy=0){return d.poly(d.ngonPts(n,r,rot,cx,cy))},
    star(n,k,r,rot=0){const p=d.ngonPts(n,r,rot),g=gcd(n,k);for(let s=0;s<g;s++){const q=[];for(let i=0;i<n/g;i++)q.push(p[(s+i*k)%n]);d.poly(q)}return d},
    curve(fn,t0,t1,steps,close=false){x.beginPath();for(let i=0;i<=steps;i++){const[a,b]=fn(t0+(t1-t0)*i/steps);i?x.lineTo(a,b):x.moveTo(a,b)}if(close)x.closePath();stroke();return d},
    dot(cx,cy,r){x.fillStyle=`rgba(${col()},${alpha})`;x.beginPath();x.arc(cx,cy,r,0,TAU);x.fill();return d},
    fillPoly(pts,a=1){x.fillStyle=`rgba(${col()},${alpha*a})`;x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.closePath();x.fill();return d},
    /* Petal (vesica) from the centre outwards: base at radius r0, tip at r0+len, half-width w, angle a. */
    petal(a,r0,len,w,cx=0,cy=0){const c=Math.cos(a),s=Math.sin(a),P=(u,v)=>[cx+c*u-s*v,cy+s*u+c*v],b=P(r0,0),t=P(r0+len,0),l=P(r0+len*.5,w*2),r=P(r0+len*.5,-w*2);
      x.beginPath();x.moveTo(...b);x.quadraticCurveTo(...l,...t);x.quadraticCurveTo(...r,...b);stroke();return d},
    lotus(n,r0,len,w,rot=0){for(let i=0;i<n;i++)d.petal(rot+TAU*i/n+Math.PI/2,r0,len,w);return d},
    text(s,size,cx=0,cy=0,fill=.0){x.save();x.translate(cx,cy);x.scale(1,-1);x.font=`${size}px "Nirmala UI","Noto Sans Devanagari","Mangal","Segoe UI Symbol",serif`;x.textAlign='center';x.textBaseline='middle';
      if(fill){x.fillStyle=`rgba(${col()},${alpha*fill})`;x.fillText(s,0,0)}x.strokeStyle=`rgba(${col()},${.16*alpha})`;x.lineWidth=W*width*3.4;x.strokeText(s,0,0);x.strokeStyle=`rgba(${col()},${alpha})`;x.lineWidth=W*width;x.strokeText(s,0,0);x.restore();return d},
    path(svg,sx=1,sy=sx,ox=0,oy=0){const p=new Path2D(),m=new DOMMatrix([sx,0,0,sy,ox,oy]);p.addPath(new Path2D(svg),m);stroke(p);return d},
    /* Per-pixel field: f(x,y)→[r,g,b] in 0..1, rendered at res² and added (for fractals, interference, cymatics). */
    field(f,res=384){res=Math.min(res,Math.max(96,size));const c=el('canvas');c.width=c.height=res;const cx=c.getContext('2d'),im=cx.createImageData(res,res),D=im.data;
      for(let j=0;j<res;j++)for(let i=0;i<res;i++){const u=(i+.5)/res*2-1,v=1-(j+.5)/res*2,o=(j*res+i)*4,q=f(u/.94,v/.94);D[o]=q[0]*255;D[o+1]=q[1]*255;D[o+2]=q[2]*255;D[o+3]=255}
      cx.putImageData(im,0,0);x.save();x.setTransform(1,0,0,1,0,0);x.imageSmoothingEnabled=true;x.drawImage(c,0,0,size,size);x.restore();return d},
    /* 3D wireframe: vertices (unit-ish), edges, rotation angles; perspective projection. */
    wire(V,Ed,ax,ay,az=0,scale=.62,depthFade=true){
      const P=V.map(([a,b,c])=>{let X=a,Y=b,Z=c,t;
        t=Y*Math.cos(ax)-Z*Math.sin(ax);Z=Y*Math.sin(ax)+Z*Math.cos(ax);Y=t;
        t=X*Math.cos(ay)+Z*Math.sin(ay);Z=-X*Math.sin(ay)+Z*Math.cos(ay);X=t;
        t=X*Math.cos(az)-Y*Math.sin(az);Y=X*Math.sin(az)+Y*Math.cos(az);X=t;
        const k=scale*2.8/(2.8-Z);return[X*k,Y*k,Z]});
      const a0=alpha;for(const[i,j]of Ed){alpha=depthFade?a0*(.45+.55*clamp((P[i][2]+P[j][2])*.25+.5,0,1)):a0;d.seg(P[i][0],P[i][1],P[j][0],P[j][1])}alpha=a0;return P},
  };
  return d;
}
const gcd=(a,b)=>b?gcd(b,a%b):a;
/* Edges between all vertex pairs at the minimum distance (for polyhedra given as vertex lists). */
function edgesOf(V,tol=1.02){let m=1e9;for(let i=0;i<V.length;i++)for(let j=i+1;j<V.length;j++)m=Math.min(m,dist3(V[i],V[j]));const E=[];for(let i=0;i<V.length;i++)for(let j=i+1;j<V.length;j++)if(dist3(V[i],V[j])<m*tol)E.push([i,j]);return E}
const dist3=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const norm3=V=>{const m=Math.max(...V.map(v=>Math.hypot(...v)));return V.map(v=>v.map(c=>c/m))};
const SOLIDS=(()=>{
  const p=PHI,ip=1/PHI,S={};
  S.tetra=norm3([[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]);
  S.cube=norm3([-1,1].flatMap(a=>[-1,1].flatMap(b=>[-1,1].map(c=>[a,b,c]))));
  S.octa=norm3([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]);
  S.ico=norm3([-1,1].flatMap(a=>[-1,1].flatMap(b=>[[0,a,b*p],[a,b*p,0],[b*p,0,a]])));
  S.dode=norm3([...S.cube.map(v=>v.map(c=>Math.sign(c))),...[-1,1].flatMap(a=>[-1,1].flatMap(b=>[[0,a*ip,b*p],[a*ip,b*p,0],[b*p,0,a*ip]]))]);
  S.cubo=norm3([-1,1].flatMap(a=>[-1,1].flatMap(b=>[[a,b,0],[a,0,b],[0,a,b]])));
  for(const k in S)S[k]={V:S[k],E:edgesOf(S[k])};
  return S;
})();
/* 4D: tesseract and 24-cell, rotated in two planes, projected to 3D then 2D. */
function proj4(V4,t,a1,a2){return V4.map(([x,y,z,w])=>{let c=Math.cos(t*a1),s=Math.sin(t*a1),X=x*c-w*s,W=x*s+w*c;c=Math.cos(t*a2);s=Math.sin(t*a2);const Y=y*c-W*s;W=y*s+W*c;const k=1.6/(2.6-W);return[X*k,Y*k,z*k]})}
const TESS=(()=>{const V=[];for(let i=0;i<16;i++)V.push([i&1?1:-1,i&2?1:-1,i&4?1:-1,i&8?1:-1]);const E=[];for(let i=0;i<16;i++)for(let b=0;b<4;b++){const j=i^(1<<b);if(j>i)E.push([i,j])}return{V:V.map(v=>v.map(c=>c*.5)),E}})();
const C24=(()=>{const V=[];for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)for(const a of[-1,1])for(const b of[-1,1]){const v=[0,0,0,0];v[i]=a;v[j]=b;V.push(v.map(c=>c*.42))}const E=[];for(let i=0;i<V.length;i++)for(let j=i+1;j<V.length;j++){const dd=Math.hypot(...V[i].map((c,k)=>c-V[j][k]));if(Math.abs(dd-.42*Math.SQRT2)<.01)E.push([i,j])}return{V,E}})();
let LORENZ=null;function lorenz(){if(LORENZ)return LORENZ;let x=.1,y=0,z=0;const P=[];for(let i=0;i<9000;i++){const dt=.006;const dx=10*(y-x),dy=x*(28-z)-y,dz=x*y-8/3*z;x+=dx*dt;y+=dy*dt;z+=dz*dt;if(i>200&&i%2)P.push([x/22,y/22,(z-24)/22])}return LORENZ=P}

/* Hex-lattice centres within radius R (lattice step s). */
function hexCentres(s,R){const out=[];for(let i=-12;i<=12;i++)for(let j=-12;j<=12;j++){const x=s*(i+j/2),y=s*j*Math.sqrt(3)/2;if(Math.hypot(x,y)<=R+1e-6)out.push([x,y])}return out}
const CHAKRAS=[
  ['Muladhara',4,'लं','square'],['Svadhisthana',6,'वं','moon'],['Manipura',10,'रं','down'],['Anahata',12,'यं','hex'],
  ['Vishuddha',16,'हं','circle'],['Ajna',2,'ॐ','ajna'],['Sahasrara',1000,'','crown']];
function chakra(d,k,t){
  const[,n,bija,shape]=CHAKRAS[k];
  d.ly(2).circ(0,0,.93).circ(0,0,.97);
  if(n===1000){for(let r=0;r<4;r++)d.ly(r%2,1,.8).lotus(24+r*8,.18+r*.14,.3,.035-r*.004,r*.13);d.ly(2).circ(0,0,.16).dot(0,0,.05);return}
  if(n===2){d.ly(0).petal(0,.3,.6,.16).petal(Math.PI,.3,.6,.16);d.ly(2).circ(0,0,.36);d.ly(1).poly(d.ngonPts(3,.3,Math.PI));d.ly(0).text(bija,.34,0,-.02);return}
  d.ly(0).lotus(n,.5,.42,Math.min(.16,1.5/n),0);d.ly(2).circ(0,0,.5);
  d.ly(1);
  if(shape==='square'){d.poly([[-.36,-.36],[.36,-.36],[.36,.36],[-.36,.36]]);d.poly(d.ngonPts(3,.3,Math.PI))}
  if(shape==='moon'){d.arc(0,-.05,.3,Math.PI*1.05,Math.PI*1.95);d.arc(0,.12,.38,Math.PI*1.15,Math.PI*1.85);d.circ(0,0,.42)}
  if(shape==='down'){d.poly(d.ngonPts(3,.44,Math.PI));for(const s of[-1,1])d.seg(s*.16,.08,s*.16,.24)}
  if(shape==='hex'){d.poly(d.ngonPts(3,.44,0));d.poly(d.ngonPts(3,.44,Math.PI))}
  if(shape==='circle'){d.poly(d.ngonPts(3,.46,Math.PI));d.circ(0,-.04,.22)}
  if(bija)d.ly(2).text(bija,.3,0,-.02,.0);
}
/* Ganesha, line art: crown, fan ears, eyes, tilak, curling trunk, one tusk, halo of petals. */
function ganesha(d,t){
  d.ly(2,.9);for(let i=0;i<24;i++)d.petal(TAU*i/24+Math.PI/2,.82,.13,.03);d.circ(0,.02,.8);
  d.ly(0,1,1.15);
  const ear=s=>{d.curve(a=>{const r=.27*(1+.07*Math.sin(a*9)),c=s*.43;return[c+Math.cos(a)*r*1.05*s,.1+Math.sin(a)*r*1.18]},-1.9,1.9,160)};
  ear(1);ear(-1);
  // head and cheeks
  d.path('M-0.27 0.36 C-0.3 0.08 -0.24 -0.12 -0.13 -0.22 M0.27 0.36 C0.3 0.08 0.24 -0.12 0.13 -0.22 M-0.27 0.36 C-0.18 0.5 0.18 0.5 0.27 0.36');
  // trunk: from between the eyes, down, curling to the right with the modak
  d.ly(0,1,1.25).path('M-0.07 0.12 C-0.09 -0.12 -0.08 -0.32 -0.02 -0.48 C0.04 -0.62 0.2 -0.66 0.26 -0.56 C0.31 -0.47 0.24 -0.38 0.16 -0.41 C0.1 -0.43 0.12 -0.5 0.17 -0.5');
  d.ly(0,1,1.05).path('M0.07 0.12 C0.08 -0.1 0.07 -0.26 0.06 -0.36 C0.08 -0.44 0.14 -0.47 0.17 -0.45');
  for(let i=1;i<7;i++){const y=.02-i*.075;d.ly(0,.55,.6).seg(-.08+i*.004,y,.07-i*.002,y-.01)}
  d.ly(1).dot(.2,-.47,.04);
  // eyes, tilak, third eye
  d.ly(1).path('M-0.2 0.2 Q-0.14 0.25 -0.08 0.2 Q-0.14 0.17 -0.2 0.2 M0.08 0.2 Q0.14 0.25 0.2 0.2 Q0.14 0.17 0.08 0.2').dot(-.14,.205,.018).dot(.14,.205,.018);
  for(let i=0;i<3;i++)d.ly(1,.9,.8).seg(-.14,.3+i*.028,.14,.3+i*.028);d.ly(2).dot(0,.335,.022);
  // tusk (his right, our left) and broken left tusk
  d.ly(1,1,1.1).path('M-0.11 -0.08 C-0.16 -0.14 -0.2 -0.22 -0.18 -0.3');d.ly(1,1,1.1).path('M0.11 -0.08 L0.15 -0.13');
  // crown: three tiers, pointed top, jewels
  d.ly(1,1,1).poly([[-.26,.42],[.26,.42],[.2,.56],[-.2,.56]]).poly([[-.2,.56],[.2,.56],[.14,.7],[-.14,.7]]).poly([[-.14,.7],[.14,.7],[0,.88]]);
  for(const x of[-.12,0,.12])d.ly(2).dot(x,.49,.022);d.ly(2).dot(0,.63,.025).dot(0,.9,.02);
  d.ly(2,.8).arc(0,.42,.3,0,Math.PI);
}
function trishul(d){
  d.ly(0,1,1.2).seg(0,-.85,0,.45);d.path('M0 0.45 L0 0.82 M-0.26 0.62 C-0.3 0.4 -0.2 0.3 0 0.3 C0.2 0.3 0.3 0.4 0.26 0.62 M-0.26 0.62 L-0.3 0.72 M0.26 0.62 L0.3 0.72');
  d.ly(1).poly([[0,.82],[-.05,.72],[.05,.72]]);d.ly(1).path('M-0.1 0.12 L0.1 0.24 L-0.1 0.24 L0.1 0.12 Z');
  d.ly(2).arc(0,.9,.12,Math.PI*1.1,Math.PI*1.9);d.ly(2).circ(0,0,.92);
  for(let i=0;i<40;i++){const a=TAU*i/40;d.ly(2,.8).petal(a,.92,.1+.04*(i%2),.025)}
}
function meditator(d){
  d.ly(2,.8).circ(0,.42,.24).circ(0,.42,.3);
  d.ly(0,1,1.1).circ(0,.42,.13).path('M0 0.55 Q0.02 0.6 0 0.62');
  d.path('M-0.06 0.3 C-0.28 0.24 -0.34 0.1 -0.34 -0.12 C-0.34 -0.24 -0.22 -0.3 -0.05 -0.3 M0.06 0.3 C0.28 0.24 0.34 0.1 0.34 -0.12 C0.34 -0.24 0.22 -0.3 0.05 -0.3');
  d.path('M-0.62 -0.5 C-0.5 -0.28 -0.2 -0.3 0 -0.36 C0.2 -0.3 0.5 -0.28 0.62 -0.5 C0.4 -0.56 -0.4 -0.56 -0.62 -0.5 Z');
  const ys=[-.33,-.22,-.1,.04,.18,.36,.58];ys.forEach((y,i)=>d.ly(1).dot(0,y,.028).circ(0,y,.05));
  d.ly(2,.6).seg(0,-.33,0,.58);for(let i=0;i<36;i++)d.ly(2,.5).seg(Math.cos(TAU*i/36)*.33,.42+Math.sin(TAU*i/36)*.33,Math.cos(TAU*i/36)*.42,.42+Math.sin(TAU*i/36)*.42);
}
function sriYantra(d){
  const U=[[-.58,.81,.98],[-.4,.72,.62],[-.22,.58,.42],[.03,.4,.27]],D=[[.58,.81,-.98],[.47,.74,-.64],[.3,.62,-.44],[.17,.46,-.3],[.07,.27,-.11]],k=.64;
  d.ly(0);U.forEach(([b,w,a])=>d.poly([[-w*k,b*k],[w*k,b*k],[0,a*k]]));d.ly(1);D.forEach(([b,w,a])=>d.poly([[-w*k,b*k],[w*k,b*k],[0,a*k]]));
  d.ly(2).dot(0,0,.018).circ(0,0,.66).circ(0,0,.7);d.lotus(8,.7,.1,.04).lotus(16,.8,.09,.026).circ(0,0,.9);
  d.ly(2,.8);const S=.96,g=.13,o=.04;d.poly([[-S,-S],[-g,-S],[-g,-S-o],[g,-S-o],[g,-S],[S,-S],[S,-g],[S+o,-g],[S+o,g],[S,g],[S,S],[g,S],[g,S+o],[-g,S+o],[-g,S],[-S,S],[-S,g],[-S-o,g],[-S-o,-g],[-S,-g]]);
}
function fruitCentres(r){const c=[[0,0]];for(let i=0;i<6;i++){const a=TAU*i/6;c.push([Math.cos(a)*2*r,Math.sin(a)*2*r]);c.push([Math.cos(a+Math.PI/6)*2*r*Math.sqrt(3),Math.sin(a+Math.PI/6)*2*r*Math.sqrt(3)])}return c}
function chladni(n,m,u,v){return Math.cos(n*Math.PI*u)*Math.cos(m*Math.PI*v)-Math.cos(m*Math.PI*u)*Math.cos(n*Math.PI*v)}
function julia(cr,ci){return(u,v)=>{let x=u*1.5,y=v*1.5,i=0;for(;i<90&&x*x+y*y<16;i++){const t=x*x-y*y+cr;y=2*x*y+ci;x=t}if(i>=90)return[0,0,.15];const s=i+1-Math.log2(Math.log2(x*x+y*y)/2+1e-9),b=fract(s*.12);return[b<.08?1:0,Math.max(0,1-Math.abs(b-.5)*12),Math.min(1,s/60)*.35]}}
function lsys(axiom,rules,n){let s=axiom;for(let i=0;i<n;i++)s=[...s].map(c=>rules[c]||c).join('');return s}
function turtle(d,s,ang,fit=.9,a0=0){let x=0,y=0,a=a0;const pts=[[0,0]];for(const c of s){if(c==='F'||c==='G'){x+=Math.cos(a);y+=Math.sin(a);pts.push([x,y])}else if(c==='+')a+=ang;else if(c==='-')a-=ang}
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const[u,v]of pts){x0=Math.min(x0,u);x1=Math.max(x1,u);y0=Math.min(y0,v);y1=Math.max(y1,v)}const k=2*fit/Math.max(x1-x0,y1-y0),cx=(x0+x1)/2,cy=(y0+y1)/2;d.poly(pts.map(([u,v])=>[(u-cx)*k,(v-cy)*k]),false)}
let PENROSE=null;
function penrose(){if(PENROSE)return PENROSE;const g=PHI;let T=[];for(let i=0;i<10;i++){const a=TAU*i/10,b=TAU*(i+1)/10;let B=[Math.cos(a),Math.sin(a)],C=[Math.cos(b),Math.sin(b)];if(i%2)[B,C]=[C,B];T.push([0,[0,0],B,C])}
  for(let k=0;k<5;k++){const N=[];for(const[c,A,B,C]of T){if(c===0){const P=[A[0]+(B[0]-A[0])/g,A[1]+(B[1]-A[1])/g];N.push([0,C,P,B],[1,P,C,A])}else{const Q=[B[0]+(A[0]-B[0])/g,B[1]+(A[1]-B[1])/g],R=[B[0]+(C[0]-B[0])/g,B[1]+(C[1]-B[1])/g];N.push([1,R,C,A],[1,Q,R,B],[0,R,Q,A])}}T=N}return PENROSE=T}

/* name, family, draw(d,t), anim. Index 0 is None. */
const GEO=[
  {n:'None',f:''},
  // ---------- Sacred ----------
  {n:'Seed of Life',f:'Sacred',draw(d){const r=.3;d.ly(0).circ(0,0,r);for(let i=0;i<6;i++)d.circ(Math.cos(TAU*i/6)*r,Math.sin(TAU*i/6)*r,r);d.ly(2).circ(0,0,2*r).circ(0,0,2*r+.04);d.ly(1);for(let i=0;i<6;i++)d.dot(Math.cos(TAU*i/6+Math.PI/6)*r*Math.sqrt(3),Math.sin(TAU*i/6+Math.PI/6)*r*Math.sqrt(3),.012)}},
  {n:'Flower of Life',f:'Sacred',draw(d){const r=.2;d.ly(0);for(const[x,y]of hexCentres(r,2*r))d.circ(x,y,r);d.ly(1,.9);for(const[x,y]of hexCentres(r,r))d.circ(x,y,r*.5);d.ly(2).circ(0,0,3*r).circ(0,0,3*r+.045)}},
  {n:"Metatron's Cube",f:'Sacred',draw(d){const r=.13,c=fruitCentres(r);d.ly(1,.75);for(let i=0;i<c.length;i++)for(let j=i+1;j<c.length;j++)d.seg(...c[i],...c[j]);d.ly(0);for(const[x,y]of c)d.circ(x,y,r);d.ly(2).circ(0,0,.92)}},
  {n:'Egg of Life',f:'Sacred',draw(d){const r=.24;d.ly(0).circ(0,0,r);for(let i=0;i<6;i++)d.circ(Math.cos(TAU*i/6)*2*r,Math.sin(TAU*i/6)*2*r,r);d.ly(1).ngon(6,2*r,Math.PI/6).star(6,2,2*r,Math.PI/6);d.ly(2).circ(0,0,3*r)}},
  {n:'Vesica Piscis',f:'Sacred',draw(d){const r=.42;d.ly(0).circ(-r/2,0,r).circ(r/2,0,r);d.ly(1).poly([[0,r*.866],[r/2,0],[0,-r*.866],[-r/2,0]]).seg(0,r*.866,0,-r*.866).seg(-r/2,0,r/2,0);d.ly(2).circ(0,0,r*1.5).circ(0,r*.866,r).circ(0,-r*.866,r)}},
  {n:'Tree of Life',fig:1,f:'Sacred',draw(d){const N=[[0,.82],[.32,.6],[-.32,.6],[.32,.2],[-.32,.2],[0,.38],[.32,-.2],[-.32,-.2],[0,-.02],[0,-.48],[0,.6]];const E=[[0,1],[0,2],[0,5],[1,2],[1,3],[1,5],[2,4],[2,5],[3,4],[3,5],[3,6],[4,5],[4,7],[5,6],[5,7],[5,8],[6,7],[6,8],[6,9],[7,8],[7,9],[8,9]];
    d.ly(1,.85);for(const[a,b]of E)d.seg(...N[a],...N[b]);d.ly(0);N.slice(0,10).forEach(([x,y])=>d.circ(x,y,.075));d.ly(2,.5).circ(...N[10],.05);d.ly(2).circ(0,.17,.92)}},
  {n:'Sri Yantra',whole:1,f:'Sacred',draw:sriYantra},
  {n:'Merkaba',f:'Sacred',draw(d){d.ly(0).poly(d.ngonPts(3,.78,0));d.ly(1).poly(d.ngonPts(3,.78,Math.PI));d.ly(2,.7);const p=d.ngonPts(6,.78,0);p.forEach(q=>d.seg(0,0,...q));d.ngon(6,.45,Math.PI/6).circ(0,0,.85)}},
  {n:'Torus',f:'Sacred',draw(d){for(let i=0;i<36;i++){const a=TAU*i/36;d.ly(i%2,.85).circ(Math.cos(a)*.36,Math.sin(a)*.36,.42)}d.ly(2).circ(0,0,.06)}},
  {n:'Golden Spiral',fig:1,f:'Sacred',draw(d){let x=-.92,w=1.84,h=w/PHI,y=-h/2;const arcs=[];
    for(let i=0;i<12;i++){const k=i%4;let s,c,a0;
      if(k===0){s=h;d.ly(1,.8).poly([[x,y],[x+s,y],[x+s,y+s],[x,y+s]]);c=[x+s,y];a0=Math.PI;x+=s;w-=s}
      else if(k===1){s=w;d.ly(1,.8).poly([[x,y+h-s],[x+s,y+h-s],[x+s,y+h],[x,y+h]]);c=[x,y+h-s];a0=Math.PI/2;h-=s}
      else if(k===2){s=h;d.ly(1,.8).poly([[x+w-s,y],[x+w,y],[x+w,y+s],[x+w-s,y+s]]);c=[x+w-s,y+s];a0=0;w-=s}
      else{s=w;d.ly(1,.8).poly([[x,y],[x+s,y],[x+s,y+s],[x,y+s]]);c=[x+s,y+s];a0=-Math.PI/2;y+=s;h-=s}
      d.ly(0,1,1.2).curve(t=>[c[0]+Math.cos(a0-t)*s,c[1]+Math.sin(a0-t)*s],0,Math.PI/2,40)}
    d.ly(2,.7).circ(0,0,.95)}},
  {n:'Phyllotaxis',f:'Sacred',draw(d){for(let i=1;i<700;i++){const a=i*GOLDEN_ANGLE,r=.9*Math.sqrt(i/700);d.ly(i%13<5?0:i%21<8?1:2).dot(Math.cos(a)*r,Math.sin(a)*r,.008+.014*Math.sqrt(i/700))}}},
  {n:'Pentagram',f:'Sacred',draw(d){let r=.9;for(let k=0;k<5;k++){d.ly(k%2).ngon(5,r,k%2?Math.PI:0).star(5,2,r,k%2?Math.PI:0);r*=1/(PHI*PHI)}d.ly(2).circ(0,0,.94)}},
  {n:'Enneagram',f:'Sacred',draw(d){const p=d.ngonPts(9,.82,0);d.ly(2).circ(0,0,.82);d.ly(0).poly([p[0],p[3],p[6]]);d.ly(1).poly([1,4,2,8,5,7].map(i=>p[i]));for(const q of p)d.ly(2).dot(...q,.03)}},
  {n:'Star Polygons',f:'Sacred',draw(d){d.ly(0).star(7,3,.88);d.ly(1).star(9,4,.66,.1);d.ly(2).star(11,5,.44).star(12,5,.26).circ(0,0,.92)}},
  {n:'Rub el Hizb',f:'Sacred',draw(d){d.ly(0).ngon(4,.8,0);d.ly(1).ngon(4,.8,Math.PI/4);d.ly(2).circ(0,0,.36).circ(0,0,.42).star(8,3,.6,Math.PI/8)}},
  {n:'Islamic Twelve',f:'Sacred',draw(d){d.ly(0).star(12,5,.88);d.ly(1).star(12,5,.5,Math.PI/12).ngon(12,.88);d.ly(2).ngon(6,.26).star(6,2,.26).circ(0,0,.94)}},
  {n:'Triquetra',f:'Sacred',draw(d){for(let i=0;i<3;i++)d.ly(i,1,1.3).petal(TAU*i/3+Math.PI/2,-.08,.92,.23);d.ly(2).circ(0,0,.4).circ(0,0,.93)}},
  {n:'Triskelion',f:'Sacred',draw(d){for(let k=0;k<3;k++){const a0=TAU*k/3,cx=Math.cos(a0)*.3,cy=Math.sin(a0)*.3;d.ly(k).curve(t=>[cx+Math.cos(a0+t)*.04*t,cy+Math.sin(a0+t)*.04*t],0,TAU*2.4,300)}d.ly(2).circ(0,0,.9)}},
  {n:'Borromean Rings',f:'Sacred',draw(d){for(let i=0;i<3;i++){const a=TAU*i/3+Math.PI/2;d.ly(i,1,1.4).circ(Math.cos(a)*.26,Math.sin(a)*.26,.44)}}},
  {n:'Yin Yang',f:'Sacred',draw(d){d.ly(2).circ(0,0,.8);d.ly(0,1,1.2).arc(0,.4,.4,Math.PI/2,Math.PI*1.5).arc(0,-.4,.4,-Math.PI/2,Math.PI/2);d.ly(1).dot(0,.4,.1).circ(0,-.4,.1);for(let i=0;i<8;i++)d.ly(2,.7).seg(...d.ngonPts(8,.88,TAU*i/8)[0],...d.ngonPts(8,.96,TAU*i/8)[0])}},
  {n:'Lotus',f:'Sacred',draw(d){d.ly(0).lotus(8,.1,.42,.1);d.ly(1).lotus(16,.3,.42,.06,Math.PI/16);d.ly(2).lotus(32,.58,.32,.035).circ(0,0,.1)}},
  {n:'Mandala',f:'Sacred',draw(d){d.ly(2).circ(0,0,.12).circ(0,0,.93);d.ly(0).lotus(12,.12,.26,.06);d.ly(1);for(let i=0;i<24;i++){const a=TAU*i/24;d.dot(Math.cos(a)*.44,Math.sin(a)*.44,.022)}d.circ(0,0,.48);d.ly(0).lotus(24,.5,.24,.04);d.ly(1).curve(a=>[Math.cos(a)*(.8+.04*Math.cos(a*36)),Math.sin(a)*(.8+.04*Math.cos(a*36))],0,TAU,720);d.ly(2).lotus(48,.84,.08,.012)}},
  {n:'Labyrinth',f:'Sacred',draw(d){for(let k=0;k<11;k++){const r=.12+k*.072,g=.12/(1+k*.3),s=k%2?Math.PI/2:-Math.PI/2;d.ly(k%3===2?2:k%2).arc(0,0,r,s+g,s+TAU-g)}d.ly(2);for(let k=0;k<10;k+=2)d.seg(0,.12+k*.072,0,.12+(k+1)*.072)}},
  // ---------- Chakra ----------
  ...CHAKRAS.map((c,k)=>({n:c[0],fig:c[0]==='Ajna'?1:0,f:'Chakra',draw(d,t){chakra(d,k,t)}})),
  {n:'Seven Chakras',fig:1,f:'Chakra',draw(d){const ys=[-.78,-.52,-.26,0,.26,.52,.8],ns=[4,6,10,12,16,2,24];
    d.ly(2,.7).seg(0,-.92,0,.92);d.ly(1,.9).curve(t=>[Math.sin(t*Math.PI*3.5)*.16,t*.8],-1.05,1.05,300).curve(t=>[-Math.sin(t*Math.PI*3.5)*.16,t*.8],-1.05,1.05,300);
    ys.forEach((y,i)=>{d.ly(0).circ(0,y,.075);for(let k=0;k<ns[i];k++)d.ly(0,.85,.7).petal(TAU*k/ns[i],.075,.05,.016,0,y)})}},
  {n:'Kundalini',fig:1,f:'Chakra',draw(d){d.ly(0,1,1.3).curve(t=>[Math.sin(t*9)*.22*(1-t*.3),-.9+t*1.75],0,1,400);d.ly(1,1,1.3).curve(t=>[-Math.sin(t*9)*.22*(1-t*.3),-.9+t*1.75],0,1,400);d.ly(2).seg(0,-.95,0,.92);d.ly(2).petal(Math.PI*.25,.88,.12,.05,0,0).petal(Math.PI*.75,.88,.12,.05,0,0);d.ly(2).dot(0,.86,.04)}},
  // ---------- Divine ----------
  {n:'Om',fig:1,f:'Divine',draw(d){d.ly(2).circ(0,0,.9).circ(0,0,.95);for(let i=0;i<16;i++)d.ly(2,.7).petal(TAU*i/16,.95,.0,.0);d.ly(0,1,1.3).text('ॐ',1.15,0,-.05,.0);d.ly(1,.8).lotus(8,.9,.04,.02)}},
  {n:'Ganesha',fig:1,f:'Divine',draw:ganesha},
  {n:'Trishul',fig:1,f:'Divine',draw:trishul},
  {n:'Meditation',fig:1,f:'Divine',draw:meditator},
  {n:'Dharma Wheel',f:'Divine',draw(d){d.ly(2).circ(0,0,.86).circ(0,0,.78);d.ly(0).circ(0,0,.14).circ(0,0,.06);d.ly(1,1,1.2);for(let i=0;i<8;i++){const a=TAU*i/8;d.seg(Math.cos(a)*.14,Math.sin(a)*.14,Math.cos(a)*.78,Math.sin(a)*.78);d.ly(0).dot(Math.cos(a)*.92,Math.sin(a)*.92,.04);d.ly(1,1,1.2)}d.ly(2,.8).lotus(8,.14,.2,.05,Math.PI/8)}},
  {n:'Eye of Providence',fig:1,f:'Divine',draw(d){d.ly(0,1,1.2).poly(d.ngonPts(3,.62,0,0,-.06));d.ly(1).path('M-0.28 0.0 Q0 0.2 0.28 0.0 Q0 -0.2 -0.28 0').circ(0,0,.085).dot(0,0,.04);d.ly(2,.8);for(let i=0;i<36;i++){const a=TAU*i/36;d.seg(Math.cos(a)*.66,Math.sin(a)*.66-.06,Math.cos(a)*(.8+.1*(i%2)),Math.sin(a)*(.8+.1*(i%2))-.06)}}},
  {n:'Ankh',fig:1,f:'Divine',draw(d){d.ly(0,1,1.4).path('M0 0.18 C-0.24 0.32 -0.24 0.78 0 0.78 C0.24 0.78 0.24 0.32 0 0.18 Z M-0.42 0.12 L0.42 0.12 M0 0.12 L0 -0.85');d.ly(2).circ(0,0,.93);d.ly(1,.7);for(let i=0;i<24;i++)d.petal(TAU*i/24,.93,.06,.02)}},
  {n:'Nataraja Fire',fig:1,f:'Divine',draw(d){d.ly(2).circ(0,0,.68).circ(0,0,.74);for(let i=0;i<30;i++){const a=TAU*i/30;d.ly(i%2).petal(a,.74,.16+.06*(i%3),.04)}d.ly(0,1,1.2).text('ॐ',.62,0,-.04)}},
  // ---------- Solids (3D, turning) ----------
  ...[['Icosahedron','ico'],['Dodecahedron','dode'],['Vector Equilibrium','cubo']].map(([n,k])=>({n,f:'Solids',anim:1,draw(d,t){const s=SOLIDS[k];d.ly(0,1,1.1);const P=d.wire(s.V,s.E,t*.31,t*.47,t*.13,.7);d.ly(1);for(const q of P)d.dot(q[0],q[1],.02);d.ly(2,.7).circ(0,0,.9)}})),
  {n:'Platonic Nest',f:'Solids',anim:1,draw(d,t){d.ly(0).wire(SOLIDS.dode.V,SOLIDS.dode.E,t*.3,t*.4,0,.85);d.ly(1).wire(SOLIDS.ico.V,SOLIDS.ico.E,-t*.25,t*.35,.3,.6);d.ly(2).wire(SOLIDS.cube.V,SOLIDS.cube.E,t*.4,-t*.3,0,.38);d.wire(SOLIDS.octa.V,SOLIDS.octa.E,t*.5,t*.2,0,.22)}},
  {n:'Star Tetrahedron',f:'Solids',anim:1,draw(d,t){const T=SOLIDS.tetra;d.ly(0,1,1.2).wire(T.V,T.E,t*.3+.6,t*.45,0,.8);d.ly(1,1,1.2).wire(T.V.map(v=>v.map(c=>-c)),T.E,t*.3+.6,t*.45,0,.8);d.ly(2).circ(0,0,.9)}},
  {n:'Tesseract',f:'Solids',anim:1,draw(d,t){const P=proj4(TESS.V,t,.37,.23);d.ly(0,1,1.1).wire(P,TESS.E,.5,t*.2,0,1.5);d.ly(2,.6).circ(0,0,.92)}},
  {n:'24-Cell',f:'Solids',anim:1,draw(d,t){const P=proj4(C24.V,t,.29,.19);d.ly(0).wire(P,C24.E,.4,t*.15,0,1.9);d.ly(2,.6).circ(0,0,.94)}},
  {n:'Torus Knot',f:'Solids',anim:1,draw(d,t){const p=3,q=7,V=[];for(let i=0;i<=600;i++){const a=TAU*i/600,r=.55+.22*Math.cos(q*a);V.push([r*Math.cos(p*a),r*Math.sin(p*a),.22*Math.sin(q*a)])}const E=V.slice(1).map((_,i)=>[i,i+1]);d.ly(0,1,1.2).wire(V,E,.5+t*.2,t*.3,0,.95);d.ly(2).circ(0,0,.93)}},
  {n:'Lorenz',f:'Solids',anim:1,draw(d,t){const L=lorenz(),E=[];for(let i=0;i<L.length-1;i++)E.push([i,i+1]);d.ly(0,.9,.45).wire(L,E,1.57,t*.3,0,.85,false)}},
  // ---------- Math ----------
  {n:'Times Table',f:'Math',anim:1,draw(d,t){const N=150,m=2+((t*.12)%48);d.ly(2).circ(0,0,.9);for(let i=0;i<N;i++){const a=TAU*i/N,b=TAU*((i*m)%N)/N;d.ly(i%2,.6,.55).seg(Math.cos(a)*.9,Math.sin(a)*.9,Math.cos(b)*.9,Math.sin(b)*.9)}}},
  {n:'Maurer Rose',f:'Math',anim:1,draw(d,t){const n=2+Math.floor((t*.08)%7),dd=29+Math.floor((t*.6)%60),pts=[];for(let k=0;k<=360;k++){const th=k*dd*Math.PI/180,r=Math.sin(n*th)*.9;pts.push([r*Math.cos(th),r*Math.sin(th)])}d.ly(0,.9,.8).poly(pts);d.ly(1,1,1.2).curve(th=>{const r=Math.sin(n*th)*.9;return[r*Math.cos(th),r*Math.sin(th)]},0,TAU,600)}},
  {n:'Rose Curves',f:'Math',draw(d){d.ly(0,1,1.1).curve(a=>{const r=.9*Math.cos(5/3*a);return[r*Math.cos(a),r*Math.sin(a)]},0,TAU*3,1200);d.ly(1).curve(a=>{const r=.6*Math.cos(7/4*a);return[r*Math.cos(a),r*Math.sin(a)]},0,TAU*4,1400);d.ly(2).curve(a=>{const r=.32*Math.cos(4*a);return[r*Math.cos(a),r*Math.sin(a)]},0,TAU,400)}},
  {n:'Spirograph',f:'Math',anim:1,draw(d,t){const R=1,r=.37+.02*Math.sin(t*.1),k=.82;d.ly(0,.95).curve(a=>[((R-r)*Math.cos(a)+k*r*Math.cos((R-r)/r*a))*.62,((R-r)*Math.sin(a)-k*r*Math.sin((R-r)/r*a))*.62],0,TAU*19,3000);d.ly(1,.9).curve(a=>[(.6*Math.cos(a)+.3*Math.cos(7*a+t*.2))*.95,(.6*Math.sin(a)-.3*Math.sin(7*a+t*.2))*.95],0,TAU,600)}},
  {n:'Lissajous',f:'Math',anim:1,draw(d,t){d.ly(0,1,1.1).curve(a=>[.88*Math.sin(3*a+t*.3),.88*Math.sin(2*a)],0,TAU,900);d.ly(1).curve(a=>[.7*Math.sin(5*a+t*.21),.7*Math.sin(4*a)],0,TAU,1200);d.ly(2,.8).curve(a=>[.5*Math.sin(7*a),.5*Math.sin(6*a+t*.17)],0,TAU,1400)}},
  {n:'Atom',f:'Math',draw(d){for(let i=0;i<3;i++){const a=TAU*i/6;d.ly(i,1,1.1).curve(s=>{const x=Math.cos(s)*.85,y=Math.sin(s)*.3;return[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)]},0,TAU,300)}d.ly(2).dot(0,0,.07).circ(0,0,.12)}},
  {n:'DNA Helix',fig:1,f:'Math',anim:1,draw(d,t){d.ly(0,1,1.2).curve(s=>[Math.sin(s*7+t)*.3,s],-.95,.95,300);d.ly(1,1,1.2).curve(s=>[Math.sin(s*7+t+Math.PI)*.3,s],-.95,.95,300);for(let i=0;i<24;i++){const s=-.92+i*.08;d.ly(2,.7).seg(Math.sin(s*7+t)*.3,s,Math.sin(s*7+t+Math.PI)*.3,s)}}},
  {n:'Chladni',tile:1,f:'Math',anim:1,draw(d,t){const k=Math.floor(t*.07)%6,M=[[1,4],[2,5],[3,7],[1,6],[4,7],[3,8]][k],m2=[[2,3],[3,6],[2,7],[5,6],[1,8],[4,9]][k];d.field((u,v)=>{const a=Math.abs(chladni(M[0],M[1],u,v)),b=Math.abs(chladni(m2[0],m2[1],u,v));return[Math.exp(-a*a*90),Math.exp(-b*b*90)*.8,0]},320)}},
  {n:'Interference',tile:1,f:'Math',anim:1,draw(d,t){const S=[[-.45,-.3],[.45,-.3],[0,.5]];d.field((u,v)=>{let s=0;for(const[a,b]of S)s+=Math.cos(Math.hypot(u-a,v-b)*48-t*.6);const q=Math.abs(s)/3;return[Math.pow(q,4),Math.pow(Math.max(0,s)/3,6)*.8,0]},320)}},
  // ---------- Fractal ----------
  {n:'Koch Snowflake',f:'Fractal',draw(d){const s=lsys('F--F--F',{F:'F+F--F+F'},4);d.ly(0,1,.9);turtle(d,s,Math.PI/3,.88);d.ly(1,.9);turtle(d,lsys('F--F--F',{F:'F+F--F+F'},2),Math.PI/3,.42);d.ly(2).circ(0,0,.93)}},
  {n:'Sierpinski',f:'Fractal',draw(d){const go=(a,b,c,n)=>{if(!n){d.ly((a[0]*7+a[1]*3>0)?0:1,.9,.8).poly([a,b,c]);return}const m=(p,q)=>[(p[0]+q[0])/2,(p[1]+q[1])/2];go(a,m(a,b),m(a,c),n-1);go(m(a,b),b,m(b,c),n-1);go(m(a,c),m(b,c),c,n-1)};const P=d.ngonPts(3,.9,0,0,-.1);go(P[0],P[1],P[2],6);d.ly(2,.6).ngon(3,.9,Math.PI,0,-.1)}},
  {n:'Hilbert Curve',tile:1,f:'Fractal',draw(d){d.ly(0,.95,.8);turtle(d,lsys('A',{A:'+BF-AFA-FB+',B:'-AF+BFB+FA-'},5).replace(/[AB]/g,''),Math.PI/2,.9);d.ly(1,.8,.7);turtle(d,lsys('A',{A:'+BF-AFA-FB+',B:'-AF+BFB+FA-'},3).replace(/[AB]/g,''),Math.PI/2,.5)}},
  {n:'Dragon Curve',f:'Fractal',draw(d){const s=lsys('FX',{X:'X+YF+',Y:'-FX-Y'},12).replace(/[XY]/g,'');d.ly(0,.9,.7);turtle(d,s,Math.PI/2,.9);d.ly(1,.7,.6);turtle(d,s,Math.PI/2,.9,Math.PI)}},
  {n:'Apollonian',f:'Fractal',draw(d){const C=[];const go=(c1,c2,c3,n)=>{if(n<0)return;const k4=c1.k+c2.k+c3.k+2*Math.sqrt(Math.abs(c1.k*c2.k+c2.k*c3.k+c3.k*c1.k));if(k4>90)return;
      const z=(c,k)=>({re:c.x*c.k,im:c.y*c.k});const a=z(c1),b=z(c2),c=z(c3),pr=(p,q)=>({re:p.re*q.re-p.im*q.im,im:p.re*q.im+p.im*q.re}),ab=pr(a,b),bc=pr(b,c),ca=pr(c,a),s={re:ab.re+bc.re+ca.re,im:ab.im+bc.im+ca.im},m=Math.hypot(s.re,s.im),an=Math.atan2(s.im,s.re)/2,sq={re:Math.sqrt(m)*Math.cos(an),im:Math.sqrt(m)*Math.sin(an)};
      let best=null;for(const sg of[1,-1]){const re=a.re+b.re+c.re+sg*2*sq.re,im=a.im+b.im+c.im+sg*2*sq.im,x=re/k4,y=im/k4;const ok=[c1,c2,c3].every(q=>Math.abs(Math.hypot(x-q.x,y-q.y)-Math.abs(1/k4+1/q.k*(q.k<0?-1:1)))<.02||Math.abs(Math.hypot(x-q.x,y-q.y)-Math.abs(1/q.k)+1/k4)<.02);if(ok&&!C.some(o=>Math.hypot(o.x-x,o.y-y)<.003&&Math.abs(o.k-k4)<.1)){best={x,y,k:k4};break}}
      if(!best)return;C.push(best);go(c1,c2,best,n-1);go(c2,c3,best,n-1);go(c1,c3,best,n-1)};
    const R=.92,o={x:0,y:0,k:-1/R},r=R/(1+2/Math.sqrt(3)),cs=[0,1,2].map(i=>({x:Math.cos(TAU*i/3+Math.PI/2)*(R-r),y:Math.sin(TAU*i/3+Math.PI/2)*(R-r),k:1/r}));C.push(...cs);
    go(cs[0],cs[1],cs[2],7);for(let i=0;i<3;i++)go(o,cs[i],cs[(i+1)%3],6);d.ly(2).circ(0,0,R);C.forEach((c,i)=>d.ly(c.k>12?1:0,.95,.8).circ(c.x,c.y,1/c.k))}},
  {n:'Penrose',f:'Fractal',draw(d){for(const[c,A,B,C]of penrose()){d.ly(c,.9,.6).poly([B,A,C],false)}d.ly(2,.6).circ(0,0,.98)}},
  {n:'Julia',f:'Fractal',draw(d){d.field(julia(-.8,.156),420)}},
  {n:'Mandelbrot',f:'Fractal',draw(d){d.field((u,v)=>{const cr=u*1.35-.6,ci=v*1.35;let x=0,y=0,i=0;for(;i<120&&x*x+y*y<16;i++){const t=x*x-y*y+cr;y=2*x*y+ci;x=t}if(i>=120)return[0,0,.12];const s=i+1-Math.log2(Math.log2(x*x+y*y)/2+1e-9),b=fract(s*.1);return[b<.07?1:0,Math.max(0,1-Math.abs(b-.5)*22)*.8,Math.min(1,s/40)*.25]},440)}},
  {n:'Fractal Tree',f:'Fractal',draw(d){const go=(x,y,a,l,n)=>{if(n<0)return;const X=x+Math.cos(a)*l,Y=y+Math.sin(a)*l;d.ly(n>5?0:n>2?1:2,1,.35+n*.12).seg(x,y,X,Y);go(X,Y,a+.45,l*.7,n-1);go(X,Y,a-.45,l*.7,n-1)};for(let k=0;k<6;k++){const a=TAU*k/6;go(0,0,a,.28,7)}}},
  // ---------- Psychedelic ----------
  {n:'Twisted Squares',f:'Psychedelic',draw(d){let r=.95,a=0;for(let i=0;i<34;i++){d.ly(i%3).ngon(4,r,a);a+=.07;r*=.93}}},
  {n:'Moiré Rings',f:'Psychedelic',draw(d){for(let i=1;i<30;i++){d.ly(0,.9,.8).circ(-.08,0,i*.034);d.ly(1,.9,.8).circ(.08,0,i*.034)}}},
  {n:'Hypno Spiral',f:'Psychedelic',draw(d){for(let s=0;s<6;s++)d.ly(s%2,1,1.5).curve(a=>{const r=.03*a;return[r*Math.cos(a+s*TAU/6),r*Math.sin(a+s*TAU/6)]},0,32,600)}},
  {n:'Sunburst',f:'Psychedelic',draw(d){for(let i=0;i<72;i++){const a=TAU*i/72;d.ly(i%2,.9,.8).seg(Math.cos(a)*.1,Math.sin(a)*.1,Math.cos(a)*1.4,Math.sin(a)*1.4)}for(let k=1;k<9;k++)d.ly(2,.7).circ(0,0,k*.12)}},
  {n:'Radial Checker',tile:1,f:'Psychedelic',draw(d){d.field((u,v)=>{const r=Math.hypot(u,v),a=Math.atan2(v,u),c=(Math.floor(Math.log(r+1e-3)*7)+Math.floor(a/TAU*24+Math.log(r+1e-3)*3))&1,e=Math.min(fract(Math.log(r+1e-3)*7),1-fract(Math.log(r+1e-3)*7));return[c*.55,(1-c)*.25,Math.exp(-e*e*400)*.9]},420)}},
  {n:'Honeycomb',tile:1,f:'Psychedelic',draw(d){const s=.16;for(const[x,y]of hexCentres(s*Math.sqrt(3),1.6)){d.ly((Math.round(x*9+y*5)%3+3)%3,.9).ngon(6,s,Math.PI/6,x,y)}}},
  {n:'Truchet',tile:1,f:'Psychedelic',draw(d){let seed=3;const r=()=>(seed=(seed*16807)%2147483647)/2147483647;const n=12,s=2/n;for(let i=0;i<n;i++)for(let j=0;j<n;j++){const x=-1+i*s,y=-1+j*s;d.ly((i+j)%2,.9,1.1);if(r()<.5){d.arc(x,y,s/2,0,Math.PI/2);d.arc(x+s,y+s,s/2,Math.PI,Math.PI*1.5)}else{d.arc(x+s,y,s/2,Math.PI/2,Math.PI);d.arc(x,y+s,s/2,-Math.PI/2,0)}}}},
  {n:'Voronoi',tile:1,f:'Psychedelic',draw(d){const S=[];let seed=11;const r=()=>(seed=(seed*16807)%2147483647)/2147483647;for(let i=0;i<46;i++){const a=i*GOLDEN_ANGLE,q=Math.sqrt(i/46)*1.05;S.push([Math.cos(a)*q+(r()-.5)*.08,Math.sin(a)*q+(r()-.5)*.08])}
    d.field((u,v)=>{let a=9,b=9,k=0;S.forEach((p,i)=>{const t=Math.hypot(u-p[0],v-p[1]);if(t<a){b=a;a=t;k=i}else if(t<b)b=t});const e=b-a;return[Math.exp(-e*e*3000),Math.exp(-a*a*900)*.7,(k%5===0?.25:0)]},400)}},
  {n:'Tunnel Rings',f:'Psychedelic',draw(d){for(let i=0;i<26;i++){const r=.98*Math.pow(.88,i);d.ly(i%3,.95,1+(26-i)*.02).ngon(8,r,i*.13)}}},
];
const GEO_FAMILIES=['Sacred','Chakra','Divine','Solids','Math','Fractal','Psychedelic'];
