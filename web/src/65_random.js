/* Randomiser: every press draws a whole new look from a seed. Space, mirrors, tiling, colour, ink, flow, particles,
   pattern, ball, canvas, glow: all drawn together from ranges that always look good, then glided into (the same
   morph presets use, so the picture melts from one look to the next). A seed is a number: the same seed is always the
   same look, so a good one can be written down, shared or saved as a preset. */
const Rand={
  seed:0,hist:[],pos:-1,
  rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}},
  /* The look for a seed: every preset-able setting. */
  look(seed){
    const r=this.rng(seed),u=(a,b)=>a+(b-a)*r(),i=(a,b)=>Math.floor(u(a,b+1)),pick=a=>a[Math.floor(r()*a.length)],chance=p=>r()<p;
    const v={};for(const k of PRESET_KEYS)v[k]=D[k];
    // shape of space
    const sp=pick([0,0,0,0,1,1,1,2,2,3,3,4,4,5,5]);v.space=sp;
    v.kal=i(3,12);v.foldDepth=chance(.4)?i(2,3):1;v.hp=i(5,9);v.hq=i(3,5);v.growth=u(3,14);v.arms=i(1,4);v.tile=u(.55,1.3);
    v.spin=chance(.6)?u(-.5,.5):0;v.drift=u(-.3,.3);v.ptint=chance(.4)?u(.2,.8):0;v.mir=chance(.15)?1:0;
    if(chance(.25)){v.echo=u(.5,.9);v.ezoom=u(.1,.5);v.etwist=u(-.25,.25)}
    // ball and canvas
    if(chance(.22)){v.orb=u(.6,.95);v.odepth=u(.5,1)}else if(chance(.4)){v.cvs=chance(.75)?1:2}
    // colour
    v.pal=i(0,SCHEMA.palettes.length-1);v.h=r();v.hr=u(.15,1);v.s=u(.7,1);v.cm=pick([0,0,1,2,3]);v.vib=u(1,1.6);v.tone=chance(.6)?1:0;
    // ink and fluid
    v.amt=u(.7,1.5);v.rad=u(.08,.2);v.ink=u(.25,.8);v.den=u(.25,.8);v.curl=u(16,40);v.vel=u(.05,.14);
    v.field=chance(.6)?i(1,5):0;v.fs=u(.2,.55);v.fsc=u(.7,1.3);v.ts=u(.6,1.1);v.bu=chance(.2)?u(-10,10):0;
    v.auto=chance(.5)?u(.15,.5):0;v.amode=i(0,2);
    // light and glass of the picture
    v.glw=u(.85,1.1);v.bloom=u(.2,.8);v.bth=u(.4,.7);v.vig=u(.3,.55);v.rel=u(.2,.9);v.spc=u(20,90);v.lgt=u(0,360);
    v.met=chance(.25)?u(.2,.6):0;v.irs=chance(.3)?u(.1,.5):0;v.fre=chance(.35)?u(.2,.8):0;v.chroma=chance(.3)?u(.1,.4):0;v.hdrift=chance(.4)?u(-.3,.3):0;
    // particles
    v.fx=chance(.75)?i(1,4):0;if(v.fx){const st=PRESETS.particleStyles[v.fx];Object.assign(v,st);v.pn=u(.15,.6);v.psh=u(.5,1)}
    // pattern drawn into the fluid
    if(chance(.4)&&GEO.length>1){v.geo=i(1,GEO.length-1);v.beh=i(0,5);v.gsz=u(.7,1.4);v.grot=u(-.3,.3);v.gcnt=u(-.3,.3);v.gswirl=u(-.4,.4);v.gcm=i(0,2)}
    for(const k in v){const s=sanitize(k,v[k]);v[k]=s===undefined?D[k]:s}
    return v;
  },
  apply(seed,{record=true}={}){
    this.seed=seed;if(record){this.hist.length=this.pos+1;this.hist.push(seed);this.pos=this.hist.length-1}
    Quick.reset();const v=this.look(seed);B={...P,...v};
    if(changesStructure(v)&&Trans.begin(0)){Object.assign(P,v);morph=null}else morph={from:{...P},to:v,t:0};
    hueBase=v.h;Director.reset();persist();
    $('#pn').textContent='Random #'+seed;if(UI.built)UI.sync();
    const sy=$('#sy');if(sy)sy.textContent=String(seed%1000);
  },
  next(){const s=Math.floor(Math.random()*1e5)+1;this.apply(s);notice('Random #'+s+'  ·  tap for another, hold to go back, Save keeps it',3200);haptic(10)},
  back(){if(this.pos<=0){notice('That was the first one.',1200);return}this.pos--;this.apply(this.hist[this.pos],{record:false});notice('Back to #'+this.seed,1500);haptic(10)}
};
