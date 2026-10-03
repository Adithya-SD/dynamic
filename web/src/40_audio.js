/* Standalone browser audio capture and 24-band onset analysis. */
(function (root) {
  'use strict';

  const BAND_COUNT = 24;
  const FFT_SIZE = 2048;
  const HOP_SIZE = 128;
  const MIN_HZ = 35;
  const MAX_HZ = 16000;

  function makeBandEdges(sampleRate, fftSize) {
    const hi = Math.min(MAX_HZ, sampleRate / 2);
    const edges = new Uint16Array(BAND_COUNT + 1);
    const maxBin = fftSize / 2;
    for (let i = 0; i <= BAND_COUNT; i++) {
      const hz = MIN_HZ * Math.pow(hi / MIN_HZ, i / BAND_COUNT);
      edges[i] = Math.min(maxBin, Math.max(1, Math.round(hz * fftSize / sampleRate)));
    }
    return edges;
  }

  // Kept pure/exported so onset behavior can be tested without browser APIs.
  function createBandDetector() {
    const previous = new Float32Array(BAND_COUNT);
    const average = new Float32Array(BAND_COUNT);
    const cooldown = new Float64Array(BAND_COUNT);
    cooldown.fill(-1e9);
    return function detect(levels, time, out) {
      out = out || new Float32Array(BAND_COUNT);
      out.fill(0);
      for (let i = 0; i < BAND_COUNT; i++) {
        const level = Math.max(0, levels[i] || 0);
        const flux = Math.max(0, level - previous[i]);
        const threshold = Math.max(0.025, average[i] * 1.8);
        if (flux > threshold && level > 0.035 && time - cooldown[i] >= 0.035) {
          out[i] = Math.min(1, flux * 3.2);
          cooldown[i] = time;
        }
        average[i] = average[i] * 0.92 + flux * 0.08;
        previous[i] = level;
      }
      return out;
    };
  }

  const moduleLoads = new WeakMap();
  function workletSource() {
    return `class DynamicsBandsProcessor extends AudioWorkletProcessor {
      constructor() {
        super(); this.n=2048; this.hop=128; this.ring=new Float32Array(this.n); this.write=0; this.since=0;
        this.re=new Float32Array(this.n); this.im=new Float32Array(this.n); this.window=new Float32Array(this.n);this.reverse=new Uint16Array(this.n);this.cosine=new Float32Array(this.n/2);this.sine=new Float32Array(this.n/2);
        for(let i=0;i<this.n;i++){this.window[i]=0.5-0.5*Math.cos(6.283185307179586*i/(this.n-1));let x=i,r=0;for(let b=0;b<11;b++){r=(r<<1)|(x&1);x>>=1;}this.reverse[i]=r;}
        for(let i=0;i<this.n/2;i++){const a=-6.283185307179586*i/this.n;this.cosine[i]=Math.cos(a);this.sine[i]=Math.sin(a);}
        this.lastAnalysisTime=0;this.report=0;this.edges=new Uint16Array(25);
        for(let i=0;i<=24;i++){const hz=35*Math.pow(Math.min(16000,sampleRate/2)/35,i/24);this.edges[i]=Math.max(1,Math.round(hz*this.n/sampleRate));}
        this.prev=new Float32Array(24);this.avg=new Float32Array(24);this.cool=new Float64Array(24);this.cool.fill(-1e9);
        this.pool=[];for(let i=0;i<16;i++)this.pool.push({levels:new Float32Array(24),onsets:new Float32Array(24)});
        this.port.onmessage=e=>{if(e.data&&e.data.levels&&e.data.onsets)this.pool.push(e.data);};
        this.port.postMessage({ready:true});
      }
      process(inputs) {
        const input=inputs[0]&&inputs[0][0]; if(!input)return true;
        for(let j=0;j<input.length;j++){this.ring[this.write]=input[j];this.write=(this.write+1)&2047;this.since++;}
        this.report+=input.length;if(this.report<this.hop)return true;this.report-=this.hop;this.since=0;
        const item=this.pool.pop();if(!item)return true;const interval=Math.max(this.hop/sampleRate,currentTime-this.lastAnalysisTime),fluxScale=(512/sampleRate)/interval,retain=Math.pow(.92,interval*sampleRate/512);this.lastAnalysisTime=currentTime;
        // Persistent FFT buffers, Hann window, bit-reversal order and twiddles avoid per-block allocation/trig.
        for(let i=0;i<this.n;i++){const q=this.reverse[i],x=this.ring[(this.write+i)&2047]*this.window[i];this.re[q]=x;this.im[q]=0;}
        for(let len=2;len<=this.n;len<<=1){const stride=this.n/len;for(let base=0;base<this.n;base+=len){for(let k=0;k<len/2;k++){const ti=k*stride,wr=this.cosine[ti],wi=this.sine[ti],a=base+k,b=a+len/2,vr=this.re[b]*wr-this.im[b]*wi,vi=this.re[b]*wi+this.im[b]*wr;this.re[b]=this.re[a]-vr;this.im[b]=this.im[a]-vi;this.re[a]+=vr;this.im[a]+=vi;}}}
        
        for(let b=0;b<24;b++){let sum=0,start=this.edges[b],end=this.edges[b+1];if(end<=start){start=Math.min(1023,Math.max(1,start));end=start+1;}for(let k=start;k<end&&k<1024;k++){const re=this.re[k],im=this.im[k];sum+=re*re+im*im;}const level=Math.min(1,Math.sqrt(sum)/1024*4);const flux=Math.max(0,level-this.prev[b])*fluxScale;const threshold=Math.max(0.025,this.avg[b]*1.8);item.onsets[b]=flux>threshold&&level>0.035&&currentTime-this.cool[b]>=0.035?Math.min(1,flux*3.2):0;if(item.onsets[b])this.cool[b]=currentTime;this.avg[b]=this.avg[b]*retain+flux*(1-retain);this.prev[b]=level;item.levels[b]=level;}
        item.time=currentTime;this.port.postMessage(item,[item.levels.buffer,item.onsets.buffer]); return true;
      }
    } registerProcessor('dynamics-bands',DynamicsBandsProcessor);`;
  }

  class DynamicsAudio {
    constructor() {
      this.onState = null;
      this.onBands = null;this.analysisHz=0;this._reportCount=0;this._reportStart=0;
      this.state = 'off';
      this.position = 0;
      this.duration = 0;
      this.file = null;
      this._ctx = null; this._source = null; this._stream = null; this._media = null;
      this._worklet = null; this._mute = null; this._fallbackTimer = null; this._objectUrl = null; this._moduleUrl = null; this._generation = 0;
      this._analyser = null; this._freq = null; this._lastLevels = new Float32Array(BAND_COUNT);
      this._detect = createBandDetector(); this._videoTrack = null; this._kind = 'off';
    }
    _state(value, detail) { this.state = value; if (typeof this.onState === 'function') this.onState({ state: value, detail: detail || null }); }
    async _context() {
      const Ctx = root.AudioContext || root.webkitAudioContext;
      if (!Ctx) throw new Error('Web Audio is unavailable in this browser.');
      if (!this._ctx || this._ctx.state === 'closed') this._ctx = new Ctx();
      try { await this._ctx.resume(); } catch (_) { /* caller can retry from a user gesture */ }
      return this._ctx;
    }
    async select(kind, options) {
      options = options || {};
      if (!['off','mic','desktop','file','stream'].includes(kind)) throw new TypeError('Unknown audio source: ' + kind);
      await this.stop();
      if (kind === 'off') { this._state('off'); return; }
      const generation=++this._generation;
      this._kind = kind;
      try {
        const ctx = await this._context();
        if(generation!==this._generation)return;
        if (kind === 'mic') {
          if (!root.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Microphone capture is unavailable.');
          const stream = await navigator.mediaDevices.getUserMedia({audio:{deviceId:options.deviceId?{exact:options.deviceId}:undefined,echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
          if(generation!==this._generation){for(const t of stream.getTracks())t.stop();return;}this._stream=stream;
          this._source = ctx.createMediaStreamSource(this._stream);
          const status=await this._connectAnalysis(this._source,generation);if(generation===this._generation)this._state('mic',status);return;
        }
        if (kind === 'desktop') {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('Desktop audio capture is unavailable.');
          const stream = await navigator.mediaDevices.getDisplayMedia({audio:true,video:true});
          if(generation!==this._generation){for(const t of stream.getTracks())t.stop();return;}this._stream=stream;
          const audioTracks = this._stream.getAudioTracks();
          if (!audioTracks.length) { this._releaseStream(); throw new Error('The selected screen or tab did not share audio.'); }
          this._videoTrack = this._stream.getVideoTracks()[0] || null; // Keep display capture alive until stop().
          this._source = ctx.createMediaStreamSource(this._stream);const status=await this._connectAnalysis(this._source,generation);if(generation===this._generation)this._state('desktop',status);return;
        }
        if (!root.document) throw new Error('HTML media playback is unavailable.');
        const media = this._media = document.createElement('audio'); media.preload='auto'; media.crossOrigin='anonymous'; media.controls=false;
        const url = options.url || (options.file && URL.createObjectURL(options.file));
        if (!url) throw new Error('Provide a file or URL for this source.');
        if (options.file) this._objectUrl = url;
        media.src = url; this.file = options.file || url; media.onended=()=>this._state('ended');
        media.onerror=()=>{if(generation===this._generation)this._state('error','Media failed to load; check the URL, format, and CORS policy.');};
        media.ontimeupdate=()=>{this.position=media.currentTime||0;this.duration=Number.isFinite(media.duration)?media.duration:0;};
        this._source = ctx.createMediaElementSource(media); this._source.connect(ctx.destination); // Only files/streams are monitored; live capture is never played back.
        const status=await this._connectAnalysis(this._source,generation);if(generation!==this._generation)return;
        try { await media.play(); } catch (e) { this._releaseAll(); this._state('error',e.message); throw new Error('Media playback needs a user gesture or failed to start: '+e.message); }
        this._state(kind,status);
      } catch (e) { if(generation!==this._generation)return;this._releaseAll();this._state('error', e && e.message || String(e)); throw e; }
    }
    async _connectAnalysis(source,generation) {
      const ctx=this._ctx; this._analyser=ctx.createAnalyser(); this._analyser.fftSize=1024; this._analyser.smoothingTimeConstant=0;
      source.connect(this._analyser); this._freq=new Float32Array(this._analyser.frequencyBinCount);
      let usedWorklet=false;
      if (ctx.audioWorklet && root.Blob && root.URL && URL.createObjectURL) {
        try {
          let load=moduleLoads.get(ctx);
          if(!load){const url=URL.createObjectURL(new Blob([workletSource()],{type:'application/javascript'}));load=ctx.audioWorklet.addModule(url).finally(()=>URL.revokeObjectURL(url));moduleLoads.set(ctx,load);load.catch(()=>moduleLoads.delete(ctx));}
          await load;if(generation!==this._generation)return null;
          const node=new AudioWorkletNode(ctx,'dynamics-bands',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
          source.connect(node);this._worklet=node;
          this._mute=ctx.createGain();this._mute.gain.value=0;node.connect(this._mute);this._mute.connect(ctx.destination);
          node.port.onmessage=e=>{const d=e.data;if(d&&d.ready)return;if(!d||!d.levels||!d.onsets)return;this._emit(d.levels,d.onsets,d.time);node.port.postMessage(d,[d.levels.buffer,d.onsets.buffer]);};
          usedWorklet=true;
        } catch (_) { }
      }
      if(generation!==this._generation)return null;
      if (!usedWorklet) {
        this._fallbackTimer=root.setInterval(()=>this._fallback(),8);
        return {degraded:true,reason:'AudioWorklet unavailable; using analyser fallback with higher latency.'};
      }
      return null;
    }
    _fallback() {
      if(!this._analyser||!this._ctx)return;
      this._analyser.getFloatFrequencyData(this._freq);
      const edges=makeBandEdges(this._ctx.sampleRate,this._analyser.fftSize), levels=new Float32Array(BAND_COUNT);
      for(let b=0;b<BAND_COUNT;b++){let sum=0,n=0;for(let k=edges[b];k<edges[b+1]&&k<this._freq.length;k++){sum+=Math.pow(10,this._freq[k]/20);n++;}levels[b]=Math.min(1,(sum/Math.max(1,n))*5);}
      this._emit(levels,this._detect(levels,this._ctx.currentTime),this._ctx.currentTime);
    }
    _emit(levels,onsets,time) { const now=root.performance?.now()||Date.now();if(!this._reportStart)this._reportStart=now;this._reportCount++;if(now-this._reportStart>=500){this.analysisHz=this._reportCount*1000/(now-this._reportStart);this._reportCount=0;this._reportStart=now}this._lastLevels.set(levels); if(typeof this.onBands==='function')this.onBands({time:Number(time)||0,levels,onsets}); }
    async inputDevices() {
      if(!root.navigator||!navigator.mediaDevices||!navigator.mediaDevices.enumerateDevices)return [];
      const devices=await navigator.mediaDevices.enumerateDevices();return devices.filter(d=>d.kind==='audioinput').map(d=>({deviceId:d.deviceId,label:d.label||'Microphone'}));
    }
    async playPause() { if(!this._media)return false;const ctx=await this._context();if(ctx.state!=='running')await ctx.resume();if(this._media.paused){await this._media.play();return true;}this._media.pause();return false; }
    async stop() { this._generation++;this._releaseAll();this._kind='off';this.analysisHz=0;this._reportCount=0;this._reportStart=0;this.position=0;this.duration=0;this.file=null;this._state('off'); }
    _releaseStream() { if(this._stream){for(const t of this._stream.getTracks())try{t.stop();}catch(_){}this._stream=null;}this._videoTrack=null; }
    _releaseAll() {
      if(this._fallbackTimer!==null){root.clearInterval(this._fallbackTimer);this._fallbackTimer=null;}
      if(this._worklet){this._worklet.port.onmessage=null;try{this._worklet.disconnect();}catch(_){}this._worklet=null;}
      if(this._mute){try{this._mute.disconnect();}catch(_){}this._mute=null;}
      if(this._source){try{this._source.disconnect();}catch(_){}this._source=null;}
      if(this._analyser){try{this._analyser.disconnect();}catch(_){}this._analyser=null;}
      this._releaseStream();
      if(this._media){this._media.pause();this._media.removeAttribute('src');try{this._media.load();}catch(_){}this._media=null;}
      if(this._objectUrl){URL.revokeObjectURL(this._objectUrl);this._objectUrl=null;}
    }
    async dispose() { await this.stop();if(this._ctx&&this._ctx.state!=='closed')await this._ctx.close();this._ctx=null; }
  }

  DynamicsAudio.BAND_COUNT=BAND_COUNT;
  DynamicsAudio.createBandDetector=createBandDetector;
  DynamicsAudio.workletSource=workletSource;
  if(typeof module!=='undefined'&&module.exports)module.exports=DynamicsAudio;
  root.DynamicsAudio=DynamicsAudio;
})(typeof window!=='undefined'?window:globalThis);
