/* Interface: built from shared/params.json. Liquid glass is drawn by the GPU behind every .g element. */
UI={
  tab:-1,lastTab:1,scroll:{},open:false,layoutDirty:true,rows:[],upd:[],armed:null,armTimer:0,touch:false,
  sel:null,selV:[0,0,0,0],selT:null,
  dissolve:0,dissolving:false,hidden:false,waking:false,deposited:0,mask:null,lastInput:performance.now(),
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
      const panel=this.panels[i];
      if(id==='music')this.buildMusicHead(panel);
      let group='';
      for(const d of SCHEMA.params){if(d.tab!==id)continue;
        if(d.g!==group){group=d.g;const h=el('h4');h.textContent=group;h.dataset.group=group;panel.append(h)}
        const row=d.t==='c'?this.choice(d):d.t==='b'?this.toggle(d):d.t==='p'?this.palette(d):this.slider(d);
        row.dataset.s=(d.l+' '+d.g+' '+label+' '+d.k+' '+(d.o||[]).join(' ')).toLowerCase();row.dataset.g=d.g;panel.append(row);this.rows.push(row);
        if(d.help){const p=el('p','help');p.textContent=d.help;row.append(p)}
      }
      if(id==='music')this.buildSpotify(panel);
      if(id==='system')this.buildSystem(panel);
    }
    this.buildDock();
    $('#q').addEventListener('input',()=>this.search());
    $('#q').addEventListener('keydown',e=>{if(e.key==='Escape'){$('#q').value='';this.search()}});
    bd.addEventListener('scroll',()=>{this.layoutDirty=true;if(this.armed&&!this.armed.dragging)this.disarm()},{passive:true});
    new ResizeObserver(()=>{this.layoutDirty=true}).observe($('#sh'));
    addEventListener('pointerdown',e=>{this.touch=e.pointerType!=='mouse';document.body.classList.toggle('touch',this.touch);this.lastInput=performance.now();if(e.target!==cv&&!e.target.closest('.sl'))this.disarm()},true);
    const st=store.get('dynamic.ui',{});this.scroll=st.sc||{};this.lastTab=st.l||1;this.cat=st.cat||'All';
    this.renderCards();this.sync();if(st.o)this.show(st.t|0,true);
    this.built=true;this.presetChanged();
  },
  persistUi(){store.set('dynamic.ui',{o:this.open?1:0,t:Math.max(this.tab,0),l:this.lastTab,sc:this.scroll,cat:this.cat})},

  /* ---------- controls ---------- */
  slider(d){
    const row=el('div','sl'),dec=d.st<1?Math.ceil(-Math.log10(d.st)-1e-9):0;
    row.innerHTML=`<span><label>${d.l}<i class="dot"></i></label><em></em></span><div class="tr" role="slider" tabindex="0" aria-label="${d.l}" aria-valuemin="${d.min}" aria-valuemax="${d.max}"><i class="fl"></i><b class="kn"></b></div>`;
    const tr=row.querySelector('.tr'),kn=row.querySelector('.kn'),em=row.querySelector('em'),k=d.k;
    const fmt=v=>(+v).toFixed(dec)+(d.u||'');
    const ui=()=>{tr.style.setProperty('--q',(P[k]-d.min)/(d.max-d.min));em.textContent=fmt(P[k]);tr.setAttribute('aria-valuenow',P[k]);row.classList.toggle('chg',Math.abs(P[k]-B[k])>1e-6);
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
  vis(row,d){if(!d.when)return;this.upd.push(()=>{let ok=true;for(const k in d.when){const w=d.when[k];ok=ok&&(w==='on'?P[k]>0:w.includes(P[k]))}row.hidden=!ok||row.dataset.miss==='1';row.dataset.when=ok?'':'1'})},
  trackColors(kind){
    const hl=(h,s=.85,l=58)=>`hsl(${fract(h)*360} ${s*100}% ${l}%)`;
    if(kind==='hue')return[`linear-gradient(90deg,${[0,1,2,3,4,5,6].map(i=>hl(i/6)).join()})`,hl(P.h)];
    if(kind==='range'){const c=[0,.25,.5,.75,1].map(t=>`rgb(${paletteRGB(P.h+P.hr*t).map(x=>Math.round(x*255))})`);return[`linear-gradient(90deg,${c.join()})`,c[2]]}
    return[`linear-gradient(90deg,${hl(P.h,0)},${hl(P.h,1)})`,hl(P.h,P.s)];
  },
  change(k,v){
    const old=P[k];P[k]=v;morph=null;
    if(PDEF[k].quality){if(!Engine.allocate(quality())){P[k]=old;notice(Engine.error)}}
    if(k==='edges')Engine.setWrap(!!v);
    persist();this.sync();
  },
  sync(){for(const f of this.upd)f();if(this.searching)this.search()},

  /* ---------- search: every setting in every tab ---------- */
  search(){
    const q=$('#q').value.trim().toLowerCase();this.searching=!!q;
    const words=q.split(/\s+/).filter(Boolean);
    this.panels.forEach((p,i)=>{p.hidden=q?false:i!==this.tab;p.classList.toggle('res',!!q)});
    for(const p of this.panels.slice(1)){
      let any=false;const groups={};
      for(const row of p.querySelectorAll('[data-s]')){const hit=!q||words.every(w=>row.dataset.s.includes(w));row.dataset.miss=hit?'':'1';row.hidden=!hit||row.dataset.when==='1';if(hit&&!row.hidden){any=true;groups[row.dataset.g]=1}}
      for(const h of p.querySelectorAll('h4'))h.hidden=!!q&&!groups[h.dataset.group];
      for(const h of p.querySelectorAll('.help,.extra'))h.hidden=!!q;
      let t=p.querySelector('h5.tt');if(!t){t=el('h5','tt');t.textContent=SCHEMA.tabs[this.panels.indexOf(p)][1];p.prepend(t)}t.hidden=!q;
      if(q)p.hidden=!any;
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
      b.classList.toggle('on',i===current);b.onclick=()=>{applyPreset(i,{animate:false});Engine.snapshot()};grid.append(b);
    });
    if(this.panels&&this.panels[0])this.panels[0].hidden=q?!grid.children.length:this.tab!==0;
    this.layoutDirty=true;
  },
  cardRGB(v,t){const S=STOPS[v.pal|0],h=v.h+v.hr*t,c=S?stopsMix(S,h):hsv(h,1,1),l=c[0]*.299+c[1]*.587+c[2]*.114;return c.map(x=>(l+(x-l)*Math.max(v.s*1.25,.2))*(.9-t*.3))},
  presetChanged(){
    const pr=allPresets()[current];if(!pr)return;
    $('#pn').textContent=pr.n;this.about.textContent=pr.about||(pr.c==='Mine'?'Your preset.':pr.c==='Classic'?'Original Dynamics 8 preset.':'');
    this.favBtn.textContent=(favorites.has(pr.n)?'★':'☆')+' Favorite';this.delBtn.hidden=current<BUILTIN;
    [...$('#pg').children].forEach(c=>c.classList.toggle('on',c.getAttribute('aria-label')==='Load '+pr.n));
    if(Engine.vel)Engine.setWrap(!!P.edges);
    this.sync();
  },
  cycle(){const list=allPresets(),pool=list.map((p,i)=>i).filter(i=>favorites.size?favorites.has(list[i].n):list[i].c!=='Classic');const n=pool[(pool.indexOf(current)+1)%pool.length];applyPreset(n,{animate:true})},
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
    pick(NATIVE?'Phone audio':'PC / tab audio','desktop',()=>NATIVE?(audio.stop(),NATIVE.startPlaybackCapture()):audio.select('desktop'));
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
    if(!NATIVE)btn('Fullscreen',()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen());
    const h2=el('h4');h2.textContent='Reset';panel.append(h2);
    const row2=el('div','sg extra');panel.append(row2);
    const r=el('button','ch');r.textContent='Sharp liquid glass';r.onclick=()=>{P.ref=2;P.blr=0;P.dsp=.18;P.bzl=1;persist();this.sync()};
    const r2=el('button','ch');r2.textContent='Default quality';r2.onclick=()=>{for(const k of SYSTEM_KEYS)if(PDEF[k].g==='Quality')P[k]=D[k];Engine.allocate(quality(),true);persist();this.sync()};
    row2.append(r,r2);
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
    this.tabBtns.forEach((b,i)=>{b.classList.toggle('on',i===t);b.setAttribute('aria-selected',i===t)});this.tabBtns[t].scrollIntoView({inline:'nearest',block:'nearest'});
    $('#bd').scrollTop=this.scroll[t]|0;$('#kp').classList.toggle('on',t===0);$('#kt').classList.toggle('on',t>0);
    this.layoutDirty=true;this.persistUi();
  },
  shut(){if(this.tab>=0)this.scroll[this.tab]=$('#bd').scrollTop;$('#sh').classList.remove('o');this.open=false;this.disarm();$('#kp').classList.remove('on');$('#kt').classList.remove('on');this.layoutDirty=true;this.persistUi()},
  buildDock(){
    const dock=$('#dock'),I={p:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',t:'M4 8h9M17 8h3M4 16h3M11 16h9M15 5v6M9 13v6',y:SCHEMA.tabs[2][2],u:'M8 5L3 10l5 5M3 10h10a7 7 0 0 1 7 7',z:'M8 5v14M16 5v14',c:'M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5'};
    const add=(id,label,fn)=>{const b=el('button','k',svgIcon(I[id])+(id==='y'?'<i id="sy"></i>':''));b.id='k'+id;b.setAttribute('aria-label',label);b.onclick=()=>fn(b);dock.append(b);return b};
    add('p','Presets',()=>this.show(0));
    add('t','Settings',()=>this.show(this.lastTab));
    add('y','Next space',()=>{this.change('space',(P.space+1)%PDEF.space.o.length);notice(PDEF.space.o[P.space],1500)});
    add('u','Undo',()=>{if(!Engine.restore())notice('Nothing to undo.',1500)});
    add('z','Pause',b=>{App.paused=!App.paused;b.classList.toggle('on',App.paused);b.querySelector('path').setAttribute('d',App.paused?'M8 5l11 7-11 7z':I.z)});
    add('c','Clear',()=>Engine.clear());
    this.upd.push(()=>{$('#sy').textContent=P.space?String(P.space):''});
  },

  /* ---------- per-frame: glass rects, tab capsule, dissolve ---------- */
  R:new Float32Array(32),Q:new Float32Array(16),X:new Float32Array(8),
  glass(dpr){
    let n=0;const R=this.R,Q=this.Q,X=this.X;
    for(const e of this.G){
      let o;if(e.id==='sh')o=+getComputedStyle(e).opacity;else if(e.id==='dlg')o=e.open?1:0;else if(e.id==='note')o=e.hidden?0:1;else o=1;
      o*=1-(e._d||0)*.0;if(o<.02||n>7)continue;const b=e.getBoundingClientRect();if(b.bottom<0||b.top>VH()||!b.width)continue;
      R.set([b.left*dpr,b.top*dpr,b.width*dpr,b.height*dpr],n*4);Q[n*2]=Math.min((+e.dataset.r||b.height/2)*dpr,b.width*dpr/2,b.height*dpr/2);Q[n*2+1]=o;X[n]=e._d||0;n++;
    }
    if(this.open&&this.sel&&n<8){const s=this.sel;R.set([s[0]*dpr,s[1]*dpr,s[2]*dpr,s[3]*dpr],n*4);Q[n*2]=Math.min(s[3]/2*dpr,s[2]/2*dpr);Q[n*2+1]=+getComputedStyle($('#sh')).opacity;X[n]=$('#sh')._d||0;n++}
    return{R,Q,X,n};
  },
  frame(dt){
    /* tab capsule: a spring-driven glass lens that slides and stretches between tabs */
    if(this.open&&this.tab>=0){const b=this.tabBtns[this.tab].getBoundingClientRect(),t=[b.left,b.top,b.width,b.height];
      if(!this.sel)this.sel=t.slice();for(let i=0;i<4;i++){const a=(t[i]-this.sel[i])*320-this.selV[i]*30;this.selV[i]+=a*Math.min(dt,.03);this.sel[i]+=this.selV[i]*Math.min(dt,.03)}}
    this.fade(dt);
  },
  fade(dt){
    const editing=this.open||$('#dlg').open,autoOn=P.auto>0||P.cyc||Music.active();
    const want=P.uh&&!editing&&(Input.down()||(autoOn&&performance.now()-this.lastInput>3500));
    if(this.waking){this.dissolve=Math.max(0,this.dissolve-dt/.45);this.applyFade();if(!this.dissolve)this.waking=false;return}
    if(want&&!this.dissolving&&!this.hidden){this.captureMask();this.dissolving=true;this.deposited=0}
    if(this.dissolving&&!this.hidden){this.dissolve=Math.min(1,this.dissolve+dt/1.1);if(this.dissolve>=1)this.hidden=true}
    this.applyFade();
    if(this.hidden&&!autoOn&&!Input.down()&&!editing&&performance.now()-this.lastInput>P.ud*1000)this.wake();
  },
  applyFade(){
    this.G.forEach((e,i)=>{const d=clamp(this.dissolve*(1.25-.08*i),0,1);e._d=d;e.classList.toggle('ds',d>.01);e.classList.toggle('gone',d>.4);if(d>.01){e.style.setProperty('--b',d*14+'px');e.style.setProperty('--o',Math.max(0,1-d*1.5))}else{e.style.removeProperty('--b');e.style.removeProperty('--o')}});
  },
  wake(){if(!this.dissolving&&!this.hidden)return;this.hidden=false;this.dissolving=false;this.waking=true;this.lastInput=performance.now()},
  depositStep(){
    if(!this.dissolving||!this.mask||this.dissolve<=this.deposited||App.paused)return;
    Engine.deposit(this.mask,this.dissolve,this.deposited,4);this.deposited=this.dissolve;
  },
  /* Rasterise the visible interface (panels, text, icons, chips) into a mask; it becomes ink as it melts. */
  captureMask(){
    const w=Math.round(VW()),h=Math.round(VH()),c=this.maskCanvas||(this.maskCanvas=el('canvas'));c.width=w;c.height=h;const x=c.getContext('2d');x.clearRect(0,0,w,h);
    for(const panel of this.G){
      if(panel.id==='dlg'&&!panel.open||panel.id==='note'&&panel.hidden||panel.id==='sh'&&!this.open)continue;
      const r=panel.getBoundingClientRect(),rad=+panel.dataset.r||r.height/2;x.save();x.beginPath();x.roundRect(r.x,r.y,r.width,r.height,rad);x.clip();x.fillStyle='rgba(170,195,230,.12)';x.fillRect(r.x,r.y,r.width,r.height);
      const walk=document.createTreeWalker(panel,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);let node;
      while((node=walk.nextNode())){
        const e=node.nodeType===3?node.parentElement:node;if(!e||e.closest('[hidden]'))continue;
        if(node.nodeType===3){if(!node.textContent.trim())continue;const rg=document.createRange();rg.selectNodeContents(node);const b=rg.getBoundingClientRect();if(!b.width)continue;const st=getComputedStyle(e);x.fillStyle='#fff';x.font=`${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;x.textBaseline='middle';x.fillText(node.textContent.trim(),b.x,b.y+b.height/2);continue}
        const b=e.getBoundingClientRect();if(!b.width||!b.height||b.bottom<r.top||b.top>r.bottom)continue;
        if(e.tagName==='svg'){x.save();x.translate(b.x,b.y);x.scale(b.width/24,b.height/24);x.strokeStyle='#fff';x.lineWidth=1.8;x.lineCap=x.lineJoin='round';for(const p of e.querySelectorAll('path'))x.stroke(new Path2D(p.getAttribute('d')));x.restore()}
        else if(e.matches('.c')){x.fillStyle=e.style.background.includes('rgb')?(e.style.background.match(/rgb\([^)]*\)/g)||['#888'])[1]||'#888':'#888';x.globalAlpha=.55;x.beginPath();x.roundRect(b.x,b.y,b.width,b.height,22);x.fill();x.globalAlpha=1}
        else if(e.matches('.ch,.kn,.tr')){x.fillStyle=e.matches('.kn')?'rgba(255,255,255,.85)':'rgba(190,210,235,.2)';x.beginPath();x.roundRect(b.x,b.y,b.width,b.height,Math.min(20,b.height/2));x.fill()}
      }
      x.restore();
    }
    if(!this.mask){this.mask=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.mask);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)}
    gl.bindTexture(gl.TEXTURE_2D,this.mask);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
  }
};
function quality(){const q={};for(const k of QUALITY_KEYS)q[k]=P[k];return q}
async function albumPalette(url){
  try{const img=new Image();img.crossOrigin='anonymous';await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src=url});
    const c=el('canvas');c.width=c.height=32;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,32,32);const d=x.getImageData(0,0,32,32).data,bins=new Map();
    for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b);if(mx<30||Math.min(r,g,b)>235)continue;const k=(r>>5)*64+(g>>5)*8+(b>>5),e=bins.get(k)||[0,0,0,0];e[0]+=r;e[1]+=g;e[2]+=b;e[3]++;bins.set(k,e)}
    const cols=[...bins.values()].sort((a,b)=>b[3]-a[3]).slice(0,5).map(e=>[e[0]/e[3]/255,e[1]/e[3]/255,e[2]/e[3]/255]);if(cols.length)album=cols;
  }catch{notice('Album artwork could not be read for colours.')}
}
