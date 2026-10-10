/* Engine: the pass graph shared with Android (app/src/main/cpp/Engine.cpp mirrors it).
   Velocity lives in reference cells/s, 128 cells across the visible short side, so changing
   simulation detail sharpens the fluid without changing how it moves. */
const REF=128,MAX_VEL=1500,PART_SIDE=256;
const Engine={
  vel:null,prs:null,div:null,crl:null,dye:null,fwd:null,
  parts:null,ptx:null,scene:null,lit:null,echo:null,bloom:[],
  sim:[1,1],ink:[1,1],res:[1,1],world:1,wrap:false,
  stamps:new Float32Array(12*256),nStamps:0,stampBuf:null,stampVao:null,
  undo:[],budget:640*1024*1024,error:'',live:{},
  init(){
    this.stampBuf=gl.createBuffer();this.stampVao=gl.createVertexArray();
    gl.bindVertexArray(this.stampVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.stampBuf);
    for(let i=0;i<3;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,48,i*16);gl.vertexAttribDivisor(i,1)}
    gl.bindVertexArray(null);
    const pf=floatTargets?'rgba32f':'rgba16f';
    this.parts=pair(PART_SIDE,PART_SIDE,pf,{nearest:true});this.seedParticles();
    this.black=target(1,1,'rgba8');
  },
  seedParticles(){
    const n=PART_SIDE*PART_SIDE,data=new Float32Array(n*4);
    for(let i=0;i<n;i++){data[i*4]=Math.random();data[i*4+1]=Math.random();data[i*4+2]=Math.random();data[i*4+3]=Math.random()}
    for(const t of[this.parts.r,this.parts.w]){gl.bindTexture(gl.TEXTURE_2D,t.tex);
      if(t.fmt==='rgba32f')gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,PART_SIDE,PART_SIDE,gl.RGBA,gl.FLOAT,data);
      else{const h=new Uint16Array(n*4);for(let i=0;i<h.length;i++)h[i]=toHalf(data[i]);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,PART_SIDE,PART_SIDE,gl.RGBA,gl.HALF_FLOAT,h)}}
  },
  spaceDefs(n){return'#define SPACE '+(n|0)+'\n'},
  /* The variant to draw with: the wanted space if its shader has finished compiling, else the last one that did. */
  variant(vs,fs,key){
    const want=this.spaceDefs(Space.u.uSpace);
    if(programIfReady(vs,fs,want)){this.live[key]=want;return want}
    return this.live[key]||(this.live[key]=want);
  },
  BASE:['ghost','blur','shift','pshift','copy','advect','maccormack','divergence','curl','vorticity','pressure','gradient','fade','forces','material','bloom_down','bloom_up','echo','final','particles_update','compose','geo'].map(n=>['fullscreen.vert',n+'.frag']).concat([['splat.vert','splat.frag'],['particles.vert','particles.frag']]),
  /* Compile everything the first frame needs, in parallel. Other spaces follow quietly, one at a time. */
  async warm(onProgress){
    const d=this.spaceDefs(Space.u.uSpace),list=this.BASE.filter(([,f])=>f!=='compose.frag').map(x=>[...x,'']);
    list.push(['fullscreen.vert','compose.frag',d]);
    const errors=await warmPrograms(list,onProgress);this.live.compose=d;return errors;
  },
  async warmAll(){const l=[];for(let n=0;n<6;n++){const d=this.spaceDefs(n);l.push(['fullscreen.vert','compose.frag',d],['fullscreen.vert','uiflow.frag',d])}return warmPrograms(l)},
  async warmRest(){
    for(let n=0;n<6;n++){const d=this.spaceDefs(n);for(const[vs,fs]of[['fullscreen.vert','compose.frag'],['fullscreen.vert','uiflow.frag']]){const e=startProgram(vs,fs,d);while(!e.ready&&!e.failed){await new Promise(r=>setTimeout(r,100));if(compileDone(e))finishProgram(e)}}}
  },
  /* Sizes from quality. Render = CSS px × min(DPR,2) × scale. Sheet keeps screen aspect. */
  sizes(Q){
    const dpr=Math.min(devicePixelRatio||1,2),rw=Math.max(64,Math.round(VW()*dpr*Q.rscale)),rh=Math.max(64,Math.round(VH()*dpr*Q.rscale));
    const a=rw/rh,w=Q.world,max=gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const dims=(short)=>{const s=Math.min(short*w,max);return a>=1?[Math.min(max,Math.round(s*a)),Math.round(s)]:[Math.round(s),Math.min(max,Math.round(s/a))]};
    const sim=dims(Q.sim),ink=dims(Math.min(2048,Math.round(Math.min(rw,rh)*Q.inkq))),pq=Q.pq||.6;
    const bytes=sim[0]*sim[1]*(4*2+2*2+2+2)+ink[0]*ink[1]*8*3+rw*rh*8*4+ink[0]*ink[1]*8*pq*pq+PART_SIDE*PART_SIDE*32;
    return{res:[rw,rh],sim,ink,bytes,world:w,pq};
  },
  /* (Re)allocate. Keeps ink across size changes; on failure the previous allocation stays live. */
  allocate(Q,force){
    const s=this.sizes(Q);
    const simSame=this.vel&&this.vel.r.w===s.sim[0]&&this.vel.r.h===s.sim[1],inkSame=this.dye&&this.dye.r.w===s.ink[0]&&this.dye.r.h===s.ink[1],resSame=this.scene&&this.res[0]===s.res[0]&&this.res[1]===s.res[1];
    if(!force&&simSame&&inkSame&&resSame&&this.world===s.world)return true;
    if(s.bytes>this.budget){this.error=`Needs ~${Math.round(s.bytes/1048576)} MiB of GPU memory; kept previous quality.`;return false}
    const made=[];const T=(...a)=>{const t=target(...a);made.push(t);return t},PR=(...a)=>{const p={r:T(...a),w:T(...a),swap(){const t=this.r;this.r=this.w;this.w=t}};return p};
    try{
      const wrap={wrap:this.wrap};
      const n={};
      if(force||!simSame){n.vel=PR(...s.sim,'rg16f',wrap);n.prs=PR(...s.sim,'r16f',wrap);n.div=T(...s.sim,'r16f',wrap);n.crl=T(...s.sim,'r16f',wrap)}
      if(force||!inkSame){n.dye=PR(...s.ink,'rgba16f',wrap);n.fwd=T(...s.ink,'rgba16f',wrap);
        if(this.dye){pass('copy.frag',{uSrc:this.dye.r,uScale:1},n.dye.r)}}
      const pw=Math.round(s.ink[0]*s.pq),ph=Math.round(s.ink[1]*s.pq);
      if(force||!this.ptx||this.ptx.w!==pw||this.ptx.h!==ph)n.ptx=T(pw,ph,'rgba16f');
      if(force||!resSame){n.scene=T(...s.res,'rgba16f');n.lit=T(...s.res,'rgba16f');n.bloom=[];let bw=s.res[0],bh=s.res[1];for(let i=0;i<5;i++){bw=Math.max(1,bw>>1);bh=Math.max(1,bh>>1);n.bloom.push(T(bw,bh,'rgba16f'))}}
      for(const k in n){const old=this[k];if(Array.isArray(old))old.forEach(kill);else kill(old);this[k]=n[k]}
      if(n.dye){this.undo.forEach(u=>kill(u));this.undo=[]}
      if(n.ptx){kill(this.ptx2);this.ptx2=null}
      if(n.scene){Trans.free();this.lastFrame=null;kill(this.echo);this.echo=null;if(this.dof){this.dof.forEach(kill);this.dof=null}}
      Space.inkSize=s.ink;this.sim=s.sim;this.ink=s.ink;this.res=s.res;this.world=s.world;
      cv.width=s.res[0];cv.height=s.res[1];this.error='';return true;
    }catch(e){made.forEach(kill);this.error='GPU allocation failed; kept previous quality. '+e.message;return false}
  },
  setWrap(on){if(on===this.wrap)return;this.wrap=on;for(const t of[this.vel,this.prs,this.div,this.crl,this.dye,this.fwd])t&&setWrap(t,on)},
  refTx(){const a=this.sim[0]/this.sim[1],sx=a>=1?a:1,sy=a>=1?1:1/a;return[1/(REF*sx*this.world),1/(REF*sy*this.world)]},

  /* Brush stamp in sheet uv. r = variance in short-side units (the original brush radius). */
  stamp(x,y,vx,vy,rgb,r,ink){
    if(this.nStamps*12>=this.stamps.length){const a=new Float32Array(this.stamps.length*2);a.set(this.stamps);this.stamps=a}
    const o=this.nStamps++*12,s=this.stamps;
    s[o]=x;s[o+1]=y;s[o+2]=r;s[o+3]=r*Math.max(.05,ink);s[o+4]=vx;s[o+5]=vy;s[o+6]=Math.random()*100;s[o+7]=1;s[o+8]=rgb[0];s[o+9]=rgb[1];s[o+10]=rgb[2];s[o+11]=0;
  },
  flushStamps(brush){
    const n=this.nStamps;if(!n)return;this.nStamps=0;
    gl.bindBuffer(gl.ARRAY_BUFFER,this.stampBuf);gl.bufferData(gl.ARRAY_BUFFER,this.stamps.subarray(0,n*12),gl.STREAM_DRAW);
    const prog=program('splat.vert','splat.frag');gl.useProgram(prog.p);gl.bindVertexArray(this.stampVao);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
    setUniforms(prog,{uMode:0,uAspect:this.sim[0]/this.sim[1],uBrush:brush});bindOut(this.vel.r);gl.drawArraysInstanced(gl.TRIANGLES,0,6,n);
    setUniforms(prog,{uMode:1,uAspect:this.ink[0]/this.ink[1],uBrush:brush});bindOut(this.dye.r);gl.drawArraysInstanced(gl.TRIANGLES,0,6,n);
    gl.disable(gl.BLEND);gl.bindVertexArray(null);
  },

  step(dt,P,field){
    const tx=[1/this.sim[0],1/this.sim[1]],ref=this.refTx(),a=this.sim[0]/this.sim[1];
    const aspect=[(a>=1?a:1)*this.world,(a>=1?1:1/a)*this.world];
    if(field.g[0]||field.g[1]||P.bu||field.mode){pass('forces.frag',{uVel:this.vel.r,uDye:this.dye.r,uG:field.g,uAspect:aspect,uPoles:Space.u.uPoles,uBuoy:P.bu,uDt:dt,uFieldStr:field.str,uFieldScale:P.fsc,uTime:field.time,uField:field.mode},this.vel.w);this.vel.swap()}
    pass('curl.frag',{uVel:this.vel.r,uTx:tx,uScale:Math.min(this.sim[0],this.sim[1])/(REF*this.world)},this.crl);
    pass('vorticity.frag',{uVel:this.vel.r,uCurl:this.crl,uTx:tx,uCurlStr:P.curl*REF*this.world/Math.min(this.sim[0],this.sim[1]),uDt:dt,uMaxVel:MAX_VEL},this.vel.w);this.vel.swap();
    pass('divergence.frag',{uVel:this.vel.r,uTx:tx,uWalls:this.wrap?0:1},this.div);
    pass('copy.frag',{uSrc:this.prs.r,uScale:.8},this.prs.w);this.prs.swap();
    for(let i=0,it=Gov.iters(dt);i<it;i++){pass('pressure.frag',{uP:this.prs.r,uDiv:this.div,uTx:tx},this.prs.w);this.prs.swap()}
    pass('gradient.frag',{uP:this.prs.r,uVel:this.vel.r,uTx:tx},this.vel.w);this.vel.swap();
    pass('advect.frag',{uVel:this.vel.r,uSrc:this.vel.r,uRefTx:ref,uDt:dt,uDiss:P.vel},this.vel.w);this.vel.swap();
    pass('advect.frag',{uVel:this.vel.r,uSrc:this.dye.r,uRefTx:ref,uDt:dt,uDiss:0},this.fwd);
    pass('maccormack.frag',{uVel:this.vel.r,uSrc:this.dye.r,uFwd:this.fwd,uRefTx:ref,uSrcTx:[1/this.ink[0],1/this.ink[1]],uDt:dt,uDiss:P.den,uSub:.006+.008*P.den},this.dye.w);this.dye.swap();
  },

  particles(dt,P,emit,time,palette,paused,fdt){
    if(!P.fx)return;
    if(!paused){pass('particles_update.frag',{uState:this.parts.r,uVel:this.vel.r,uRefTx:this.refTx(),uEmit:emit,uDt:dt,uSpeed:P.pspd,uLife:P.plf,uTime:time,uWrap:this.wrap?1:0,uMaxStep:.55,...Geo.particleUniforms(P)},this.parts.w);this.parts.swap()}
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    pass('fade.frag',{uAlpha:1-Math.pow(P.ptl,dt*60)},this.ptx);
    gl.blendFunc(gl.ONE,gl.ONE);
    const prog=program('particles.vert','particles.frag');gl.useProgram(prog.p);
    // Footprint in screen pixels is the same at any particle resolution (0.6 is the phone look); a higher one only sharpens it.
    const pq=this.ptx.w/this.ink[0],scale=this.ink[0]*.6/Math.max(1,this.res[0]/Math.min(devicePixelRatio||1,2));
    setUniforms(prog,{uState:this.parts.r,uVel:this.vel.r,uSide:PART_SIDE,uTarget:[this.ptx.w,this.ptx.h],uRefTx:this.refTx(),uSize:P.psz*Math.max(1,scale)*pq/.6,uStretch:P.fx===4?2.2:1.1,uBright:P.pbr*.26*Math.min(2,(fdt||dt)*60)*Math.min(2.2,Math.pow((1-P.ptl)/.15,.85)),uMode:P.fx,uTime:time,uSat:P.s,uHue:P.h,uHueRange:P.hr,uSharp:P.psh,...palette});
    bindOut(this.ptx);gl.bindVertexArray(emptyVao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,Math.max(1,Math.round(P.pn*PART_SIDE*PART_SIDE)));
    gl.disable(gl.BLEND);
  },

  /* Display: compose (fold once) → material → echo → bloom → final (glass, film). */
  render(P,look,glass,toScreen=true,out=null){
    const res=this.res,sp=Space.u;
    pass('compose.frag',{...sp,uDye:this.dye.r,uPart:this.ptx,uCurl:this.crl,uExposure:look.exposure,uFloor:P.blk*.08,uVib:P.vib,uTone:P.tone,uOrbL:look.orbL||[.4,.5,.75],uOrbRim:look.orbRim||[.3,.5,1],uOrbDepth:P.odepth,uHue:look.hue,uParityHue:P.ptint*Math.PI*.66,uChroma:P.chroma,uPartOn:P.fx?1:0,...Geo.composeUniforms()},this.scene,this.variant('fullscreen.vert','compose.frag','compose'));
    let base=this.scene;
    if(P.rel>0||P.met>0||P.irs>0||P.fre>0){pass('material.frag',{uScene:this.scene,uTx:[1/res[0],1/res[1]],uRelief:P.rel,uSharp:P.spc,uLight:P.lgt*Math.PI/180,uMetal:P.met,uIris:P.irs,uRim:P.fre,uShine:0},this.lit);base=this.lit}
    if(P.echo>0){
      if(!this.echo)this.echo=pair(...res,'rgba16f');
      const a=res[0]/res[1];
      pass('echo.frag',{uCur:base,uPrev:this.echo.r,uEcho:P.echo,uZoom:look.echoZoom,uTwist:look.echoTwist,uCenter:look.echoCenter||[0,0],uAspect:a>=1?[a,1]:[1,1/a]},this.echo.w);this.echo.swap();base=this.echo.r;
    }else if(this.echo){kill(this.echo);this.echo=null}
    /* A blurred copy of the picture (quarter size, then eighth size run through a Gaussian) for the glass panels and for the
       ball's depth of field. Built only when one of them is on screen. */
    let farA=this.black,farB=this.black,dof=0;
    const frost=glass.n>0&&toScreen&&P.blr>.5,ball=sp.uOrb>0&&P.odepth>0;
    if(frost||ball){
      const qw=Math.max(1,res[0]>>2),qh=Math.max(1,res[1]>>2),ew=Math.max(1,res[0]>>3),eh=Math.max(1,res[1]>>3);
      if(!this.dof||this.dof[0].w!==qw||this.dof[0].h!==qh){if(this.dof)this.dof.forEach(kill);this.dof=[target(qw,qh,'rgba16f'),target(ew,eh,'rgba16f'),target(ew,eh,'rgba16f')]}
      const D=this.dof,sc=Math.min(3,(frost?P.blr:14)*res[0]/VW()*.044);   // Gaussian width in eighth-size texels
      pass('bloom_down.frag',{uSrc:base,uTx:[2/res[0],2/res[1]],uThreshold:0,uFirst:0},D[0]);
      pass('bloom_down.frag',{uSrc:D[0],uTx:[2/D[0].w,2/D[0].h],uThreshold:0,uFirst:0},D[1]);
      pass('blur.frag',{uSrc:D[1],uDir:[sc/D[1].w,0]},D[2]);
      pass('blur.frag',{uSrc:D[2],uDir:[0,sc/D[1].h]},D[1]);
      farA=D[0];farB=D[1];dof=ball?Math.min(1,P.odepth*1.15):0;
    }else if(this.dof){this.dof.forEach(kill);this.dof=null}
    let bloomTex=this.black,bloomAmt=0;
    if(look.bloom>0){
      const B=this.bloom;
      pass('bloom_down.frag',{uSrc:base,uTx:[1/res[0],1/res[1]],uThreshold:P.bth,uFirst:1},B[0]);
      for(let i=1;i<B.length;i++)pass('bloom_down.frag',{uSrc:B[i-1],uTx:[1/B[i-1].w,1/B[i-1].h],uFirst:0},B[i]);
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
      for(let i=B.length-2;i>=0;i--)pass('bloom_up.frag',{uSrc:B[i+1],uTx:[.5/B[i+1].w,.5/B[i+1].h]},B[i]);
      gl.disable(gl.BLEND);bloomTex=B[0];bloomAmt=look.bloom*.45;
    }
    if(toScreen)this.lastFrame={base,bloom:bloomTex,amt:bloomAmt};
    const dp=res[0]/VW();
    pass('final.frag',{...Trans.uniforms(look),uUi:this.ui.on?this.ui.r:this.black,uUiA:this.ui.on?this.ui.a:0,uImg:base,uBloom:bloomTex,uFarA:farA,uFarB:farB,uOrb:sp.uOrb,uDof:dof,uBlack:Math.min(.38,Exposure.bpS+P.blk*.45),uSharp:P.shp,uRes:res,uBloomAmt:bloomAmt,uVig:P.vig,uContrast:P.ctr,uGrain:P.grain,uLens:P.lens,uTime:look.time,uDp:dp,
      uR:glass.R,uQ:glass.Q,uN:toScreen?glass.n:0,uRefr:P.ref,uBlur:P.blr,uBezel:P.bzl,uDisp:P.dsp},out);
  },
  /* Clean frame (no interface) read straight from an offscreen target: works even when the page is not being presented. */
  capture(P,look,glass){
    const[w,h]=this.res;if(!this.cap||this.cap.w!==w||this.cap.h!==h){kill(this.cap);this.cap=target(w,h,'rgba8')}
    this.render(P,look,glass,false,this.cap);
    const px=new Uint8ClampedArray(w*h*4);gl.bindFramebuffer(gl.FRAMEBUFFER,this.cap.fb);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
    const row=w*4,tmp=new Uint8ClampedArray(row);for(let y=0;y<h>>1;y++){const a=y*row,b=(h-1-y)*row;tmp.set(px.subarray(a,a+row));px.copyWithin(a,b,b+row);px.set(tmp,b)}
    const c=el('canvas');c.width=w;c.height=h;c.getContext('2d').putImageData(new ImageData(px,w,h),0,0);return c;
  },

  /* Infinite canvas: slide every field by the camera's offset (uv) so the camera is centred again. */
  scrollSheet(s){
    const sh=(src,dst)=>{pass('shift.frag',{uSrc:src.r,uShift:s},dst.w);dst.swap()};
    sh(this.dye,this.dye);sh(this.vel,this.vel);sh(this.prs,this.prs);
    if(this.ptx)pass('shift.frag',{uSrc:this.ptx,uShift:s},this.ptx2||(this.ptx2=target(this.ptx.w,this.ptx.h,'rgba16f')));
    if(this.ptx&&this.ptx2){const t=this.ptx;this.ptx=this.ptx2;this.ptx2=t}
    pass('pshift.frag',{uSrc:this.parts.r,uShift:s},this.parts.w);this.parts.swap();
  },
  /* Interface ink: when the interface dissolves, a picture of it becomes a layer that the fluid carries (uiflow.frag).
     Still water leaves it intact; flow pushes it away and smears it. begin(mask) takes the picture, step() advects it. */
  ui:{r:null,w:null,on:false,a:0,decay:.25,age:0,rel:0},
  uiBegin(mask){
    const u=this.ui,w=Math.round(VW()),h=Math.round(VH());
    if(!u.r||u.r.w!==w||u.r.h!==h){kill(u.r);kill(u.w);u.r=target(w,h,'rgba16f');u.w=target(w,h,'rgba16f')}
    pass('copy.frag',{uSrc:mask,uScale:1},u.r);u.on=true;u.age=0;u.decay=.25;u.a=0;u.rel=0;
  },
  uiRelease(){const u=this.ui;if(u.on){u.decay=7;u.rel=.6}},
  uiStep(dt,simDt){
    const u=this.ui;if(!u.on)return;
    u.age+=dt;if(u.rel&&(u.rel-=dt)<=0||u.age>20){u.on=false;kill(u.r);kill(u.w);u.r=u.w=null;return}
    if(App.paused)return;
    pass('uiflow.frag',{...Space.u,uPrev:u.r,uVel:this.vel.r,uRefTx:this.refTx(),uUiRes:[u.r.w,u.r.h],uDt:simDt,uFade:u.decay*dt},u.w,this.variant('fullscreen.vert','uiflow.frag','uiflow'));
    const t=u.r;u.r=u.w;u.w=t;
  },
  snapshot(){
    const used=[...liveTargets].reduce((s,t)=>s+t.bytes,0),need=this.dye.r.w*this.dye.r.h*8;
    if(used+need>this.budget)return;
    const t=target(this.dye.r.w,this.dye.r.h,'rgba16f');pass('copy.frag',{uSrc:this.dye.r,uScale:1},t);this.undo.push(t);
    while(this.undo.length>4)kill(this.undo.shift());
  },
  restore(){const t=this.undo.pop();if(!t)return false;pass('copy.frag',{uSrc:t,uScale:1},this.dye.r);kill(t);return true},
  clear(){this.snapshot();for(const t of[this.vel,this.prs,this.dye])clearTarget(t);clearTarget(this.ptx);this.echo&&clearTarget(this.echo)},
  memoryMiB(){return[...liveTargets].reduce((s,t)=>s+t.bytes,0)/1048576}
};
function toHalf(f){const b=new DataView(new ArrayBuffer(4));b.setFloat32(0,f);const x=b.getUint32(0),s=(x>>>16)&0x8000,e=((x>>>23)&0xff)-112,m=(x>>>13)&0x3ff;return e<=0?s:e>=31?s|0x7c00:s|(e<<10)|m}
