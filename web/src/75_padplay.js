/* Controller play. Each stick is a brush: push to paint, the cursor stays where you leave it.
   Triggers press harder (more ink and force); holding a trigger with the stick still grows a hold.
   A splash · B undo · X palette · Y space · LB/RB copies − / + · D-pad ←/→ presets, ↑ menu, ↓ auto motion
   Back pause · Start menu · L3 clear. Rumble follows the music, or your strokes in Touch mode. */
const PadPlay={
  cur:[[.35,.5],[.65,.5]],live:[0,0],idle:[9,9],shown:0,dots:null,
  init(){
    this.dots=[el('i','padcur'),el('i','padcur b')];document.body.append(...this.dots);
    Pad.init(()=>{const g=Pad.get();if(g)notice(Pad.name+' connected. Sticks paint, triggers press harder'+(Pad.canRumble()?', rumble follows the music':'')+'.');UI.padState&&UI.padState()});
  },
  frame(dt){
    const g=Pad.get();
    if(!g){if(this.shown){this.shown=0;this.dots.forEach(d=>d.classList.remove('on'))}Feel.silence(dt);return}
    const std=g.mapping==='standard'||g.buttons.length>=16,W=VW(),H=VH(),S=Math.min(W,H),ax=g.axes;
    const trig=[std?g.buttons[6].value:0,std?g.buttons[7].value:0];
    let touch=0;
    for(let k=0;k<2;k++){
      let x=ax[k*2]||0,y=ax[k*2+1]||0;const m=Math.hypot(x,y);
      if(m<.16){x=y=0}else{const s=(m-.16)/.84/m;x*=s;y*=s}   // radial dead zone, rescaled to full range
      const mag=Math.hypot(x,y),sp=1.9*S*P.padspd*mag,c=this.cur[k];
      c[0]=clamp(c[0]+x*sp*dt/W,0,1);c[1]=clamp(c[1]+y*sp*dt/H,0,1);
      const id='pad'+k,on=mag>0||trig[k]>.08;
      if(on){this.idle[k]=0;let p=Input.ptr.get(id);
        if(!p){if(!Input.ptr.size)Engine.snapshot();p={x:c[0]*W,y:c[1]*H,fx:c[0]*W,fy:c[1]*H,o:Math.random()*6,t:0,h:0,id:++strokeCount};Input.ptr.set(id,p)}
        p.x=c[0]*W;p.y=c[1]*H;p.k=1+trig[k]*2;touch=Math.max(touch,mag*(.4+trig[k]*.6));UI.lastInput=performance.now();
      }else if((this.idle[k]+=dt)>.12)Input.ptr.delete(id);
      this.dots[k].style.transform=`translate(${c[0]*W}px,${c[1]*H}px)`;
    }
    const used=this.idle[0]<3||this.idle[1]<3;if(used!==!!this.shown){this.shown=used?1:0;this.dots.forEach(d=>d.classList.toggle('on',used))}
    if(std)for(const b of Pad.pressed(g))this.button(b);
    // Music rumble is sent from the analysis callback (Music.ingest) at audio rate; here only silence and Touch mode.
    const mode=P.rmode|0,gain=P.rgain,conf=(mode===1||mode===2?mode:0)+'/'+gain;
    if(NATIVE&&NATIVE.padConfig&&conf!==this.conf){this.conf=conf;NATIVE.padConfig(mode===1||mode===2?mode:0,gain)}
    if(!Music.active())Feel.silence(dt);
    if(mode===0)Pad.rumble(0,0);
    else if(mode===3||!Music.active())Pad.rumble(touch*.5*gain,touch*.8*gain);
    Pad.setLight(this.lightColor());
  },
  lightColor(){const c=paletteRGB(P.h+P.hr*fract(clock*.05+Feel.beat*.2)),v=.25+.75*Math.max(Feel.beat,Feel.lo);return c.map(z=>Math.round(clamp(z*v,0,1)*255))},
  button(b){
    switch(b){
      case 0:for(const c of this.cur){const a=Math.random()*TAU;Input.taps.push([c[0]*VW(),c[1]*VH(),Math.cos(a)*900,Math.sin(a)*900,Math.random()*6,++strokeCount])}Pad.tick(40,.6,.6);break;
      case 1:$('#ku').click();Pad.tick(25,.2,.5);break;
      case 2:UI.change('pal',(P.pal+1)%SCHEMA.palettes.length);notice('Palette: '+SCHEMA.palettes[P.pal][0],1500);Pad.tick(20,0,.6);break;
      case 3:UI.change('space',(P.space+1)%6);notice('Space: '+PDEF.space.o[P.space],1500);Pad.tick(30,.4,.3);break;
      case 4:case 5:UI.change('sym',clamp(P.sym+(b===5?1:-1),1,12));notice('Copies: '+P.sym,1200);Pad.tick(15,0,.5);break;
      case 8:$('#kz').click();break;
      case 9:case 12:UI.open?UI.shut():(UI.wake(),UI.show(UI.lastTab));break;
      case 10:Engine.snapshot();Engine.clear();Pad.tick(60,.8,0);break;
      case 13:UI.change('auto',P.auto>0?0:.3);notice(P.auto?'Auto motion on':'Auto motion off',1200);break;
      case 14:case 15:UI.cycle(b===15?1:-1);Pad.tick(25,.3,.3);break;
    }
  }
};
