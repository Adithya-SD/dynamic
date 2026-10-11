// Smoke test for the watch bundle (wear/build/watchAssets/engine.js) without a watch: runs it in a Node VM against a mock
// OpenGL ES bridge that reflects uniforms from the real shader sources, then drives it like the app does (resize, start,
// frames, touches, presets, music). Catches script errors, missing browser stand-ins and uniform typos in seconds.
//   node tools/watch_smoke.mjs [frames]
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'wear/build/watchAssets/engine.js'), 'utf8');
const FRAMES = +(process.argv[2] || 240);

const C = new Map();
const K = k => { if (!C.has(k)) C.set(k, 0x10000 + C.size); return C.get(k); };
const GLSL_TYPES = { sampler2D: 'SAMPLER_2D', float: 'FLOAT', vec2: 'FLOAT_VEC2', vec3: 'FLOAT_VEC3', vec4: 'FLOAT_VEC4', mat3: 'FLOAT_MAT3', int: 'INT', bool: 'BOOL' };
let ids = 0;
const shaders = new Map(), programs = new Map();
const stats = { draws: 0, programs: 0, uniformCalls: 0, targets: 0 };
const bad = [];

const gl = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (typeof k === 'symbol') return undefined;
    if (/^[A-Z][A-Z0-9_]+$/.test(k)) return K(k);
    return (...a) => { throw new Error('GL function not in the bridge: ' + k); };
  },
});
const def = (n, f) => { gl[n] = f; };
for (const n of ['createProgram', 'createShader', 'createTexture', 'createFramebuffer', 'createVertexArray', 'createBuffer']) def(n, () => { if (n === 'createProgram') stats.programs++; if (n === 'createTexture') stats.targets++; return ++ids; });
def('shaderSource', (s, text) => shaders.set(s, text));
def('attachShader', (p, s) => { (programs.get(p) || programs.set(p, []).get(p)).push(s); });
def('getProgramParameter', (p, k) => {
  if (k === K('LINK_STATUS')) return true;
  if (k === K('ACTIVE_UNIFORMS')) return uniformsOf(p).length;
  return 0;
});
def('getShaderInfoLog', () => ''); def('getProgramInfoLog', () => '');
def('getActiveUniform', (p, i) => uniformsOf(p)[i]);
def('getUniformLocation', (p, n) => ++ids);
def('checkFramebufferStatus', () => K('FRAMEBUFFER_COMPLETE'));
def('getExtension', () => ({}));
def('getParameter', k => k === K('MAX_TEXTURE_SIZE') ? 4096 : 'mock');
def('getError', () => 0);
def('loadProgramBinary', () => false); def('saveProgramBinary', () => true);
for (const n of ['compileShader', 'linkProgram', 'detachShader', 'deleteShader', 'deleteProgram', 'useProgram', 'bindTexture', 'activeTexture', 'texParameteri', 'texStorage2D',
  'generateMipmap', 'pixelStorei', 'texImage2D', 'texSubImage2D', 'deleteTexture', 'deleteFramebuffer', 'bindFramebuffer', 'framebufferTexture2D', 'viewport', 'clearColor', 'clear',
  'bindVertexArray', 'enableVertexAttribArray', 'vertexAttribPointer', 'vertexAttribDivisor', 'bindBuffer', 'bufferData', 'enable', 'disable', 'blendFunc', 'flush', 'finish', 'deleteBuffer', 'deleteVertexArray'])
  def(n, () => undefined);
for (const n of ['uniform1i', 'uniform1f', 'uniform1fv', 'uniform2fv', 'uniform3fv', 'uniform4fv', 'uniformMatrix3fv']) def(n, (loc, ...v) => {
  stats.uniformCalls++;
  for (const x of v) if (typeof x === 'number' && !Number.isFinite(x)) bad.push(n + ' got ' + x);
  for (const x of v) if (x && x.length) for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) { bad.push(n + ' array has ' + x[i]); break; }
});
def('drawArrays', () => { stats.draws++; }); def('drawArraysInstanced', () => { stats.draws++; });
def('readPixels', (x, y, w, h, f, t, buf) => { if (buf) for (let i = 0; i < buf.length; i++) buf[i] = 90 + (i % 7) * 20; });

function uniformsOf(p) {
  const out = [], seen = new Set();
  for (const s of programs.get(p) || []) {
    const text = shaders.get(s) || '';
    for (const m of text.matchAll(/^\s*uniform\s+(?:highp\s+|mediump\s+|lowp\s+)?(\w+)\s+(\w+)\s*(?:\[(\d+)\])?\s*;/gm)) {
      if (seen.has(m[2])) continue; seen.add(m[2]);
      out.push({ name: m[2] + (m[3] ? '[0]' : ''), type: K(GLSL_TYPES[m[1]] || 'FLOAT'), size: m[3] ? +m[3] : 1 });
    }
  }
  return out;
}

const events = [], errors = [];
const store = new Map();
let clockMs = 1000;
const sandbox = {
  __gl: gl,
  __host: {
    now: () => clockMs,
    read: k => store.has(k) ? store.get(k) : null,
    write: (k, v) => { store.set(k, v); },
    emit: (n, t) => { events.push([n, t]); },
    surface: () => [450, 450],
    glStats: () => 'mock',
  },
  console: { log() {}, info() {}, debug() {}, warn: (...a) => errors.push('warn: ' + a.join(' ')), error: (...a) => errors.push(a.join(' ')) },
};
vm.createContext(sandbox);
const run = code => vm.runInContext(code, sandbox, { filename: 'engine.js' });

try { run(src); } catch (e) { console.error('LOAD FAILED:', e.stack); process.exit(1); }
run('__resize(450,450)');
run('__start()');
await new Promise(r => setTimeout(r, 20));
if (!events.some(e => e[0] === 'ready')) { console.error('never became ready', events, errors.slice(0, 5)); process.exit(1); }

let drawn = 0;
const t0 = Date.now();
for (let i = 0; i < FRAMES; i++) {
  clockMs += 33.3;
  if (i === 20) run('__pointer(0,1,225,225)');
  if (i > 20 && i < 80) run(`__pointer(1,1,${225 + 100 * Math.cos(i / 6)},${225 + 100 * Math.sin(i / 6)})`);
  if (i === 80) run('__pointer(2,1,225,225)');
  if (i === 100) run('WatchApp.cycle(1)');
  if (i === 120) run('WatchApp.palette(1)');
  if (i === 130) run('WatchApp.random()');
  if (i === 140) run('WatchApp.mic(true,"Listening")');
  if (i > 140 && i % 3 === 0) run(`__nativeBands(Array.from({length:24},(_, b)=>Math.max(0,.8-b*.03)*(.5+.5*Math.sin(${i}/${3 + (i % 5)}+b))))`);
  if (i === 150) run('__nativeQuat(0.1,0.05,0,0.99)');
  if (i === 160) run('WatchApp.quality(3)');
  if (i === 180) run('WatchApp.go(allPresets().findIndex(p=>p.n==="Nebula"))');
  if (run('__frame(' + clockMs + ')')) drawn++;
  if (i % 40 === 0) await new Promise(r => setTimeout(r, 0));
}
const state = JSON.parse(run('WatchApp.state()'));
const presets = JSON.parse(run('WatchApp.presets()'));
console.log(`frames ${FRAMES}, drawn ${drawn}, ${Date.now() - t0} ms; GL: ${stats.programs} programs, ${stats.draws} draws, ${stats.uniformCalls} uniform calls, ${stats.targets} textures`);
console.log('state', JSON.stringify(state));
console.log(`${presets.length} presets for the watch; events:`, [...new Set(events.map(e => e[0]))].join(', '));
const uniq = [...new Set(errors)];
if (bad.length) console.error('NON-FINITE uniforms:', [...new Set(bad)].slice(0, 10));
if (uniq.length) { console.error('ERRORS:\n' + uniq.slice(0, 15).join('\n')); process.exit(1); }
if (bad.length) process.exit(1);
console.log('OK');
