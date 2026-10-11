/* Wear OS host, part 1: what a browser would provide for the shared engine modules. The native side
   (wear/src/main/cpp/engine.c) supplies __gl (OpenGL ES 3 in WebGL2's shape) and __host (clock, files, events to the app).
   This file is only used in the watch bundle (tools/build_web.py → wear assets/engine.js). */
var window=globalThis,self=globalThis;
var __LEAN=true;   // the engine runs its lean pass set here (see LEAN in 30_engine.js)
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
const __ctx2d=new Proxy({},{get:(t,k)=>k in t?t[k]:__noop,set:(t,k,v)=>(t[k]=v,true)});
function __canvas(){const e=__el();e.width=e.height=1;e.getContext=()=>__ctx2d;e.toDataURL=()=>'';return e}
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
