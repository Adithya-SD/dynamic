/* Fractal zoom: an escape-time fractal drawn by compose.frag (shared/shaders/fractal.glsl) that you can keep zooming into, and
   that zooms with the music. Two ways to make a zoom with no end:
     exact   The Mandelbrot set round a Misiurewicz point c0 (and a Julia set round a repelling fixed point) is self-similar:
             multiply the view by the multiplier lambda of the point's cycle and the picture is the same again. So the camera
             only ever moves between scale R0 and R0/|lambda| (turning by arg lambda as it goes), then starts over: seamless,
             and the numbers never get small, so a 32-bit float is enough for ever. Colour and light come from the distance to the
             edge of the set, which looks the same at every scale, so the loop shows no seam.
     dissolve  Any other fractal (the Burning Ship, the Tricorn...): the shader fades between the picture and the same picture K
             times larger as the camera falls, which hides the seam.
   Each site starts from a view of the whole fractal and dives to its loop. */
const FR_SITES=[
  {n:'Mandelbrot · spiral',t:1,c:[0,1],k:2,p:2,R0:.06,per:8,it:380,from:[-.5,0,3.2],glow:.03},
  {n:'Mandelbrot · valley',t:1,c:[-.228155493653962,1.115142508039937],k:3,p:1,R0:.05,per:6,it:380,from:[-.5,0,3.2],glow:.03},
  {n:'Mandelbrot · seahorse',t:1,c:[.419643377607081,.606290729207199],k:3,p:2,R0:.05,per:8,it:380,from:[-.5,0,3.2],glow:.03},
  {n:'Mandelbrot · twist',t:1,c:[-.607031022616088,.605251381278934],k:3,p:3,R0:.04,per:9,it:420,from:[-.5,0,3.2],glow:.03},
  {n:'Mandelbrot · tendrils',t:1,c:[-.506294458195889,.683991968089373],k:4,p:2,R0:.04,per:8,it:420,from:[-.5,0,3.2],glow:.03},
  {n:'Julia · dendrite',t:2,jc:[0,1],root:1,R0:.12,per:6,it:300,from:[0,0,3],glow:.03},
  {n:'Julia · rabbit',t:2,jc:[-.123,.745],root:1,R0:.16,per:6,it:300,from:[0,0,3],glow:.03},
  {n:'Julia · spirals',t:2,jc:[-.4,.6],root:1,R0:.12,per:6,it:300,from:[0,0,3],glow:.03},
  {n:'Burning Ship',t:3,c:[-1.8625,-.0045],K:8,R0:.05,per:7,it:300,from:[-.5,-.5,3.6],glow:.03},
  {n:'Tricorn',t:4,c:[-1.9,0],K:8,R0:.1,per:7,it:300,from:[0,0,3.8],glow:.03},
  {n:'Multibrot',t:5,c:[-.1563,.7646],K:12,R0:.03,per:7,it:300,from:[0,0,3.2],glow:.025},
  {n:'Burning Ship · cathedral',t:3,c:[-1.76,-.03],K:6,R0:.15,per:7,it:300,from:[-.5,-.5,3.6],glow:.03},
];
const FR_NAMES=['Off',...FR_SITES.map(s=>s.n)];
const cx_sqrt=(x,y)=>{const r=Math.hypot(x,y),a=Math.sqrt((r+x)/2),b=Math.sqrt(Math.max(r-x,0)/2);return[a,y<0?-b:b]};
const Frac={
  on:false,idx:0,site:null,lz:0,kick:0,dive:0,loopOct:1,lam:[1,0],lamLn:[0,0],jc:[0,0],cols:new Float32Array(9),u:null,
  /* Work out a site's constants: the multiplier of its cycle and how long one loop of the zoom is, in octaves (factors of two). */
  setup(i){
    const s=this.site=FR_SITES[i-1];this.idx=i;this.lz=0;this.kick=0;
    this.dive=Math.log2(s.from[2]/s.R0);
    if(s.t===1){   // Misiurewicz point: orbit of 0 under z²+c, preperiod k, period p
      const o=[];let zx=0,zy=0;for(let n=0;n<s.k+s.p+1;n++){const x=zx*zx-zy*zy+s.c[0],y=2*zx*zy+s.c[1];zx=x;zy=y;o.push([x,y])}
      let lx=1,ly=0;for(let j=0;j<s.p;j++){const[a,b]=o[s.k-1+j],px=2*a,py=2*b;[lx,ly]=[lx*px-ly*py,lx*py+ly*px]}
      this.lam=[lx,ly];
    }else if(s.t===2){   // Julia: a repelling fixed point, z = (1 ± sqrt(1-4c)) / 2, multiplier 2z
      const[sx,sy]=cx_sqrt(1-4*s.jc[0],-4*s.jc[1]),z=s.root?[(1+sx)/2,sy/2]:[(1-sx)/2,-sy/2];
      this.jc=s.jc;this.fix=z;this.lam=[2*z[0],2*z[1]];
    }
    if(s.t<=2){const m=Math.hypot(this.lam[0],this.lam[1]);this.loopOct=Math.log2(m);this.lamLn=[Math.log(m),Math.atan2(this.lam[1],this.lam[0])]}
    else this.loopOct=Math.log2(s.K);
  },
  /* One frame. Zoom speed is in octaves per second; the music adds to it, and every beat gives the zoom a punch. */
  update(dt,E){
    const i=E.ff|0;this.on=i>0&&!WATCH;
    if(!this.on)return;
    if(i!==this.idx)this.setup(i);
    if(App.paused)return;
    const M=Music;
    if(M.onBeat)this.kick+=E.fbt*3;
    if(M.drop>.3)this.kick+=M.drop*E.fbt*dt*40;
    this.kick*=Math.exp(-dt*6);
    this.lz+=(E.fsp*(1+.6*M.energy)+this.kick)*dt;
    this.lz=Math.max(this.lz,-.4);
  },
  zoom(oct){this.lz=Math.max(-.4,this.lz+oct)},
  /* Uniforms for fractal.frag. */
  uniforms(){
    const s=this.site,E=Director.E,res=Engine.res,sp=Math.min(res[0],res[1]);
    let cx,cy,mre,mim,K=0,f=0;
    const t=this.lz-this.dive;
    if(t<0){   // the dive: from the whole fractal to the loop, the target never leaving the view
      const S=s.from[2]*Math.pow(2,-this.lz),c0=s.t===2?this.fix:s.c,e=clamp((S-s.R0)/(s.from[2]-s.R0),0,1);
      cx=c0[0]+(s.from[0]-c0[0])*e;cy=c0[1]+(s.from[1]-c0[1])*e;mre=S;mim=0;
    }else{
      const g=t/this.loopOct;f=g-Math.floor(g);
      if(s.t<=2){const c0=s.t===2?this.fix:s.c,r=s.R0*Math.exp(-f*this.lamLn[0]),a=-f*this.lamLn[1];cx=c0[0];cy=c0[1];mre=r*Math.cos(a);mim=r*Math.sin(a)}
      else{cx=s.c[0];cy=s.c[1];mre=s.R0;mim=0;K=s.K}
    }
    const mag=Math.hypot(mre,mim);
    for(let k=0;k<3;k++)this.cols.set(paletteRGB(E.h+E.hr*(k*.5+clock*.01)),k*3);
    const a=Engine.sim[0]/Engine.sim[1],asp=[(a>=1?a:1)*Engine.world,(a>=1?1:1/a)*Engine.world];
    const c=Space.mode===1&&Space.u.uSpace<2?Space.u.uCam:[0,0];
    return{uFrA:[s.t,1,s.per,mag/sp],uFrB:[cx,cy,s.t===2?this.jc[0]:0,s.t===2?this.jc[1]:0],uFrC:[mre,mim,K,f],uFrD:[E.fit,clock*.012,s.glow,0],
      uFrCols:this.cols,uFrAsp:asp,uFrCtr:[.5+c[0],.5+c[1]]};
  }
};
