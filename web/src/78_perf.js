/* Frame governor and auto exposure.
   Governor: measures GPU time per frame (EXT_disjoint_timer_query_webgl2; frame rate when unavailable) and the
   screen's refresh rate. When frames run late it lowers resolution, ink detail, simulation cells and pressure steps
   one level at a time; with lasting headroom it climbs back. At the lowest level it halves the frame rate (144 → 72)
   so pacing stays even instead of stuttering. Pressure steps also scale with the time step, so 144 Hz costs about the
   same per second as 60 Hz.
   Exposure: four times a second a 16×16 sample of the composed frame is read back asynchronously; the brightest
   quarter is steered towards a fixed level, so a sparse frame is not blown out and a dense one is not pushed white. */
const Gov={
  first:true,level:0,refresh:60,cap:0,iv:[],queries:[],gpu:0,fps:0,slowN:0,fastN:0,last:0,tLast:0,
  LEVELS:[[1,1,1,1,.9],[.85,.85,.875,.85,.8],[.72,.72,.75,.7,.7],[.62,.6,.625,.6,.6],[.52,.5,.5,.5,.6],[.44,.45,.44,.45,.6]],
  auto(){return!P.qual},
  lvl(){return this.auto()?this.level:[0,0,1,3,4,5][P.qual|0]},
  /* An endless or wrapping canvas simulates a world 1.8x the screen across; its cells are a little coarser to pay for it. */
  quality(Q){const L=this.LEVELS[this.lvl()],c=P.cvs?.8:1;return{...Q,rscale:Q.rscale*L[0],inkq:Q.inkq*L[1]*c,sim:Math.max(96,Math.round(Q.sim*L[2]*c/16)*16),world:P.cvs?1.8:Q.world,pq:L[4]}},
  iters(dt){const L=this.LEVELS[this.lvl()][3];return Math.max(6,Math.round(P.it*L*Math.min(1,dt*60*1.1+.25)))},
  /* Every rAF timestamp, drawn or not: the median interval is the display refresh. */
  raf(now){if(this.tLast){const d=now-this.tLast;this.lastD=Math.max(d,(this.lastD||0)*.9);if(d>2&&d<250){this.iv.push(d);if(this.iv.length>90)this.iv.shift()}}this.tLast=now;
    if(this.iv.length>=30&&(this.iv.length%30===0)){const s=[...this.iv].sort((a,b)=>a-b),m=s[s.length>>1];this.refresh=Math.round(1000/m)}},
  targetHz(){const c=[30,60,90,120,144,0,-1][P.hz|0];if(c>0)return c;if(c===0)return 0;return this.cap||this.refresh},
  begin(){if(!timerExt)return null;const q=gl.createQuery();gl.beginQuery(timerExt.TIME_ELAPSED_EXT,q);return q},
  end(q){if(!q)return;gl.endQuery(timerExt.TIME_ELAPSED_EXT);this.queries.push(q);
    while(this.queries.length){const h=this.queries[0];if(!gl.getQueryParameter(h,gl.QUERY_RESULT_AVAILABLE))break;this.queries.shift();
      if(!gl.getParameter(timerExt.GPU_DISJOINT_EXT)){const ms=gl.getQueryParameter(h,gl.QUERY_RESULT)/1e6;this.gpu=this.gpu?this.gpu*.9+ms*.1:ms}gl.deleteQuery(h)}
    if(this.queries.length>6)gl.deleteQuery(this.queries.shift())},
  /* Twice a second. */
  review(fps){
    this.fps=fps;if(!this.auto()||App.paused||UI.open&&UI.tabId()==='system')return;
    // A hidden or throttled page (background tab, minimised window) says nothing about the GPU.
    if(document.hidden||this.throttled())return;
    const now=performance.now(),hz=this.targetHz()||this.refresh,budget=1000/hz*.82,haveGpu=!!timerExt&&this.gpu>0;
    const slow=haveGpu?this.gpu>budget&&fps<hz*.97:fps<hz*.88,fast=haveGpu?this.gpu<budget*.42&&fps>hz*.95:false;
    this.slowN=slow?this.slowN+1:0;this.fastN=fast?this.fastN+1:0;
    if(this.slowN>=(this.first?1:3)&&now-this.last>(this.first?400:2000)){this.slowN=0;this.last=now;
      // With a GPU timing, jump straight to the level whose pixel count fits the budget (cost ~ resolution²).
      let L=this.level+1;
      if(haveGpu){const s0=this.LEVELS[this.level][0];while(L<this.LEVELS.length-1&&this.gpu*(this.LEVELS[L][0]/s0)**2>budget*.8)L++}
      this.first=false;this.gpu=0;
      if(this.level<this.LEVELS.length-1){this.level=Math.min(L,this.LEVELS.length-1);this.apply()}
      else if(P.hz===6&&!this.cap&&this.refresh>=100){this.cap=Math.round(this.refresh/2)}}
    else if(this.fastN>=10&&now-this.last>5000){this.fastN=0;this.last=now;
      if(this.cap){this.cap=0}else if(this.level>0){this.level--;this.apply()}}
  },
  apply(){Engine.allocate(quality())},
  throttled(){return this.iv.length<10||this.lastD>250},   // background tabs run rAF at ~1 Hz; a slow GPU still manages >4 fps
  label(){const n=['Ultra','High','High−','Balanced','Light','Battery'][this.lvl()];return this.auto()?'Auto · '+n:n}
};

const Exposure={
  k:1,t:0,pbo:null,fence:null,tiny:null,px:new Uint8Array(16*16*4),bp:0,bpS:0,
  /* Called after the frame is drawn (scene holds the composed, tone-mapped frame). */
  sample(dt){
    this.t+=dt;this.bpS+=(this.bp-this.bpS)*(1-Math.exp(-dt/.7));   // black point glides
    if(this.fence){const st=gl.clientWaitSync(this.fence,0,0);if(st===gl.ALREADY_SIGNALED||st===gl.CONDITION_SATISFIED){
      gl.deleteSync(this.fence);this.fence=null;gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.pbo);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,this.px);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);this.steer()}}
    if(this.fence||this.t<.25)return;
    const dtSteer=this.t;this.t=0;this.dtSteer=dtSteer;
    if(!this.tiny){this.tiny=target(16,16,'rgba8');this.pbo=gl.createBuffer();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.pbo);gl.bufferData(gl.PIXEL_PACK_BUFFER,16*16*4,gl.STREAM_READ);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null)}
    pass('copy.frag',{uSrc:Engine.scene,uScale:1},this.tiny);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.tiny.fb);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.pbo);gl.readPixels(0,0,16,16,gl.RGBA,gl.UNSIGNED_BYTE,0);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
    this.fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
  },
  steer(){
    const v=new Float32Array(256);for(let i=0;i<256;i++)v[i]=Math.max(this.px[i*4],this.px[i*4+1],this.px[i*4+2])/255;
    v.sort();let top=0;for(let i=192;i<256;i++)top+=v[i];top/=64;const p50=v[128],p90=v[230],p98=v[250];
    this.top=p90;this.p98=p98;
    this.p50=p50;
    // Black point: as high as the picture allows. Whatever is dimmer than the darkest third of the frame is haze, not
    // content, so it goes to pure black and the rest is stretched back up (levels), which keeps the contrast.
    this.bp=clamp(v[88]*.85,0,.26);
    const dt=this.dtSteer||.25;
    if(!P.aex){this.k=1;return}
    // Leave a well-lit frame alone. Pull back only when the top of the picture clips; lift only when it is nearly black.
    let want=0;
    if(p98>.93||p90>.85)want=-.7;else if(p98<.06)return;else if(p90<.12)want=Math.min(.25,Math.log(.2/Math.max(p90,.03)));
    else want=Math.log(1/this.k)*.5;   // otherwise drift back to neutral
    this.k=clamp(this.k*Math.exp(clamp(want,-.8,.4)*dt/1.2),.55,1.3);
  },
  reset(){this.k=1}
};
