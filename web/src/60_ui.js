/* Interface: built from shared/params.json. Liquid glass is drawn by the GPU behind every .g element. */
UI={
  tab:-1,lastTab:1,scroll:{},open:false,layoutDirty:true,rows:[],upd:[],armed:null,armTimer:0,touch:false,
  sel:null,selV:[0,0,0,0],selT:null,
  dissolve:0,dissolving:false,hidden:false,waking:false,mask:null,lastInput:performance.now(),
  build(){
    this.G=[$('#ttl'),$('#sh'),$('#dock'),$('#dlg'),$('#note')];
    const tabs=$('#tabs'),bd=$('#bd');
    this.tabBtns=[];this.panels=[];
    SCHEMA.tabs.forEach(([id,label,icon],i)=>{
      const b=el('button','',svgIcon(icon)+`<span>${label}</span>`);b.setAttribute('role','tab');b.setAttribute('aria-label',label);b.onclick=()=>this.show(i,true);tabs.append(b);this.tabBtns.push(b);
      const panel=el('div','panel');panel.dataset.tab=id;panel.hidden=true;bd.append(panel);this.panels.push(panel);
    });
    this.buildPresets(this.panels[0]);
    for(const[i,[id,label]]of SCHEMA.tabs.entries()){if(i===0)continue;
      const panel=this.panels[i];panel.style.setProperty('--ac',ACCENT[id]||'#fff');
      if(id==='quick'){this.buildQuick(panel);continue}
      if(id==='music')this.buildMusicHead(panel);
      let group='',G=null;
      for(const d of SCHEMA.params){if(d.tab!==id||d.hide)continue;
        if(d.g!==group){this.closeGroup(G,panel);group=d.g;G=this.openGroup(panel,group,id)}
        const row=d.t==='g'?this.geoPicker(d):d.t==='c'?this.choice(d):d.t==='b'?this.toggle(d):d.t==='p'?this.palette(d):this.slider(d);
        row.dataset.s=(d.l+' '+d.g+' '+label+' '+d.k+' '+(d.help||'')+' '+(d.o||[]).join(' ')).toLowerCase();row.dataset.g=d.g;row.dataset.k=d.k;
        const bc=el('small','bc');bc.textContent=label+' › '+d.g;row.prepend(bc);
        panel.append(row);this.rows.push(row);G.keys.push(d.k);if(d.when)G.locked.push(d);
        if(d.help){const p=el('p','help hint');p.textContent=d.help;row.append(p);const ib=el('button','ib','i');ib.type='button';ib.setAttribute('aria-label','What is '+d.l+'?');ib.onclick=e=>{e.stopPropagation();row.classList.toggle('hl')};row.append(ib)}   // help hides behind an (i)
      }
      this.closeGroup(G,panel);
      if(id==='music')this.buildSpotify(panel);
      if(id==='system')this.buildSystem(panel);
    }
    this.buildDock();
    const td=el('div');td.id='tabdesc';$('#sh').insertBefore(td,$('#find'));this.buildChangedChip();
    this.hudEl=el('div');this.hudEl.id='hud';$('#sh').insertBefore(this.hudEl,$('#tabs'));this.hudEl.addEventListener('click',e=>{if(e.target.closest('.tc')){Tilt.reset();notice('Tilt neutral set to how you hold it now.',1800)}});
    $('#q').addEventListener('input',()=>this.search());
    $('#q').addEventListener('keydown',e=>{if(e.key==='Escape'){$('#q').value='';this.search()}});
    bd.addEventListener('scroll',()=>{this.layoutDirty=true;if(this.armed&&!this.armed.dragging)this.disarm()},{passive:true});
    new ResizeObserver(()=>{this.layoutDirty=true}).observe($('#sh'));
    addEventListener('pointerdown',e=>{this.touch=e.pointerType!=='mouse';document.body.classList.toggle('touch',this.touch);this.lastInput=performance.now();if(e.target!==cv&&!e.target.closest('.sl'))this.disarm()},true);
    const st=store.get('dynamic.ui',{});this.scroll=st.sc||{};this.lastTab=st.l||1;this.cat=st.cat||'All';
    this.renderCards();this.sync();if(st.o)this.show(st.t|0,true);
    this.built=true;this.presetChanged();
  },
  /* Stats strip (top of the sheet) and title line: frame rate, quality, tempo with a beat lamp, section, source. */
  hud(){
    const M=Music,on=M.active(),fps=Math.round(App.fps),hz=Gov.targetHz()||Gov.refresh;
    const sec={calm:'Calm',build:'Build-up',full:'Full'}[M.section.state]||'';
    const lock=M.conf>.55?'locked':M.conf>.25?'finding':'free';
    const src=M.native?'Phone audio':{mic:'Mic',desktop:'Tab audio',file:'File',stream:'Stream'}[audio.state]||'';
    if(this.hudEl)this.hudEl.innerHTML=`<span><b>${fps}</b> fps <em>/ ${hz}</em></span><span>${Gov.label()}</span>`+(Tilt.src?`<span title="Tilt source: tap to set the neutral pose" class="tc">⟲ ${Tilt.src}${Space.mode===1?' · scroll':''}</span>`:'')+
      (on?`<span class="bpm ${lock}"><i></i><b>${M.bpm?Math.round(M.bpm):'—'}</b> bpm</span><span>${sec}${M.drop>.3?' · <b>DROP</b>':''}</span><span>${src}</span>`:'<span class="dim">No music · Music tab → Listen to</span>');
    $('#fps').textContent=P.st?(on&&M.bpm?Math.round(M.bpm)+' bpm · ':'')+fps+' fps':'';
  },
  tabId(){return SCHEMA.tabs[this.tab]?.[0]||''},
  persistUi(){store.set('dynamic.ui',{o:this.open?1:0,t:Math.max(this.tab,0),l:this.lastTab,sc:this.scroll,cat:this.cat})},

  /* ---------- controls ---------- */
  slider(d){
    const row=el('div','sl'),dec=d.st<1?Math.ceil(-Math.log10(d.st)-1e-9):0;
    const mk=MUSIC_LINKED[d.k];
    row.innerHTML=`<span><label>${d.l}<i class="dot"></i>${mk?`<i class="mk" title="The music moves this on ${mk}">♪</i>`:''}</label><em></em></span><div class="tr" role="slider" tabindex="0" aria-label="${d.l}" aria-valuemin="${d.min}" aria-valuemax="${d.max}"><i class="df"></i><i class="fl"></i><b class="kn"></b></div>`+(d.ends?`<small class="ends"><span>${d.ends[0]}</span><span>${d.ends[1]}</span></small>`:'');
    if(d.dial)row.classList.add('dial');
    const tr=row.querySelector('.tr'),kn=row.querySelector('.kn'),em=row.querySelector('em'),fl=row.querySelector('.fl'),k=d.k;
    const fmt=d.fmt||(v=>(+v).toFixed(dec)+(d.u||''));
    const ui=()=>{tr.style.setProperty('--b',clamp((B[k]-d.min)/(d.max-d.min),0,1));tr.style.setProperty('--q',(P[k]-d.min)/(d.max-d.min));em.textContent=fmt(P[k]);tr.setAttribute('aria-valuenow',P[k]);
      if(d.dial){const q=(P[k]-d.min)/(d.max-d.min);fl.style.left=`calc(14px + (100% - 28px)*${Math.min(q,.5)})`;fl.style.width=`calc((100% - 28px)*${Math.abs(q-.5)})`}   // a dial fills from its middle
      row.classList.toggle('chg',Math.abs(P[k]-B[k])>1e-6);
      if(d.track){const c=this.trackColors(d.track);tr.style.setProperty('--tk',c[0]);tr.style.setProperty('--fc','transparent');tr.style.setProperty('--kc',c[1])}};
    const set=v=>{v=clamp(Math.round((v-d.min)/d.st)*d.st+d.min,d.min,d.max);v=+v.toFixed(6);if(v!==P[k]){this.change(k,v)}};
    const fromX=x=>{const r=tr.getBoundingClientRect();return d.min+clamp((x-r.left-14)/Math.max(1,r.width-28),0,1)*(d.max-d.min)};
    let drag=null,pend=null,lastX=0;
    const s={row,dragging:false};
    tr.addEventListener('pointerdown',e=>{
      if(this.dissolving||this.hidden)return;
      const touch=e.pointerType!=='mouse';
      if(touch&&this.armed!==s){pend={x:e.clientX,y:e.clientY,id:e.pointerId};return}
      try{tr.setPointerCapture(e.pointerId)}catch{}row.classList.add('a');s.dragging=true;
      const b=kn.getBoundingClientRect(),c=b.left+b.width/2;drag={x0:e.clientX,moved:false,grip:Math.abs(e.clientX-c)<40?e.clientX-c:null};lastX=e.clientX;this.keepArmed();
    });
    tr.addEventListener('pointermove',e=>{
      if(pend){if(Math.hypot(e.clientX-pend.x,e.clientY-pend.y)>10)pend=null;return}
      if(!drag)return;if(Math.abs(e.clientX-drag.x0)>3)drag.moved=true;
      if(drag.moved){set(fromX(e.clientX-(drag.grip??0)));const q=Math.min(.32,Math.abs(e.clientX-lastX)*.025);kn.style.setProperty('--sx',1+q);kn.style.setProperty('--sy',1-q*.7)}
      lastX=e.clientX;this.keepArmed();
    });
    const end=()=>{row.classList.remove('a');kn.style.setProperty('--sx',1);kn.style.setProperty('--sy',1);drag=null;s.dragging=false};
    tr.addEventListener('pointerup',e=>{
      if(pend){pend=null;this.arm(s);return}
      if(drag&&!drag.moved&&drag.grip===null)set(fromX(e.clientX));end();
    });
    tr.addEventListener('pointercancel',()=>{pend=null;end()});
    tr.addEventListener('keydown',e=>{const n={ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1}[e.key];if(n){e.preventDefault();set(P[k]+n*d.st*(e.shiftKey?10:1))}else if(e.key==='Home'||e.key==='End'){e.preventDefault();set(e.key==='Home'?d.min:d.max)}});
    row.querySelector('span').addEventListener('dblclick',()=>this.change(k,B[k]));
    this.upd.push(ui);this.vis(row,d);return row;
  },
  arm(s){if(this.armed&&this.armed!==s)this.armed.row.classList.remove('arm');this.armed=s;s.row.classList.add('arm');haptic(12);this.keepArmed()},
  keepArmed(){clearTimeout(this.armTimer);this.armTimer=setTimeout(()=>this.disarm(),4000)},
  disarm(){if(this.armed&&!this.armed.dragging){this.armed.row.classList.remove('arm');this.armed=null}},
  choice(d){
    const row=el('div','sw'),label=el('span','',`${d.l}<i class="dot"></i>`),wrap=el('div','sg');wrap.style.margin='0';
    row.append(label,wrap);
    d.o.forEach((n,i)=>{const b=el('button','ch');b.textContent=n;b.onclick=()=>{this.change(d.k,i);if(d.k==='fx'&&i){const st=PRESETS.particleStyles[i];for(const k in st)P[k]=st[k];this.sync()}};wrap.append(b)});
    this.upd.push(()=>{[...wrap.children].forEach((b,i)=>b.classList.toggle('on',i===P[d.k]));row.classList.toggle('chg',P[d.k]!==B[d.k])});
    this.vis(row,d);return row;
  },
  toggle(d){
    const row=el('div','sg'),b=el('button','ch');b.textContent=d.l;b.onclick=()=>this.change(d.k,P[d.k]?0:1);row.append(b);
    this.upd.push(()=>b.classList.toggle('on',!!P[d.k]));this.vis(row,d);return row;
  },
  palette(d){
    const row=el('div','sw'),label=el('span','',`${d.l}<i class="dot"></i>`),wrap=el('div','row');row.append(label,wrap);
    SCHEMA.palettes.forEach(([name],i)=>{const b=el('button');b.title=name;b.setAttribute('aria-label',name+' palette');
      b.style.background=`linear-gradient(90deg,${[0,.2,.4,.6,.8,1].map(t=>{const c=STOPS[i]?stopsMix(STOPS[i],t*.84):hsv(t,.85,1);return`rgb(${c.map(x=>Math.round(x*255))})`}).join()})`;
      b.onclick=()=>this.change('pal',i);wrap.append(b)});
    this.upd.push(()=>{[...wrap.children].forEach((b,i)=>b.classList.toggle('on',i===P.pal));row.classList.toggle('chg',P.pal!==B.pal)});return row;
  },
  /* Geometry picker: family chips over a grid of live thumbnails (drawn lazily, a few per frame). */
  geoPicker(d){
    const row=el('div','geo'),fams=el('div','sg'),grid=el('div','gg');fams.style.margin='0 0 10px';row.append(fams,grid);
    let fam=store.get('dynamic.geofam','Sacred');
    const render=()=>{grid.replaceChildren();[...fams.children].forEach(b=>b.classList.toggle('on',b.textContent===fam));
      GEO.forEach((g,i)=>{if(i&&fam!=='All'&&g.f!==fam)return;
        const b=el('button','gc');b.dataset.i=i;b.setAttribute('aria-label',g.n);b.innerHTML=i?'<img alt=""><span></span>':'<span></span>';b.querySelector('span').textContent=i?g.n:'No pattern';
        b.onclick=()=>{this.change('geo',i);Geo.drawT=0};grid.append(b)});
      this.loadThumbs(grid);this.sync()};
    ['All',...GEO_FAMILIES].forEach(f=>{const b=el('button','ch');b.textContent=f;b.onclick=()=>{fam=f;store.set('dynamic.geofam',f);render()};fams.append(b)});
    this.upd.push(()=>{[...grid.children].forEach(b=>b.classList.toggle('on',+b.dataset.i===(P.geo|0)));row.classList.toggle('chg',P.geo!==B.geo)});
    this.geoRender=render;render();return row;
  },
  loadThumbs(grid){const bs=[...grid.querySelectorAll('img')];let k=0;const step=()=>{if(!this.open||this.tabId()!=='geometry'){setTimeout(step,300);return}const t0=performance.now();while(k<bs.length&&performance.now()-t0<10){const im=bs[k++],i=+im.parentNode.dataset.i;im.src=Geo.thumb(i)}if(k<bs.length)setTimeout(step,30)};step()},
  vis(row,d){if(!d.when)return;this.upd.push(()=>{let ok=true;for(const k in d.when){const w=d.when[k];ok=ok&&(w==='on'?P[k]>0:w.includes(P[k]))}row.hidden=!ok||row.dataset.miss==='1';row.dataset.when=ok?'':'1'})},
  trackColors(kind){
    const hl=(h,s=.85,l=58)=>`hsl(${fract(h)*360} ${s*100}% ${l}%)`;
    if(kind==='hue')return[`linear-gradient(90deg,${[0,1,2,3,4,5,6].map(i=>hl(i/6)).join()})`,hl(P.h)];
    if(kind==='range'){const c=[0,.25,.5,.75,1].map(t=>`rgb(${paletteRGB(P.h+P.hr*t).map(x=>Math.round(x*255))})`);return[`linear-gradient(90deg,${c.join()})`,c[2]]}
    return[`linear-gradient(90deg,${hl(P.h,0)},${hl(P.h,1)})`,hl(P.h,P.s)];
  },
  change(k,v){
    morph=null;if(PDEF[k].virtual){Quick.apply(k,v);this.sync();return}
    Quick.touch(k);
    const old=P[k];P[k]=v;
    if(PDEF[k].quality){if(!Engine.allocate(quality())){P[k]=old;notice(Engine.error)}}
    if(k==='edges')Engine.setWrap(!!(v||P.cvs));
    persist();this.sync();
  },
  sync(){for(const f of this.upd)f();if(this.searching)this.search()},

  /* ---------- search: every setting in every tab ---------- */
  search(){
    const q=$('#q').value.trim().toLowerCase(),mod=!!this.onlyChanged;this.searching=!!q||mod;
    const words=q.split(/\s+/).filter(Boolean);
    this.panels.forEach((p,i)=>{p.hidden=this.searching?false:i!==this.tab;p.classList.toggle('res',this.searching)});
    for(const p of this.panels.slice(1)){
      let any=false;const groups={};
      for(const row of p.querySelectorAll('[data-s]')){const hit=(!q||words.every(w=>row.dataset.s.includes(w)))&&(!mod||row.classList.contains('chg'));row.dataset.miss=hit?'':'1';row.hidden=!hit||row.dataset.when==='1';if(hit&&!row.hidden){any=true;groups[row.dataset.g]=1}}
      for(const h of p.querySelectorAll('h4'))h.hidden=this.searching&&!groups[h.dataset.group];
      for(const h of p.querySelectorAll('.help,.extra'))h.hidden=this.searching;
      let t=p.querySelector('h5.tt');if(!t){t=el('h5','tt');t.textContent=SCHEMA.tabs[this.panels.indexOf(p)][1];p.prepend(t)}t.hidden=!this.searching;
      if(this.searching)p.hidden=!any;
    }
    this.renderCards();this.layoutDirty=true;
  },

  /* ---------- presets ---------- */
  buildPresets(panel){
    this.about=el('p','help extra');
    const actions=el('div','sg extra');
    const act=(t,f)=>{const b=el('button','ch');b.textContent=t;b.onclick=async()=>{try{await f()}catch(e){notice(e.message||String(e))}};actions.append(b);return b};
    act('Save',()=>this.dialog('Save preset',d=>{const i=this.input(d,'Name',current>=BUILTIN?allPresets()[current].n:allPresets()[current].n+' remix');this.button(d,'Save',()=>{const n=i.value.trim();if(!n)throw Error('Give it a name.');savePreset(n);this.cat='Mine';this.renderCards();this.presetChanged();this.closeDialog()})}));
    act('Share',()=>this.share());
    act('Import',()=>this.importDialog());
    this.favBtn=act('☆ Favorite',()=>{toggleFavorite(allPresets()[current].n);this.presetChanged();this.renderCards()});
    act('Morph next',()=>this.cycle());
    this.delBtn=act('Delete',()=>this.dialog('Delete “'+allPresets()[current].n+'”?',d=>this.button(d,'Delete',()=>{deletePreset(current);this.renderCards();this.closeDialog()})));
    const cats=el('div');cats.id='cats';
    ['All','★',...PRESETS.categories.filter(c=>c!=='Classic'),'Mine','Classic'].forEach(c=>{const b=el('button','ch');b.textContent=c;b.onclick=()=>{this.cat=c;this.renderCards();this.persistUi()};cats.append(b)});
    const grid=el('div');grid.id='pg';
    panel.append(this.about,actions,cats,grid);
  },
  renderCards(){
    const grid=$('#pg'),q=$('#q').value.trim().toLowerCase(),cat=this.cat||'All';grid.replaceChildren();
    [...$('#cats').children].forEach(b=>b.classList.toggle('on',b.textContent===cat));
    allPresets().forEach((pr,i)=>{
      const show=q?pr.n.toLowerCase().includes(q):cat==='All'?pr.c!=='Classic':cat==='★'?favorites.has(pr.n):pr.c===cat;
      if(!show)return;
      const v=presetValues(pr),g=t=>{const c=this.cardRGB(v,t);return`rgb(${c.map(x=>Math.round(x*255))})`};
      const b=el('button','c',svgIcon(PRESETS.icons[pr.i]||PRESETS.icons.user)+`<span></span>`+(favorites.has(pr.n)?'<i class="fav">★</i>':''));
      b.querySelector('span').textContent=pr.n;b.setAttribute('aria-label','Load '+pr.n);
      b.style.background=`linear-gradient(0deg,#000a,#0000 75%),linear-gradient(135deg,${g(0)},${g(.5)},${g(1)})`;
      if(v.geo>0){b.classList.add('gp');b.dataset.geo=v.geo;b.style.setProperty('--g1',g(0));b.style.setProperty('--g2',g(.6))}
      b.classList.toggle('on',i===current);b.onclick=()=>{applyPreset(i,{animate:true});Engine.snapshot()};grid.append(b);
    });
    this.cardThumbs(grid);
    if(this.panels&&this.panels[0])this.panels[0].hidden=q?!grid.children.length:this.tab!==0;
    this.layoutDirty=true;
  },
  /* Geometry presets: the pattern, tinted with the preset's colours, drawn a few per frame. */
  cardThumbs(grid){const cs=[...grid.querySelectorAll('.gp')];let k=0;const step=()=>{const t0=performance.now();while(k<cs.length&&performance.now()-t0<8){const c=cs[k++];c.style.backgroundImage=`linear-gradient(0deg,#000c,#0000 70%),url(${Geo.thumb(+c.dataset.geo)}),linear-gradient(135deg,var(--g1),var(--g2))`;c.style.backgroundBlendMode='normal,screen,normal';c.style.backgroundSize='cover';c.style.backgroundPosition='center'}if(k<cs.length)setTimeout(step,20)};setTimeout(step,0)},
  cardRGB(v,t){const S=STOPS[v.pal|0],h=v.h+v.hr*t,c=S?stopsMix(S,h):hsv(h,1,1),l=c[0]*.299+c[1]*.587+c[2]*.114;return c.map(x=>(l+(x-l)*Math.max(v.s*1.25,.2))*(.9-t*.3))},
  presetChanged(){
    const pr=allPresets()[current];if(!pr)return;
    $('#pn').textContent=pr.n;this.about.textContent=pr.about||(pr.c==='Mine'?'Your preset.':pr.c==='Classic'?'Original Dynamics 8 preset.':'');
    this.favBtn.textContent=(favorites.has(pr.n)?'★':'☆')+' Favorite';this.delBtn.hidden=current<BUILTIN;
    [...$('#pg').children].forEach(c=>c.classList.toggle('on',c.getAttribute('aria-label')==='Load '+pr.n));
    if(Engine.vel)Engine.setWrap(!!(P.edges||P.cvs));
    this.sync();
  },
  cycle(d=1){const list=allPresets(),pool=list.map((p,i)=>i).filter(i=>favorites.size?favorites.has(list[i].n):list[i].c!=='Classic');let i=pool.indexOf(current);if(i<0)i=d>0?-1:0;const n=pool[(i+d+pool.length)%pool.length];applyPreset(n,{animate:true})},
  async share(){
    const code=await encodePreset(),link=/^https?:$/.test(location.protocol)?location.origin+location.pathname+'#p='+code:'';
    this.dialog('Share preset',d=>{const t=el('textarea');t.rows=4;t.readOnly=true;t.value=link||code;d.append(t);
      this.button(d,'Copy',async()=>{await copyText(t.value);notice('Copied. Paste it anywhere; opening the link loads the preset.')});
      if(NATIVE)this.button(d,'Send…',()=>NATIVE.share(t.value));else if(navigator.share&&link)this.button(d,'Send…',()=>navigator.share({title:'Dynamic preset',url:link}));
      const p=el('p','help');p.textContent='The code holds every setting of this look. Anyone can paste it into Import, on PC or phone.';d.append(p)});
  },
  importDialog(){this.dialog('Import preset',d=>{const t=el('textarea');t.rows=4;t.placeholder='Paste a DYN1 code or link';d.append(t);this.button(d,'Load',async()=>{const pr=await decodePreset(t.value);saved.push(pr);store.set('dynamic.saved',saved);applyPreset(allPresets().length-1);this.cat='Mine';this.renderCards();this.closeDialog()})})},

  /* ---------- music ---------- */
  buildMusicHead(panel){
    const h=el('h4');h.textContent='Listen to';panel.append(h);
    const src=el('div','sg extra');panel.append(src);
    const pick=(label,kind,fn)=>{const b=el('button','ch');b.textContent=label;b.dataset.kind=kind;b.onclick=async()=>{try{await fn()}catch(e){notice(e.message||String(e))}};src.append(b)};
    pick('Off','off',()=>{if(NATIVE)NATIVE.stopPlaybackCapture();return audio.stop()});
    pick('Microphone','mic',()=>{if(NATIVE)NATIVE.stopPlaybackCapture();return audio.select('mic')});
    pick(NATIVE?'Phone audio':PCAPP?'System audio ★':'Tab / Spotify audio ★','desktop',()=>NATIVE?(audio.stop(),NATIVE.startPlaybackCapture()):audio.select('desktop'));
    pick('File','file',()=>{const f=el('input');f.type='file';f.accept='audio/*,video/*';f.onchange=()=>f.files[0]&&audio.select('file',{file:f.files[0]}).catch(e=>notice(e.message));f.click()});
    pick('Stream URL','stream',()=>this.dialog('Play a stream',d=>{const u=this.input(d,'HTTP(S) audio URL','');this.button(d,'Play',async()=>{await audio.select('stream',{url:u.value.trim()});this.closeDialog()})}));
    this.srcBtns=src;
    this.bands=el('div','bands extra');for(let i=0;i<24;i++)this.bands.append(el('i'));panel.append(this.bands);
    this.audioStatus=el('p','help extra');this.audioStatus.textContent='Pick a source. Low notes draw near the centre, high notes near the edge; loudness drives the motion.';panel.append(this.audioStatus);
    const file=el('div','sg extra');this.fileRow=file;file.hidden=true;panel.append(file);
    const pp=el('button','ch');pp.textContent='Play / pause';pp.onclick=()=>audio.playPause();const lp=el('button','ch');lp.textContent='Loop';lp.onclick=()=>{if(audio._media){audio._media.loop=!audio._media.loop;lp.classList.toggle('on',audio._media.loop)}};
    this.seek=el('input');this.seek.type='range';this.seek.min=0;this.seek.max=1;this.seek.step=.1;this.seek.value=0;this.seek.style.cssText='flex:1;min-width:140px;accent-color:#fff';this.seek.oninput=()=>{if(audio._media)audio._media.currentTime=+this.seek.value};
    file.append(pp,lp,this.seek);
  },
  buildSpotify(panel){
    const h=el('h4');h.textContent='Spotify';panel.append(h);
    const card=el('div','spotify extra'),img=el('img'),info=el('div');img.alt='';img.crossOrigin='anonymous';info.innerHTML='<strong></strong><p></p><p class="st">Optional. Adds track info, controls and album colours.</p>';card.append(img,info);panel.append(card);
    const row=el('div','sg extra');panel.append(row);
    const btn=(t,f)=>{const b=el('button','ch');b.textContent=t;b.onclick=()=>Promise.resolve(f()).catch(e=>notice(e.message||String(e)));row.append(b);return b};
    const prev=btn('⏮',()=>spotify.transport('previous')),play=btn('⏯',()=>spotify.transport(this.sp?.playing?'pause':'play')),next=btn('⏭',()=>spotify.transport('next'));
    if(NATIVE)btn('Allow access',()=>NATIVE.openNotificationAccess());else btn('Connect',()=>this.dialog('Connect Spotify',d=>{const cfg=store.get('dynamics.spotify.config',{});const id=this.input(d,'Client ID (from developer.spotify.com)',cfg.clientId||''),uri=this.input(d,'Redirect URI',cfg.redirectUri||location.origin+location.pathname);
      const p=el('p','help');p.textContent='Create an app at developer.spotify.com, add this exact redirect URI, paste its Client ID. Beat sync still needs Microphone or PC audio: Spotify does not share audio.';d.append(p);
      this.button(d,'Connect',async()=>{spotify.configure(id.value.trim(),uri.value.trim());await spotify.connect()})}));
    if(!NATIVE)btn('Disconnect',()=>spotify.disconnect());
    this.spUi={img,title:info.querySelector('strong'),artist:info.querySelectorAll('p')[0],status:info.querySelector('.st'),prev,play,next};
  },
  spotifyState(s){
    const key=s.track?(s.track.title+'|'+s.track.artist):'';if(this.sp&&key&&key!==this.spKey&&Music.active()){Music.resetSync();Director.reset()}this.spKey=key;   // new song: re-lock the beat at once
    this.sp=s;const u=this.spUi;if(!u)return;
    u.status.textContent=s.error||s.status||'Optional. Adds track info, controls and album colours.';u.title.textContent=s.track?.title||'';u.artist.textContent=s.track?.artist||'';
    const art=s.artwork||s.track?.artwork;if(art&&art!==this.art){this.art=art;u.img.src=art;albumPalette(art)}
    for(const b of[u.prev,u.play,u.next])b.disabled=!s.connected;
  },

  /* ---------- system ---------- */
  buildSystem(panel){
    const h=el('h4');h.textContent='Capture';panel.append(h);
    const row=el('div','sg extra');panel.append(row);
    const btn=(t,f)=>{const b=el('button','ch');b.textContent=t;b.onclick=()=>Promise.resolve(f()).catch(e=>notice(e.message||String(e)));row.append(b);return b};
    btn('Save image',()=>{App.snap=true});
    this.recBtn=btn('Record video',()=>App.record());
    const h2=el('h4');h2.textContent='Reset';panel.append(h2);
    const row2=el('div','sg extra');panel.append(row2);
    const r=el('button','ch');r.textContent='Sharp liquid glass';r.onclick=()=>{P.ref=2;P.blr=0;P.dsp=.18;P.bzl=1;persist();this.sync()};r.textContent='Clear glass';
    const r3=el('button','ch');r3.textContent='Default look';r3.onclick=()=>{for(const k of SYSTEM_KEYS)if(!PDEF[k].quality&&PDEF[k].tab!=='music'||['dir','shock','msn','aring','abeat','aspace','afield','aglow','aspeed','bpu'].includes(k))P[k]=D[k];Exposure.reset();persist();this.sync();notice('Look reset to defaults.',2500)};row2.append(r3);
    const r2=el('button','ch');r2.textContent='Default quality';r2.onclick=()=>{for(const k of SYSTEM_KEYS)if(PDEF[k].g==='Quality')P[k]=D[k];Engine.allocate(quality(),true);persist();this.sync()};
    row2.append(r,r2);
    if(PCAPP){
      const h3=el('h4');h3.textContent='Window';panel.append(h3);const row3=el('div','sg extra');panel.append(row3);
      const fsb=el('button','ch');fsb.textContent='Full screen / window (F11)';fsb.onclick=()=>PCAPP.toggleFullscreen();
      const top=el('button','ch');top.textContent='Keep on top';top.onclick=async()=>{const on=!top.classList.contains('on');await PCAPP.setAlwaysOnTop(on);top.classList.toggle('on',on)};
      const q=el('button','ch');q.textContent='Quit (Ctrl+Q)';q.onclick=()=>PCAPP.quit();row3.append(fsb,top,q);
      PCAPP.info().then(i=>{if(i&&i.gpu){const p=el('p','help extra');p.textContent='Graphics: '+i.gpu;panel.append(p)}}).catch(()=>{});
    }
    this.diag=el('p','help extra');panel.append(this.diag);
  },

  /* ---------- dialogs ---------- */
  dialog(title,build){const d=$('#dlg');d.replaceChildren();const h=el('h2');h.textContent=title;const x=el('button','ch');x.textContent='Close';x.onclick=()=>this.closeDialog();h.append(x);d.append(h);build(d);if(!d.open)d.showModal();this.layoutDirty=true},
  closeDialog(){$('#dlg').close();this.layoutDirty=true},
  input(parent,label,value){const w=el('label','field'),s=el('span');s.textContent=label;const i=el('input');i.value=value||'';i.style.userSelect='text';w.append(s,i);parent.append(w);setTimeout(()=>i.focus(),50);return i},
  button(parent,text,fn){const row=parent.querySelector(':scope>.sg')||parent.appendChild(el('div','sg'));const b=el('button','ch');b.textContent=text;b.onclick=async()=>{try{await fn()}catch(e){notice(e.message||String(e))}};row.append(b);return b},

  /* ---------- sheet & dock ---------- */
  show(t,force){
    const sh=$('#sh');if(this.open&&this.tab===t&&!force)return this.shut();
    if(this.tab>=0)this.scroll[this.tab]=$('#bd').scrollTop;
    this.tab=t;if(t>0)this.lastTab=t;this.open=true;sh.classList.add('o');
    if(!this.searching)this.panels.forEach((p,i)=>p.hidden=i!==t);
    this.tabBtns.forEach((b,i)=>{b.classList.toggle('on',i===t);b.setAttribute('aria-selected',i===t)});this.revealTab();
    $('#bd').scrollTop=this.scroll[t]|0;$('#kp').classList.toggle('on',t===0);$('#kt').classList.toggle('on',t>0);
    this.describeTab();this.layoutDirty=true;this.persistUi();
  },
  /* Scroll the tab strip (not the page) so the active tab sits inside it. */
  revealTab(){const tb=$('#tabs'),b=this.tabBtns[this.tab];if(!b)return;const x=b.offsetLeft-(tb.clientWidth-b.offsetWidth)/2;tb.scrollTo({left:Math.max(0,x),behavior:'smooth'})},
  shut(){if(this.tab>=0)this.scroll[this.tab]=$('#bd').scrollTop;$('#sh').classList.remove('o');this.open=false;this.disarm();$('#kp').classList.remove('on');$('#kt').classList.remove('on');this.layoutDirty=true;this.persistUi()},
  buildDock(){
    const dock=$('#dock'),I={p:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',t:'M4 8h9M17 8h3M4 16h3M11 16h9M15 5v6M9 13v6',y:SCHEMA.tabs.find(t=>t[0]==='space')[2],u:'M8 5L3 10l5 5M3 10h10a7 7 0 0 1 7 7',v:'M12 12c-1.7-2.3-3.3-3.8-5-3.8a3.8 3.8 0 1 0 0 7.6c1.7 0 3.3-1.5 5-3.8z',z:'M8 5v14M16 5v14',c:'M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5',f:'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'};
    const add=(id,label,fn)=>{const b=el('button','k',svgIcon(I[id])+(id==='y'?'<i id="sy"></i>':''));b.id='k'+id;b.setAttribute('aria-label',label);b.onclick=()=>fn(b);dock.append(b);return b};
    add('p','Presets',()=>this.show(0));
    add('t','Settings',()=>this.show(this.lastTab));
    // Randomise: tap for a new look, hold for the previous one.
    const yb=add('y','Random look (tap: new, hold: back)',()=>{});yb.onclick=null;yb.title='Random look: tap for a new one, hold to go back';
    let yt=0,yl=false;yb.addEventListener('pointerdown',()=>{yl=false;clearTimeout(yt);yt=setTimeout(()=>{yl=true;Rand.back()},450)});
    yb.addEventListener('pointerup',()=>{clearTimeout(yt);if(!yl)Rand.next()});yb.addEventListener('pointerleave',()=>clearTimeout(yt));
    // Canvas: window -> infinite (endless, never loops) -> wrap (finite world, edges wrap) -> window.
    const INF='M12 12c-1.7-2.3-3.3-3.8-5-3.8a3.8 3.8 0 1 0 0 7.6c1.7 0 3.3-1.5 5-3.8zm0 0c1.7 2.3 3.3 3.8 5 3.8a3.8 3.8 0 1 0 0-7.6c-1.7 0-3.3 1.5-5 3.8z',WRAP='M4 9V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3M8 6.5L5.5 9 8 11.5M16 17.5l2.5-2.5-2.5-2.5';
    const NOTE=['Window · the picture fills the screen','Infinite · tilt (or move the mouse) to fly over an endless canvas','Wrap · a finite world whose edges wrap round; tilt to look around inside it'];
    const cb=add('v','Canvas: infinite / wrap / window',()=>{const n=((P.cvs|0)+1)%3;this.change('cvs',n);notice(NOTE[n],3000);haptic(10)});
    this.upd.push(()=>{const m=P.cvs|0;cb.classList.toggle('on',m>0);cb.querySelector('path').setAttribute('d',m===2?WRAP:INF);cb.title=NOTE[m]});
    add('u','Undo',()=>{if(!Engine.restore())notice('Nothing to undo.',1500)});
    add('z','Pause',b=>{App.paused=!App.paused;b.classList.toggle('on',App.paused);b.querySelector('path').setAttribute('d',App.paused?'M8 5l11 7-11 7z':I.z)});
    add('c','Clear',()=>Engine.clear());
    if(PCAPP){const fb=add('f','Window / full screen',()=>PCAPP.toggleFullscreen());fb.innerHTML=svgIcon('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')}
    else if(!NATIVE&&document.documentElement.requestFullscreen){const I2='M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',I3='M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5';
      const fb=add('f','Fullscreen',()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen().catch(()=>{}));fb.innerHTML=svgIcon(I2);
      document.addEventListener('fullscreenchange',()=>{fb.innerHTML=svgIcon(document.fullscreenElement?I3:I2);fb.classList.toggle('on',!!document.fullscreenElement)})}
  },

  /* ---------- per-frame: glass rects, tab capsule, dissolve ---------- */
  R:new Float32Array(32),Q:new Float32Array(16),
  /* Rectangles of the glass panels for the shader. Reading layout every frame is the costly part on phones, so it is
     redone each frame only while something moves (a panel sliding, dissolving) and every 100 ms otherwise. */
  glass(dpr){
    const now=performance.now();if(this.layoutDirty){this.layoutDirty=false;this.liveUntil=now+900}
    if(this._g&&this._dpr===dpr&&now>this.liveUntil&&!this.dissolving&&!this.waking&&now-this._gt<100)return this._g;
    this._gt=now;this._dpr=dpr;
    let n=0;const R=this.R,Q=this.Q;
    for(const e of this.G){
      let o;if(e.id==='sh')o=+getComputedStyle(e).opacity;else if(e.id==='dlg')o=e.open?1:0;else if(e.id==='note')o=e.hidden?0:1;else o=1;
      o*=1-ease(e._d||0);if(o<.02||n>7)continue;const b=e.getBoundingClientRect();if(b.bottom<0||b.top>VH()||!b.width)continue;
      R.set([b.left*dpr,b.top*dpr,b.width*dpr,b.height*dpr],n*4);Q[n*2]=Math.min((+e.dataset.r||b.height/2)*dpr,b.width*dpr/2,b.height*dpr/2);Q[n*2+1]=o;n++;
    }
    // The capsule under the active tab: only where the tab strip really shows it (a tab scrolled out of the strip leaves no glass behind)
    if(this.open&&this.sel&&n<8){const s=this.sel,c=$('#tabs').getBoundingClientRect(),x0=Math.max(s[0],c.left+4),x1=Math.min(s[0]+s[2],c.right-4);
      if(x1-x0>10&&s[1]>=c.top-2&&s[1]<c.bottom){R.set([x0*dpr,s[1]*dpr,(x1-x0)*dpr,s[3]*dpr],n*4);Q[n*2]=Math.min(s[3]/2*dpr,(x1-x0)/2*dpr);Q[n*2+1]=+getComputedStyle($('#sh')).opacity*(1-ease($('#sh')._d||0));n++}}
    return this._g={R,Q,n};
  },
  frame(dt){
    /* tab capsule: a spring-driven glass lens that slides and stretches between tabs */
    if(this.open&&this.tab>=0){const b=this.tabBtns[this.tab].getBoundingClientRect(),t=[b.left,b.top,b.width,b.height];
      if(!this.sel)this.sel=t.slice();for(let i=0;i<4;i++){const a=(t[i]-this.sel[i])*320-this.selV[i]*30;this.selV[i]+=a*Math.min(dt,.03);this.sel[i]+=this.selV[i]*Math.min(dt,.03)}}
    if(PCAPP){const idle=performance.now()-this.lastInput>2500&&!this.open;if(idle!==this._nc){this._nc=idle;document.documentElement.classList.toggle('nocursor',idle)}}   // no pointer in the way
    this.fade(dt);
  },
  /* Hide on idle / while drawing: the interface becomes ink (Engine.uiBegin) and the fluid carries it off; the real
     panels fade out underneath in 0.6 s. Wake reverses it quickly. */
  fade(dt){
    const editing=this.open||$('#dlg').open,autoOn=P.auto>0||P.cyc||Music.active();
    const want=P.uh&&!editing&&(Input.down()||(autoOn&&performance.now()-this.lastInput>3500));
    if(this.waking){this.dissolve=Math.max(0,this.dissolve-dt/.35);this.applyFade();if(!this.dissolve){this.waking=false}return}
    if(want&&!this.dissolving&&!this.hidden){this.captureMask();Engine.uiBegin(this.mask);this.dissolving=true}
    if(this.dissolving&&!this.hidden){this.dissolve=Math.min(1,this.dissolve+dt/.6);if(this.dissolve>=1)this.hidden=true}
    this.applyFade();
    if(this.hidden&&!this.pinned&&!autoOn&&!Input.down()&&!editing&&performance.now()-this.lastInput>P.ud*1000)this.wake();
  },
  applyFade(){
    Engine.ui.a=ease(this.dissolve);
    this.G.forEach((e,i)=>{const d=clamp(this.dissolve*(1.15-.05*i),0,1);e._d=d;e.classList.toggle('ds',d>.01);e.classList.toggle('gone',d>.4);if(d>.01)e.style.setProperty('--o',Math.max(0,1-ease(d)));else e.style.removeProperty('--o')});
  },
  /* H key: melt the interface away and keep it away until H or a tap. */
  hideNow(){if(this.hidden||this.dissolving)return;if(this.open)this.shut();this.captureMask();Engine.uiBegin(this.mask);this.dissolving=true;this.pinned=true},
  wake(){this.pinned=false;if(!this.dissolving&&!this.hidden)return;this.hidden=false;this.dissolving=false;this.waking=true;this.lastInput=performance.now();Engine.uiRelease()},
  /* Rasterise the visible interface (panels, text, icons, chips) into a mask; it becomes ink as it melts. */
  captureMask(){
    const w=Math.round(VW()),h=Math.round(VH()),c=this.maskCanvas||(this.maskCanvas=el('canvas'));c.width=w;c.height=h;const x=c.getContext('2d');x.clearRect(0,0,w,h);
    for(const panel of this.G){
      if(panel.id==='dlg'&&!panel.open||panel.id==='note'&&panel.hidden||panel.id==='sh'&&!this.open)continue;
      const r=panel.getBoundingClientRect(),rad=+panel.dataset.r||r.height/2;x.save();x.beginPath();x.roundRect(r.x,r.y,r.width,r.height,rad);x.clip();x.fillStyle='rgba(170,195,230,.14)';x.fillRect(r.x,r.y,r.width,r.height);x.strokeStyle='rgba(255,255,255,.3)';x.lineWidth=2.5;x.stroke();
      const walk=document.createTreeWalker(panel,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);let node;
      while((node=walk.nextNode())){
        const e=node.nodeType===3?node.parentElement:node;if(!e||e.closest('[hidden]'))continue;
        if(node.nodeType===3){if(!node.textContent.trim())continue;const rg=document.createRange();rg.selectNodeContents(node);const b=rg.getBoundingClientRect();if(!b.width)continue;const st=getComputedStyle(e),eb=e.getBoundingClientRect();if(eb.width<2)continue;x.save();x.beginPath();x.rect(eb.x,eb.y,eb.width,eb.height);x.clip();x.fillStyle='#fff';x.font=`${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;x.textBaseline='middle';x.fillText(node.textContent.trim(),b.x,b.y+b.height/2);x.restore();continue}
        const b=e.getBoundingClientRect();if(!b.width||!b.height||b.bottom<r.top||b.top>r.bottom)continue;
        if(e.tagName==='svg'){x.save();x.translate(b.x,b.y);x.scale(b.width/24,b.height/24);x.strokeStyle='#fff';x.lineWidth=1.8;x.lineCap=x.lineJoin='round';for(const p of e.querySelectorAll('path'))x.stroke(new Path2D(p.getAttribute('d')));x.restore()}
        else if(e.matches('.c')){x.fillStyle=e.style.background.includes('rgb')?(e.style.background.match(/rgb\([^)]*\)/g)||['#888'])[1]||'#888':'#888';x.globalAlpha=.55;x.beginPath();x.roundRect(b.x,b.y,b.width,b.height,22);x.fill();x.globalAlpha=1}
        else if(e.matches('.ch,.kn,.tr')){x.fillStyle=e.matches('.kn')?'rgba(255,255,255,.85)':'rgba(190,210,235,.2)';x.beginPath();x.roundRect(b.x,b.y,b.width,b.height,Math.min(20,b.height/2));x.fill()}
      }
      x.restore();
    }
    if(!this.mask){this.mask=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.mask);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)}
    gl.bindTexture(gl.TEXTURE_2D,this.mask);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  }
};
function quality(){const q={};for(const k of QUALITY_KEYS)q[k]=P[k];return Gov.quality(q)}
async function albumPalette(url){
  try{const img=new Image();img.crossOrigin='anonymous';await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src=url});
    const c=el('canvas');c.width=c.height=32;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,32,32);const d=x.getImageData(0,0,32,32).data,bins=new Map();
    for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b);if(mx<30||Math.min(r,g,b)>235)continue;const k=(r>>5)*64+(g>>5)*8+(b>>5),e=bins.get(k)||[0,0,0,0];e[0]+=r;e[1]+=g;e[2]+=b;e[3]++;bins.set(k,e)}
    const cols=[...bins.values()].sort((a,b)=>b[3]-a[3]).slice(0,5).map(e=>[e[0]/e[3]/255,e[1]/e[3]/255,e[2]/e[3]/255]);if(cols.length)album=cols;
  }catch{notice('Album artwork could not be read for colours.')}
}
