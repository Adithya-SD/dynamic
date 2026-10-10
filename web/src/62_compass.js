/* Compass: the layer of the settings that helps you find your way.
   - Quick tab: mood dials that move many settings at once around the preset (middle = as designed), the essentials,
     the randomiser, and the settings you touched last.
   - Every group says how many of its settings you changed and can put them back with one tap.
   - Settings that are hidden because of another choice are not silently gone: a line under the group says what
     unlocks them, and one tap does it.
   - Colour accents per tab, a sentence about what the tab is for, ♪ marks on settings the music moves, a notch on each
     slider where the preset had it, "Changed" filter, and search results that say where each setting lives. */
const ACCENT={presets:'#ff9a76',quick:'#ffd36b',geometry:'#9be37b',draw:'#ff7bd1',space:'#7bb8ff',motion:'#6be3d6',look:'#ffe07b',particles:'#c59bff',music:'#ff6b8a',system:'#9aa4b5'};
const TABINFO={
  presets:'Whole looks. Tap one and it melts in.',
  quick:'The few things most people change, and dials that move many settings at once.',
  geometry:'Draw sacred geometry, chakras and symbols into the fluid, and choose how the fluid obeys them.',
  draw:'How strokes look and what colours they use.',
  space:'How the picture is folded, tiled, wrapped round a ball or scrolled for ever.',
  motion:'How the fluid moves: speed, swirls, currents, wind and tilt.',
  look:'Brightness, contrast, glow and material of the picture itself.',
  particles:'Points of light carried by the flow: how many, how sharp, how long their trails.',
  music:'How the picture listens: source, sensitivity, and how hard each beat hits.',
  system:'Quality, speed, the interface and capture.'
};
/* Settings the Director moves with the music (shown with ♪). */
const MUSIC_LINKED={spin:'build-ups and drops',drift:'build-ups and drops',echo:'build-ups',ezoom:'build-ups and beats',etwist:'drops',curl:'every kick',bloom:'beats and drops',vig:'build-ups',chroma:'hi-hats and snares',hdrift:'build-ups',s:'drops',fs:'bass and drops',pn:'drops and busy music',pbr:'beats',psz:'beats',abeat:'drops',gpulse:'beats',h:'drops and bars',kal:'busy music and drops',foldDepth:'busy music',glw:'beats'};

/* Mood dials: value -1..1, 0 = the preset as designed. Each entry: [setting, 'x'|'+', amount].
   'x': value = base * amount^dial (dial -1 divides, +1 multiplies); '+': value = base + amount*dial. */
const MACROS=[
  {id:'energy',l:'Energy',ends:['Calm','Wild'],help:'Speed, swirls and force of the fluid.',m:[['ts','x',1.6],['curl','x',1.5],['fs','x',1.7],['frc','x',1.4],['pspd','x',1.6]]},
  {id:'detail',l:'Intricacy',ends:['Simple','Intricate'],help:'More mirrors, more particles, finer patterns.',m:[['kal','+',4],['foldDepth','+',1.5],['pn','x',2],['tile','x',.65],['gsz','x',.8],['hp','+',2]]},
  {id:'colour',l:'Colour',ends:['Muted','Vivid'],help:'How rich and how wide the colours are.',m:[['s','+',.25],['vib','x',1.4],['hr','+',.3],['amt','x',1.3]]},
  {id:'glow',l:'Light',ends:['Dark','Radiant'],help:'Exposure and glow.',m:[['glw','x',1.35],['bloom','+',.55],['bth','+',-.2]]},
  {id:'depth',l:'Depth',ends:['Flat','Sculpted'],help:'Relief, shine and rim light.',m:[['rel','+',.7],['fre','+',.5],['met','+',.3],['spc','x',1.5],['odepth','+',.3]]},
  {id:'trail',l:'Memory',ends:['Crisp','Dreamy'],help:'How long ink, trails and echoes linger.',m:[['den','x',.5],['vel','x',.6],['echo','+',.3],['ptl','+',.04]]},
  {id:'music',l:'Music',ends:['Subtle','Dramatic'],help:'How hard the picture reacts to the song.',m:[['dir','+',.35],['aglow','+',.3],['abeat','+',.5],['msn','x',1.5]]}
];
for(const m of MACROS){const k='m_'+m.id;PDEF[k]={k,min:-1,max:1,st:.01,d:0,virtual:true,macro:m};P[k]=0;D[k]=0;B[k]=0}

const Quick={
  recent:[],
  reset(){for(const m of MACROS){P['m_'+m.id]=0;if(B)B['m_'+m.id]=0}},
  /* Move every setting of a dial from the preset's own value. */
  apply(k,v){
    const m=PDEF[k].macro;P[k]=v;
    for(const[key,type,a]of m.m){
      const base=B[key];if(base===undefined||!PDEF[key])continue;
      let nv=type==='x'?base*Math.pow(a,v):base+a*v;
      if(type==='x'&&Math.abs(base)<1e-6)nv=PDEF[key].min>=0?(v>0?(PDEF[key].max*.12*v):0):0;   // a multiplier cannot lift zero
      const s=sanitize(key,nv);if(s!==undefined)P[key]=s;
    }
    persist();
  },
  touch(k){const i=this.recent.indexOf(k);if(i>=0)this.recent.splice(i,1);this.recent.unshift(k);this.recent.length=Math.min(this.recent.length,6);UI.recentUi&&UI.recentUi()}
};

Object.assign(UI,{
  /* ---------- groups: heading with change count and reset, and the "unlocks" line ---------- */
  openGroup(panel,name,tabId){
    const h=el('h4');h.dataset.group=name;
    const t=el('span','gn');t.textContent=name;const badge=el('span','gc2');badge.hidden=true;
    const rb=el('button','rg');rb.textContent='↺ reset';rb.hidden=true;rb.setAttribute('aria-label','Reset '+name+' to the preset');
    h.append(t,badge,rb);panel.append(h);
    const G={h,keys:[],locked:[],badge,rb};
    rb.onclick=()=>{for(const k of G.keys)if(Math.abs(P[k]-B[k])>1e-6){P[k]=B[k]}morph=null;persist();this.sync();haptic(8)};
    this.upd.push(()=>{const n=G.keys.filter(k=>Math.abs(P[k]-B[k])>1e-6).length;badge.hidden=rb.hidden=!n;badge.textContent=n+' changed'});
    return G;
  },
  closeGroup(G,panel){
    if(!G||!G.locked.length)return;
    const bar=el('div','lockbar extra');panel.append(bar);
    const specs=new Map();for(const d of G.locked){const key=JSON.stringify(d.when);if(!specs.has(key))specs.set(key,{when:d.when,items:[]});specs.get(key).items.push(d)}
    const ok=w=>{for(const k in w){const x=w[k];if(!(x==='on'?P[k]>0:x.includes(P[k])))return false}return true};
    const name=w=>Object.keys(w).map(k=>{const x=w[k],d=PDEF[k];return x==='on'?d.l:(d.o?x.map(i=>d.o[i]).join('/'):d.l)}).join(' + ');
    const act=w=>{for(const k in w){const x=w[k];this.change(k,x==='on'?(k==='orb'?.75:(D[k]>0?D[k]:1)):x[0])}notice('Unlocked: '+name(w),1800)};
    this.upd.push(()=>{
      bar.replaceChildren();let any=false;
      for(const s of specs.values()){if(ok(s.when))continue;any=true;
        const c=el('button','lk');c.innerHTML='<b></b><span></span>';c.firstChild.textContent=name(s.when)+' ▸';c.lastChild.textContent=' '+s.items.map(d=>d.l).join(', ');c.title='Needs '+name(s.when);c.onclick=()=>act(s.when);bar.append(c)}
      bar.hidden=!any||this.searching;
    });
  },

  /* ---------- Quick tab ---------- */
  buildQuick(panel){
    const rnd=el('div','qrand');
    rnd.innerHTML='<button class="big" aria-label="Random look"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg><span>Surprise me</span><em></em></button><button class="ch" aria-label="Previous random look">◀</button>';
    const big=rnd.firstChild,prev=rnd.lastChild,seed=big.querySelector('em');
    big.onclick=()=>Rand.next();prev.onclick=()=>Rand.back();
    this.upd.push(()=>{seed.textContent=Rand.seed?'#'+Rand.seed:'every press: a whole new look'});
    panel.append(rnd);
    const h=el('h4');h.dataset.group='Mood';h.innerHTML='<span class="gn">Mood</span><span class="gc2" id="mood">middle = the preset as designed</span>';panel.append(h);
    for(const m of MACROS){const d=PDEF['m_'+m.id];const row=this.slider({...d,l:m.l,help:m.help,ends:m.ends,fmt:v=>(v>0?'+':'')+Math.round(v*100)+'%',dial:true});row.title=m.help;panel.append(row)}
    const h2=el('h4');h2.dataset.group='Essentials';h2.innerHTML='<span class="gn">Essentials</span>';panel.append(h2);
    for(const k of['pal','h','ts','glw','pn','dir','qual']){const d=PDEF[k];if(!d)continue;const row=d.t==='c'?this.choice(d):d.t==='p'?this.palette(d):this.slider(d);panel.append(row)}
    const h3=el('h4');h3.dataset.group='Recent';h3.innerHTML='<span class="gn">Touched last</span>';panel.append(h3);
    const rec=el('div','recent');panel.append(rec);
    this.recentUi=()=>{rec.replaceChildren();if(!Quick.recent.length){const p=el('p','help');p.textContent='Settings you move appear here, so you can find them again.';rec.append(p);return}
      for(const k of Quick.recent){const d=PDEF[k];if(!d||d.virtual)continue;const b=el('button','ch rc');const tab=SCHEMA.tabs.find(t=>t[0]===d.tab);b.innerHTML='<i></i><span></span><small></small>';b.querySelector('span').textContent=d.l;b.querySelector('small').textContent=(tab?tab[1]:'')+' › '+d.g;b.firstChild.style.background=ACCENT[d.tab]||'#fff';
        b.onclick=()=>this.reveal(k);rec.append(b)}};
    this.recentUi();
  },
  /* Jump to a setting: open its tab, scroll to it and light it up. */
  reveal(k){
    const d=PDEF[k];if(!d)return;const i=SCHEMA.tabs.findIndex(t=>t[0]===d.tab);if(i<0)return;
    $('#q').value='';this.onlyChanged=false;this.syncChangedChip&&this.syncChangedChip();this.search();this.show(i,true);
    const row=this.panels[i].querySelector(`[data-k="${k}"]`);if(!row)return;
    if(row.hidden){const w=d.when;if(w){for(const kk in w){const x=w[kk];this.change(kk,x==='on'?(kk==='orb'?.75:(D[kk]>0?D[kk]:1)):x[0])}}}
    setTimeout(()=>{row.scrollIntoView({block:'center',behavior:'smooth'});row.classList.remove('flash');void row.offsetWidth;row.classList.add('flash')},60);
  },

  /* ---------- tab sentence, "changed" filter ---------- */
  describeTab(){const id=this.tabId(),e=$('#tabdesc');if(!e)return;e.textContent=TABINFO[id]||'';e.style.setProperty('--ac',ACCENT[id]||'#fff')},
  buildChangedChip(){
    const f=$('#find'),b=el('button','chip');b.id='chg';b.type='button';b.setAttribute('aria-pressed','false');b.title='Show only the settings you changed';b.innerHTML='Changed <i></i>';f.append(b);
    b.onclick=()=>{this.onlyChanged=!this.onlyChanged;this.syncChangedChip();this.search();if(this.onlyChanged&&!this.open)this.show(this.lastTab)};
    this.syncChangedChip=()=>{b.classList.toggle('on',!!this.onlyChanged);b.setAttribute('aria-pressed',!!this.onlyChanged)};
    this.upd.push(()=>{let n=0;for(const row of this.rows)if(row.classList.contains('chg')&&row.dataset.k)n++;b.lastChild.textContent=n||'';b.classList.toggle('has',n>0)});
  }
});
