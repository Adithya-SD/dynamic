// Offline beat-sync test: synthesises songs (known beat times), runs the exact analysis code the app runs
// (analysisCore → createSignal → BeatTracker), polls the beat clock like the render loop does, and scores the
// predicted beats against the truth. node tools/beat_test.mjs [filter]
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const DynamicsAudio = require('../web/src/40_audio.js');
const BeatTracker = require('../web/src/42_beat.js');
const SR = 48000;

let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const noise = () => rnd() * 2 - 1;
function add(buf, t0, dur, fn, gain = 1) { const a = Math.max(0, Math.round(t0 * SR)), b = Math.min(buf.length, Math.round((t0 + dur) * SR)); for (let i = a; i < b; i++) buf[i] += fn((i - a) / SR) * gain; }
const kick = t => Math.sin(2 * Math.PI * (45 * t + 75 * (1 - Math.exp(-t * 30)) / 30)) * Math.exp(-t * 9);
const snare = t => (noise() * .7 + .4 * Math.sin(2 * Math.PI * 190 * t)) * Math.exp(-t * 18);
let hp = 0; const hat = t => { const n = noise(), v = n - hp; hp = n; return v * .5 * Math.exp(-t * 60); };
const bass = f => t => (Math.sin(2 * Math.PI * f * t) + .4 * Math.sin(4 * Math.PI * f * t)) * Math.min(1, t * 200) * Math.exp(-t * 2.5);
const piano = f => t => [1, .5, .3, .2].reduce((s, a, k) => s + a * Math.sin(2 * Math.PI * f * (k + 1) * t), 0) * Math.min(1, t * 150) * Math.exp(-t * 2.2) * .4;
const pad = f => t => [1, 1.5, 2].reduce((s, m) => s + Math.sin(2 * Math.PI * f * m * t), 0) * Math.min(1, t / .4) * .12;
const chord = [130.8, 164.8, 196, 246.9];

/* pattern: per-beat callback (buf, time, beatIndex, beatLen) */
function song({bpm, bars = 24, beatsPerBar = 4, jitter = 0, tempoTo = 0, gain = 1, noiseFloor = .002, swing = 0, play}) {
  const beats = []; let t = 1, n = bars * beatsPerBar;
  for (let i = 0; i < n; i++) { const b = tempoTo ? bpm + (tempoTo - bpm) * i / n : bpm; beats.push(t); t += 60 / b; }
  const buf = new Float32Array(Math.ceil((t + 1) * SR));
  beats.forEach((bt, i) => play(buf, bt + (rnd() - .5) * 2 * jitter, i, (beats[i + 1] || bt + 60 / bpm) - bt, beatsPerBar, swing));
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i] * gain + noise() * noiseFloor;
  return {buf, beats};
}
const SONGS = {
  'house 128': {bpm: 128, play(b, t, i, L) { add(b, t, .4, kick); if (i % 2) add(b, t, .2, snare, .5); add(b, t + L / 2, .05, hat, .4); add(b, t + L / 2, .3, bass(55), .3); }},
  'hiphop 90 swing': {bpm: 90, play(b, t, i, L) { if (i % 4 === 0) add(b, t, .4, kick); if (i % 4 === 2) add(b, t + L * .5, .4, kick, .8); if (i % 2) add(b, t, .25, snare, .7); for (let k = 0; k < 4; k++) add(b, t + L * (k / 4 + (k % 2 ? .07 : 0)), .04, hat, .25); }},
  'dnb 174': {bpm: 174, play(b, t, i, L) { if (i % 4 === 0) add(b, t, .3, kick); if (i % 4 === 2) add(b, t + L * .5, .3, kick, .8); if (i % 2) add(b, t, .2, snare, .8); add(b, t, .04, hat, .2); add(b, t + L / 2, .04, hat, .2); }},
  'ballad 68 piano': {bpm: 68, noiseFloor: .003, play(b, t, i, L) { add(b, t, 2.5, piano(chord[i % 4] / 2), .8); add(b, t + L / 2, 1.5, piano(chord[(i + 2) % 4]), .35); if (i % 4 === 0) add(b, t, 2, bass(65.4), .5); }},
  'trap 140 halftime': {bpm: 140, play(b, t, i, L) { if (i % 8 === 0 || i % 8 === 5) add(b, t, .6, bass(49), .9); if (i % 4 === 2) add(b, t, .3, snare, .9); for (let k = 0; k < (i % 4 === 3 ? 4 : 2); k++) add(b, t + L * k / (i % 4 === 3 ? 4 : 2), .03, hat, .3); }},
  'waltz 100 (3/4)': {bpm: 100, beatsPerBar: 3, play(b, t, i, L) { if (i % 3 === 0) add(b, t, 1.5, bass(65.4), .8); else add(b, t, .8, piano(chord[i % 4]), .6); }},
  'rock 112 human': {bpm: 112, jitter: .012, play(b, t, i, L) { if (i % 2 === 0) add(b, t, .4, kick); else add(b, t, .25, snare, .8); add(b, t, .05, hat, .3); add(b, t + L / 2, .05, hat, .3); add(b, t, L, bass(82.4), .25); }},
  'tempo drift 120→132': {bpm: 120, tempoTo: 132, play(b, t, i, L) { add(b, t, .4, kick); if (i % 2) add(b, t, .2, snare, .5); add(b, t + L / 2, .05, hat, .4); }},
  'quiet mic 124 (-36 dB)': {bpm: 124, gain: .016, noiseFloor: .0015, play(b, t, i, L) { add(b, t, .4, kick); if (i % 2) add(b, t, .2, snare, .5); add(b, t + L / 2, .05, hat, .3); add(b, t, 1, pad(chord[i % 4]), .5); }},
  'pad + soft kick 76': {bpm: 76, play(b, t, i, L) { add(b, t, L * 1.2, pad(chord[i % 4]), 1); add(b, t, .4, kick, .35); }},
};

function run(name, cfg) {
  const {buf, beats} = song(cfg), core = DynamicsAudio.analysisCore(SR), sig = DynamicsAudio.createSignal(), bt = new BeatTracker();
  const hop = new Float32Array(128), fired = []; let nextPoll = 0, lockAt = null;
  for (let i = 0; i + 128 <= buf.length; i += 128) {
    hop.set(buf.subarray(i, i + 128)); core.process(hop);
    const t = (i + 128) / SR; sig.push(core.levels, t, core.odf); bt.push(t, sig.odf);
    if (t >= nextPoll) { nextPoll = t + 1 / 144; const r = bt.poll(t); if (r) { const k = Math.floor((t - bt.tb) / (bt.period / 100)); fired.push([bt.tb + k * bt.period / 100, bt.conf, r]); } }
  }
  // Score from 5 s on: each true beat matched by a predicted beat within ±50 ms.
  const truth = beats.filter(x => x > 6), pred = fired.filter(f => f[0] > 6 && f[0] < beats[beats.length - 1] + .1).map(f => f[0]);
  const match = (tr, pr, tol) => { let hit = 0, err = 0; const used = new Set(); for (const x of tr) { let best = -1, bd = tol; pr.forEach((p, j) => { const d = Math.abs(p - x); if (d < bd && !used.has(j)) { bd = d; best = j; } }); if (best >= 0) { used.add(best); hit++; err += pr[best] - x; } } return {hit, err: hit ? err / hit * 1000 : 0}; };
  const m = match(truth, pred, .05), P = pred.length ? m.hit / pred.length : 0, R = truth.length ? m.hit / truth.length : 0, F = P + R ? 2 * P * R / (P + R) : 0;
  // Lock time: first time from which every later true beat (for 4 beats) is hit.
  for (const x of beats) { if (pred.length === 0) break; const ok = beats.filter(y => y >= x).slice(0, 4).every(y => fired.some(f => Math.abs(f[0] - y) < .05)); if (ok) { lockAt = x - 1; break; } }
  const conf = fired.filter(f => f[0] > 6).reduce((s, f) => s + f[1], 0) / Math.max(1, fired.filter(f => f[0] > 6).length);
  console.log(`${name.padEnd(24)} bpm ${String(cfg.bpm).padStart(3)} → ${bt.bpm.toFixed(1).padStart(6)}  F ${F.toFixed(2)}  P ${P.toFixed(2)} R ${R.toFixed(2)}  offset ${m.err.toFixed(0).padStart(4)} ms  lock ${lockAt == null ? ' --' : lockAt.toFixed(1) + 's'}  conf ${conf.toFixed(2)}`);
  return F;
}
const filter = process.argv[2] || '';
if (filter === '--wav') { await import('node:fs').then(fs => { globalThis.__fs = fs; }); }
let total = 0, n = 0;
for (const [name, cfg] of Object.entries(SONGS)) if (filter !== '--wav' && name.includes(filter)) { total += run(name, cfg); n++; }
if (n) console.log('mean F', (total / n).toFixed(3));

// Drop detection: intro (hats + pad) → build (accelerating snare roll + noise riser, no bass) → DROP → breakdown → build → DROP.
{
  const bpm = 126, B = 60 / bpm, bars = 44, buf = new Float32Array(Math.ceil((bars * 4 * B + 3) * SR)), drops = [1 + 16 * 4 * B, 1 + 36 * 4 * B];
  const sec = bar => bar < 8 ? 'intro' : bar < 16 ? 'build' : bar < 26 ? 'drop' : bar < 32 ? 'break' : bar < 36 ? 'build' : 'drop';
  for (let i = 0; i < bars * 4; i++) {
    const t = 1 + i * B, s = sec(i >> 2);
    if (s === 'intro' || s === 'break') { add(buf, t + B / 2, .05, hat, .3); add(buf, t, B * 1.1, pad(chord[(i >> 2) % 4]), .6); }
    if (s === 'build') { const into = ((i >> 2) % 8) / 8, div = into < .5 ? 1 : into < .75 ? 2 : 4; for (let k = 0; k < div; k++) add(buf, t + k * B / div, .1, snare, .3 + .4 * into); add(buf, t, B, () => noise() * .15 * into, 1); add(buf, t, B * 1.1, pad(chord[0]), .3); }
    if (s === 'drop') { add(buf, t, .4, kick); if (i % 2) add(buf, t, .2, snare, .6); add(buf, t + B / 2, .05, hat, .4); add(buf, t, B, bass(55), .6); add(buf, t, B * 1.1, pad(chord[(i >> 2) % 4]), .4); }
  }
  for (let i = 0; i < buf.length; i++) buf[i] += noise() * .002;
  if (filter === '--wav') {   // 16-bit stereo WAV for the in-browser end-to-end test
    const n = buf.length, out = Buffer.alloc(44 + n * 4), w = (o, v, b) => b === 4 ? out.writeUInt32LE(v, o) : out.writeUInt16LE(v, o);
    out.write('RIFF', 0); w(4, 36 + n * 4, 4); out.write('WAVEfmt ', 8); w(16, 16, 4); w(20, 1); w(22, 2); w(24, SR, 4); w(28, SR * 4, 4); w(32, 4); w(34, 16); out.write('data', 36); w(40, n * 4, 4);
    let pk = 0; for (const v of buf) pk = Math.max(pk, Math.abs(v)); for (let i = 0; i < n; i++) { const v = Math.round(buf[i] / pk * .9 * 32767); out.writeInt16LE(v, 44 + i * 4); out.writeInt16LE(v, 46 + i * 4); }
    globalThis.__fs.mkdirSync('.shots', {recursive: true}); globalThis.__fs.writeFileSync('.shots/edm_test.wav', out); console.log('wrote .shots/edm_test.wav', (n / SR).toFixed(1) + 's, drops at', drops.map(x => x.toFixed(2)).join(', ')); process.exit(0);
  }
  const core = DynamicsAudio.analysisCore(SR), sig = DynamicsAudio.createSignal(), st = new BeatTracker.SectionTracker(), hop = new Float32Array(128), states = [];
  let last = '';
  for (let i = 0; i + 128 <= buf.length; i += 128) { hop.set(buf.subarray(i, i + 128)); core.process(hop); const t = (i + 128) / SR; st.push(t, core.levels); if (st.state !== last) { states.push(`${t.toFixed(1)}:${st.state}`); last = st.state; } }
  console.log('drops truth', drops.map(x => x.toFixed(2)).join(' '), '| detected', st.events.map(x => x.toFixed(2)).join(' '));
  console.log('sections', states.join(' '), '| truth: build', (1 + 32 * B).toFixed(1), 'drop', drops[0].toFixed(1), 'break', (1 + 104 * B).toFixed(1), 'build', (1 + 128 * B).toFixed(1), 'drop', drops[1].toFixed(1));
}
