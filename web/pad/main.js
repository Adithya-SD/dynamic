/* Dynamic Pad: the controller as a music feeler. Audio analysis (worklet, ~375/s) drives the motors directly from
   its callback, so rumble keeps time even when this page is not drawing. */
const MODES=[['Music','Heavy motor plays the bass line and kicks, light motor plays mids, snares and hats.'],['Beats','Only the hits: a punch on every kick, a tap on every snare and hat.'],['Off','Motors stay still; meters keep showing what they would do.'],['Stream','The song itself, streamed raw: its bass envelope drives the heavy motor and its treble the light one, every moment, no shaping.']];
const ORDER=[3,0,1,2];   // buttons left to right
const cfg=Object.assign({mode:0,gain:1,hi:0},store.get('dynamic.pad',{}));
const audio=new DynamicsAudio();
let live=0,native=false;
const save=()=>store.set('dynamic.pad',cfg);
function bands(levels,onsets){
  live=performance.now();
  Feel.bands(levels,onsets,cfg.mode===3?4:cfg.mode===1?2:1,cfg.hi);
  if(cfg.mode!==2&&!native)Pad.rumble(Feel.strong*cfg.gain,Feel.weak*cfg.gain);
  lastLevels=levels;
}
let lastLevels=new Float32Array(24);
audio.onBands=d=>bands(d.levels,d.onsets);
audio.onState=s=>{const ok=['mic','desktop','file','stream'].includes(s.state);
  $('#status').textContent=s.state==='error'?s.detail:ok?{mic:'Listening to the microphone.',desktop:'Listening to the shared audio.',file:'Playing your file.',stream:'Playing the stream.'}[s.state]:'Pick a source. The heavy motor plays the bass, the light motor plays the treble.';
  mark(ok?s.state:'off')};
if(NATIVE){window.__nativeBands=(l,o)=>bands(l,o);window.__nativeAudio=(on,text)=>{native=on;$('#status').textContent=text;mark(on?'desktop':'off')}}

const src=$('#src');
const pick=(label,kind,fn)=>{const b=el('button');b.textContent=label;b.dataset.kind=kind;b.onclick=async()=>{try{await fn()}catch(e){notice(e.message)}};src.append(b)};
const mark=k=>[...src.children].forEach(b=>b.classList.toggle('on',b.dataset.kind===k));
pick('Off','off',()=>{if(NATIVE)NATIVE.stopPlaybackCapture();Pad.rumble(0,0);return audio.stop()});
pick(NATIVE?'Phone audio':'PC / tab audio','desktop',()=>NATIVE?(audio.stop(),NATIVE.startPlaybackCapture()):audio.select('desktop'));
pick('Microphone','mic',()=>{if(NATIVE)NATIVE.stopPlaybackCapture();return audio.select('mic')});
pick('Music file','file',()=>$('#file').click());
$('#file').onchange=e=>{const f=e.target.files[0];if(f){if(NATIVE)NATIVE.stopPlaybackCapture();audio.select('file',{file:f}).catch(x=>notice(x.message))}};
mark('off');

const mode=$('#mode');
ORDER.forEach(i=>{const b=el('button');b.textContent=MODES[i][0];b.dataset.i=i;b.onclick=()=>{cfg.mode=i;save();sync();if(i===2)Pad.rumble(0,0)};mode.append(b)});
const hiRow=$('#hirow');['Treble','Bass','Off'].forEach((n,i)=>{const b=el('button');b.textContent=n;b.onclick=()=>{cfg.hi=i;save();sync()};hiRow.append(b)});
const gain=$('#gain');gain.value=cfg.gain;gain.oninput=()=>{cfg.gain=+gain.value;save();sync()};
function sync(){if(NATIVE&&NATIVE.padConfig)NATIVE.padConfig([1,2,0,1][cfg.mode],cfg.gain,cfg.hi);[...hiRow.children].forEach((b,i)=>b.classList.toggle('on',i===cfg.hi));[...mode.children].forEach(b=>b.classList.toggle('on',+b.dataset.i===cfg.mode));$('#gainv').textContent=Math.round(cfg.gain*100)+'%';$('#modehelp').textContent=MODES[cfg.mode][1]}
sync();
$('#test').onclick=async()=>{const seq=[[1,0,350],[0,1,350],[0,0,150]];for(let k=0;k<6;k++)seq.push([1,.3,70],[0,0,180]);
  for(const[s,w,ms]of seq){Pad.rumble(s,w);Pad.sent=0;await new Promise(r=>setTimeout(r,ms))}Pad.rumble(0,0)};

const bandBox=$('#bands');for(let i=0;i<24;i++)bandBox.append(el('i'));
Pad.init(()=>{const g=Pad.get();$('#pad').classList.toggle('on',!!g);$('#padname').textContent=g?Pad.name:'No controller yet';
  $('#padhint').textContent=g?(Pad.canRumble()?'Rumble ready.':'This browser cannot drive its motors; try Chrome or Edge.')+(Pad.hasLight()?' Light bar follows the beat.':''):'Connect a controller and press any button.'});

/* Background: a warm core that swells with the bass and a cool ring that shimmers with the treble. */
const cv=$('#bg'),x=cv.getContext('2d');let last=performance.now();
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.1,(now-last)/1000);last=now;
  if(now-live>250&&!native)Feel.silence(dt);
  const dpr=Math.min(devicePixelRatio||1,2),w=cv.width=innerWidth*dpr,h=cv.height=innerHeight*dpr,r=Math.min(w,h);
  x.fillStyle='#05060a';x.fillRect(0,0,w,h);x.globalCompositeOperation='lighter';
  const cx=w/2,cy=h*.62,s=Feel.strong,t=Feel.weak;
  let g=x.createRadialGradient(cx,cy,0,cx,cy,r*(.18+.35*s));g.addColorStop(0,`rgba(255,120,60,${.10+.5*s})`);g.addColorStop(1,'rgba(255,60,30,0)');x.fillStyle=g;x.fillRect(0,0,w,h);
  x.lineWidth=(1.5+6*t)*dpr;x.strokeStyle=`rgba(90,215,255,${.08+.6*t})`;x.beginPath();x.arc(cx,cy,r*(.36+.04*t),0,TAU);x.stroke();
  x.globalCompositeOperation='source-over';
  for(const[id,v]of[['#lo',s],['#hi',t]]){const m=$(id);m.style.setProperty('--v',v.toFixed(3));m.querySelector('strong').textContent=Math.round(v*100)}
  for(let i=0;i<24;i++){const p=Feel.peak[i]||1;bandBox.children[i].style.setProperty('--l',Math.min(1,lastLevels[i]/p).toFixed(3))}
  const gp=Pad.get();if(gp)Pad.setLight([255,Math.round(120*(1-s)),Math.round(255*t)].map(v=>Math.round(v*(.2+.8*Math.max(s,t)))));
}
requestAnimationFrame(frame);
