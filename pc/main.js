/* Dynamic for Windows. A full-screen Chromium shell around the same engine as the web and phone apps.
   What it adds over a browser tab:
   - the fast GPU: the discrete graphics card is requested from Chromium and from Windows itself (the per-app graphics
     preference), instead of the integrated chip browsers usually land on;
   - priority: the app and its GPU / renderer processes run at high priority, never throttled in the background;
   - the music: "System audio" captures everything the PC plays (Spotify, a browser, a game) with no picker and no
     "share" bar, and starts by itself;
   - no distractions: borderless full screen, no menus, display kept awake, cursor hides when idle. */
const {app, BrowserWindow, session, desktopCapturer, protocol, net, powerSaveBlocker, ipcMain, Menu} = require('electron');
const path = require('path'), os = require('os'), fs = require('fs'), {execFileSync} = require('child_process'), {pathToFileURL} = require('url');

/* The page comes from a "live" folder next to the program when there is one (tools/build_all.ps1 keeps it current), and
   otherwise from the copy packed inside. While the app is open, a new build in the live folder reloads the page by itself:
   updating the Windows app is a file copy, not a repackage. */
const BUNDLED = path.join(__dirname, 'app');
const LIVE = process.env.DYNAMIC_LIVE || path.join(path.dirname(process.execPath), '..', '..', 'live');
const liveIndex = path.join(LIVE, 'index.html');
const root = () => (fs.existsSync(liveIndex) ? LIVE : BUNDLED);

// ---- GPU and scheduling: decided before the app is ready ----
const SWITCHES = [['force_high_performance_gpu'], ['ignore-gpu-blocklist'], ['enable-gpu-rasterization'], ['enable-zero-copy'],
  ['use-angle', 'd3d11'], ['disable-renderer-backgrounding'], ['disable-background-timer-throttling'], ['disable-backgrounding-occluded-windows'],
  ['autoplay-policy', 'no-user-gesture-required'], ['disable-features', 'CalculateNativeWinOcclusion']];
for (const [k, v] of SWITCHES) { if (v) app.commandLine.appendSwitch(k, v); else app.commandLine.appendSwitch(k); }

protocol.registerSchemesAsPrivileged([{scheme: 'dynamic', privileges: {standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true}}]);

/* Windows keeps a per-app graphics preference (Settings > Display > Graphics). Set this exe to "High performance";
   the first time, restart once so Chromium picks the right adapter from the start. */
function preferDiscreteGpu() {
  if (process.platform !== 'win32' || !app.isPackaged) return false;
  const key = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences', exe = process.execPath;
  try {
    const out = execFileSync('reg', ['query', key, '/v', exe], {encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']});
    if (out.includes('GpuPreference=2')) return false;
  } catch (e) { /* not set yet */ }
  try { execFileSync('reg', ['add', key, '/v', exe, '/t', 'REG_SZ', '/d', 'GpuPreference=2;', '/f'], {windowsHide: true, stdio: 'ignore'}); return true; } catch (e) { return false; }
}

function boostPriority() {
  const hi = os.constants.priority.PRIORITY_HIGH;
  for (const m of app.getAppMetrics()) { try { os.setPriority(m.pid, hi); } catch (e) { /* not allowed for this process */ } }
}

let win = null, blocker = 0;
if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  if (preferDiscreteGpu()) { app.relaunch(); app.exit(0); return; }
  Menu.setApplicationMenu(null);
  try { os.setPriority(process.pid, os.constants.priority.PRIORITY_HIGH); } catch (e) { /* ignore */ }

  protocol.handle('dynamic', req => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || !p) p = '/index.html';
    const base = path.normalize(root()), file = path.normalize(path.join(base, p));
    if (!file.startsWith(base)) return new Response('', {status: 403});
    return net.fetch(pathToFileURL(file).toString());
  });

  // System-wide audio, no picker: the page's getDisplayMedia call is answered with the whole screen and a loopback of
  // everything the PC is playing.
  const ses = session.defaultSession;
  ses.setDisplayMediaRequestHandler(async (req, cb) => {
    try { const sources = await desktopCapturer.getSources({types: ['screen'], thumbnailSize: {width: 1, height: 1}}); cb({video: sources[0], audio: 'loopback'}); }
    catch (e) { cb({}); }
  }, {useSystemPicker: false});
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'display-capture', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'midi', 'sensors'].includes(perm)));
  ses.setPermissionCheckHandler(() => true);

  win = new BrowserWindow({
    fullscreen: true, frame: false, show: false, backgroundColor: '#000000', title: 'Dynamic', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false, autoplayPolicy: 'no-user-gesture-required'}
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', async () => {
    boostPriority(); setTimeout(boostPriority, 4000);
    // Listen to the PC's own sound as soon as the engine is ready (a script run from the shell counts as a user gesture).
    try { await win.webContents.executeJavaScript('(async()=>{await App.ready;if(!Music.active())await audio.select("desktop")})().catch(()=>{})', true); } catch (e) { /* the button is still there */ }
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (input.control && input.key.toLowerCase() === 'q') app.quit();
    else if (input.key === 'F12' && input.control && input.shift) win.webContents.toggleDevTools();
  });
  // Smoke test (set DYNAMIC_SMOKE=<output file>): windowed, report what the engine sees after a few seconds, quit.
  if (process.env.DYNAMIC_SMOKE) {
    win.setFullScreen(false); win.setSize(1280, 720);
    setTimeout(async () => {
      let r;
      try { r = await win.webContents.executeJavaScript('({renderer:gl.getParameter(gl.RENDERER),fps:Math.round(App.fps),refresh:Gov.refresh,res:Engine.res,secure:isSecureContext,pc:!!PCAPP,audio:audio.state,mode:audio.analysisMode,music:Music.active(),bpm:Math.round(Music.bpm),preset:allPresets()[current].n})'); }
      catch (e) { r = {error: String(e)}; }
      try { r.gpuInfo = await app.getGPUInfo('basic'); r.priorities = app.getAppMetrics().map(m => [m.type, m.pid]); } catch (e) { /* ignore */ }
      require('fs').writeFileSync(process.env.DYNAMIC_SMOKE, JSON.stringify(r, null, 1));
      app.quit();
    }, 9000);
  }
  win.loadURL('dynamic://app/index.html');
  // A new build appeared in the live folder: reload (the page restarts, system audio is picked up again).
  let reloadT = 0;
  try { fs.watchFile(liveIndex, {interval: 1500}, (cur, prev) => { if (cur.mtimeMs !== prev.mtimeMs && cur.size > 0) { clearTimeout(reloadT); reloadT = setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.reloadIgnoringCache(); }, 800); } }); } catch (e) { /* no live folder */ }
  blocker = powerSaveBlocker.start('prevent-display-sleep');

  ipcMain.handle('fullscreen', () => { win.setFullScreen(!win.isFullScreen()); return win.isFullScreen(); });
  ipcMain.handle('top', (e, on) => { win.setAlwaysOnTop(on); return on; });
  ipcMain.handle('quit', () => app.quit());
  ipcMain.handle('info', async () => {
    try { const g = await app.getGPUInfo('basic'); const d = (g.gpuDevice || []).find(x => x.active) || (g.gpuDevice || [])[0] || {}; return {gpu: d.deviceString || '', electron: process.versions.electron}; } catch (e) { return {}; }
  });
});

app.on('window-all-closed', () => app.quit());
app.on('quit', () => { try { powerSaveBlocker.stop(blocker); } catch (e) { /* ignore */ } });
