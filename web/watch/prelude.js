/* Wear OS host, part 1: what a browser would provide for the shared engine modules. The native side
   (wear/src/main/cpp/engine.c) supplies __gl (OpenGL ES 3 in WebGL2's shape) and __host (clock, files, events to the app).
   This file is only used in the watch bundle (tools/build_web.py → wear assets/engine.js). */
var window=globalThis,self=globalThis;
var __LEAN=true,__GEO_SIZE=512,__GEO_ANIM=256;   // pattern canvases are smaller on the watch   // the engine runs its lean pass set here (see LEAN in 30_engine.js)
var innerWidth=450,innerHeight=450,devicePixelRatio=1;
var performance={now:()=>__host.now()};
const __noop=function(){};

/* One event table for window, document and the canvas: the app feeds pointer events in with __pointer(). */
const __handlers={};
function addEventListener(t,f){(__handlers[t]||(__handlers[t]=[])).push(f)}
function removeEventListener(t,f){const l=__handlers[t];if(l){const i=l.indexOf(f);if(i>=0)l.splice(i,1)}}
function __fire(t,e){const l=__handlers[t];if(l)for(const f of l.slice()){try{f(e)}catch(err){console.error(t+': '+(err&&err.stack||err))}}}

/* Elements and a 2D context that accept anything and draw nothing (interface and pattern code that the watch does not run). */
const __style=new Proxy({},{get:(t,k)=>k in t?t[k]:(k==='setProperty'||k==='removeProperty'?__noop:''),set:(t,k,v)=>(t[k]=v,true)});
function __el(){return{style:__style,classList:{add:__noop,remove:__noop,toggle:__noop,contains:()=>false},dataset:{},children:[],textContent:'',innerHTML:'',hidden:false,value:'',
  addEventListener,removeEventListener,appendChild:__noop,append:__noop,remove:__noop,querySelector:()=>__el(),querySelectorAll:()=>[],setAttribute:__noop,getAttribute:()=>null,
  getBoundingClientRect:()=>({left:0,top:0,right:innerWidth,bottom:innerHeight,width:innerWidth,height:innerHeight}),focus:__noop,blur:__noop,click:__noop,matches:()=>false,closest:()=>null}}
/* A 2D canvas for the sacred-geometry patterns, drawn by the native rasteriser (wear/src/main/cpp/canvas2d.c). Lines, arcs, curves, fills and
   light that adds are real; text and images are not drawn here (patterns that need a per-pixel field are left out of the watch's list). */
function __color(c){
  if(typeof c!=='string')return[0,0,0,1];
  let m=/^rgba?\(([^)]*)\)$/.exec(c);
  if(m){const p=m[1].split(',').map(Number);return[p[0],p[1],p[2],p.length>3?p[3]:1]}
  m=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if(m){let h=m[1];if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),1]}
  return[0,0,0,1];
}
/* SVG path data (the absolute commands M L C Q Z that the patterns use) as a list of ops; cubic curves are flattened. */
function __svgPath(ops,d){
  const t=d.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi)||[];let i=0,cmd='',x=0,y=0,sx=0,sy=0;
  const n=()=>+t[i++];
  while(i<t.length){
    if(/[a-z]/i.test(t[i]))cmd=t[i++];
    if(cmd==='M'){x=n();y=n();sx=x;sy=y;ops.push(['M',x,y]);cmd='L'}
    else if(cmd==='L'){x=n();y=n();ops.push(['L',x,y])}
    else if(cmd==='Q'){const a=n(),b=n(),c=n(),e=n();ops.push(['Q',a,b,c,e]);x=c;y=e}
    else if(cmd==='C'){const a=n(),b=n(),c=n(),e=n(),f=n(),g=n();for(let k=1;k<=16;k++){const u=k/16,v=1-u;ops.push(['L',v*v*v*x+3*v*v*u*a+3*v*u*u*c+u*u*u*f,v*v*v*y+3*v*v*u*b+3*v*u*u*e+u*u*u*g])}x=f;y=g}
    else if(cmd==='Z'||cmd==='z'){ops.push(['Z']);x=sx;y=sy}
    else i++;
  }
}
class DOMMatrix{constructor(a){a=a||[1,0,0,1,0,0];this.a=a[0];this.b=a[1];this.c=a[2];this.d=a[3];this.e=a[4];this.f=a[5]}}
class Path2D{
  constructor(d){this.ops=[];if(typeof d==='string')__svgPath(this.ops,d);else if(d&&d.ops)this.ops=d.ops.slice()}
  moveTo(x,y){this.ops.push(['M',x,y])}lineTo(x,y){this.ops.push(['L',x,y])}quadraticCurveTo(a,b,c,d){this.ops.push(['Q',a,b,c,d])}closePath(){this.ops.push(['Z'])}
  addPath(p,m){
    const k=m||{a:1,b:0,c:0,d:1,e:0,f:0},X=(x,y)=>k.a*x+k.c*y+k.e,Y=(x,y)=>k.b*x+k.d*y+k.f;
    for(const o of p.ops)this.ops.push(o[0]==='Z'?o:o[0]==='Q'?['Q',X(o[1],o[2]),Y(o[1],o[2]),X(o[3],o[4]),Y(o[3],o[4])]:[o[0],X(o[1],o[2]),Y(o[1],o[2])]);
  }
}
const __ctx2d=new Proxy({},{get:(t,k)=>k in t?t[k]:__noop,set:(t,k,v)=>(t[k]=v,true)});   // for anything that is not a pattern canvas
function __canvas(){
  const e=__el(),id=__host.c2dNew(1,1),c=__host.c2d;let w=1,h=1;
  const cx={
    set strokeStyle(v){const k=__color(v);c(id,9,k[0],k[1],k[2],k[3])},
    set fillStyle(v){const k=__color(v);c(id,10,k[0],k[1],k[2],k[3])},
    set lineWidth(v){c(id,11,v)},
    set globalCompositeOperation(v){c(id,12,v==='lighter'?1:0)},
    set lineCap(v){},set lineJoin(v){},set imageSmoothingEnabled(v){},set font(v){},set textAlign(v){},set textBaseline(v){},
    beginPath(){c(id,0)},moveTo(x,y){c(id,1,x,y)},lineTo(x,y){c(id,2,x,y)},closePath(){c(id,3)},
    arc(x,y,r,a0,a1,ccw){c(id,4,x,y,r,a0,a1,ccw?1:0)},quadraticCurveTo(a,b,x,y){c(id,5,a,b,x,y)},
    stroke(p){
      if(p){c(id,0);for(const o of p.ops){const k=o[0];if(k==='M')c(id,1,o[1],o[2]);else if(k==='L')c(id,2,o[1],o[2]);else if(k==='Q')c(id,5,o[1],o[2],o[3],o[4]);else c(id,3)}}
      c(id,6);
    },
    fill(){c(id,7)},fillRect(x,y,ww,hh){c(id,8,x,y,ww,hh)},
    setTransform(a,b,cc,d,e2,f){c(id,13,a,b,cc,d,e2,f)},save(){c(id,14)},restore(){c(id,15)},translate(x,y){c(id,16,x,y)},scale(x,y){c(id,17,x,y)},
    fillText:__noop,strokeText:__noop,drawImage:__noop,putImageData:__noop,
    createImageData:()=>({data:new Uint8ClampedArray(4)}),getImageData:()=>({data:new Uint8ClampedArray(4)})
  };
  Object.defineProperty(e,'width',{get:()=>w,set:v=>{w=v|0;__host.c2dSize(id,w,h)}});
  Object.defineProperty(e,'height',{get:()=>h,set:v=>{h=v|0;__host.c2dSize(id,w,h)}});
  e._id=id;e.getContext=()=>cx;e.toDataURL=()=>'';
  return e;
}
const document={querySelector:()=>__el(),querySelectorAll:()=>[],getElementById:()=>__el(),createElement:t=>t==='canvas'?__canvas():__el(),
  documentElement:__el(),body:__el(),addEventListener,removeEventListener,hidden:false,activeElement:null};

const localStorage={getItem:k=>__host.read(k),setItem:(k,v)=>__host.write(k,String(v)),removeItem:k=>__host.write(k,'')};
const navigator={vibrate:()=>false,getGamepads:()=>[],userAgent:'Dynamic for Wear OS',maxTouchPoints:5};
const location={search:'?watch',hash:'',pathname:'/',href:'watch'};
const history={replaceState:__noop};
const screen={orientation:{angle:0,addEventListener:__noop}};
window.orientation=0;
/* The engine's "native shell" hooks (haptics, Spotify, saving files) go to the app as events. */
window.DynamicNative={haptic:ms=>__host.emit('haptic',String(ms|0)),spotify:()=>'',openNotificationAccess:__noop,copy:__noop,beginSave:__noop,saveChunk:__noop,endSave:()=>''};

/* Timers run from the app's frame callback (__frame). */
let __timerId=0;const __timers=new Map();
function setTimeout(fn,ms,...a){const id=++__timerId;__timers.set(id,{t:performance.now()+(ms||0),fn,a,every:0});return id}
function setInterval(fn,ms,...a){const id=++__timerId,e=Math.max(1,ms||1);__timers.set(id,{t:performance.now()+e,fn,a,every:e});return id}
function clearTimeout(id){__timers.delete(id)}
const clearInterval=clearTimeout;
function __runTimers(now){
  for(const[id,t]of[...__timers]){
    if(t.t>now)continue;
    if(t.every)t.t=now+t.every;else __timers.delete(id);
    try{t.fn(...t.a)}catch(e){console.error('timer: '+(e&&e.stack||e))}
  }
}
function requestAnimationFrame(fn){return setTimeout(()=>fn(performance.now()),0)}
