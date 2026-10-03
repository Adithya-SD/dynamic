'use strict';
/* Small shared helpers. Every module below is concatenated in filename order by tools/build_web.py. */
const $=s=>document.querySelector(s);
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const fract=x=>x-Math.floor(x);
const VW=()=>innerWidth||document.documentElement.clientWidth||1;
const VH=()=>innerHeight||document.documentElement.clientHeight||1;
function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}
const store={
  get(k,f){try{const v=localStorage.getItem(k);return v==null?f:JSON.parse(v)}catch{return f}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
};
function hsv(h,s,v){h=fract(h)*6;const i=h|0,f=h-i,p=v*(1-s),q=v*(1-s*f),t=v*(1-s*(1-f));return[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6]}
const NATIVE=window.DynamicNative||null;   // set by the Android shell; absent in a normal browser
if(NATIVE)document.documentElement.classList.add('native');
const haptic=ms=>{try{NATIVE?NATIVE.haptic(ms):navigator.vibrate&&navigator.vibrate(ms)}catch{}};
async function download(blob,name){
  if(NATIVE){   // WebView cannot follow blob: downloads, so stream the file to the shell in 768 KB chunks
    NATIVE.beginSave(name,blob.type||'application/octet-stream');
    for(let o=0;o<blob.size;o+=786432){const buf=new Uint8Array(await blob.slice(o,o+786432).arrayBuffer());let b='';for(let i=0;i<buf.length;i+=8192)b+=String.fromCharCode.apply(null,buf.subarray(i,i+8192));NATIVE.saveChunk(btoa(b))}
    notice(NATIVE.endSave());return;
  }
  const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function copyText(t){if(NATIVE){NATIVE.copy(t);return}await navigator.clipboard.writeText(t)}
const svgIcon=(d,cls='')=>`<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true"><path d="${d}"/></svg>`;
let noteTimer=0;
function notice(text,ms=5000){const n=$('#note');n.textContent=text;n.hidden=false;UI&&(UI.layoutDirty=true);clearTimeout(noteTimer);noteTimer=setTimeout(()=>{n.hidden=true;UI&&(UI.layoutDirty=true)},ms)}
var UI=null;
