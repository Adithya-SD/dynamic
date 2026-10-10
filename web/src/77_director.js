/* Director: reads the song (beat clock, sections, drops, kick/snare/hat) and plays the scene like an instrument.
   It never edits your settings: every frame it copies P into E, bends E, and the engine draws E.
   Speed is held calm and scaled to the tempo (fast songs do not fly apart); the power of the music goes into punch:
   every kick lands a flash, a swell of the frame and a burst of ink, downbeats lift the colour, snares crack the light.
   Build-up: spin and tunnel zoom wind up, the frame tightens. Drop: the colour glides a third of the wheel, spin turns
   round, the kaleidoscope changes and the picture dissolves into the next pattern. Calm passages breathe slowly.
   Strength = Music → Director. */
const Director={
  E:{},cx:0,geoStep:0,bars:0,lastGeo:-1,hue:0,hueV:0,hueTo:0,spinKick:0,zoomKick:0,seg:0,dropSeen:0,spinDir:1,gate:0,flash:0,
  apply(P,dt){
    const E=this.E;Object.assign(E,P);
    const M=Music,on=M.active()&&performance.now()-M.last<400;
    this.gate+=((on?1:0)-this.gate)*(1-Math.exp(-dt/.6));   // fades in/out with the music, no jumps
    const d=P.dir*this.gate,g=this.gate;
    this.spinKick*=Math.exp(-dt/2.4);this.zoomKick*=Math.exp(-dt/1.1);this.flash*=Math.exp(-dt/.45);
    // The colour glides to its new place (a damped spring, about 1.5 s): never a jump.
    {const w=3.4,a=-w*w*(this.hue-this.hueTo)-2*w*this.hueV;this.hueV+=a*dt;this.hue+=this.hueV*dt}
    E.h=P.h+this.hue;
    if(P.geo!==this.lastGeo){this.lastGeo=P.geo;this.geoStep=0}
    if(P.geo>0&&this.geoStep){const fam=GEO.map((g,i)=>i).filter(i=>i&&GEO[i].f===GEO[P.geo].f&&(GEO[i].hue!=null)===(GEO[P.geo].hue!=null)),k=fam.indexOf(P.geo|0);E.geo=fam[(k+this.geoStep)%fam.length]}
    const G=GEO[E.geo|0];if(G&&G.hue!=null&&P.pal===0)E.h=G.hue+this.hue*.15;   // chakras keep their own colour
    // The behaviour owns the particle look: a swarm needs many small, long-lived dots; vortex and obstacle need streams.
    const B=E.geo>0&&GEO_BEH[E.beh|0];if(B&&B.style){Object.assign(E,B.style);E.pn=Math.min(1,B.style.pn*(.5+P.pn/.7));E.pbr=B.style.pbr*P.pbr;E.psz=B.style.psz*.6;E.pspd=B.style.pspd*P.pspd/.8}   // .6: styles were tuned on a full-resolution particle layer
    E.zp=0;
    if(g>.001){E.vel=P.vel+.22*g}   // velocities relax in a couple of seconds, so beats do not pile up into a gale
    if(d<.001){musicFlow(E,0,dt);return E}
    const sec=M.section,ten=sec.tension,inten=sec.intensity,drop=M.drop,pulse=M.pulse*Math.min(1,M.conf*1.3),kick=M.kick,snare=M.snare;
    if(M.dropN!==this.dropSeen){this.dropSeen=M.dropN;this.hueTo+=.33*d;this.spinDir=-this.spinDir;this.spinKick=1.1*d*this.spinDir;this.zoomKick=1;this.flash=1;this.seg++;if(P.gseq===1)this.geoStep++}
    if(M.downbeat){this.hueTo+=.035*d*(.3+inten);this.bars++;if(P.gseq>=2&&this.bars%(P.gseq===2?16:8)===0)this.geoStep++}
    const sp=P.spin||.1*this.spinDir;
    E.spin=sp*(1+inten*.4*d)+this.spinKick+ten*.55*d*Math.sign(sp)+pulse*.12*d*Math.sign(sp);
    E.drift=P.drift*(1+d*(inten*.3+drop*.7+ten*.35));
    if(P.space===1&&this.seg%3)E.kal=Math.min(16,Math.max(3,Math.round(P.kal*(this.seg%3===1?2:1.5))));
    E.echo=Math.min(.95,Math.max(P.echo,d*(.5+.4*ten)*(ten>.05?1:0)+P.echo*(1-d*.3*drop)));
    E.ezoom=P.ezoom+d*(ten*.35+this.zoomKick*.5+pulse*.12);
    E.etwist=P.etwist+d*this.spinKick*.12;
    // Punch: transients that land on the beat and are gone before the next one, so the sync reads without adding speed.
    E.curl=P.curl*(1+d*(.9*kick+.5*drop));
    E.bloom=P.bloom*(1+d*(.9*pulse+1.4*drop+.6*snare));
    E.vig=clamp(P.vig+d*(.4*ten-.25*drop),0,1);
    E.chroma=clamp(P.chroma+d*(.4*M.hat+.45*snare+.3*drop),0,1);
    E.hdrift=P.hdrift+d*.1*inten;
    E.s=clamp(P.s+d*(.1*drop+.06*pulse),0,1);
    E.fs=P.fs*(1+d*(M.bass*.7+drop*1.2+ten*.5));
    E.pn=Math.min(1,E.pn*(1+d*drop*1.5));
    E.pbr=E.pbr*(1+d*(.9*pulse+1.2*drop+.5*kick));
    E.psz=E.psz*(1+d*(.35*pulse+.4*drop));
    E.abeat=P.abeat*(1+d*(drop*1.5+inten*.5));
    E.zp=d*(.05*pulse+.05*kick+.07*drop+.03*this.flash);   // the whole frame swells on every hit
    E.gpulse=Math.min(1,P.gpulse*(1+d*.8));
    // Intricacy follows the music: busier, denser songs fold into more mirrors, nest the pattern and multiply strokes.
    const cx=M.complexity*d;this.cx=cx;
    if(E.space===1){   // busier music, more mirrors: but only a step every few seconds, each one announced by a transition
      const kb=E.kal,k=Math.min(16,Math.round(kb*(1+cx*.9))),f=Math.min(5,P.foldDepth+Math.round(cx*1.6)),now=performance.now(),H=this.hold||(this.hold={k,f,t:0,kb,fb:P.foldDepth});
      if(kb!==H.kb||P.foldDepth!==H.fb||now-H.t>4500){if(H.k!==k||H.f!==f)H.t=now;H.k=k;H.f=f;H.kb=kb;H.fb=P.foldDepth}
      E.kal=H.k;E.foldDepth=H.f}
    if(E.space===2||E.space===4)E.tile=P.tile*(1-cx*.35);
    E.sym=Math.max(P.sym,1+Math.round(cx*5));
    E.pn=Math.min(1,E.pn*(1+cx));
    E.etwist=E.etwist+cx*.12*Math.sign(this.spinDir);
    musicFlow(E,d,dt);
    return E;
  },
  reset(){this.hue=this.hueTo=this.hueV=0;this.seg=0;this.geoStep=0;this.bars=0;this.spinKick=this.zoomKick=this.flash=0}
};
/* Time scale for the fluid and automatic paths. With music it settles a little below normal and follows the tempo
   (a 170 bpm song moves no faster than a 100 bpm one); loudness, kicks and drops add only a gentle lift. */
function musicFlow(E,d,dt){
  const M=Music,live=performance.now()-M.last<250,tk=M.bpm>40&&M.conf>.25?clamp(Math.sqrt(100/M.bpm),.7,1.1):1;
  const target=live?clamp(.7*tk*(1+M.energy*.3+M.kick*.12+(M.drop*.25+M.section.intensity*.1)*d),.5,1):1;
  musicSpeed+=(target-musicSpeed)*(1-Math.exp(-(dt||.016)/.7));
}
