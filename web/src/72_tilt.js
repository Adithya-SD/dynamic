/* Tilt: one 2D vector that says "which way is downhill", from the phone's gyroscope or, on a computer, from where the
   mouse hovers over the picture. It tilts the world in 3D (perspective on every space; in hyperbolic space it walks you
   through the tiling), steers the echo tunnel, and makes the fluid run downhill.
   Tilt.x: right is positive. Tilt.y: down is positive (screen coordinates). Both ease towards the target. */
const Tilt={
  x:0,y:0,tx:0,ty:0,b0:null,src:'',seen:0,away:true,hover:false,
  init(){
    // Phone: orientation relative to how you are holding it; the neutral pose slowly follows your grip.
    addEventListener('deviceorientation',e=>this.feed(e.gamma,e.beta),true);
    // Android shell: the accelerometer is read natively and pushed in (a file:// page may not get orientation events).
    if(NATIVE||WATCH)window.__nativeTilt=(ax,ay,az)=>{const g=Math.hypot(ax,ay,az)||1;this.feed(Math.asin(clamp(-ax/g,-1,1))*57.2958,90-Math.atan2(az,ay)*57.2958)};
    // iOS asks for permission once, from a tap.
    const D=window.DeviceOrientationEvent;
    if(D&&typeof D.requestPermission==='function')addEventListener('pointerdown',()=>{D.requestPermission().catch(()=>{})},{once:true,capture:true});
    // Computer: the mouse over the picture.
    cv.addEventListener('pointermove',e=>{
      if(e.pointerType!=='mouse'||e.buttons)return;   // hovering only: dragging is for drawing
      this.tx=clamp((e.clientX/VW()-.5)*2,-1,1);this.ty=clamp((e.clientY/VH()-.5)*2,-1,1);
      this.src='mouse';this.seen=performance.now();this.hover=true;this.away=false;
    });
    document.addEventListener('mouseleave',()=>{if(this.src==='mouse'){this.tx=this.ty=0;this.hover=false}});
    addEventListener('blur',()=>{if(this.src==='mouse'){this.tx=this.ty=0}});
  },
  /* gamma: left-right roll, beta: front-back pitch, both in degrees, device frame (as the W3C event gives them). */
  feed(gamma,beta){
    if(gamma==null||beta==null||!isFinite(gamma+beta))return;
    const ang=((screen.orientation&&screen.orientation.angle)||window.orientation||0)|0;
    if(this.b0==null)this.b0=[0,beta>45?65:20];   // upright reading vs lying flat
    const gy=beta-this.b0[1];
    this.b0[1]+=(beta-this.b0[1])*.004;            // ~4 s to re-centre
    let x=gamma,y=gy;
    if(ang===90){x=gy;y=-gamma}else if(ang===270||ang===-90){x=-gy;y=gamma}else if(ang===180){x=-gamma;y=-gy}
    this.tx=clamp(x/40,-1,1);this.ty=clamp(y/40,-1,1);this.src='gyro';this.seen=performance.now();this.away=false;
  },
  frame(dt){
    const k=1-Math.exp(-dt/.14);
    this.x+=(this.tx-this.x)*k;this.y+=(this.ty-this.y)*k;
  },
  /* Tilt for the scene: [x right, y up], scaled and optionally reversed. */
  get(P){const s=(P.tilt||0)*(P.tinv?-1:1);return[this.x*s,-this.y*s]},
  /* Downhill force on the fluid, in the units of Wind and Gravity. */
  pour(P){const s=(P.tflow||0)*50*(P.tinv?-1:1);return[this.x*s,-this.y*s]}
};
