/* Tilt: how far the device (or the mouse) has been turned away from where you were holding it, as a rotation.
   Phone and watch: the full orientation (a quaternion), so it works in any pose, upside down included. The neutral
   pose slowly follows your grip, so the picture always settles back to the middle wherever you hold the device.
   Computer: the mouse over the picture stands in for the gyroscope.
   Outputs (all eased through a heavy spring, so it feels like it has weight):
     Tilt.x / Tilt.y  flat tilt, -1..1, x right, y down (screen coordinates): perspective, tunnel, fluid pour
     Tilt.rv          the same turn as a rotation vector in radians [about x, about y, about z]: the orb rolls with it */
const Tilt={
  x:0,y:0,rv:[0,0,0],s:[0,0,0],v:[0,0,0],t:[0,0,0],qc:null,qr:null,src:'',seen:0,away:true,hover:false,
  init(){
    // Phone browser: the W3C orientation event; the rotation matrix it describes has no gimbal lock.
    addEventListener('deviceorientation',e=>this.feedEuler(e.alpha,e.beta,e.gamma),true);
    // Android shells: the game rotation vector is read natively and pushed in as a quaternion (a file:// page may get no events);
    // the accelerometer is the fallback for devices without one.
    if(NATIVE||WATCH){
      window.__nativeQuat=(x,y,z,w)=>this.feedQuat([x,y,z,w]);
      window.__nativeTilt=(ax,ay,az)=>this.feedGravity(ax,ay,az);
    }
    // iOS asks for permission once, from a tap.
    const D=window.DeviceOrientationEvent;
    if(D&&typeof D.requestPermission==='function')addEventListener('pointerdown',()=>{D.requestPermission().catch(()=>{})},{once:true,capture:true});
    // Turning the screen round changes what "left" means: start again from the new pose.
    const re=()=>{this.qr=null};
    if(screen.orientation&&screen.orientation.addEventListener)screen.orientation.addEventListener('change',re);else addEventListener('orientationchange',re);
    // Computer: the mouse over the picture.
    cv.addEventListener('pointermove',e=>{
      if(e.pointerType!=='mouse'||e.buttons)return;   // hovering only: dragging is for drawing
      const mx=clamp((e.clientX/VW()-.5)*2,-1,1),my=clamp((e.clientY/VH()-.5)*2,-1,1);
      this.t=[my*1.25,mx*1.25,0];this.src='mouse';this.seen=performance.now();this.hover=true;this.away=false;
    });
    document.addEventListener('mouseleave',()=>{if(this.src==='mouse'){this.t=[0,0,0];this.hover=false}});
    addEventListener('blur',()=>{if(this.src==='mouse'){this.t=[0,0,0]}});
  },
  /* Quaternions are [x,y,z,w]; q maps device vectors to the world. */
  feedEuler(a,b,g){
    if(b==null||g==null||!isFinite(b+g))return;
    const r=Math.PI/180,h=(d,ax)=>{const s=Math.sin(d*r/2),c=Math.cos(d*r/2);return[ax===0?s:0,ax===1?s:0,ax===2?s:0,c]};
    this.feedQuat(qmul(qmul(h(a||0,2),h(b,0)),h(g,1)));
  },
  feedGravity(ax,ay,az){
    const l=Math.hypot(ax,ay,az);if(!(l>1))return;
    // Device-frame "down" is minus the measured acceleration. Shortest turn from there to the world's down (0,0,-1).
    const gx=-ax/l,gy=-ay/l,gz=-az/l,cx=gy*-1-gz*0,cy=gz*0-gx*-1,cz=0,d=-gz;   // cross(g, down), dot(g, down)
    let q;
    if(d<-.9999)q=[1,0,0,0];else{q=[cx,cy,cz,1+d];const n=Math.hypot(...q);q=q.map(v=>v/n)}
    this.feedQuat(q);
  },
  feedQuat(q){
    if(!(q[0]*q[0]+q[1]*q[1]+q[2]*q[2]+q[3]*q[3]>.5)||q.some(v=>!isFinite(v)))return;
    this.qc=q;this.src='gyro';this.seen=performance.now();this.away=false;
    if(!this.qr)this.qr=q.slice();
  },
  frame(dt){
    dt=Math.min(dt,.05);
    if(this.src==='gyro'&&this.qc){
      // The neutral pose follows the device, slowly: hold a tilt and the picture drifts back to the middle.
      const k=1-Math.exp(-dt/4.5),a=this.qr,b=this.qc,dot=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3],sg=dot<0?-1:1;
      const m=a.map((v,i)=>v+(b[i]*sg-v)*k),n=Math.hypot(...m);this.qr=m.map(v=>v/n);
      // Turn of the device since the neutral pose, in the neutral pose's own axes (so it means the same in any hold).
      let r=qmul(qconj(this.qr),b);if(r[3]<0)r=r.map(v=>-v);
      const sn=Math.hypot(r[0],r[1],r[2]),ang=2*Math.atan2(sn,r[3]),dead=.035,ea=Math.max(0,ang-dead),sat=1.15*Math.tanh(ea/1.15);
      const f=sn>1e-6?sat/sn:0;let u=[r[0]*f,r[1]*f,r[2]*f];
      // Landscape: the screen's right/down are not the device's.
      const o=((screen.orientation&&screen.orientation.angle)||window.orientation||0)|0,tx=u[1],ty=u[0];
      if(o===90)u=[tx,-ty,u[2]];else if(o===270||o===-90)u=[-tx,ty,u[2]];else if(o===180)u=[-ty,-tx,u[2]];
      this.t=[u[0],u[1],u[2]*.6];
    }
    // A heavy critically damped spring: it leans into the turn and settles back with some resistance.
    const w=this.src==='mouse'?8:6.5;
    for(let i=0;i<3;i++){const a=-w*w*(this.s[i]-this.t[i])-2*w*this.v[i];this.v[i]+=a*dt;this.s[i]+=this.v[i]*dt}
    this.x=Math.tanh(this.s[1]/1.05);this.y=Math.tanh(this.s[0]/1.05);this.rv=this.s;
  },
  /* Tilt for the scene: [x right, y up], scaled and optionally reversed. */
  get(P){const s=(P.tilt||0)*(P.tinv?-1:1);return[this.x*s,-this.y*s]},
  /* Downhill force on the fluid, in the units of Wind and Gravity. */
  pour(P){const s=(P.tflow||0)*50*(P.tinv?-1:1);return[this.x*s,-this.y*s]},
  /* The same turn as a rotation vector (radians) for the 3D orb. */
  rot(P){const s=(P.tilt||0)*(P.tinv?-1:1)*1.8;return[this.rv[0]*s,this.rv[1]*s,this.rv[2]*s]}
};
function qmul(a,b){return[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]]}
function qconj(a){return[-a[0],-a[1],-a[2],a[3]]}
