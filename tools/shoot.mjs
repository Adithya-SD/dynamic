// Headless visual test runner. Starts Edge (headless, throwaway profile), opens the dev build, runs a JS
// expression against the page (the harness `H` is loaded) and prints its result plus any page errors.
// Snapshots are posted by the page to tools/dev_server.py and land in .shots/.
//   node tools/shoot.mjs "await H.sheet(H.curated(),{name:'x'})" [width] [height]
import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [expr = 'H.curated().length', w = '1280', h = '800', page = 'docs/index.html'] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'dynamic-edge-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  `--window-size=${w},${h}`, '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
  ...(process.env.GPU === 'low' ? [] : ['--force_high_performance_gpu']), '--no-first-run', '--disable-extensions', '--autoplay-policy=no-user-gesture-required', 'about:blank'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const done = code => { try { edge.kill(); } catch {} setTimeout(() => { try { rmSync(profile, {recursive: true, force: true}); } catch {} process.exit(code); }, 400); };

let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
}
if (!target) { console.error('Edge did not start'); done(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const pending = new Map(), waiters = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') console.log('PAGE EXCEPTION:', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) console.log('PAGE ' + m.params.type.toUpperCase() + ':', m.params.args.map(a => a.value ?? a.description).join(' '));
  waiters.forEach(f => f(m));
});
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({id, method, params})); });
await send('Runtime.enable'); await send('Page.enable');
const loaded = new Promise(r => waiters.push(m => m.method === 'Page.loadEventFired' && r()));
await send('Page.navigate', {url: `http://127.0.0.1:8765/${page}?dev&t=${Date.now()}`});
if (process.env.MOBILE) await send('Emulation.setDeviceMetricsOverride', {width: +w, height: +h, deviceScaleFactor: 2, mobile: true});
if (process.env.MOBILE) await send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
await loaded; await sleep(600);
const boot = `await App.ready;await Engine.warmAll();if(typeof H==='undefined')await new Promise((ok,no)=>{const s=document.createElement('script');s.src='/tools/harness.js?'+Date.now();s.onload=ok;s.onerror=no;document.body.append(s)});`;
const body = expr.includes(';') ? expr : `return (${expr});`; // contains ';' => statements, write your own return
const res = await send('Runtime.evaluate', {expression: `(async()=>{${boot}
${body}})()`, awaitPromise: true, returnByValue: true, timeout: 900000});
if (res.result?.exceptionDetails) console.log('EVAL ERROR:', res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text);
else console.log(JSON.stringify(res.result?.result?.value ?? res.result?.result?.description ?? res.error));
if (process.env.SHOT) {
  mkdirSync('.shots', {recursive: true});
  const shot = await send('Page.captureScreenshot', {format: 'png'});
  writeFileSync(`.shots/${process.env.SHOT}.png`, Buffer.from(shot.result.data, 'base64'));
}
done(0);
