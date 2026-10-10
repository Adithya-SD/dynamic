/* Transitions. Anything that would make the picture jump (a new preset, pattern, number of mirrors, space, palette) is
   caught here: the last frame is kept as a ghost and melts into the new picture instead. Geometry changes (mirrors,
   fold depth, polygon sides) reveal the new picture from the centre outwards inside a ring of light, so you can see
   what changed; everything else is a slow dissolve. Drops always use the ring. */
const Trans={
  ghost:null,t:1,dur:1.1,kind:0,sig:'',last:0,GEOM:['kal','foldDepth','hp','hq','arms','mir'],KEYS:['space','kal','foldDepth','hp','hq','arms','mir','pal','cm','fx','field','gcm','geo','beh'],
  active(){return this.t<1&&this.ghost},
  /* Called every frame with the picture that is about to be drawn. */
  watch(E,dt){
    this.t=Math.min(1,this.t+dt/this.dur);
    const s=this.KEYS.map(k=>E[k]|0).join('.')+(E.orb>0?'b':'');
    if(this.sig&&s!==this.sig&&!App.paused&&Engine.lastFrame){
      const was=this.sig.split('.'),now=s.split('.'),geom=this.KEYS.some((k,i)=>this.GEOM.includes(k)&&was[i]!==now[i]);
      const others=this.KEYS.some((k,i)=>!this.GEOM.includes(k)&&was[i]!==now[i]);
      this.fire(Music.drop>.4||geom&&!others?1:0);
    }
    this.sig=s;
  },
  fire(kind){
    const f=Engine.lastFrame,res=Engine.res;if(!f)return;
    // Changes in quick succession (a slider being dragged) keep the first ghost and restart its fade.
    if(this.t<.45&&this.ghost){this.t=Math.min(this.t,.3);this.kind=kind;return}
    if(!this.ghost||this.ghost.w!==res[0]||this.ghost.h!==res[1]){kill(this.ghost);this.ghost=target(res[0],res[1],'rgba16f')}
    pass('ghost.frag',{uImg:f.base,uBloom:f.bloom,uAmt:f.amt},this.ghost);
    this.t=0;this.kind=kind;this.dur=kind?1.15:1.3;
  },
  /* Uniforms for the final pass. */
  uniforms(look){
    if(!this.active())return{uGhost:Engine.black,uGhostA:0,uGhostT:1,uGhostK:0,uGhostC:[0,0,0]};
    const t=this.t,c=look.orbRim||[.3,.5,1];
    return{uGhost:this.ghost,uGhostA:1-t*t*(3-2*t),uGhostT:t,uGhostK:this.kind,uGhostC:c.map(z=>z*1.5+.15)};
  },
  free(){kill(this.ghost);this.ghost=null;this.t=1}
};
