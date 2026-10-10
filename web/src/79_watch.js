/* Wear OS: the whole engine on a small round screen, without the settings sheet (index.html?watch).
   Drag draws. Crown / bezel (wheel) or double-tap: next preset. Two-finger tap: next palette. Hold: microphone (beat
   sync, Director and drops all work from it). Tilt your wrist to look around in 3D. Light quality, 30 fps. */
const Watch={
  mic:false,
  init(){
    // First run: light quality, half-rate frames, no interface effects, a bit more wrist pour.
    if(!store.get('dynamic.watchinit',0)){store.set('dynamic.watchinit',1);P.qual=4;P.uh=0;P.st=0;P.tflow=.5;persist();const i=allPresets().findIndex(x=>x.n==='Infinity');if(i>=0)applyPreset(i)}
    Gov.cap=30;
    const show=()=>notice(allPresets()[current].n,1300);
    let wt=0;addEventListener('wheel',e=>{const n=performance.now();if(n-wt<180)return;wt=n;UI.cycle(e.deltaY>0?1:-1);show()},{passive:true});
    let lastUp=0,down=0,x0=0,y0=0,moved=false,hold=0,touches=0;
    cv.addEventListener('pointerdown',e=>{touches++;x0=e.clientX;y0=e.clientY;moved=false;down=performance.now();
      if(touches===2){UI.change('pal',(P.pal+1)%SCHEMA.palettes.length);notice(SCHEMA.palettes[P.pal][0],900)}
      clearTimeout(hold);hold=setTimeout(()=>{if(!moved&&touches===1)this.toggleMic()},900)});
    cv.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-x0,e.clientY-y0)>12)moved=true});
    const up=e=>{touches=Math.max(0,touches-1);clearTimeout(hold);const n=performance.now();
      if(!moved&&n-down<350){if(n-lastUp<320){UI.cycle(1);show();lastUp=0}else lastUp=n}};
    cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',()=>{touches=Math.max(0,touches-1);clearTimeout(hold)});
  },
  async toggleMic(){
    try{
      if(this.mic){await audio.stop();this.mic=false;notice('Mic off',900);return}
      await audio.select('mic');this.mic=true;notice('Listening',1100);haptic(30);
    }catch(e){notice(e.message||'No microphone',2200)}
  }
};
