let s=12345;Math.random=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296};
Exposure.sample=function(){};Exposure.k=1;Exposure.bp=Exposure.bpS=.04;   // auto exposure reads the GPU back asynchronously: not repeatable
UI.change('qual',2);   // a fixed quality: the governor would change resolution with the machine's timing
const names=['Mercury','Ocean','Marble','Gold','Oil Slick','Acid','Mandala'];   // the presets that render repeatably (no particles): the baseline against itself differs by under 0.9 / 255
const out={};
for(const n of names){
  s=12345;H.prep(n);Engine.seedParticles();H.stroke(8);H.run(3);   // short: a fluid is chaotic, so rounding-level differences grow with every frame; after a few steps they are still invisible
  P.uh=H.uh;H.run(1);
  const src=H.grab(),c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.drawImage(src,0,0,64,64);
  const d=x.getImageData(0,0,64,64).data,a=[];for(let i=0;i<d.length;i+=4)a.push(d[i],d[i+1],d[i+2]);out[n]=a;
}
return out;
