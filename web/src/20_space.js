/* Space: CPU twin of shared/shaders/space.glsl. Keep the two in lockstep (and Android's Space.kt).
   The display folds screen→sheet; the brush maps the finger through the same function, so ink appears
   exactly under the touch and at every symmetric image. */
const TAU=Math.PI*2,PHI=(1+Math.sqrt(5))/2;
const mirror1=x=>1-Math.abs(((x%2)+2)%2-1);
const Space={
  spin:0,shift:[0,0],mobA:0,phase:[0,0],poleT:0,orbT:0,cam:[0,0],pshift:[0,0],sph:[0,0],hypM:[0,0],mode:0,orbR:[1,0,0,0,1,0,0,0,1],
  u:{uLoop:48,uCam:[0,0],uPeriodic:0,uOrb:0,uPulse:0,uOrbM:[1,0,0,0,1,0,0,0,1],uMobBg:[0,0],uTilt:[0,0],uSpace:0,uRes:[1,1],uWorld:1,uSegs:6,uDepth:1,uSpin:0,uTile:1,uShift:[0,0],uHyp:[2,1.7,1,7],uHypOff:[.5,.5],uMob:[0,0],uSpiral:[.3,1.9,1,0],uSpiralPhase:[0,0],uPoles:[-.2,.1,.2,-.1]},
  hyperbolic(p,q){
    p=Math.round(p);q=Math.round(q);
    if((p-2)*(q-2)<=4)q=Math.floor(2+4/(p-2))+1;
    const sp=Math.sin(Math.PI/p),cp=Math.cos(Math.PI/p),cq=Math.cos(Math.PI/q);
    const cx=1/Math.sqrt(1-sp*sp/(cq*cq)),r=cx*sp/cq;
    const t=cx*cp-Math.sqrt(Math.max(cx*cx*cp*cp-1,0)),bx=t*cp,by=t*sp;
    const xm=Math.max(cx-r,bx),ym=by,s=.9/Math.max(xm,ym);
    return{hyp:[cx,r,s,p],off:[.5-xm*s/2,.5-ym*s/2],q};
  },
  update(P,dt,res,world,pulse,tl,rv,zp){
    tl=tl||[0,0];rv=rv||[0,0,0];zp=zp||0;this.u.uPulse=zp;
    const u=this.u,k=1+pulse;
    this.spin+=P.spin*dt*k;
    const d=P.drift*k;
    this.shift[0]+=d*dt*.13;this.shift[1]+=d*dt*.071;
    this.mobA+=dt*.23*Math.sign(d||1);
    this.phase[0]+=d*dt*.5;this.phase[1]-=d*dt*.35;
    this.poleT+=dt*(.05+Math.abs(d)*.08);
    u.uSpace=P.space|0;u.uRes=res;u.uWorld=world;u.uSegs=P.kal;u.uDepth=P.foldDepth;u.uSpin=this.spin;u.uTile=P.tile;
    /* Canvas: 0 Window (tilt leans the picture), 1 Infinite (tilt is a joystick: the camera scrolls for ever over a world that
       repeats), 2 Wrap (tilt looks around a finite world whose edges wrap). A ball always takes the tilt itself. */
    const cvs=P.cvs|0,mode=P.orb>0?0:cvs;this.mode=mode;u.uPeriodic=cvs?1:0;
    const pos=mode===1?[0,0]:tl;   // position-like tilt (Window and Wrap)
    if(mode===1&&dt>0){
      const sp=(P.cspd||1)*.45,vx=tl[0]*sp,vy=tl[1]*sp,sh=Math.min(res[0],res[1]),c=Math.cos(this.spin),s=Math.sin(this.spin),tile=Math.max(P.tile,.05);
      this.cam[0]=(this.cam[0]+vx*dt*sh/res[0]/world)%1;this.cam[1]=(this.cam[1]+vy*dt*sh/res[1]/world)%1;
      this.pshift[0]+=(c*vx-s*vy)*dt/tile;this.pshift[1]+=(s*vx+c*vy)*dt/tile;
      this.sph[0]+=vx*dt*.7;this.sph[1]+=vy*dt*.7;
      // hyperbolic: add a small hyperbolic translation to where we stand (Möbius addition keeps us inside the disk)
      const dx=vx*dt*.9,dy=vy*dt*.9,[mx,my]=this.hypM,nx=mx+dx,ny=my+dy,ex=1+dx*mx+dy*my,ey=dx*my-dy*mx,dd=Math.max(ex*ex+ey*ey,1e-9);
      let hx=(nx*ex+ny*ey)/dd,hy=(ny*ex-nx*ey)/dd;const hl=Math.hypot(hx,hy);if(hl>.86){hx*=.86/hl;hy*=.86/hl}this.hypM=[hx,hy];
    }
    const pr=(1-1/Math.max(world,1))/2*.9;
    u.uCam=mode===1?this.cam:mode===2?[tl[0]*pr,tl[1]*pr]:[0,0];
    const hw=mode?0:([.9,.6,.5,.3,.4,.4][u.uSpace]||.5)*(P.orb>0?.3:1);u.uTilt=[tl[0]*hw,tl[1]*hw];
    u.uShift=u.uSpace===2?(mode===1?[this.shift[0]+this.pshift[0],this.shift[1]+this.pshift[1]]:[this.shift[0]+pos[0]*.35,this.shift[1]+pos[1]*.35]):this.shift;
    if(u.uSpace===3){const h=this.hyperbolic(P.hp,P.hq);u.uHyp=h.hyp;u.uHypOff=h.off;const m=Math.min(.62,Math.abs(P.drift)*.7);
      const lim=(x,y)=>{const l=Math.hypot(x,y);return l>.86?[x*.86/l,y*.86/l]:[x,y]};
      const amb=lim(m*Math.cos(this.mobA),m*Math.sin(this.mobA));
      let bg;if(mode===1){const[hx,hy]=this.hypM,[ax,ay]=amb,nx=ax+hx,ny=ay+hy,ex=1+hx*ax+hy*ay,ey=hx*ay-hy*ax,dd=Math.max(ex*ex+ey*ey,1e-9);bg=lim((nx*ex+ny*ey)/dd,(ny*ex-nx*ey)/dd)}
      else bg=lim(amb[0]+pos[0]*.55,amb[1]+pos[1]*.55);
      u.uMobBg=bg;u.uMob=P.orb>0?amb:bg}   // tilting walks you through the tiling; round a ball it turns the ball instead (the backdrop still walks)
    this.orb(P,dt,res,rv);
    const g=Math.max(1.01,P.growth),lnS=Math.log(g);u.uSpiral=[lnS/TAU,lnS,Math.max(1,Math.round(P.arms)),0];u.uSpiralPhase=mode===1?[this.phase[0]+this.sph[0],this.phase[1]+this.sph[1]]:[this.phase[0]+pos[0]*.6,this.phase[1]+pos[1]*.6];
    const ar=res[0]/res[1],gx=(.5-1/PHI/PHI)*Math.max(ar,1),gy=(.5-1/PHI/PHI)*Math.max(1/ar,1),w=this.poleT;
    u.uPoles=[-gx+.03*Math.cos(w),gy+.03*Math.sin(w*1.3),gx+.03*Math.cos(w*.8+2),-gy+.03*Math.sin(w+1)];
  },
  /* The ball: radius from the Ball setting; it turns by itself (a slowly wandering axis) and with the tilt. */
  orb(P,dt,res,rv){
    const u=this.u;
    if(!(P.orb>0)){u.uOrb=0;return}
    u.uOrb=(.2+.3*P.orb)*(1+u.uPulse*1.2);
    const t=this.orbT+=dt,sg=(P.spin<0||P.drift<0)?-1:1,w=sg*(.1+Math.abs(P.spin)*.7+Math.abs(P.drift)*.25)*dt;
    // spin about a wandering axis, applied in view space
    const ax=Math.sin(t*.13)*.45,ay=1,az=Math.cos(t*.09)*.3;
    this.orbR=matMul(rodrigues(ax*w,ay*w,az*w),this.orbR);
    const R=matMul(rodrigues(rv[0],rv[1],rv[2]),this.orbR);
    this.orbV=R;u.uOrbM=R;   // row-major R handed over as column-major is R transposed: view normal -> body normal
  },
  /* Render-pixel (y up) → sheet coordinates before the mirror fold. Mirrors spaceMap() in GLSL. */
  map(fx,fy){
    const u=this.u,R=u.uRes,sh=Math.min(R[0],R[1]);
    let qx=(fx-.5*R[0])/sh,qy=(fy-.5*R[1])/sh;
    if(u.uOrb>0){
      const bx=qx/u.uOrb,by=qy/u.uOrb,r2=bx*bx+by*by;
      if(r2<1){
        const nz=Math.sqrt(1-r2),M=u.uOrbM,nx=M[0]*bx+M[3]*by+M[6]*nz,ny=M[1]*bx+M[4]*by+M[7]*nz,nzz=M[2]*bx+M[5]*by+M[8]*nz,d=Math.max(1+nzz,1e-3);
        return u.uSpace===3?this.hyper(nx/d,ny/d,u.uMob):this.flat(nx/d*.5,ny/d*.5);
      }
    }
    qx*=1-u.uPulse;qy*=1-u.uPulse;
    {const dn=Math.max(.3,1+qx*u.uTilt[0]+qy*u.uTilt[1]);qx/=dn;qy/=dn}
    return this.flat(qx,qy);
  },
  /* Poincaré disk point (unit disk; the outside is mirrored in) through the {p,q} fold. */
  hyper(x,y,mob){
    const u=this.u;
    const r2=x*x+y*y;if(r2>1){x/=r2;y/=r2}
    const[ax,ay]=mob;let nx=x-ax,ny=y-ay,dx=1-(ax*x+ay*y),dy=-(ax*y-ay*x);const dd=Math.max(dx*dx+dy*dy,1e-12);
    x=(nx*dx+ny*dy)/dd;y=(ny*dx-nx*dy)/dd;
    const[cx,cr,s,p]=u.uHyp,w=TAU/p,cr2=cr*cr;
    for(let i=0;i<48;i++){let m=((Math.atan2(y,x)%w)+w)%w;if(m>w*.5)m=w-m;const l=Math.hypot(x,y);x=l*Math.cos(m);y=l*Math.sin(m);
      const ex=x-cx,ey=y,d2=ex*ex+ey*ey;if(d2>=cr2)break;x=cx+ex*cr2/d2;y=ey*cr2/d2}
    return[u.uHypOff[0]+x*s,u.uHypOff[1]+y*s];
  },
  /* Plane point (short-side units, already tilted) → sheet. */
  flat(qx,qy){
    const u=this.u,R=u.uRes,sh=Math.min(R[0],R[1]);
    const rot=(x,y,a)=>{const c=Math.cos(a),s=Math.sin(a);return[c*x-s*y,s*x+c*y]};
    const sheet=(x,y)=>[.5+x*sh/R[0]/u.uWorld,.5+y*sh/R[1]/u.uWorld],add=p=>[p[0]+u.uCam[0],p[1]+u.uCam[1]];
    switch(u.uSpace){
      case 1:{[qx,qy]=rot(qx,qy,u.uSpin);const w=TAU/Math.max(2,Math.floor(u.uSegs));let r=Math.hypot(qx,qy),a=Math.atan2(qy,qx);
        for(let j=0;j<5&&j<u.uDepth;j++){const m=((a+j*w*.37)%w+w)%w;a=Math.abs(m-w*.5);if(j>0)r*=1.18}
        return add(sheet(r*Math.cos(a),r*Math.sin(a)))}
      case 2:{[qx,qy]=rot(qx,qy,u.uSpin);const t=Math.max(u.uTile,.05);let x=qx/t+.5+u.uShift[0],y=qy/t+.2887+u.uShift[1];
        for(let i=0;i<48;i++){let inside=true;if(y<0){y=-y;inside=false}
          let d=x*.8660254-y*.5;if(d<0){x-=2*d*.8660254;y+=2*d*.5;inside=false}
          d=(x-1)*-.8660254+y*-.5;if(d<0){x+=2*d*.8660254;y+=2*d*.5;inside=false}
          if(inside)break}
        return[.5+(x-.5)*.9,.5+(y-.2887)*.9]}
      case 3:{[qx,qy]=rot(qx,qy,u.uSpin);return this.hyper(qx/.48,qy/.48,u.uMobBg)}
      case 4:case 5:{let zx,zy;
        if(u.uSpace===5){const[a1,a2,b1,b2]=u.uPoles,nx=qx-a1,ny=qy-a2,dx=qx-b1,dy=qy-b2,dd=Math.max(dx*dx+dy*dy,1e-12);zx=(nx*dx+ny*dy)/dd;zy=(ny*dx-nx*dy)/dd}
        else[zx,zy]=rot(qx,qy,u.uSpin);
        const[k,lnS,arms]=u.uSpiral,lr=Math.log(Math.max(Math.hypot(zx,zy),1e-6)),th=Math.atan2(zy,zx),s=lr-k*th;
        return[arms*s/(Math.PI*k)+u.uSpiralPhase[0],2*lr/(lnS*Math.max(u.uTile,.05))+u.uSpiralPhase[1]]}
    }
    return add(sheet(qx,qy));
  },
  uv(fx,fy){const m=this.map(fx,fy),u=this.u;return u.uPeriodic&&u.uSpace<2?[fract(m[0]),fract(m[1])]:[mirror1(m[0]),mirror1(m[1])]},
  /* Map a CSS-pixel brush sample. Returns sheet uv, local scale and the velocity carried into sheet space.
     Velocity (vx,vy) is screen-space, y up, in reference cells/s. */
  brush(x,y,vx,vy){
    const u=this.u,R=u.uRes,s=R[0]/VW(),fx=x*s,fy=R[1]-y*s,c=this.uv(fx,fy);
    if(u.uSpace===0)return{u:c[0],v:c[1],scale:1,vx,vy};
    const e=1.5,px=this.uv(fx+e,fy),py=this.uv(fx,fy+e);
    const kx=R[0]*u.uWorld/e,ky=R[1]*u.uWorld/e;
    const j00=(px[0]-c[0])*kx,j01=(py[0]-c[0])*kx,j10=(px[1]-c[1])*ky,j11=(py[1]-c[1])*ky;
    const det=Math.abs(j00*j11-j01*j10),scale=Math.sqrt(det);
    if(!isFinite(scale)||!isFinite(j00+j01+j10+j11))return{u:c[0],v:c[1],scale:1,vx,vy};
    /* Tilings (prism, hyperbolic) and spirals can squeeze a whole tile into a few pixels. The stamp stays small
       enough to read as a mark inside one tile, and the carried velocity keeps its direction with a bounded speed. */
    let ox=j00*vx+j01*vy,oy=j10*vx+j11*vy;const m=Math.hypot(ox,oy),cap=Math.hypot(vx,vy)*clamp(scale,.4,2);
    if(m>cap&&m>0){ox*=cap/m;oy*=cap/m}
    return{u:c[0],v:c[1],scale:clamp(scale,.25,1.5),vx:ox,vy:oy};
  }
};
/* 3x3 row-major helpers for the ball's orientation. */
function matMul(a,b){const o=new Array(9);for(let i=0;i<3;i++)for(let j=0;j<3;j++)o[i*3+j]=a[i*3]*b[j]+a[i*3+1]*b[3+j]+a[i*3+2]*b[6+j];return o}
function rodrigues(x,y,z){
  const a=Math.hypot(x,y,z);if(a<1e-6)return[1,0,0,0,1,0,0,0,1];
  const kx=x/a,ky=y/a,kz=z/a,c=Math.cos(a),s=Math.sin(a),t=1-c;
  return[c+kx*kx*t,kx*ky*t-kz*s,kx*kz*t+ky*s, ky*kx*t+kz*s,c+ky*ky*t,ky*kz*t-kx*s, kz*kx*t-ky*s,kz*ky*t+kx*s,c+kz*kz*t];
}
