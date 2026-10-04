const { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain, powerMonitor, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadCatalog } = require('./catalog.cjs');
const { loadAdditionalMotions } = require('./extra-motions.cjs');
const { defaults, validate, readSettings, writeSettings } = require('./settings.cjs');
const { selectedDisplays, distribute } = require('./display.cjs');
app.setName('DeguDesktopVer2');
if (process.platform === 'win32') app.setAppUserModelId('com.kdevelopk.degudesktop.ver2');
const qaProfile = process.argv.find(a => a.startsWith('--qa-profile='))?.slice('--qa-profile='.length);
if (qaProfile) app.setPath('userData', path.resolve(qaProfile));
else app.setPath('userData', path.join(app.getPath('appData'), 'DeguDesktopVer2'));
let settings, catalog, tray, settingsWindow, timer, revision = 0, suspended = false, quitting = false, startupNote = '';
const overlays = new Map(), overlayBounds = new Map(), ready = new Set(), loaded = new Map(), failures = [];
const settingsFile = path.join(app.getPath('userData'), 'settings.json');
const publicCatalog = () => catalog.variants.map(({ id, coatLabel, motions }) => ({ id, coatLabel, motions: Object.fromEntries(Object.entries(motions).map(([action, m]) => [action, { durations: m.durations, tiers: m.tiers, presentation: m.presentation, singlePlay: m.singlePlay, displayScale: m.displayScale, cycles: m.cycles, transitionMs: m.transitionMs }])) }));
const displayList = () => screen.getAllDisplays();
const enabledDisplays = () => selectedDisplays(displayList(), screen.getPrimaryDisplay().id, settings.monitor);
function state() {
  return { settings, catalog: publicCatalog(), displays: displayList().map((d, i) => ({ id: d.id, label: `${d.id === screen.getPrimaryDisplay().id ? 'メイン画面' : `画面 ${i + 1}`} · ${d.size.width} × ${d.size.height}`, scaleFactor: d.scaleFactor })), version: app.getVersion(), note: startupNote };
}
function safeWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
}
function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  const area = screen.getPrimaryDisplay().workArea;
  settingsWindow = new BrowserWindow({ width: Math.min(1000, area.width), height: Math.min(800, area.height), minWidth: 360, minHeight: 500, show: false,
    title: 'DeguDesktopVer2 — 設定', backgroundColor: '#f7f8f3', icon: path.join(__dirname, 'icon.ico'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  safeWindow(settingsWindow);
  settingsWindow.once('ready-to-show', () => { settingsWindow?.show(); });
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.webContents.on('render-process-gone', (_event, details) => reportFailure(`設定画面を開けませんでした (${details.reason})。`));
  settingsWindow.loadFile(path.join(__dirname, 'settings.html')).catch(error => reportFailure(error.message));
}
function buildMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'DeguDesktopVer2', enabled: false },
    { label: '設定を開く', click: openSettings },
    { type: 'separator' },
    { label: '表示する数', submenu: Array.from({ length: 10 }, (_, i) => ({ label: `${i + 1}匹`, type: 'radio', checked: settings.count === i + 1, click: () => change({ count: i + 1 }) })) },
    { label: settings.paused ? '動きを再開' : '動きを一時停止', click: () => change({ paused: !settings.paused }) },
    { label: settings.hidden ? 'デグーを表示' : 'デグーを隠す', click: () => change({ hidden: !settings.hidden }) },
    { type: 'separator' },
    { label: '終了', click: () => app.quit() }
  ]));
  tray.setToolTip(`DeguDesktopVer2 · ${settings.count}匹 · ${settings.hidden ? '非表示' : settings.paused ? '一時停止' : '散歩中'}`);
}
function reportFailure(message) {
  const clean = String(message).slice(0, 300); failures.push(clean); console.error(clean);
  startupNote = 'デグーを表示できませんでした。設定を開き直すか、アプリを再起動してください。';
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('degu:error', startupNote);
}
function selectedPets(displayId) {
  const displays = enabledDisplays();
  const pets = settings.pets.slice(0, settings.count).map((p, slot) => ({ ...p, slot }));
  return distribute(pets, displays).get(displayId) ?? [];
}
function sendOverlay(id, win) {
  if (!ready.has(win.id)) return;
  const d = displayList().find(item => item.id === id); if (!d) return;
  const pets = selectedPets(id);
  const active = !suspended && !settings.hidden && pets.length > 0;
  win.webContents.send('degu:overlay-state', { revision, settings, catalog: publicCatalog(), pets, active,
    area: { x: d.workArea.x - d.bounds.x, y: d.workArea.y - d.bounds.y, width: d.workArea.width, height: d.workArea.height } });
  if (!active) win.hide();
}
function ensureOverlay(d) {
  if (overlays.has(d.id)) return overlays.get(d.id);
  const win = new BrowserWindow({ ...d.bounds, show: false, frame: false, transparent: true, backgroundColor: '#00000000', focusable: false,
    skipTaskbar: true, hasShadow: false, resizable: false, movable: false, fullscreenable: false, title: `DeguDesktopVer2 — 画面 ${d.id}`,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  overlays.set(d.id, win); overlayBounds.set(d.id, JSON.stringify(d.bounds)); safeWindow(win);
  win.setIgnoreMouseEvents(true, { forward: true }); win.setAlwaysOnTop(true, 'floating');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.on('closed', () => { if (overlays.get(d.id) === win) { overlays.delete(d.id); overlayBounds.delete(d.id); } ready.delete(win.id); loaded.delete(win.id); });
  win.webContents.on('render-process-gone', (_event, details) => { if (!quitting) { win.hide(); reportFailure(`デグーの表示が停止しました (${details.reason})。`); } });
  win.loadFile(path.join(__dirname, 'overlay.html')).catch(error => reportFailure(error.message));
  return win;
}
function syncOverlays(rebuild = false) {
  const displays = enabledDisplays(), ids = new Set(displays.map(d => d.id));
  for (const [id, win] of overlays) if (rebuild || !ids.has(id)) { overlays.delete(id); overlayBounds.delete(id); win.destroy(); }
  for (const d of displays) {
    const win=ensureOverlay(d), bounds=JSON.stringify(d.bounds);
    if(overlayBounds.get(d.id)!==bounds){win.setBounds(d.bounds);overlayBounds.set(d.id,bounds);}
    sendOverlay(d.id,win);
  }
}
function publish() {
  revision++; buildMenu(); syncOverlays();
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('degu:state', state());
}
function change(patch) {
  try {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(k => !Object.keys(defaults()).includes(k) || k === 'version')) throw new Error('設定の項目が正しくありません。');
    const next = validate({ ...settings, ...patch });
    writeSettings(settingsFile, next); settings = next; publish();
    return { ok: true, state: state() };
  } catch (error) { return { ok: false, error: error.message }; }
}
function isSettingsSender(event) {
  return settingsWindow && !settingsWindow.isDestroyed() && event.sender.id === settingsWindow.webContents.id && event.senderFrame === event.sender.mainFrame && event.senderFrame.url === pathToFileURL(path.join(__dirname, 'settings.html')).href;
}
function overlayFor(event) { return [...overlays.entries()].find(([_id, win]) => !win.isDestroyed() && win.webContents.id === event.sender.id && event.senderFrame === event.sender.mainFrame); }
let cursorSample = null, lastCursorAt = 0;
function tick() {
  if (quitting || suspended || settings.hidden || !overlays.size) return;
  const point = screen.getCursorScreenPoint();
  const now = performance.now();
  if (cursorSample && cursorSample.x === point.x && cursorSample.y === point.y && now - lastCursorAt < 500) return;
  cursorSample = point; lastCursorAt = now;
  for (const [id, win] of overlays) {
    const d = displayList().find(item => item.id === id); if (!d || !ready.has(win.id)) continue;
    win.webContents.send('degu:cursor', { x: point.x - d.bounds.x, y: point.y - d.bounds.y });
  }
}
async function start() {
  catalog = loadAdditionalMotions(loadCatalog(path.join(__dirname, 'media')), path.join(__dirname, 'motions'));
  const read = readSettings(settingsFile); settings = read.settings;
  if (read.recovered) {
    fs.copyFileSync(settingsFile, `${settingsFile}.invalid-${Date.now()}`);
    startupNote = '保存した設定を読み込めなかったため、初期設定で起動しました。元の設定は保管しています。';
  }
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'tray.png')));
  tray.on('double-click', openSettings); if (process.platform === 'darwin') tray.on('click', openSettings);
  ipcMain.handle('degu:get-state', event => { if (!isSettingsSender(event)) throw new Error('Unauthorized sender'); return state(); });
  ipcMain.handle('degu:update', (event, patch) => { if (!isSettingsSender(event)) throw new Error('Unauthorized sender'); return change(patch); });
  ipcMain.handle('degu:reset', event => { if (!isSettingsSender(event)) throw new Error('Unauthorized sender'); const { version, ...patch } = defaults(); return change(patch); });
  ipcMain.on('degu:ready', event => { const target = overlayFor(event); if (target) { ready.add(target[1].id); sendOverlay(...target); } });
  ipcMain.on('degu:loaded', (event, receivedRevision) => {
    const target = overlayFor(event); if (!target || receivedRevision !== revision) return;
    loaded.set(target[1].id, revision);
    if (!suspended && !settings.hidden && selectedPets(target[0]).length) target[1].showInactive();
  });
  ipcMain.on('degu:failed', (event, message) => { const target = overlayFor(event); if (target) { target[1].hide(); reportFailure(message); } });
  const rebuild = () => { revision++; syncOverlays(true); if (settingsWindow) settingsWindow.webContents.send('degu:state', state()); };
  // Keep unaffected windows and their motion phase when another screen changes.
  const refreshDisplays = () => { revision++; syncOverlays(); if (settingsWindow) settingsWindow.webContents.send('degu:state', state()); };
  screen.on('display-added', refreshDisplays); screen.on('display-removed', refreshDisplays); screen.on('display-metrics-changed', refreshDisplays);
  powerMonitor.on('suspend', () => { suspended = true; revision++; syncOverlays(); });
  powerMonitor.on('resume', () => { suspended = false; refreshDisplays(); });
  Menu.setApplicationMenu(null); buildMenu(); syncOverlays(); timer = setInterval(tick, 1000 / 30);
  if (!fs.existsSync(settingsFile) || process.argv.includes('--settings') || qaProfile) openSettings();
  if (process.platform === 'darwin') app.dock?.hide();
  // Only exposed to the main process, for native window and lifecycle QA.
  globalThis.deguRuntime = { get settings() { return settings; }, get overlays() { return [...overlays.entries()].map(([id, win]) => ({ displayId: id, id: win.id, visible: win.isVisible(), focusable: win.isFocusable(), bounds: win.getBounds(), handle: win.getNativeWindowHandle().toString('hex'), loadedRevision: loaded.get(win.id) })); }, get failures() { return failures; }, settingsFile, rebuild, openSettings, change };
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', openSettings);
  app.on('activate', () => { if (settings) openSettings(); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; clearInterval(timer); });
  app.whenReady().then(start).catch(error => { console.error(error); dialog.showErrorBox('DeguDesktopVer2を起動できませんでした', 'アプリのファイルを確認し、ZIPの場合はすべて展開してから起動してください。'); app.quit(); });
}
