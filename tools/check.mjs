// Smoke test before shipping: boots the built page (docs/index.html) in headless Edge as desktop, phone and watch, drives
// every tab, presets (dissolve and glide), the randomiser, eyes, the infinite and wrap canvases, music-free frames, and fails
// on any page exception, shader error or GPU allocation error.   node tools/check.mjs
import {spawn, spawnSync} from 'node:child_process';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = 8790 + Math.floor(Math.random() * 100);
const server = spawn('python', [join(root, 'tools', 'dev_server.py'), String(port)], {cwd: root, stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${port}/docs/index.html`); break; } catch { await sleep(250); } }

const common = `const r={};const find=n=>allPresets().findIndex(x=>x.n===n);H.run(40);
for(let i=0;i<SCHEMA.tabs.length;i++){UI.show(i,true);H.run(2)}UI.shut();
applyPreset(find('Mandala'),{animate:true});H.run(30);applyPreset(find('Nebula'),{animate:true});H.run(30);
applyPreset(find('Third Eye'),{animate:true});H.run(40);applyPreset(find('Eyeball'),{animate:true});H.run(40);applyPreset(find('Infinity'),{animate:true});H.run(40);
Rand.next();H.run(40);Rand.next();H.run(40);Rand.back();H.run(10);
for(const m of [1,2,0]){P.cvs=m;H.run(40)}
UI.onlyChanged=true;UI.search();UI.onlyChanged=false;UI.search();
r.err=Engine.error;r.fps=Math.round(App.fps);r.preset=allPresets()[current].n;r.build=BUILD.id;return JSON.stringify(r)`;
const jobs = [
  ['desktop 1280x800', {}, common, 1280, 800, 'docs/index.html'],
  ['phone 412x915', {MOBILE: '1'}, common, 412, 915, 'docs/index.html'],
  ['watch 400x400', {}, `H.run(120);return JSON.stringify({err:Engine.error,watch:WATCH})`, 400, 400, 'docs/index.html?watch&x=1']
];
let failed = 0;
for (const [name, env, js, w, h, page] of jobs) {
  const p = spawnSync('node', [join(root, 'tools', 'shoot.mjs'), js, String(w), String(h), page], {cwd: root, env: {...process.env, DEVPORT: String(port), ...env}, encoding: 'utf8', timeout: 240000});
  const out = (p.stdout || '') + (p.stderr || '');
  const bad = /PAGE EXCEPTION|EVAL ERROR|PAGE ERROR/.test(out) || /"err":"[^"]/.test(out.replace(/\\"/g, '"')) || p.status !== 0;
  console.log((bad ? 'FAIL  ' : 'ok    ') + name + (bad ? '\n' + out.split('\n').slice(0, 8).join('\n') : ''));
  if (bad) failed++;
}
server.kill();
process.exit(failed ? 1 : 0);
