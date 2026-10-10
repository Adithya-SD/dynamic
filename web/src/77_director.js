/* Director: reads the song (beat clock, sections, drops, kick/snare/hat) and plays the scene like an instrument.
   It never edits your settings: every frame it copies P into E, bends E, and the engine draws E.
   Build-up: spin and tunnel zoom wind up, the frame tightens. Drop: colour jumps a third of the wheel, spin
   reverses, kaleidoscope segments change, light and flow surge. Downbeats nudge the hue; kicks twist the fluid;
   hats shimmer the colour. Calm passages breathe slowly. Strength = Music → Director. */
const Director={
  E:{},cx:0,geoStep:0,bars:0,lastGeo:-1,hue:0,hueTo:0,spinKick:0,zoomKick:0,seg:0,dropSeen:0,spinDir:1,gate:0,
  apply(P,dt){
    const E=this.E;Object.assign(E,P);
    const M=Music,on=M.active()&&performance.now()-M.last<400;
    this.gate+=((on?1:0)-this.gate)*(1-Math.exp(-dt/.6));   // fades in/out with the music, no jumps
    const d=P.dir*this.gate;
    this.spinKick*=Math.exp(-dt/1.6);this.zoomKick*=Math.exp(-dt/.7);
    this.hue+=(this.hueTo-this.hue)*(1-Math.exp(-dt/.35));
    E.h=P.h+this.hue;
    if(P.geo!==this.lastGeo){this.lastGeo=P.geo;this.geoStep=0}
    if(P.geo>0&&this.geoStep){const fam=GEO.map((g,i)=>i).filter(i=>i&&GEO[i].f===GEO[P.geo].f&&(GEO[i].hue!=null)===(GEO[P.geo].hue!=null)),k=fam.indexOf(P.geo|0);E.geo=fam[(k+this.geoStep)%fam.length]}
    const G=GEO[E.geo|0];if(G&&G.hue!=null&&P.pal===0)E.h=G.hue+this.hue*.15;   // chakras keep their own colour
    // The behaviour owns the particle look: a swarm needs many small, long-lived dots; vortex and obstacle need streams.
    const B=E.geo>0&&GEO_BEH[E.beh|0];if(B&&B.style){Object.assign(E,B.style);E.pn=Math.min(1,B.style.pn*(.5+P.pn/.7));E.pbr=B.style.pbr*P.pbr;E.psz=B.style.psz*.6}   // .6: styles were tuned on a full-resolution particle layer
    if(d<.001){musicFlow(E,0);return E}
    const sec=M.section,ten=sec.tension,inten=sec.intensity,drop=M.drop,pulse=M.pulse*Math.min(1,M.conf*1.3);
    if(M.dropN!==this.dropSeen){this.dropSeen=M.dropN;this.hueTo+=.33*d;this.spinDir=-this.spinDir;this.spinKick=2.2*d*this.spinDir;this.zoomKick=1;this.seg++;if(P.gseq===1)this.geoStep++}
    if(M.downbeat){this.hueTo+=.035*d*(.3+inten);this.bars++;if(P.gseq>=2&&this.bars%(P.gseq===2?16:8)===0)this.geoStep++}
    const sp=P.spin||.12*this.spinDir;
    E.spin=sp*(1+inten*.9*d)+this.spinKick+ten*1.4*d*Math.sign(sp)+pulse*.25*d*Math.sign(sp);
    E.drift=P.drift*(1+d*(inten+drop*2+ten));
    if(P.space===1&&this.seg%3)E.kal=Math.min(16,Math.max(3,Math.round(P.kal*(this.seg%3===1?2:1.5))));
    E.echo=Math.min(.95,Math.max(P.echo,d*(.5+.4*ten)*(ten>.05?1:0)+P.echo*(1-d*.3*drop)));
    E.ezoom=P.ezoom+d*(ten*.7+this.zoomKick*.9+pulse*.15);
    E.etwist=P.etwist+d*this.spinKick*.15;
    E.curl=P.curl*(1+d*(.6*M.kick+.4*drop));
    E.bloom=P.bloom*(1+d*(.5*pulse+1.2*drop));
    E.vig=clamp(P.vig+d*(.4*ten-.25*drop),0,1);
    E.chroma=clamp(P.chroma+d*(.35*M.hat+.3*drop),0,1);
    E.hdrift=P.hdrift+d*.12*inten;
    E.s=clamp(P.s+d*.12*drop,0,1);
    E.fs=P.fs*(1+d*(M.bass*1.2+drop*2+ten));
    E.pn=Math.min(1,P.pn*(1+d*drop*1.5));
    E.pbr=P.pbr*(1+d*(.5*pulse+drop));
    E.abeat=P.abeat*(1+d*(drop*1.5+inten*.5));
    // Intricacy follows the music: busier, denser songs fold into more mirrors, nest the pattern and multiply strokes.
    const cx=M.complexity*d;this.cx=cx;
    if(E.space===1){E.kal=Math.min(16,Math.round(E.kal*(1+cx*.9)));E.foldDepth=Math.min(5,P.foldDepth+Math.round(cx*1.6))}
    if(E.space===2||E.space===4)E.tile=P.tile*(1-cx*.35);
    E.sym=Math.max(P.sym,1+Math.round(cx*5));
    E.pn=Math.min(1,E.pn*(1+cx));
    E.etwist=E.etwist+cx*.15*Math.sign(this.spinDir);
    musicFlow(E,d);
    return E;
  },
  reset(){this.hue=this.hueTo=0;this.seg=0;this.geoStep=0;this.bars=0;this.spinKick=this.zoomKick=0}
};
/* Flow speed rides the music: louder and denser passages move faster, kicks shove, drops surge. */
function musicFlow(E,d){
  const M=Music,live=performance.now()-M.last<250;
  musicSpeed=live?clamp(1+M.energy*.55+M.kick*.25*(.5+d)+M.drop*.6*d+M.section.intensity*.2*d,1,1.8):1;
}
