/* Beat tracker. Works on the onset signal from 40_audio.js (any rate, any source) and keeps a beat clock that
   predicts beats ahead of time, so visuals can land on the beat instead of trailing it.

   1. Onset strength: the four flux ranges are each divided by their own running mean (loudness-free), the bass range
      counts double (kicks carry the pulse), resampled to 100 frames/s, minus a 0.3 s moving average.
   2. Tempo (4×/s): autocorrelation of the last 10 s, scored as a comb (lags L, 2L, 3L, 4L) and weighted by a
      log-normal prior around 120 BPM. A different tempo must win for 0.75 s in a row before it replaces the
      current one; double/half switches need a clear margin, so the pulse does not flip octaves.
   3. Phase (4×/s): the pulse train of that period that best matches the last 4 s of onsets (recent beats weigh more).
   4. Clock: a phase-locked loop pulls the predicted beat towards each measurement; three large misses in a row
      re-seat it at once (new song, break, tempo jump).
   5. Bar: the beat that keeps carrying the most bass becomes beat 1 of 4.
   Confidence falls to 0 in silence or when nothing repeats, and the app then follows raw onsets instead. */
(function (root) {
  'use strict';
  const FR = 100, N = 1000, EST = 25;
  const DETECT_DELAY = .022; // onset signal peaks ~22 ms after the true attack (measured by tools/beat_test.mjs)

  class BeatTracker {
    constructor() { this.reset(); }
    reset() {
      this.buf = new Float32Array(N); this.lowBuf = new Float32Array(N); this.n = 0;
      this.cur = -1; this.f0 = 0; this.acc = 0; this.accLow = 0; this.accN = 0;
      this.mean = new Float32Array([1, 1, 1, 1]).fill(1e-3); this.ma = 0; this.hopT = 0;
      this.period = 0; this.tb = 0; this.conf = 0; this.strength = 0; this.locked = false;
      this.cand = 0; this.candN = 0; this.miss = 0; this.fired = -1e9; this.count = 0;
      this.bar = new Float32Array(4); this.pending = []; this.activity = 0; this.since = 0;
      this.hint = 0;
    }
    /* New section (a drop): forget the onset history so the build's rolls do not hold the old tempo; the clock keeps
       running and the first estimate (2 s later) is adopted outright. */
    refresh() { this.buf.fill(0); this.lowBuf.fill(0); this.f0 += this.n; this.n = 0; this.since = 0; this.fresh = true; this.candN = 0; this.conf *= .6; }
    get bpm() { return this.period ? 60 * FR / this.period : 0; }
    /* Optional tempo hint (e.g. from track metadata): biases the prior towards it. */
    setHint(bpm) { this.hint = bpm > 0 ? bpm : 0; }

    push(time, odf) {
      const dt = this.hopT ? Math.min(.1, Math.max(.0005, time - this.hopT)) : .0027; this.hopT = time;
      const a = 1 - Math.exp(-dt / 2.5);
      let o = 0, low = 0;
      for (let i = 0; i < 4; i++) {
        const v = odf[i] || 0; this.mean[i] += (v - this.mean[i]) * a; this.mean[i] = Math.max(this.mean[i], 1e-4);
      }
      o = (odf[0] || 0) / this.mean[0] + 2 * (odf[1] || 0) / this.mean[1] + .5 * (odf[2] || 0) / this.mean[2];
      low = (odf[1] || 0) / this.mean[1];
      this.activity += ((odf[0] || 0) - this.activity) * a;
      const f = Math.floor(time * FR);
      if (this.cur < 0) { this.cur = f; this.f0 = f; }
      if (f > this.cur) {
        if (f - this.cur > 50 || f < this.cur - 50) { this.reset(); this.cur = f; this.f0 = f; }
        else {
          this._frame(this.accN ? this.acc / this.accN : 0, this.accN ? this.accLow / this.accN : 0);
          for (let k = this.cur + 1; k < f; k++) this._frame(0, 0);
          this.cur = f;
        }
        this.acc = 0; this.accLow = 0; this.accN = 0;
      }
      this.acc += o; this.accLow += low; this.accN++;
    }
    _frame(o, low) {
      this.ma += (o - this.ma) * (1 / 30);
      const i = this.n % N;
      this.buf[i] = Math.max(0, o - this.ma); this.lowBuf[i] = low; this.n++;
      this._settleBar();
      if (++this.since >= EST) { this.since = 0; this._estimate(); }
    }
    /* Linear copy of the last `len` frames, oldest first. */
    _last(src, len) {
      const out = new Float32Array(len), start = this.n - len;
      for (let j = 0; j < len; j++) out[j] = src[(start + j) % N];
      return out;
    }
    _estimate() {
      const len = Math.min(this.n, N);
      if (len < 200) return;
      const x = this._last(this.buf, len);
      let m = 0; for (let j = 0; j < len; j++) m += x[j]; m /= len;
      const y = new Float32Array(len); for (let j = 0; j < len; j++) y[j] = x[j] - m;
      const Lmax = Math.min(480, len - 90), r = new Float32Array(Lmax + 2);
      for (let L = 0; L <= Lmax + 1 && L < len; L++) { let s = 0; for (let j = L; j < len; j++) s += y[j] * y[j - L]; r[L] = s / (len - L); }
      const r0 = r[0] || 1e-9; for (let L = 0; L < r.length; L++) r[L] /= r0;
      const at = L => { if (L >= Lmax) return 0; const i = Math.floor(L), f = L - i; return r[i] * (1 - f) + r[i + 1] * f; };
      const center = this.hint || 120;
      const comb = L => { let s = 0, w = 0; for (let k = 1; k <= 4; k++) { if (k * L > Lmax) break; const wk = 1 / k; s += Math.max(-.2, at(k * L)) * wk; w += wk; } return w ? s / w : 0; };
      const score = L => { const bpm = 60 * FR / L, z = Math.log2(bpm / center) / (this.hint ? .35 : .9); return Math.max(0, comb(L)) * Math.exp(-.5 * z * z); };
      let best = 0, bestS = -1, sum = 0, cnt = 0;
      for (let L = 60 * FR / 210; L <= 60 * FR / 52; L += .25) { const s = score(L); sum += s; cnt++; if (s > bestS) { bestS = s; best = L; } }
      const mean = sum / cnt;
      // Refine: parabola through neighbours.
      const s1 = score(best - .25), s3 = score(best + .25), den = s1 - 2 * bestS + s3;
      if (den < 0) best += .25 * .5 * (s1 - s3) / den;

      // Metrical level: when every other pulse of the doubled period is much weaker (a ballad's off-beat chords),
      // the slower pulse is the beat. Otherwise the comb and prior decide (half/double stays on the beat grid).
      const win = this._last(this.buf, Math.min(len, 600));
      let want = best;
      if (60 * FR / (best * 2) >= 50) { const a = this._train(win, best * 2), m = this._train(win, best * 2, a.ph + best); if (m / Math.max(a.A, 1e-9) < .32) want = best * 2; }

      if (!this.period || this.fresh) { this.period = want; this.fresh = false; }
      else {
        const ratio = want / this.period;
        if (Math.abs(ratio - 1) < .045) { this.period += (want - this.period) * .3; this.candN = 0; }
        else {
          const octave = [.5, 2, 1.5, 2 / 3, 3, 1 / 3].some(k => Math.abs(ratio - k) < .05);
          if (octave || score(want) > score(this.period) * 1.12) {
            if (this.cand && Math.abs(want / this.cand - 1) < .04) this.candN++; else { this.cand = want; this.candN = 1; }
            if (this.candN >= (octave ? 4 : 3)) { this.period = want; this.candN = 0; this.miss = 3; }
          } else this.candN = Math.max(0, this.candN - 1);
        }
      }
      const peak = comb(this.period);
      this.strength = peak;

      // Phase: best pulse train over the last 4 s.
      const T = this.period, W = Math.min(len, 400), tr = this._train(this._last(this.buf, W), T);
      const bp = tr.ph, bA = tr.A, aSum = tr.sum, aN = tr.n;
      const contrast = aN ? bA / Math.max(1e-6, aSum / aN) : 0;
      const endIndex = this.n - 1;              // absolute frame index of z[W-1]
      const tMeas = (this.f0 + endIndex - bp + .5) / FR - DETECT_DELAY;
      const P = T / FR;

      const live = this.activity > 1e-4;
      const c = live ? Math.min(1, Math.max(0, (peak - .05) / .2)) * Math.min(1, Math.max(0, (contrast - 1.15) / 1.2)) * Math.min(1, Math.max(0, (bestS / Math.max(mean, 1e-6) - 1.2) / 1.5) + .4) : 0;
      this.conf += (c - this.conf) * (c < this.conf ? .5 : .35);

      if (!this.locked) { this.tb = tMeas; this.locked = true; this.miss = 0; }
      else {
        let e = (tMeas - this.tb) / P; e -= Math.round(e);
        if (Math.abs(e) > .2) this.miss++; else this.miss = 0;
        if (this.miss >= 3) { this.tb = tMeas; this.miss = 0; }
        else this.tb += e * P * .35;
      }
      // Keep tb close to now so rounding stays exact.
      const k = Math.floor((tMeas - this.tb) / P); this.tb += k * P;
    }
    /* Pulse train of period T over z (oldest first). With ph given, the strength at that phase; else the best phase. */
    _train(z, T, ph) {
      const W = z.length, sm = new Float32Array(W);
      for (let j = 0; j < W; j++) sm[j] = z[j] + .5 * ((z[j - 1] || 0) + (z[j + 1] || 0));
      const v = p => { const i = Math.floor(p), f = p - i; return i < 0 || i >= W - 1 ? 0 : sm[i] * (1 - f) + sm[i + 1] * f; };
      const at = q => { let A = 0, w = 1; for (let p = W - 1 - q; p >= 0; p -= T) { A += v(p) * w; w *= .88; } return A; };
      if (ph !== undefined) return at(((ph % T) + T) % T);
      let bp = 0, bA = -1, sum = 0, n = 0;
      for (let q = 0; q < T; q += .5) { const A = at(q); sum += A; n++; if (A > bA) { bA = A; bp = q; } }
      return { ph: bp, A: bA, sum, n };
    }
    /* Beat clock at audio time t (seconds, same clock as push()). */
    phase(t) { if (!this.period) return 0; const P = this.period / FR, q = (t - this.tb) / P; return q - Math.floor(q); }
    /* Call every frame with the audio time to show. Returns 0, or 1 (beat), or 2 (downbeat) once per predicted beat. */
    poll(t) {
      if (!this.period || !this.locked) return 0;
      const P = this.period / FR, k = Math.floor((t - this.tb) / P), bt = this.tb + k * P;
      if (bt <= this.fired + P * .55) return 0;
      this.fired = bt; this.count++;
      this.pending.push([bt, this.count & 3]);
      return ((this.count - this.barOffset()) & 3) === 0 ? 2 : 1;
    }
    barOffset() { let b = 0; for (let i = 1; i < 4; i++) if (this.bar[i] > this.bar[b]) b = i; return b; }
    /* Once a fired beat is 60 ms in the past, credit its bass onset to its slot in the bar. */
    _settleBar() {
      const now = (this.f0 + this.n - 1) / FR;
      while (this.pending.length && this.pending[0][0] + .06 < now) {
        const [bt, slot] = this.pending.shift(), c = Math.round((bt + DETECT_DELAY) * FR) - this.f0;
        let e = 0; for (let j = c - 3; j <= c + 3; j++) if (j >= this.n - N && j < this.n && j >= 0) e = Math.max(e, this.lowBuf[j % N]);
        for (let i = 0; i < 4; i++) this.bar[i] *= .97;
        this.bar[slot] += e;
      }
    }
  }
  /* Song sections from loudness and bass relative to the song's own recent history (raw levels, before automatic
     gain, so a drop stays a jump). States: calm, build, full. A drop is bass and loudness leaping back after a stretch
     without bass: the moment the whole picture should explode. Also reports intensity (0..1) and build tension (0..1). */
  class SectionTracker {
    constructor() { this.reset(); }
    reset() {
      this.t = 0; this.lf = -90; this.ls = -90; this.ll = -90; this.ff = -90; this.fs = -90; this.fl = -90; this.hf = -90; this.hs = -90;
      this.state = 'calm'; this.since = 0; this.lastDrop = -1e9; this.noBass = 0; this.intensity = 0; this.tension = 0; this.drop = 0; this.events = [];
      this.bassHist = []; this.histT = 0;
    }
    push(time, raw) {
      const dt = this.t ? Math.min(.1, Math.max(.0005, time - this.t)) : .0027; this.t = time;
      let lo = 0, all = 0, hi = 0;
      for (let b = 0; b < 24; b++) { const e = (raw[b] || 0) * (raw[b] || 0); all += e; if (b < 5) lo += e; else if (b >= 14) hi += e; }
      const db = x => 10 * Math.log10(x + 1e-9), L = db(lo / 5), F = db(all / 24), H = db(hi / 10), k = tau => 1 - Math.exp(-dt / tau);
      if (this.lf < -89) { this.lf = this.ls = this.ll = L; this.ff = this.fs = this.fl = F; this.hf = this.hs = H; }
      this.lf += (L - this.lf) * k(.07); this.ls += (L - this.ls) * k(3); this.ll += (L - this.ll) * k(25);
      this.ff += (F - this.ff) * k(.12); this.fs += (F - this.fs) * k(3); this.fl += (F - this.fl) * k(25);
      this.hf += (H - this.hf) * k(.3); this.hs += (H - this.hs) * k(6);
      // Bass level history (one sample per 50 ms, 6 s): a drop is bass returning after it was gone.
      if ((this.histT += dt) >= .05) { this.histT = 0; this.bassHist.push(this.lf); if (this.bassHist.length > 120) this.bassHist.shift(); }
      const silent = F < -75, loud = this.ff - this.fl, prom = this.lf - this.ff;   // prom: bass vs whole mix, dB
      const bassless = prom < -14 || silent;
      this.noBass = bassless ? Math.min(3, this.noBass + dt) : Math.max(0, this.noBass - dt * 3);
      if (silent) this.heard = 0; else this.heard = (this.heard || 0) + dt;
      this.intensity += (Math.min(1, Math.max(0, (loud + 12) / 15)) * (silent ? 0 : 1) - this.intensity) * k(.25);
      this.drop *= Math.exp(-dt / .6);
      const h = this.bassHist, before = h.length > 40 ? Math.max(...h.slice(-80, -10)) : 99;
      if (!silent && this.lf - before > 12 && prom > -9 && loud > -4 && time - this.lastDrop > 8) {
        this.lastDrop = time; this.drop = 1; this.noBass = 0; this.events.push(time); this.go('full', time);
      }
      // Build: no bass while the top end rises (rolls, risers, noise sweeps). Calm: quiet or bassless and flat.
      const rising = this.hf - this.hs;
      if (this.state === 'build') { if (!bassless && this.noBass < .2) this.go('full', time); }
      else if (this.noBass > 1 && rising > 1.2 && this.heard > 6) this.go('build', time);
      else if (this.state === 'full' && (loud < -8 || this.noBass > 2)) this.go('calm', time);
      else if (this.state === 'calm' && loud > -5 && !bassless) this.go('full', time);
      this.tension = this.state === 'build' ? Math.min(1, (time - this.since) / 12) : Math.max(0, this.tension - dt);
    }
    go(s, t) { if (this.state !== s) { this.state = s; this.since = t; } }
  }
  BeatTracker.SectionTracker = SectionTracker;
  BeatTracker.FR = FR;
  if (typeof module !== 'undefined' && module.exports) module.exports = BeatTracker;
  root.BeatTracker = BeatTracker; root.SectionTracker = SectionTracker;
})(typeof window !== 'undefined' ? window : globalThis);
