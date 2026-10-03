/* Frame loop. Order matches the Android host: input → stamps → solve → particles → display. */
const App={
  paused:false,snap:false,rec:null,displayHue:0,look:{exposure:1,hue:0,bloom:0,echoZoom:0,echoTwist:0,time:0},
  last:performance.now(),frames:0,fpsT:0,fps:0,cpu:0,diagT:0,
  ready:null,
  async start(){
    let done;this.ready=new Promise(r=>done=r);
    Engine.init();restore();Engine.wrap=!!P.edges;
    if(NATIVE&&!store.get('dynamic.phoneq',0)){P.rscale=.6;P.sim=192;store.set('dynamic.phoneq',1);persist()}   // phone GPUs: lighter first run
    if(!Engine.allocate(quality(),true)){P.rscale=.75;P.sim=192;if(!Engine.allocate(quality(),true)){notice(Engine.error);return}}
    UI.build();Input.init();Music.init();
    Space.update(P,0,Engine.res,Engine.world,0);
    const bar=$('#boot i');
    const errors=await Engine.warm((n,total)=>{if(bar)bar.style.setProperty('--p',n/total)});
    if(errors.length){const b=$('#boot');if(b)b.querySelector('p').textContent='Your graphics driver rejected a shader. Update it and reload.';console.error(errors.join(' | '));return}
    const boot=$('#boot');if(boot){boot.classList.add('out');setTimeout(()=>boot.remove(),700)}
    spotify.completeRedirect().catch(e=>notice(e.message));
    window.__importPreset=code=>decodePreset(code).then(pr=>{saved.push(pr);store.set('dynamic.saved',saved);applyPreset(allPresets().length-1);UI.cat='Mine';UI.renderCards();notice('Loaded “'+pr.n+'”.')}).catch(e=>notice(e.message));
    if(/[#&]p=/.test(location.hash)){window.__importPreset(location.hash);history.replaceState(null,'',location.pathname+location.search)}
    let rt=0;addEventListener('resize',()=>{UI.layoutDirty=true;clearTimeout(rt);rt=setTimeout(()=>{if(!Engine.allocate(quality()))notice(Engine.error)},120)});
    document.addEventListener('visibilitychange',()=>{this.last=performance.now();Music.events.length=0});
    document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;
      if(e.code==='Space'){e.preventDefault();$('#kz').click()}else if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();$('#ku').click()}
      else if(e.key==='/'){e.preventDefault();if(!UI.open)UI.show(UI.lastTab);$('#q').focus()}else if(e.key==='Escape'&&UI.open)UI.shut()});
    cv.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;notice('Graphics were reset by the system. Reload to continue; your settings are saved.',60000)});
    requestAnimationFrame(t=>this.frame(t));done();
    Engine.warmRest();
  },
  frame(now){requestAnimationFrame(t=>this.frame(t));if(!this.lost&&!document.hidden)this.tick(now)},
  tick(now){
    const cap=[30,60,90,120,144,0][P.hz],el=(now-this.last)/1000;
    if(cap&&el<1/cap-.002)return;
    if(!this.firstFrame){this.firstFrame=performance.now()}
    this.last=now;const dt=Math.min(Math.max(el,1/500),.05),t0=performance.now();
    this.frames++;this.fpsT+=el;if(this.fpsT>=.5){this.fps=this.frames/this.fpsT;this.frames=0;this.fpsT=0;this.adapt();$('#fps').textContent=P.st?Math.round(this.fps)+' fps':''}
    clock+=dt;stepMorph(dt);
    if(P.cyc&&!this.paused&&(this.cycT=(this.cycT||0)+dt)>20){this.cycT=0;UI.cycle()}

    Music.frame(dt);
    const beat=Music.beat,energy=Music.energy;
    Space.update(P,this.paused?0:dt,Engine.res,Engine.world,P.aspace*(energy*1.5+beat*2));
    Input.frame(dt);
    UI.depositStep();
    Engine.flushStamps(P.bt);

    const L=this.look;
    this.displayHue+=P.hdrift*dt*.6;
    L.exposure=P.glw*(1+P.aglow*beat*.35);L.hue=this.displayHue+(P.h-hueBase)*TAU;L.bloom=P.bloom*(1+P.aglow*(beat*1.5+energy));
    L.echoZoom=P.ezoom*.012*dt*60*(1+P.aspace*beat);L.echoTwist=P.etwist*.02*dt*60;L.time=clock;
    if(!this.paused){
      const sim=dt*P.ts*musicSpeed,n=Math.min(3,Math.ceil(sim/(1/60)-1e-6)),h=sim/Math.max(n,1);
      const g=[P.wx,P.wy];
      const field={mode:P.field|0,str:P.fs*500*(1+P.afield*(Music.bass*2.5+beat)),g,time:clock};
      for(let i=0;i<n;i++)Engine.step(h,P,field);
    }
    const ps=Input.ptr.size?[...Input.ptr.values()][0]:null,emit=ps?[Input.emitAt[0],Input.emitAt[1],1,.06]:[0,0,0,0];
    Engine.particles(dt*P.ts,P,emit,clock,paletteUniforms(),this.paused);
    UI.frame(dt);
    const dpr=Engine.res[0]/VW(),glass=UI.glass(dpr);
    if(this.rec&&now-this.rec.last>=1000/this.rec.fps){Engine.render(P,L,glass,false);this.rec.ctx.drawImage(cv,0,0,this.rec.c.width,this.rec.c.height);this.rec.last=now}
    if(this.snap){this.snap=false;Engine.capture(P,L,glass).toBlob(b=>b&&download(b,'dynamic.png'))}
    Engine.render(P,L,glass,true);
    this.cpu=this.cpu*.9+(performance.now()-t0)*.1;
    if(UI.open&&UI.tab===6&&now-this.diagT>1000){this.diagT=now;UI.diag.textContent=`${Math.round(this.fps)} fps · CPU ${this.cpu.toFixed(1)} ms · render ${Engine.res.join('×')} · sim ${Engine.sim.join('×')} · ink ${Engine.ink.join('×')} · GPU memory ~${Math.round(Engine.memoryMiB())} MiB · ${gl.getParameter(gl.RENDERER)}`}
    if(audio._media&&UI.seek){UI.seek.max=audio.duration||1;if(document.activeElement!==UI.seek)UI.seek.value=audio.position||0}
  },
  adapt(){   // phone only: if frames stay slow, shed resolution a step at a time
    if(!NATIVE||this.paused||UI.open&&UI.tab===6)return;
    this.slow=this.fps<40?(this.slow||0)+1:0;
    if(this.slow>=6&&P.rscale>.5){this.slow=0;P.rscale=Math.max(.5,+(P.rscale-.1).toFixed(2));Engine.allocate(quality());persist();UI.sync()}
  },
  record(){
    if(this.rec){this.rec.r.stop();return}
    if(!cv.captureStream||!window.MediaRecorder)throw Error('Recording is not available in this browser.');
    const c=el('canvas');c.width=cv.width;c.height=cv.height;const stream=c.captureStream(30),chunks=[];
    let dest=null;if(audio._source&&audio._ctx){dest=audio._ctx.createMediaStreamDestination();audio._source.connect(dest);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t))}
    const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(m=>MediaRecorder.isTypeSupported(m));if(!mime)throw Error('No supported video format.');
    const r=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:16e6});
    r.ondataavailable=e=>e.data.size&&chunks.push(e.data);
    r.onstop=()=>{this.rec=null;stream.getTracks().forEach(t=>t.stop());try{dest&&audio._source.disconnect(dest)}catch{}download(new Blob(chunks,{type:mime}),'dynamic.'+(mime.includes('mp4')?'mp4':'webm'));UI.recBtn.textContent='Record video'};
    r.start(1000);this.rec={r,c,ctx:c.getContext('2d'),fps:30,last:0};UI.recBtn.textContent='Stop recording';notice('Recording without the interface. Tap Stop recording to save.');
  }
};
App.start();
