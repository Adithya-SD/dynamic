/* Controller core, shared by Dynamic and Dynamic Pad. The Gamepad API covers Xbox, PlayStation, Switch Pro and most
   generic pads on PC and Android; the Android shell adds native rumble and lights (DynamicNative.padRumble/padLight).

   Two rumble motors become a two-way speaker. The heavy motor (left grip, big offset weight, ~20-60 Hz feel) plays the
   bass: 35-160 Hz envelope plus a hard punch on every kick. The light motor (right grip) plays mids and treble plus
   snares and hats. Each of the 24 bands is normalised to its own recent peak, so any song, mix or volume reaches the
   full range, and a gate keeps silence still. Mode 2 (Beats) keeps only the punches; mode 3 (Touch) feels the brush. */
const Feel={
  peak:new Float32Array(24).fill(.02),lo:0,hi:0,punchL:0,punchH:0,strong:0,weak:0,t:0,beat:0,
  /* Called at the analysis rate: ~375/s on the web worklet, ~125/s from the Android capture. */
  bands(levels,onsets,mode){
    const now=performance.now(),dt=clamp((now-(this.t||now))/1000,.001,.1);this.t=now;
    let lo=0,hi=0,kl=0,kh=0;const fall=Math.exp(-dt/3);
    for(let b=0;b<24;b++){
      const l=levels[b],p=this.peak[b]=Math.max(l,this.peak[b]*fall,.006);
      const n=clamp((l/p-.3)/.7,0,1)*clamp(l/.02,0,1);   // relative to its own peak, gated by absolute level
      if(b<6){lo+=n/6;kl=Math.max(kl,onsets[b])}else if(b>=9){hi+=n/15;if(b>=12)kh=Math.max(kh,onsets[b])}
    }
    const att=1-Math.exp(-dt/.008),rel=1-Math.exp(-dt/.07);
    this.lo+=(lo-this.lo)*(lo>this.lo?att:rel);this.hi+=(hi-this.hi)*(hi>this.hi?att:rel);
    this.punchL=Math.max(this.punchL*Math.exp(-dt/.06),kl>0?Math.min(1,.55+kl):0);
    this.punchH=Math.max(this.punchH*Math.exp(-dt/.035),kh>0?Math.min(1,.35+kh*.8):0);
    this.beat=Math.max(this.punchL,this.beat*Math.exp(-dt/.15));
    if(mode===2){this.strong=this.punchL;this.weak=this.punchH*.8}
    else{this.strong=clamp(Math.pow(this.lo,1.4)*.85+this.punchL*.75,0,1);this.weak=clamp(Math.pow(this.hi,1.2)*.7+this.punchH*.5,0,1)}
  },
  silence(dt){this.lo*=Math.exp(-dt*12);this.hi*=Math.exp(-dt*12);this.punchL*=Math.exp(-dt*16);this.punchH*=Math.exp(-dt*16);this.strong*=Math.exp(-dt*16);this.weak*=Math.exp(-dt*16)}
};

const Pad={
  index:-1,name:'',sent:0,lastS:-1,lastW:-1,quiet:true,prev:[],light:-1,
  init(onChange){
    this.onChange=onChange||(()=>{});
    addEventListener('gamepadconnected',e=>{if(this.index<0)this.pick(e.gamepad);this.onChange()});
    addEventListener('gamepaddisconnected',e=>{if(e.gamepad.index===this.index){this.index=-1;this.name='';this.scan()}this.onChange()});
    this.scan();
  },
  scan(){for(const g of this.list())if(g){this.pick(g);break}},
  list(){try{return navigator.getGamepads?[...navigator.getGamepads()]:[]}catch{return[]}},
  pick(g){this.index=g.index;this.name=Pad.label(g.id);this.prev=g.buttons.map(b=>b.pressed)},
  get(){if(this.index<0)this.scan();const g=this.index>=0?this.list()[this.index]:null;return g&&g.connected?g:null},
  label(id){
    if(/xbox|xinput|045e/i.test(id))return /360|028e/i.test(id)?'Xbox 360 controller':'Xbox controller';
    if(/dualsense|0ce6/i.test(id))return'DualSense';if(/dualshock|05c4|09cc/i.test(id))return'DualShock 4';
    if(/pro controller|2009/i.test(id))return'Switch Pro controller';return(id.replace(/\(.*?\)/g,'').trim()||'Controller').slice(0,40);
  },
  canRumble(){const g=this.get();return!!(NATIVE&&NATIVE.padRumble||g&&g.vibrationActuator)},
  /* Drive the motors (0..1 each). Sent at most 60 times a second; each effect lasts 120 ms so a dropped frame never
     leaves the pad silent, and the next update pre-empts it. */
  rumble(strong,weak){
    const now=performance.now();strong=clamp(strong,0,1);weak=clamp(weak,0,1);
    const off=strong<.02&&weak<.02;
    if(off&&this.quiet)return;
    if(now-this.sent<16&&!off)return;
    if(Math.abs(strong-this.lastS)<.015&&Math.abs(weak-this.lastW)<.015&&now-this.sent<80)return;
    this.sent=now;this.lastS=strong;this.lastW=weak;this.quiet=off;
    if(NATIVE&&NATIVE.padRumble){try{NATIVE.padRumble(strong,weak)}catch{}return}
    const g=this.get(),a=g&&g.vibrationActuator;if(!a)return;
    try{(off&&a.reset?a.reset():a.playEffect(a.type||'dual-rumble',{startDelay:0,duration:120,strongMagnitude:strong,weakMagnitude:weak})).catch(()=>{})}catch{}
  },
  tick(ms=30,s=.5,w=.8){const g=this.get();if(NATIVE&&NATIVE.padRumble){try{NATIVE.padRumble(s,w)}catch{}setTimeout(()=>{try{NATIVE.padRumble(0,0)}catch{}},ms);return}
    const a=g&&g.vibrationActuator;if(a)try{a.playEffect(a.type||'dual-rumble',{duration:ms,strongMagnitude:s,weakMagnitude:w}).catch(()=>{})}catch{}},
  /* Light bar / player LEDs: native on Android 12+ (DualSense, DualShock 4 and pads that expose lights). */
  setLight(rgb){if(!(NATIVE&&NATIVE.padLight))return;const c=(255<<24|rgb[0]<<16|rgb[1]<<8|rgb[2])|0;if(c===this.light)return;this.light=c;try{NATIVE.padLight(c)}catch{}},
  hasLight(){try{return!!(NATIVE&&NATIVE.padLightCount&&NATIVE.padLightCount()>0)}catch{return false}},
  /* Edge-detected buttons for this frame: returns the indices pressed since the last call. */
  pressed(g){const out=[];g.buttons.forEach((b,i)=>{if(b.pressed&&!this.prev[i])out.push(i)});this.prev=g.buttons.map(b=>b.pressed);return out}
};
