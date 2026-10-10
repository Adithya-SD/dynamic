/* State: parameters (from shared/params.json), presets (shared/presets.json), persistence and sharing. */
const PDEF={},D={},PRESET_KEYS=[],SYSTEM_KEYS=[],QUALITY_KEYS=[];
for(const p of SCHEMA.params){PDEF[p.k]=p;D[p.k]=p.d;(p.preset===false?SYSTEM_KEYS:PRESET_KEYS).push(p.k);if(p.quality)QUALITY_KEYS.push(p.k)}
const P={...D};           // live values
let B={...D};             // values of the loaded preset: drives "changed" dots and per-slider reset
const BUILTIN=PRESETS.presets.length;
let saved=store.get('dynamic.saved',[]).filter(x=>x&&typeof x.n==='string'&&x.p&&typeof x.p==='object');
const favorites=new Set(store.get('dynamic.fav',[]));
let current=0,hueBase=D.h;
const allPresets=()=>PRESETS.presets.concat(saved);

function sanitize(k,v){
  const d=PDEF[k];if(!d||typeof v!=='number'||!isFinite(v))return undefined;
  if(d.t==='c')return clamp(Math.round(v),0,d.o.length-1);
  if(d.t==='b')return v?1:0;
  if(d.t==='p')return clamp(Math.round(v),0,SCHEMA.palettes.length-1);
  if(d.t==='g')return clamp(Math.round(v),0,GEO.length-1);
  if(d.t==='g')return clamp(Math.round(v),0,GEO.length-1);
  return clamp(v,d.min,d.max);
}
/* Full parameter set for a preset: defaults, particle style, classic base, then the preset itself. */
function presetValues(pr){
  const v={};for(const k of PRESET_KEYS)v[k]=D[k];
  const fx=pr.p.fx|0,style=PRESETS.particleStyles[fx];if(style)Object.assign(v,style);
  if(pr.c==='Classic')for(const k in PRESETS.classicBase)if(k in v)v[k]=PRESETS.classicBase[k];
  if(typeof pr.p.geo==='string'){const gi=GEO.findIndex(g=>g.n===pr.p.geo);pr={...pr,p:{...pr.p,geo:Math.max(0,gi)}}}
  for(const k in pr.p){const s=sanitize(k,pr.p[k]);if(s!==undefined&&PRESET_KEYS.includes(k))v[k]=s}
  return v;
}
let morph=null;
function applyPreset(i,{animate=false}={}){
  const list=allPresets();if(!list[i])return;
  current=i;const v=presetValues(list[i]);B={...P,...v};
  if(animate){morph={from:{...P},to:v,t:0}}else{Object.assign(P,v);morph=null}
  hueBase=v.h;persist();typeof Director!=='undefined'&&Director.reset();UI&&UI.built&&UI.presetChanged();
}
const DISCRETE=new Set(SCHEMA.params.filter(p=>p.t||p.st>=1).map(p=>p.k));
function stepMorph(dt){
  if(!morph)return;morph.t=Math.min(1,morph.t+dt/1.6);const e=morph.t*morph.t*(3-2*morph.t);
  for(const k in morph.to){const a=morph.from[k],b=morph.to[k];P[k]=DISCRETE.has(k)?(morph.t<.5?a:b):a+(b-a)*e}
  hueBase=P.h;if(morph.t>=1)morph=null;UI&&UI.sync();
}
let persistTimer=0;
function persist(){clearTimeout(persistTimer);persistTimer=setTimeout(()=>{
  const p={},s={};for(const k of PRESET_KEYS)p[k]=P[k];for(const k of SYSTEM_KEYS)s[k]=P[k];
  store.set('dynamic.state',{v:3,p,s,cur:allPresets()[current]?.n||'',hue:hueBase});
},350)}
function restore(){
  const st=store.get('dynamic.state',null);
  const i=allPresets().findIndex(x=>x.n===st?.cur);applyPreset(i>=0?i:0);
  if(!st)return;
  if((st.v|0)<3){   // v2 retuned the shared look and moved most settings out of presets: keep only personal choices
    const keep=['rmode','rhi','rgain','padspd','ref','blr','dsp','bzl','st','uh','ud','cyc','msn'];
    for(const k of keep){const v=sanitize(k,st.s?.[k]??st.p?.[k]);if(v!==undefined)P[k]=v}return}
  for(const k in st.s){const v=sanitize(k,st.s[k]);if(v!==undefined)P[k]=v}
  for(const k in st.p){const v=sanitize(k,st.p[k]);if(v!==undefined)P[k]=v}
  hueBase=typeof st.hue==='number'?st.hue:P.h;
}
function savePreset(name){
  const p={};for(const k of PRESET_KEYS)if(P[k]!==D[k])p[k]=P[k];
  const ex=saved.findIndex(x=>x.n===name);const pr={n:name.slice(0,40),c:'Mine',i:'user',p};
  if(ex>=0)saved[ex]=pr;else saved.push(pr);store.set('dynamic.saved',saved);
  current=BUILTIN+(ex>=0?ex:saved.length-1);B={...P};persist();
}
function deletePreset(i){if(i<BUILTIN)return;saved.splice(i-BUILTIN,1);store.set('dynamic.saved',saved);if(current>=allPresets().length)current=0;applyPreset(Math.min(current,allPresets().length-1))}
function toggleFavorite(name){favorites.has(name)?favorites.delete(name):favorites.add(name);store.set('dynamic.fav',[...favorites])}

/* Share codes: DYN1.<base64url(deflate(JSON))>. Same format on Android. */
async function encodePreset(){
  const p={};for(const k of PRESET_KEYS)if(P[k]!==D[k])p[k]=+(+P[k]).toFixed(4);
  const json=JSON.stringify({n:allPresets()[current]?.n||'Mine',p});
  let bytes=new TextEncoder().encode(json),tag='J';
  if(typeof CompressionStream!=='undefined'){bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());tag='Z'}
  let bin='';for(const b of bytes)bin+=String.fromCharCode(b);
  return'DYN1'+tag+'.'+btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function decodePreset(code){
  code=code.trim().replace(/^.*[#?&]p=/,'');
  if(code.length>65536)throw Error('That code is too long.');
  let obj;
  if(code.startsWith('{'))obj=JSON.parse(code);
  else{
    const m=/^DYN1([JZ])\.([A-Za-z0-9_-]+)$/.exec(code);if(!m)throw Error('Not a Dynamic preset code.');
    let bytes=Uint8Array.from(atob(m[2].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    if(m[1]==='Z'){if(typeof DecompressionStream==='undefined')throw Error('This browser cannot unpack preset codes.');bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())}
    if(bytes.length>262144)throw Error('That code expands too far.');
    obj=JSON.parse(new TextDecoder().decode(bytes));
  }
  if(!obj||typeof obj.p!=='object')throw Error('That code has no settings.');
  const p={};for(const k in obj.p){const v=sanitize(k,obj.p[k]);if(v!==undefined&&PRESET_KEYS.includes(k))p[k]=v}
  return{n:String(obj.n||'Shared').slice(0,40),c:'Mine',i:'user',p};
}

/* Colour. A palette is 6 colour stops, cyclic; t runs around it. The HSV palette uses hue directly.
   Album art supplies its own stops. The shader (particles.vert) uses the same interpolation. */
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const STOPS=SCHEMA.palettes.map(([n,h])=>h&&h.map(hex));
let album=null,strokeCount=0;
function stopsMix(S,t){const n=S.length,q=fract(t)*n,i=Math.floor(q),f=q-i,u=f*f*(3-2*f),a=S[i%n],b=S[(i+1)%n];return[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u]}
function paletteRGB(t,pal=P.pal|0){
  const S=P.cm===4&&album?album:STOPS[pal];
  if(!S)return hsv(t,P.s,1);
  const c=stopsMix(S,t),l=c[0]*.299+c[1]*.587+c[2]*.114;return c.map(x=>l+(x-l)*clamp(P.s*1.25,0,1.4));
}
function paletteUniforms(){const S=P.cm===4&&album?album:STOPS[P.pal|0];if(!S)return{uPal:0,uStops:new Float32Array(18)};const f=new Float32Array(18);for(let i=0;i<6;i++)f.set(S[i%S.length],i*3);return{uPal:S.length,uStops:f}}
function inkColor(offset,speed,x,y,id){
  const m=P.cm;let k;
  if(m===1)k=Math.min(speed/250,1);else if(m===2)k=x*.6+y*.4;else if(m===3)k=fract(id*.6180339887);else k=.5+.5*Math.sin(clock*P.spd+offset);
  return paletteRGB(hueBase+P.hr*k).map(z=>z*.3*P.amt);
}
var clock=0;
