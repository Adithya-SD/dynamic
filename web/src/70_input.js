/* Input: fingers, holds, taps, automatic paths and music. Everything enters the fluid through emit(),
   which applies stroke copies in screen space and then maps each copy through the active space. */
const GOLDEN_ANGLE=Math.PI*(3-Math.sqrt(5));
const Input={
  ptr:new Map(),taps:[],emitAt:[-1,-1],seed:0,phyllo:0,gv:[0,0],
  down(){return this.ptr.size>0},
  init(){
    cv.addEventListener('pointerdown',e=>{
      UI.lastInput=performance.now();
      if(UI.hidden||UI.dissolving&&UI.dissolve>.3){UI.wake();return}
      if(UI.open&&UI.touch){UI.shut()}
      if(!this.ptr.size)Engine.snapshot();
      cv.setPointerCapture(e.pointerId);
      const id=++strokeCount;this.ptr.set(e.pointerId,{x:e.clientX,y:e.clientY,fx:e.clientX,fy:e.clientY,o:Math.random()*6,t:0,h:0,id});
      this.taps.push([e.clientX,e.clientY,(Math.random()-.5)*900,(Math.random()-.5)*900,Math.random()*6,id]);morph=null;
    });
    cv.addEventListener('pointermove',e=>{const p=this.ptr.get(e.pointerId);if(p){p.x=e.clientX;p.y=e.clientY;UI.lastInput=performance.now()}});
    const up=e=>{this.ptr.delete(e.pointerId);UI.lastInput=performance.now()};
    cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
    addEventListener('contextmenu',e=>{if(e.target===cv)e.preventDefault()});
    addEventListener('devicemotion',e=>{const a=e.accelerationIncludingGravity;if(a)this.gv=[this.gv[0]*.9+(a.x||0)*.1,this.gv[1]*.9+(a.y||0)*.1]});
  },
  /* Screen point (CSS px, y down) with screen velocity (y up). */
  emit(x,y,vx,vy,rgb,r){
    const n=Math.max(1,P.sym|0),cx=VW()/2,cy=VH()/2,w2=1/(Engine.world*Engine.world);
    for(let k=0;k<n;k++){const a=TAU*k/n,c=Math.cos(a),s=Math.sin(a);
      for(let m=0;m<=(P.mir?1:0);m++){
        const f=m?-1:1,X=(x-cx)*f,Y=(cy-y),U=vx*f,
          px=cx+X*c-Y*s,py=cy-(X*s+Y*c),pvx=U*c-vy*s,pvy=U*s+vy*c;
        if(px<-VW()*.3||px>VW()*1.3||py<-VH()*.3||py>VH()*1.3)continue;
        const b=Space.brush(px,py,pvx,pvy);
        Engine.stamp(b.u,b.v,b.vx,b.vy,rgb,r*b.scale*b.scale*w2,P.ink);
        this.emitAt=[b.u,b.v];
      }}
  },
  radius(){const a=VW()/VH();return P.rad/100*Math.max(a,1)},
  frame(dt){
    const r=this.radius(),M=Math.max(VW(),VH());
    for(let i=0;i<10&&this.taps.length;i++){const q=this.taps.shift();this.emit(q[0],q[1],q[2],q[3],inkColor(q[4],Math.hypot(q[2],q[3]),q[0]/VW(),1-q[1]/VH(),q[5]),r)}
    for(const p of this.ptr.values()){
      const dx=p.x-p.fx,dy=p.y-p.fy,d=Math.hypot(dx,dy);
      if(d<1.5){p.t+=dt;if(p.t>.1)this.hold(p,dt,r);continue}
      p.t=p.h=0;
      const w=Math.ceil(d/Math.max(4,Math.sqrt(r)*VH()*.6)),k=Math.min(w,48),rs=r*Math.min(2.5,w/k),cs=Math.min(1,1.6/k);
      const vx=dx/M*P.frc,vy=-dy/M*P.frc,sp=Math.hypot(vx,vy);
      for(let i=1;i<=k;i++){const x=p.fx+dx*i/k,y=p.fy+dy*i/k;this.emit(x,y,vx/k,vy/k,inkColor(p.o,sp,x/VW(),1-y/VH(),p.id).map(z=>z*cs),rs)}
      p.fx=p.x;p.fy=p.y;
    }
    if(P.auto>0&&!App.paused)this.auto(dt,r);
  },
  hold(p,dt,r){
    p.h=Math.min(p.h+dt,3);const g=p.h/3,m=P.hd|0;let ax=0,ay=0;
    if(m===1)ay=1;else if(m===2)ay=-1;else if(m===3){const l=Math.hypot(...this.gv);if(l>1){ax=-this.gv[0]/l;ay=-this.gv[1]/l}else ay=-1}
    else if(m===4){ax=Math.cos(clock*5);ay=Math.sin(clock*5)}else{const a=clock*4+p.o;ax=Math.cos(a)*.5;ay=Math.sin(a)*.5}
    const f=P.hf*P.frc*.01*(.6+g*1.2)*dt*60;
    this.emit(p.x,p.y,ax*f,ay*f,inkColor(p.o,120,p.x/VW(),1-p.y/VH(),p.id).map(z=>z*.6*dt*60),r*(1+g*.75));
  },
  /* Automatic paths. Wander: Lissajous loops. Phyllotaxis: seeds at the golden angle, r ∝ √n.
     Orbit: three bodies on Kepler orbits, speed ∝ r^-1.5. */
  auto(dt,r){
    const W=VW(),H=VH(),S=Math.min(W,H),M=Math.max(W,H),k=P.frc*P.auto*musicSpeed;
    if(P.amode===1){
      this.phyllo+=dt*(14+30*P.auto)*musicSpeed;
      while(this.phyllo>=1){this.phyllo--;const n=++this.seed%377,a=n*GOLDEN_ANGLE+clock*.05,rad=S*.46*Math.sqrt(n/377);
        const x=W/2+Math.cos(a)*rad,y=H/2-Math.sin(a)*rad,f=k*.04;
        this.emit(x,y,Math.cos(a)*f,Math.sin(a)*f,inkColor(n,90,x/W,1-y/H,n),r*.7)}
      return;
    }
    for(let i=0;i<3;i++){
      let a,b;
      if(P.amode===2){const R=S*(.16+.1*i),w=.9*Math.pow(.16/(.16+.1*i),1.5),t=clock*w+i*2.1;a=[W/2+Math.cos(t)*R,H/2-Math.sin(t)*R];b=[W/2+Math.cos(t-dt*w)*R,H/2-Math.sin(t-dt*w)*R]}
      else{const pos=t=>[W*(.5+.36*Math.sin(t*(.31+.07*i)+i*2.1)),H*(.5+.34*Math.sin(t*(.39+.085*i)+i*1.3))];a=pos(clock);b=pos(clock-dt)}
      this.emit(a[0],a[1],(a[0]-b[0])/M*k*4,-(a[1]-b[1])/M*k*4,inkColor(i*2.1,80,a[0]/W,1-a[1]/H,i+1).map(z=>z*dt*60),r);
    }
  }
};

/* Music: 24 log-spaced bands. Band i circles at radius ∝ i (bass at the centre, treble at the rim);
   loudness sets how fast and how hard it pushes. Onsets fire independent bursts, no fixed tempo. */
let musicSpeed=1;
const audio=new DynamicsAudio();
const Music={
  levels:new Float32Array(24),angles:new Float64Array(24),prev:Array(24).fill(null),events:[],last:0,energy:0,bass:0,beat:0,
  init(){
    audio.onBands=d=>this.ingest(d.levels,d.onsets);
    if(NATIVE){window.__nativeBands=(l,o)=>this.ingest(l,o);window.__nativeAudio=(on,text)=>{this.native=on;UI.audioStatus.textContent=text;[...UI.srcBtns.children].forEach(b=>b.classList.toggle('on',on?b.dataset.kind==='desktop':b.dataset.kind==='off'))}}
    audio.onState=s=>{const ok=['mic','desktop','file','stream'].includes(s.state);UI.audioStatus.textContent=s.state==='error'?s.detail:ok?{mic:'Listening to the microphone',desktop:'Listening to shared audio',file:'Playing your file',stream:'Playing the stream'}[s.state]+(s.detail?.degraded?' (analyser fallback, slower)':''):'Pick a source. Low notes draw near the centre, high notes near the edge; loudness drives the motion.';
      [...UI.srcBtns.children].forEach(b=>b.classList.toggle('on',b.dataset.kind===(ok?s.state:'off')));UI.fileRow.hidden=!['file','stream'].includes(s.state)};
  },
  native:false,
  active(){return this.native||['mic','desktop','file','stream'].includes(audio.state)},
  ingest(levels,onsets){this.levels.set(levels);this.last=performance.now();for(let b=0;b<24;b++)if(onsets[b]>0)this.events.push([b,onsets[b]]);if(this.events.length>256)this.events.splice(0,this.events.length-256)},
  frame(dt){
    const live=performance.now()-this.last<250;
    if(!live)for(let i=0;i<24;i++)this.levels[i]*=Math.exp(-dt*8);
    let e=0,bass=0;const W=VW(),H=VH(),S=Math.min(W,H),r=Input.radius();
    for(let i=0;i<24;i++){
      const lv=Math.min(1,this.levels[i]*P.msn);e+=lv;if(i<5)bass+=lv/5;
      this.angles[i]+=dt*(.18+lv*2.4)*P.aspeed;
      const R=S*(.025+.42*i/23),a=this.angles[i]+i*GOLDEN_ANGLE,pt=[W/2+Math.cos(a)*R,H/2-Math.sin(a)*R],pv=this.prev[i];
      if(lv>.02&&!App.paused&&P.aring>0){
        const n=pv?Math.max(1,Math.min(4,Math.ceil(Math.hypot(pt[0]-pv[0],pt[1]-pv[1])/10))):1,f=lv*P.frc*.009*P.aring*dt*60/n;
        for(let k=1;k<=n;k++){const t=k/n,x=pv?pv[0]+(pt[0]-pv[0])*t:pt[0],y=pv?pv[1]+(pt[1]-pv[1])*t:pt[1];
          Input.emit(x,y,-Math.sin(a)*f,Math.cos(a)*f,inkColor(i,lv*180,x/W,1-y/H,i).map(z=>z*.28*lv*dt*60/n*P.aring),r*.22)}
      }
      this.prev[i]=pt;
    }
    this.energy=e/24;this.bass=bass;this.beat*=Math.exp(-dt/.14);
    let n=0;
    while(this.events.length&&n++<64){const[b,s]=this.events.shift(),lv=Math.min(1,s*P.msn);this.beat=Math.max(this.beat,lv);
      if(!P.bpu||App.paused)continue;
      const a=this.angles[b]+b*GOLDEN_ANGLE,R=S*(.025+.42*b/23),x=W/2+Math.cos(a)*R,y=H/2-Math.sin(a)*R,f=P.frc*.013*lv*P.abeat;
      Input.emit(x,y,Math.cos(a)*f,Math.sin(a)*f,inkColor(b,150,x/W,1-y/H,b).map(z=>z*.2*lv),r*.3)}
    musicSpeed=live?1+this.energy*.6:1;
    if(UI.bands&&!UI.bands.hidden&&UI.open)for(let i=0;i<24;i++)UI.bands.children[i].style.setProperty('--l',Math.min(1,this.levels[i]*P.msn).toFixed(3));
  }
};
/* Spotify: official PKCE login in a browser; on Android the phone's own media session (no account login). */
const spotify=NATIVE?{configure(){},connect:async()=>NATIVE.openNotificationAccess(),disconnect(){},completeRedirect:async()=>{},transport:async(a,p)=>NATIVE.spotify(a,p||0)}:new DynamicsSpotify(s=>UI&&UI.spotifyState(s));
if(NATIVE)window.__nativeSpotify=s=>UI&&UI.spotifyState(s);
