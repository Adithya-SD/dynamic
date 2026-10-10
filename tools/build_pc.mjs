// Build "Dynamic for Windows" (Electron). Heavy files live on D: (the repo's drive is nearly full):
//   node tools/build_pc.mjs           → D:\CodexBuild\DynamicPC\out\Dynamic-win32-x64\Dynamic.exe
// Sources: pc/ (shell) and docs/ (the web build, run `python tools/build_web.py` first).
import {execSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, rmSync, readdirSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = process.env.PCBUILD || 'D:/CodexBuild/DynamicPC';
const tmp = join(work, 'tmp');   // the system drive is nearly full: keep every temp file on D:
mkdirSync(tmp, {recursive: true});
const env = {...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp, npm_config_cache: join(work, 'npm-cache'), ELECTRON_CACHE: join(work, 'electron-cache'), electron_config_cache: join(work, 'electron-cache')};
const run = (cmd, cwd = work) => execSync(cmd, {cwd, env, stdio: 'inherit'});

mkdirSync(work, {recursive: true});
if (!existsSync(join(work, 'node_modules', 'electron'))) {
  writeFileSync(join(work, 'package.json'), JSON.stringify({name: 'dynamic-pc-build', private: true, version: '1.0.0'}));
  run('npm install --no-audit --no-fund electron@44.7.0 @electron/packager');
}

// Stage: the shell plus the web build as app/
const stage = join(work, 'stage');
rmSync(stage, {recursive: true, force: true});
mkdirSync(join(stage, 'app'), {recursive: true});
for (const f of ['main.js', 'preload.js', 'package.json']) cpSync(join(root, 'pc', f), join(stage, f));
if (existsSync(join(root, 'pc', 'icon.ico'))) cpSync(join(root, 'pc', 'icon.ico'), join(stage, 'icon.ico'));
for (const f of readdirSync(join(root, 'docs'))) {
  if (/^(index\.html|manifest\.webmanifest|icon-\d+\.png)$/.test(f)) cpSync(join(root, 'docs', f), join(stage, 'app', f));
}

const out = join(work, 'out');
rmSync(out, {recursive: true, force: true});
const icon = existsSync(join(stage, 'icon.ico')) ? ` --icon="${join(stage, 'icon.ico')}"` : '';
run(`npx @electron/packager "${stage}" Dynamic --platform=win32 --arch=x64 --out="${out}" --overwrite --prune=false --electron-version=44.7.0 --download.cacheRoot="${join(work, 'electron-cache')}"${icon}`);
console.log('Built', join(out, 'Dynamic-win32-x64', 'Dynamic.exe'));
