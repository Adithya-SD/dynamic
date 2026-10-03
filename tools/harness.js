/* Dev harness, loaded only with ?dev. Drives frames deterministically and posts snapshots to tools/dev_server.py. */
window.H={
  grab(){return Engine.capture(P,App.look,UI.glass(Engine.res[0]/innerWidth))},
  run(n,fn){let t=App.last;for(let i=0;i<n;i++){t+=1000/60;fn&&fn(i/n);App.tick(t)}},
  async snap(name,w=640){
    const src=this.grab(),c=document.createElement('canvas');c.width=w;c.height=Math.round(w*src.height/src.width);
    c.getContext('2d').drawImage(src,0,0,c.width,c.height);
    const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.85));
    await fetch('/shot?name='+encodeURIComponent(name),{method:'POST',body:b});return name;
  },
  stroke(frames=60,path='eight'){
    const W=innerWidth,H=innerHeight,S=Math.min(W,H);
    const paths={eight:t=>[W/2+Math.sin(t*6.283)*S*.32,H/2+Math.sin(t*12.566)*S*.16],line:t=>[W*(.2+.6*t),H*(.45+.1*Math.sin(t*9))],spiral:t=>[W/2+Math.cos(t*15)*S*.4*t,H/2+Math.sin(t*15)*S*.4*t]};
    const pos=paths[path],p={o:1.3,t:0,h:0,id:++strokeCount};[p.x,p.y]=pos(0);p.fx=p.x;p.fy=p.y;Input.ptr.set(-7,p);
    this.run(frames,t=>{[p.x,p.y]=pos(t)});Input.ptr.delete(-7);
  },
  prep(name){const i=allPresets().findIndex(x=>x.n===name);if(i<0)throw Error('no preset '+name);applyPreset(i);Engine.clear();Space.spin=0;Space.shift=[0,0];Space.phase=[0,0];UI.hidden=UI.dissolving=false;UI.dissolve=0;UI.applyFade();this.uh=P.uh;P.uh=0},
  async show(name,{frames=50,after=40,path='eight',tag=''}={}){
    this.prep(name);this.stroke(frames,path);this.run(after);P.uh=this.uh;
    this.run(1);return this.snap((tag||name).replace(/\W+/g,'_'));
  },
  async all(names,opt){const out=[];for(const n of names)out.push(await this.show(n,opt));return out}
};
/* Contact sheet: render each preset after the same stroke and tile them into one labelled image. */
H.sheet=async function(names,{name='sheet',cols=4,w=300,frames=50,after=40,path='eight',fn}={}){
  const rows=Math.ceil(names.length/cols),h=Math.round(w*cv.height/cv.width),c=document.createElement('canvas');c.width=cols*w;c.height=rows*h;const x=c.getContext('2d');
  x.fillStyle='#000';x.fillRect(0,0,c.width,c.height);x.font='600 13px system-ui';x.textBaseline='top';
  names.forEach((n,i)=>{this.prep(n);fn&&fn(n);this.stroke(frames,path);this.run(after);P.uh=this.uh;this.run(1);
    const cx=(i%cols)*w,cy=Math.floor(i/cols)*h;x.drawImage(this.grab(),cx,cy,w,h);x.fillStyle='#000a';x.fillRect(cx,cy,w,20);x.fillStyle='#fff';x.fillText(n,cx+6,cy+4)});
  const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.85));await fetch('/shot?name='+name,{method:'POST',body:b});return name;
};
H.curated=()=>allPresets().filter(p=>p.c!=='Classic'&&p.c!=='Mine').map(p=>p.n);
/* Per-stage GPU cost (gl.finish between stages). */
H.profile=function(n=20){
  const t={},f=(k,fn)=>{gl.finish();const a=performance.now();fn();gl.finish();t[k]=(t[k]||0)+(performance.now()-a)/n};
  const field={mode:P.field|0,str:P.fs*500,g:[P.wx,P.wy],time:clock},L=App.look,glass=UI.glass(Engine.res[0]/innerWidth);
  for(let i=0;i<n;i++){
    f('stamps',()=>{Input.taps.push([innerWidth/2,innerHeight/2,300,200,1,1]);Input.frame(1/60);Engine.flushStamps(P.bt)});
    f('step',()=>Engine.step(1/60,P,field));
    f('particles',()=>Engine.particles(1/60,P,[0,0,0,0],clock,paletteUniforms(),false));
    f('render',()=>Engine.render(P,L,glass,true));
  }
  for(const k in t)t[k]=+t[k].toFixed(2);t.total=+Object.values(t).reduce((a,b)=>a+b,0).toFixed(2);
  return{res:Engine.res,sim:Engine.sim,ink:Engine.ink,preset:allPresets()[current].n,...t};
};
/* Brightness statistics of the clean frame: mean luma, 99th percentile, share of near-white pixels. */
H.stats=function(){
  const src=this.grab(),w=160,h=Math.max(1,Math.round(w*src.height/src.width)),c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(src,0,0,w,h);
  const d=x.getImageData(0,0,w,h).data,l=new Float32Array(w*h);let sum=0,hot=0;
  for(let i=0;i<w*h;i++){const v=(d[i*4]*.299+d[i*4+1]*.587+d[i*4+2]*.114)/255;l[i]=v;sum+=v;if(v>.9)hot++}
  l.sort();return{mean:sum/(w*h),p99:l[Math.floor(w*h*.99)],hot:hot/(w*h)};
};
/* For each preset: run the standard stroke once, then solve for the exposure (glw) that gives mean luma ≈ target
   without a clipped highlight. Exposure only affects the display pass, so this re-renders but does not re-simulate. */
H.calibrate=async function(names,{target=.15,p99max=.96,frames=50,after=40}={}){
  const out={};
  for(const n of names){
    this.prep(n);this.stroke(frames);this.run(after);P.uh=this.uh;this.run(1);
    const at=g=>{P.glw=g;App.look.exposure=g;return this.stats()};
    let lo=.5,hi=3,best=null;
    for(let i=0;i<9;i++){const m=Math.sqrt(lo*hi),s=at(m);if(s.mean>target||s.p99>p99max)hi=m;else lo=m}
    best=lo;const s=at(best);out[n]={glw:+best.toFixed(2),mean:+s.mean.toFixed(3),p99:+s.p99.toFixed(2),hot:+s.hot.toFixed(3)};
  }
  return out;
};
