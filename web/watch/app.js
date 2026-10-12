/* Wear OS host, part 3: the frame loop (80_main.js without the browser parts), a stand-in for the interface the engine
   talks to, and WatchApp: the few calls the native watch interface makes. Loaded last in the watch bundle. */
/* Sacred-geometry patterns are drawn by the native 2D canvas. The few that need a per-pixel field (fractals, interference) are too heavy for a watch: they and the
   presets that use them stay out of its list. */
for(const g of GEO)g.noWatch=!!(g.noWatch||g.draw&&/[.]field[(]/.test(String(g.draw)));
function geoOk(pr){if(pr.p.ff)return false;const g=pr.p.geo;if(!g)return true;const i=typeof g==='string'?GEO.findIndex(x=>x.n===g):g|0;return i>0&&!!GEO[i]&&!GEO[i].noWatch}
const Quick={reset:__noop,touch:__noop,apply:__noop};

function notice(text,ms=5000){__host.emit('toast',JSON.stringify([String(text),ms]))}

UI={
  built:false,open:false,hidden:false,dissolving:false,waking:false,layoutDirty:false,lastInput:0,
  audioStatus:{textContent:''},srcBtns:{children:[]},fileRow:{hidden:true},bands:{hidden:true,children:[]},hudEl:null,G:[],
  R:new Float32Array(32),Q:new Float32Array(16),
  wake:__noop,tabId:()=>'',sync:__noop,hud:__noop,frame:__noop,spotifyState:__noop,
  glass(){return{R:this.R,Q:this.Q,n:0}},
  presetChanged(){__host.emit('preset',allPresets()[current].n)},
  /* Next / previous preset: the same pool as the web interface, minus what the watch cannot draw yet. */
  cycle(d=1){
    const list=allPresets(),pool=list.map((p,i)=>i).filter(i=>favorites.size?favorites.has(list[i].n):list[i].c!=='Classic'&&geoOk(list[i]));
    let i=pool.indexOf(current);if(i<0)i=d>0?-1:0;
    applyPreset(pool[(i+d+pool.length)%pool.length],{animate:true});
  },
  change(k,v){
    morph=null;const old=P[k];P[k]=v;
    if(PDEF[k].quality){if(!Engine.allocate(quality())){P[k]=old;notice(Engine.error)}}
    if(k==='edges')Engine.applyEdges();
    persist();
  }
};

/* Random looks only pick patterns the watch can draw. */
{const look=Rand.look.bind(Rand);Rand.look=seed=>{const v=look(seed);if((v.geo|0)>0&&(!GEO[v.geo|0]||GEO[v.geo|0].noWatch))v.geo=0;return v}}

/* No pixel-buffer fences in the bridge: the exposure sample is a small synchronous read, twice a second. */
Exposure.sample=function(dt){
  this.t+=dt;this.bpS+=(this.bp-this.bpS)*(1-Math.exp(-dt/.7));   // black point glides
  if(this.t<.5)return;
  this.dtSteer=this.t;this.t=0;
  if(!this.tiny)this.tiny=target(16,16,'rgba8');
  pass('copy.frag',{uSrc:Engine.scene,uScale:1},this.tiny);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.tiny.fb);gl.readPixels(0,0,16,16,gl.RGBA,gl.UNSIGNED_BYTE,this.px);
  this.steer();
};
/* The app paces the frames (30 Hz) and tells the governor so. */
Gov.raf=__noop;Gov.refresh=30;Gov.throttled=()=>false;

const App={
  paused:false,snap:false,rec:null,displayHue:0,look:{exposure:1,hue:0,bloom:0,echoZoom:0,echoTwist:0,time:0},
  last:0,frames:0,fpsT:0,fps:0,cpu:0,ready:false,started:false,prof:{logic:0,step:0,parts:0,render:0,gpu:0,n:0,m:0},
  start(){
    if(this.started)return;this.started=true;const T0=performance.now(),lap=n=>console.log('boot '+n+' '+Math.round(performance.now()-T0)+' ms');
    Engine.init();Geo.init();restore();Engine.wrap=!!(P.edges||(P.cvs|0)>=2);Engine.open=!Engine.wrap&&(P.cvs|0)===1;this.cvsSeen=P.cvs|0;
    // First run on the watch: light quality, no interface effects, a bit more wrist pour; start on Infinity.
    if(!store.get('dynamic.watchinit',0)){store.set('dynamic.watchinit',1);P.qual=4;P.uh=0;P.st=0;P.tflow=.5;persist();const i=allPresets().findIndex(x=>x.n==='Infinity');if(i>=0)applyPreset(i)}
    Gov.cap=30;
    if(!Engine.allocate(quality(),true)){P.rscale=.75;P.sim=192;if(!Engine.allocate(quality(),true)){__host.emit('error',Engine.error);return}}
    lap('allocated '+Engine.res.join('x')+' sim '+Engine.sim.join('x')+' ink '+Engine.ink.join('x'));
    Input.init();Tilt.init();Eyes.init();Music.init();
    Space.update(P,0,Engine.res,Engine.world,0);
    Engine.warm().then(errors=>{
      lap('shaders ready ('+programs.size+' programs, '+[...programs.values()].filter(e=>e.cached).length+' cached) on '+gl.getParameter(gl.RENDERER)+' '+gl.getParameter(gl.VERSION));
      if(errors.length){__host.emit('error','A shader was rejected by this watch: '+errors[0].slice(0,300));return}
      this.ready=true;this.last=performance.now();__host.emit('ready',allPresets()[current].n);
    });
  },
  frame(now){
    if(!this.ready)return false;
    // every 6 s, time one whole frame pass by pass (the full GPU wait makes that frame slow, so it is shown separately)
    cv.prof=now-(this.profT||0)>6000&&this.fps>0;
    if(!cv.prof&&this.profT&&Object.keys(cv.passMs).length){const rows=Object.entries(cv.passMs).sort((a,b)=>b[1][0]-a[1][0]),tot=rows.reduce((x,r)=>x+r[1][0],0);
      console.log('passes ('+tot.toFixed(0)+' ms with a GPU wait after each): '+rows.slice(0,12).map(([k,v])=>k+' '+v[0].toFixed(1)+(v[1]>1?' ('+v[1]+')':'')).join(' | '));cv.passMs={}}
    if(cv.prof)this.profT=now;
    const sf=__host.surface();cv.sw=sf[0];cv.sh=sf[1];
    this.tick(now);
    if(now-(this.logT||0)>3000){this.logT=now;{const q=this.prof,n=Math.max(q.n,1);console.log('prof ms/frame: logic '+(q.logic/n).toFixed(1)+' step '+(q.step/n).toFixed(1)+' particles '+(q.parts/n).toFixed(1)+' render '+(q.render/n).toFixed(1)+' gpu-wait '+(q.gpu/Math.max(q.m,1)).toFixed(1));q.logic=q.step=q.parts=q.render=q.gpu=q.n=q.m=0;console.log('gl '+__host.glStats()+' | screen bind '+((cv.screenMs||0)/n).toFixed(1)+' ms/frame');cv.screenMs=0}console.log('fps '+this.fps.toFixed(1)+' cpu '+this.cpu.toFixed(1)+' ms render '+Engine.res.join('x')+' sim '+Engine.sim.join('x')+' ink '+Engine.ink.join('x')+' surface '+cv.sw+'x'+cv.sh+' '+allPresets()[current].n)}
    if(cv.dirty){cv.dirty=false;__host.emit('size',cv.width+','+cv.height)}
    return true;
  },
  tick(now){
    const el=(now-this.last)/1000;
    this.last=now;const dt=Math.min(Math.max(el,1/500),.05),t0=performance.now();
    this.frames++;this.fpsT+=el;if(this.fpsT>=.5){this.fps=this.frames/this.fpsT;this.frames=0;this.fpsT=0;Gov.review(this.fps)}
    clock+=dt;stepMorph(dt);
    if(P.cyc&&!this.paused&&(this.cycT=(this.cycT||0)+dt)>20){this.cycT=0;UI.cycle()}

    if((P.cvs|0)!==this.cvsSeen){this.cvsSeen=P.cvs|0;Engine.applyEdges();if(!Engine.allocate(quality()))notice(Engine.error)}
    Tilt.follow=Space.mode!==1;
    if(P.auto<.45)P.auto=.45;   // a watch has nobody drawing on it all day: it paints itself
    Music.frame(dt);
    Tilt.frame(dt);const tl=Tilt.get(P);
    const E=Director.apply(P,dt),beat=Music.beat,energy=Music.energy;
    Trans.watch(E,dt);
    Space.update(E,this.paused?0:dt*PACE,Engine.res,Engine.world,P.aspace*(energy*.4+beat*.5),tl,Tilt.rot(P),E.zp);
    if(Space.pendingShift){Engine.scrollSheet(Space.pendingShift);Space.pendingShift=null}
    Input.frame(dt);
    Engine.flushStamps(P.bt);
    const pa=performance.now();

    const L=this.look;
    this.displayHue+=P.hdrift*dt*.6;
    E.lgt=P.lgt+tl[0]*55-tl[1]*30;
    this.displayHue+=(E.hdrift-P.hdrift)*dt*.6;
    Eyes.frame(dt,E);L.eyes=Eyes.uniforms(E);
    L.exposure=P.glw*Exposure.k*(1+P.aglow*(beat*.35+Music.kick*.2+Director.flash*.3));L.hue=this.displayHue+(E.h-hueBase)*TAU;L.bloom=E.bloom*(1+P.aglow*(beat*1.6+energy*.6));
    {const a=E.lgt*Math.PI/180;L.orbL=[Math.cos(a)*.7,Math.sin(a)*.7,.75];L.orbRim=paletteRGB(hueBase+E.hr*.35).map(z=>z*.6)}
    L.echoZoom=E.ezoom*.012*dt*60*(1+P.aspace*beat);L.echoTwist=E.etwist*.02*dt*60;L.echoCenter=[tl[0]*.1,tl[1]*.1];L.time=clock;
    if(!this.paused){
      const sim=dt*PACE*P.ts*musicSpeed,n=this.fps&&this.fps<40?1:Math.min(3,Math.ceil(sim/(1/60)-1e-6)),h=sim/Math.max(n,1);
      const pr=Tilt.pour(P),g=[P.wx+pr[0],P.wy+pr[1]];
      const field={mode:E.field|0,str:E.fs*500*(1+P.afield*(Music.bass*2.5+beat)),g,time:clock};
      Geo.inject(dt,E);
      for(let i=0;i<n;i++)Engine.step(h,E,field);
    }
    const pb=performance.now();
    Engine.uiStep(dt,dt*PACE*P.ts*musicSpeed);
    const ps=Input.ptr.size?[...Input.ptr.values()][0]:null,emit=ps?[Input.emitAt[0],Input.emitAt[1],1,.06]:[0,0,0,0];
    Engine.particles(dt*PACE*P.ts*Math.min(1,musicSpeed),E,emit,clock,paletteUniforms(),this.paused,dt);
    const pc=performance.now();
    const dpr=Engine.res[0]/VW(),glass=UI.glass(dpr);
    Engine.render(E,L,glass,true);Exposure.sample(dt);
    const pd=performance.now(),pf=this.prof;
    pf.logic+=pa-t0;pf.step+=pb-pa;pf.parts+=pc-pb;pf.render+=pd-pc;pf.n++;
    if((this.frames&7)===0){gl.finish();pf.gpu+=performance.now()-pd;pf.m++}   // how long the GPU is still busy after the last call: ~0 means the script is the bottleneck
    this.cpu=this.cpu*.9+(performance.now()-t0)*.1;
  }
};

/* ---- entry points the app calls (engine.c → here) ---- */
function __resize(w,h){innerWidth=w;innerHeight=h;devicePixelRatio=1;if(App.started&&App.ready){if(!Engine.allocate(quality()))notice(Engine.error)}}
function __start(){App.start()}
function __frame(now){__runTimers(now);return App.frame(now)}
function __flush(){__runTimers(performance.now()+1e7)}   // run pending timers now (saving settings) before the app pauses
function __pointer(code,id,x,y){__fire(['pointerdown','pointermove','pointerup','pointercancel'][code],{pointerId:id,clientX:x,clientY:y,pointerType:'touch',target:cv,preventDefault:__noop,stopPropagation:__noop})}

/* ---- what the watch interface asks for ---- */
const WatchApp={
  state(){
    const p=allPresets()[current]||{n:''};
    return JSON.stringify({preset:p.n,cat:p.c||'',pal:SCHEMA.palettes[P.pal|0][0],palIdx:P.pal|0,mic:!!Music.native,qual:P.qual|0,fps:Math.round(App.fps),res:Engine.res.join('x'),sim:Engine.sim.join('x'),
      paused:App.paused,tilt:P.tilt,auto:P.auto,orb:P.orb,error:Engine.error,cpu:+App.cpu.toFixed(1)});
  },
  /* The presets the watch can draw, as [index, name, category] rows. */
  presets(){const l=allPresets(),o=[];l.forEach((p,i)=>{if(p.c!=='Classic'&&geoOk(p))o.push([i,p.n,p.c])});return JSON.stringify(o)},
  palettes(){return JSON.stringify(SCHEMA.palettes.map(([n,h])=>[n,h||[]]))},
  cycle(d){UI.cycle(d)},
  go(i){applyPreset(i,{animate:true})},
  palette(d){const n=SCHEMA.palettes.length;UI.change('pal',((P.pal|0)+d+n)%n);notice(SCHEMA.palettes[P.pal|0][0],900)},
  random(){const s=Math.floor(Math.random()*1e5)+1;Rand.apply(s);notice('Random #'+s,1200);haptic(10)},
  back(){Rand.back()},
  clear(){Engine.clear()},
  undo(){if(!Engine.restore())notice('Nothing to undo',900)},
  pause(on){App.paused=on==null?!App.paused:!!on;notice(App.paused?'Paused':'Playing',700)},
  quality(q){UI.change('qual',q|0)},
  set(k,v){if(PDEF[k]){const s=sanitize(k,+v);if(s!==undefined)UI.change(k,s)}},
  get(k){return P[k]},
  /* Microphone on/off (the app captures and analyses the sound and calls __nativeBands). */
  mic(on,text){Music.native=!!on;Music.resetSync();UI.audioStatus.textContent=text||''}
};
