/* Eyes: where they look and what they feel. The drawing is in compose.frag (eyeAt); this decides the gaze target and
   the uniforms. Eyes look at your cursor while it moves or a finger is down, at the point you tilt towards on a phone,
   and wander on their own when nobody is there; with music they blink on the beat and the pupils widen on every kick.
   The target goes through the same space map as the brush, so eyes in a kaleidoscope, a tiling or on the ball all look
   at the right place in their own geometry. */
const Eyes={
  px:0,py:0,seen:-1e9,gx:0,gy:0,vx:0,vy:0,sx:0,sy:0,sacc:0,t:0,to:[.5,.5],
  off:{uEyeA:[0,0,0,0],uEyeB:[0,0,0,0],uEyeGrid:[1,1],uEyeTo:[.5,.5]},
  init(){
    const seen=e=>{this.px=e.clientX;this.py=e.clientY;this.seen=performance.now()};
    addEventListener('pointermove',seen,true);addEventListener('pointerdown',seen,true);
    this.gx=VW()/2;this.gy=VH()/2;
  },
  /* Call every frame before drawing. */
  frame(dt,E){
    if(!(E.eyes>0))return;
    const W=VW(),H=VH(),S=Math.min(W,H),now=performance.now();this.t+=dt;
    let tx,ty;
    const down=Input.ptr.size?[...Input.ptr.values()][0]:null;
    if(down){tx=down.x;ty=down.y}
    else if(now-this.seen<6000){tx=this.px;ty=this.py}
    else if(Tilt.src==='gyro'){tx=W/2+Tilt.x*S*.45;ty=H/2+Tilt.y*S*.45}
    else{tx=W/2+Math.sin(this.t*.31)*W*.28;ty=H/2+Math.cos(this.t*.23)*H*.22}
    // small quick glances, like real eyes
    if((this.sacc-=dt)<=0){this.sacc=.6+Math.random()*2;this.sx=(Math.random()-.5)*S*.07;this.sy=(Math.random()-.5)*S*.07}
    tx+=this.sx;ty+=this.sy;
    // a snappy critically damped spring: the gaze jumps to a new target, then settles
    const w=16,k=Math.min(dt,.04);
    for(const[a,b,v]of[['gx',tx,'vx'],['gy',ty,'vy']]){const acc=-w*w*(this[a]-b)-2*w*this[v];this[v]+=acc*k;this[a]+=this[v]*k}
    const res=Engine.res,fx=this.gx*res[0]/W,fy=res[1]-this.gy*res[1]/H;
    this.to=Space.map(fx,fy);
  },
  uniforms(E){
    if(!(E.eyes>0))return this.off;
    const res=Engine.res,sh=Math.min(res[0],res[1]),w=Engine.world,c=.3*E.esz;
    const M=Music,live=performance.now()-M.last<400;
    return{uEyeA:[E.eyes,E.elook,E.ebl,E.h],uEyeB:[E.eopen,live?M.beat:0,live?M.kick:0,clock],
      uEyeGrid:[1/(c*sh/res[0]/w),1/(c*sh/res[1]/w)],uEyeTo:this.to};
  }
};
