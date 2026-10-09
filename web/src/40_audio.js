/* Browser audio capture and analysis.
   Audio thread (AudioWorklet): analysisCore() runs a 2048-point FFT every 128 samples (~375 frames/s) and reports
   24 log-spaced band levels plus a spectral-flux onset signal in four ranges (full, low, mid, high).
   Main thread: createSignal() adds automatic gain (quiet microphones and loud masters reach the same range) and
   per-band onsets; BeatTracker (42_beat.js) turns the onset signal into tempo, phase and predicted beats.
   analysisCore and createSignal are plain functions so node tests (tools/beat_test.mjs) run the exact same code. */
(function (root) {
  'use strict';

  const BAND_COUNT = 24;
  const FRAME = 29; // 24 levels, 4 onset ranges, time

  function analysisCore(sampleRate) {
    const N = 2048, MASK = N - 1, LAG = 4, GAMMA = .02; // gentle log compression: loud kicks still outweigh off-beat bass and hats
    const ring = new Float32Array(N), re = new Float32Array(N), im = new Float32Array(N), win = new Float32Array(N);
    const rev = new Uint16Array(N), cs = new Float32Array(N / 2), sn = new Float32Array(N / 2);
    for (let i = 0; i < N; i++) { win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1)); let x = i, r = 0; for (let b = 0; b < 11; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
    for (let i = 0; i < N / 2; i++) { const a = -2 * Math.PI * i / N; cs[i] = Math.cos(a); sn[i] = Math.sin(a); }
    const bin = f => Math.max(1, Math.min(N / 2 - 1, Math.round(f * N / sampleRate)));
    const top = Math.min(16000, sampleRate * .475), K = bin(top) + 1, kLow = bin(180), kMid = bin(2500);
    const edges = new Uint16Array(BAND_COUNT + 1);
    for (let i = 0; i <= BAND_COUNT; i++) edges[i] = Math.max(1, Math.min(N / 2, Math.round(35 * Math.pow(top / 35, i / BAND_COUNT) * N / sampleRate)));
    // Log magnitudes of the last LAG frames: flux compares against the frame ~10 ms back, with a 3-bin max filter
    // so vibrato and slides do not read as onsets.
    const hist = []; for (let i = 0; i < LAG; i++) hist.push(new Float32Array(K));
    const mag = new Float32Array(K), levels = new Float32Array(BAND_COUNT), odf = new Float32Array(4);
    let write = 0, slot = 0;
    return {
      levels, odf,
      process(input) {
        for (let j = 0; j < input.length; j++) { ring[write] = input[j]; write = (write + 1) & MASK; }
        for (let i = 0; i < N; i++) { const q = rev[i]; re[q] = ring[(write + i) & MASK] * win[i]; im[q] = 0; }
        for (let len = 2; len <= N; len <<= 1) {
          const h = len >> 1, stride = N / len;
          for (let base = 0; base < N; base += len) for (let k = 0; k < h; k++) {
            const t = k * stride, wr = cs[t], wi = sn[t], a = base + k, b = a + h, vr = re[b] * wr - im[b] * wi, vi = re[b] * wi + im[b] * wr;
            re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
          }
        }
        for (let b = 0; b < BAND_COUNT; b++) {
          let s = 0, a = edges[b], e = edges[b + 1]; if (e <= a) e = a + 1;
          for (let k = a; k < e && k < N / 2; k++) s += re[k] * re[k] + im[k] * im[k];
          levels[b] = Math.sqrt(s) / 1024 * 4;
        }
        const old = hist[slot];
        let fl = 0, fm = 0, fh = 0;
        for (let k = 1; k < K; k++) { mag[k] = Math.log(1 + GAMMA * Math.sqrt(re[k] * re[k] + im[k] * im[k])); }
        for (let k = 1; k < K - 1; k++) {
          const d = mag[k] - Math.max(old[k - 1], old[k], old[k + 1]);
          if (d > 0) { if (k < kLow) fl += d; else if (k < kMid) fm += d; else fh += d; }
        }
        old.set(mag); slot = (slot + 1) % LAG;
        odf[0] = fl + fm + fh; odf[1] = fl; odf[2] = fm; odf[3] = fh;
      }
    };
  }

  /* Main-thread conditioning shared by every source (web worklet, analyser fallback, Android capture).
     push(raw levels, time, odf?) → normalised levels (loudest band ≈ .8 of its 5 s peak), per-band onsets, odf. */
  function createSignal() {
    const prev = new Float32Array(BAND_COUNT), avg = new Float32Array(BAND_COUNT), cool = new Float64Array(BAND_COUNT).fill(-1e9);
    const levels = new Float32Array(BAND_COUNT), onsets = new Float32Array(BAND_COUNT), lprev = new Float32Array(BAND_COUNT), odf = new Float32Array(4);
    let ref = .02, last = 0;
    return {
      levels, onsets, odf, gain: 1, loud: 0,
      push(raw, time, rawOdf) {
        const dt = last ? Math.min(.1, Math.max(.001, time - last)) : 1 / 375; last = time;
        let mx = 0; for (let b = 0; b < BAND_COUNT; b++) mx = Math.max(mx, raw[b] || 0);
        ref = Math.max(mx, ref * Math.exp(-dt / 5), .003);   // instant attack, 5 s release, floor keeps silence quiet
        const g = .8 / ref, fluxScale = (512 / 48000) / dt, retain = Math.pow(.92, dt / (512 / 48000));
        this.gain = g; this.loud = mx;
        for (let b = 0; b < BAND_COUNT; b++) {
          const level = Math.min(1.5, (raw[b] || 0) * g), flux = Math.max(0, level - prev[b]) * fluxScale;
          const threshold = Math.max(.025, avg[b] * 1.8);
          onsets[b] = flux > threshold && level > .05 && time - cool[b] >= .035 ? Math.min(1, flux * 3.2) : 0;
          if (onsets[b]) cool[b] = time;
          avg[b] = avg[b] * retain + flux * (1 - retain); prev[b] = level; levels[b] = level;
        }
        if (rawOdf) odf.set(rawOdf);
        else {   // no spectrum (Android capture, analyser fallback): flux of the log band levels
          let f = [0, 0, 0];
          for (let b = 0; b < BAND_COUNT; b++) { const v = Math.log(1 + 40 * levels[b]), d = v - lprev[b]; lprev[b] = v; if (d > 0) f[b < 5 ? 0 : b < 15 ? 1 : 2] += d; }
          odf[0] = f[0] + f[1] + f[2]; odf[1] = f[0]; odf[2] = f[1]; odf[3] = f[2];
        }
        return this;
      }
    };
  }

  function workletSource() {
    return `const analysisCore=${analysisCore.toString()};const BAND_COUNT=${BAND_COUNT};
    class DynamicsAnalysis extends AudioWorkletProcessor{
      constructor(){super();this.core=analysisCore(sampleRate);this.buf=new Float32Array(128);this.n=0;this.pool=[];
        for(let i=0;i<16;i++)this.pool.push(new Float32Array(${FRAME}));
        this.port.onmessage=e=>{if(e.data instanceof Float32Array)this.pool.push(e.data)};this.port.postMessage({ready:true})}
      process(inputs){
        const ch=inputs[0];if(!ch||!ch[0])return true;const a=ch[0],b=ch[1],n=a.length;
        for(let j=0;j<n;j++){this.buf[this.n++]=b?(a[j]+b[j])*.5:a[j];
          if(this.n===128){this.n=0;this.core.process(this.buf);const it=this.pool.pop();
            if(it){it.set(this.core.levels,0);it.set(this.core.odf,24);it[28]=currentTime+(j+1)/sampleRate;this.port.postMessage(it,[it.buffer])}}}
        return true}
    }
    registerProcessor('dynamic-analysis',DynamicsAnalysis);`;
  }

  const moduleLoads = new WeakMap();
  const KINDS = ['off', 'mic', 'desktop', 'file', 'stream'];

  class DynamicsAudio {
    constructor() {
      this.onState = null; this.onBands = null; this.analysisHz = 0; this._reportCount = 0; this._reportStart = 0;
      this.state = 'off'; this.position = 0; this.duration = 0; this.file = null; this.signal = createSignal();
      this._ctx = null; this._source = null; this._stream = null; this._media = null;
      this._worklet = null; this._mute = null; this._fallbackTimer = null; this._objectUrl = null; this._generation = 0;
      this._analyser = null; this._freq = null; this._videoTrack = null; this._kind = 'off';
    }
    _state(value, detail) { this.state = value; if (typeof this.onState === 'function') this.onState({ state: value, detail: detail || null }); }
    async _context() {
      const Ctx = root.AudioContext || root.webkitAudioContext;
      if (!Ctx) throw new Error('Web Audio is unavailable in this browser.');
      if (!this._ctx || this._ctx.state === 'closed') this._ctx = new Ctx({ latencyHint: 'interactive' });
      try { await this._ctx.resume(); } catch (_) { /* caller can retry from a user gesture */ }
      return this._ctx;
    }
    async select(kind, options) {
      options = options || {};
      if (!KINDS.includes(kind)) throw new TypeError('Unknown audio source: ' + kind);
      await this.stop();
      if (kind === 'off') { this._state('off'); return; }
      const generation = ++this._generation;
      this._kind = kind;
      const raw = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      try {
        // The context is created (and resumed) inside the click, before any permission prompt, so it never starts suspended.
        const ctx = await this._context();
        if (generation !== this._generation) return;
        if (kind === 'mic') {
          if (!root.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Microphone needs a secure page (https) and a browser that allows it.');
          let stream;
          try { stream = await navigator.mediaDevices.getUserMedia({ audio: options.deviceId ? { ...raw, deviceId: { exact: options.deviceId } } : raw, video: false }); }
          catch (e) {
            if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw new Error('Microphone blocked. Allow it in the address bar (lock icon → Microphone), then try again.');
            if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) throw new Error('No microphone found.');
            if (e && e.name === 'NotReadableError') throw new Error('The microphone is busy in another app.');
            throw e;
          }
          if (generation !== this._generation) { for (const t of stream.getTracks()) t.stop(); return; }
          this._stream = stream;
          if (ctx.state !== 'running') try { await ctx.resume(); } catch (_) { }
          this._source = ctx.createMediaStreamSource(stream);
          const status = await this._connectAnalysis(this._source, generation);
          if (generation === this._generation) this._state('mic', status);
          return;
        }
        if (kind === 'desktop') {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('Tab and system audio capture needs Chrome or Edge on a computer.');
          // Video is required by the API; ask for the smallest, slowest stream so capture costs almost nothing.
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 1, width: { ideal: 320 }, height: { ideal: 180 } },
            audio: { ...raw, suppressLocalAudioPlayback: false },
            systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'include', preferCurrentTab: false
          });
          if (generation !== this._generation) { for (const t of stream.getTracks()) t.stop(); return; }
          this._stream = stream;
          const audioTracks = stream.getAudioTracks();
          if (!audioTracks.length) { this._releaseStream(); throw new Error('No audio was shared. Pick the tab (or Entire screen) and switch on “Share audio”.'); }
          this._videoTrack = stream.getVideoTracks()[0] || null;
          if (this._videoTrack) { try { await this._videoTrack.applyConstraints({ frameRate: 1 }); } catch (_) { } }
          audioTracks[0].addEventListener('ended', () => { if (generation === this._generation) this.stop(); });
          this._source = ctx.createMediaStreamSource(stream);
          const status = await this._connectAnalysis(this._source, generation);
          if (generation === this._generation) this._state('desktop', status);
          return;
        }
        if (!root.document) throw new Error('HTML media playback is unavailable.');
        const media = this._media = document.createElement('audio'); media.preload = 'auto'; media.crossOrigin = 'anonymous'; media.controls = false;
        const url = options.url || (options.file && URL.createObjectURL(options.file));
        if (!url) throw new Error('Provide a file or URL for this source.');
        if (options.file) this._objectUrl = url;
        media.src = url; this.file = options.file || url; media.onended = () => this._state('ended');
        media.onerror = () => { if (generation === this._generation) this._state('error', 'Media failed to load; check the URL, format, and CORS policy.'); };
        media.ontimeupdate = () => { this.position = media.currentTime || 0; this.duration = Number.isFinite(media.duration) ? media.duration : 0; };
        media.onseeked = () => { if (typeof this.onSeek === 'function') this.onSeek(); };
        this._source = ctx.createMediaElementSource(media); this._source.connect(ctx.destination); // files/streams are heard; live capture is never played back
        const status = await this._connectAnalysis(this._source, generation); if (generation !== this._generation) return;
        try { await media.play(); } catch (e) { this._releaseAll(); this._state('error', e.message); throw new Error('Media playback needs a tap to start: ' + e.message); }
        this._state(kind, status);
      } catch (e) { if (generation !== this._generation) return; this._releaseAll(); this._state('error', e && e.message || String(e)); throw e; }
    }
    async _connectAnalysis(source, generation) {
      const ctx = this._ctx;
      let usedWorklet = false;
      if (ctx.audioWorklet && root.Blob && root.URL && URL.createObjectURL) {
        try {
          let load = moduleLoads.get(ctx);
          if (!load) { const url = URL.createObjectURL(new Blob([workletSource()], { type: 'application/javascript' })); load = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url)); moduleLoads.set(ctx, load); load.catch(() => moduleLoads.delete(ctx)); }
          await load; if (generation !== this._generation) return null;
          const node = new AudioWorkletNode(ctx, 'dynamic-analysis', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
          source.connect(node); this._worklet = node;
          this._mute = ctx.createGain(); this._mute.gain.value = 0; node.connect(this._mute); this._mute.connect(ctx.destination); // keeps the graph pulling
          node.port.onmessage = e => { const d = e.data; if (!(d instanceof Float32Array)) return; this._emit(d.subarray(0, 24), d[28], d.subarray(24, 28)); node.port.postMessage(d, [d.buffer]); };
          usedWorklet = true;
        } catch (_) { }
      }
      if (generation !== this._generation) return null;
      if (!usedWorklet) {
        this._analyser = ctx.createAnalyser(); this._analyser.fftSize = 1024; this._analyser.smoothingTimeConstant = 0;
        source.connect(this._analyser); this._freq = new Float32Array(this._analyser.frequencyBinCount);
        this._fallbackTimer = root.setInterval(() => this._fallback(), 8);
        return { degraded: true, reason: 'AudioWorklet unavailable; using analyser fallback with higher latency.' };
      }
      return null;
    }
    _fallback() {
      if (!this._analyser || !this._ctx) return;
      this._analyser.getFloatFrequencyData(this._freq);
      const sr = this._ctx.sampleRate, n = this._freq.length, levels = new Float32Array(BAND_COUNT), top = Math.min(16000, sr * .475);
      for (let b = 0; b < BAND_COUNT; b++) {
        const a = Math.max(1, Math.round(35 * Math.pow(top / 35, b / BAND_COUNT) * 1024 / sr)), e = Math.max(a + 1, Math.round(35 * Math.pow(top / 35, (b + 1) / BAND_COUNT) * 1024 / sr));
        let s = 0; for (let k = a; k < e && k < n; k++) { const m = Math.pow(10, this._freq[k] / 20) * 512; s += m * m; }
        levels[b] = Math.sqrt(s) / 1024 * 4;
      }
      this._emit(levels, this._ctx.currentTime, null);
    }
    _emit(raw, time, odf) {
      const now = root.performance ? performance.now() : Date.now();
      if (!this._reportStart) this._reportStart = now; this._reportCount++;
      if (now - this._reportStart >= 500) { this.analysisHz = this._reportCount * 1000 / (now - this._reportStart); this._reportCount = 0; this._reportStart = now; }
      const s = this.signal.push(raw, Number(time) || 0, odf);
      if (typeof this.onBands === 'function') this.onBands({ time: Number(time) || 0, levels: s.levels, onsets: s.onsets, odf: s.odf, raw, gain: s.gain, loud: s.loud });
    }
    async inputDevices() {
      if (!root.navigator || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices(); return devices.filter(d => d.kind === 'audioinput').map(d => ({ deviceId: d.deviceId, label: d.label || 'Microphone' }));
    }
    async playPause() { if (!this._media) return false; const ctx = await this._context(); if (ctx.state !== 'running') await ctx.resume(); if (this._media.paused) { await this._media.play(); return true; } this._media.pause(); return false; }
    async stop() { this._generation++; this._releaseAll(); this._kind = 'off'; this.analysisHz = 0; this._reportCount = 0; this._reportStart = 0; this.position = 0; this.duration = 0; this.file = null; this._state('off'); }
    _releaseStream() { if (this._stream) { for (const t of this._stream.getTracks()) try { t.stop(); } catch (_) { } this._stream = null; } this._videoTrack = null; }
    _releaseAll() {
      if (this._fallbackTimer !== null) { root.clearInterval(this._fallbackTimer); this._fallbackTimer = null; }
      if (this._worklet) { this._worklet.port.onmessage = null; try { this._worklet.disconnect(); } catch (_) { } this._worklet = null; }
      if (this._mute) { try { this._mute.disconnect(); } catch (_) { } this._mute = null; }
      if (this._source) { try { this._source.disconnect(); } catch (_) { } this._source = null; }
      if (this._analyser) { try { this._analyser.disconnect(); } catch (_) { } this._analyser = null; }
      this._releaseStream();
      if (this._media) { this._media.pause(); this._media.removeAttribute('src'); try { this._media.load(); } catch (_) { } this._media = null; }
      if (this._objectUrl) { URL.revokeObjectURL(this._objectUrl); this._objectUrl = null; }
    }
    async dispose() { await this.stop(); if (this._ctx && this._ctx.state !== 'closed') await this._ctx.close(); this._ctx = null; }
  }

  DynamicsAudio.BAND_COUNT = BAND_COUNT;
  DynamicsAudio.analysisCore = analysisCore;
  DynamicsAudio.createSignal = createSignal;
  DynamicsAudio.workletSource = workletSource;
  if (typeof module !== 'undefined' && module.exports) module.exports = DynamicsAudio;
  root.DynamicsAudio = DynamicsAudio;
})(typeof window !== 'undefined' ? window : globalThis);
