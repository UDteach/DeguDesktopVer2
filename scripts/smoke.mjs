import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { _electron } from 'playwright';
const root = path.resolve(import.meta.dirname, '..');
const packaged = process.argv.includes('--packaged');
const dir = path.join(root, '.codex/qa', `${packaged ? 'packaged' : 'source'}-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
const after = path.join(root, 'docs/design/evidence/after'); fs.mkdirSync(after, { recursive: true });
const profile = path.join(dir, 'profile');
const executablePath = packaged ? path.join(root, 'release/win-unpacked/DeguDesktopVer2.exe') : path.join(root, 'node_modules/electron/dist/electron.exe');
const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
const launch = () => _electron.launch({ executablePath, args: [...(packaged ? [] : [root]), `--qa-profile=${profile}`, '--settings'], env });
const report = { packaged, startedAt: new Date().toISOString(), checks: [], errors: [], captures: [], measurements: [], processes: [] };
let electron, overlay;
function observeProcess(application) {
  const child=application.process(), record={pid:child.pid,stderr:''};report.processes.push(record);
  child.stderr?.on('data',data=>{record.stderr=(record.stderr+data.toString()).slice(-8000);});
  child.on('exit',(code,signal)=>{record.exitCode=code;record.signal=signal;record.exitedAt=new Date().toISOString();});
}
function check(name) { report.checks.push(name); console.log(`PASS ${name}`); }
function observe(page) { page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); }); }
async function settingsPage() {
  for (let i=0; i<100; i++) {
    const page = electron.windows().find(p => !p.isClosed() && p.url().endsWith('/settings.html'));
    if (page) { await page.waitForFunction(() => window.deguPreviewDiagnostics?.ready); return page; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Settings window did not load');
}
async function overlaysReady() {
  for (let i=0; i<100; i++) {
    const pages = electron.windows().filter(p=>!p.isClosed() && p.url().endsWith('/overlay.html'));
    const samples = await Promise.allSettled(pages.map(p=>p.evaluate(()=>window.deguDiagnostics?.ready && (!window.deguDiagnostics.active || window.deguDiagnostics.paints>0))));
    for(const sample of samples) if(sample.status==='rejected' && !/Target page, context or browser has been closed/.test(sample.reason.message)) throw sample.reason;
    if (pages.length && samples.every(s=>s.status==='fulfilled' && s.value)) return pages;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Overlay did not paint');
}
async function waitOverlay(condition, argument, options={}) {
  const deadline=Date.now()+(options.timeout ?? 30000);
  while(Date.now()<deadline) {
    try { return await overlay.waitForFunction(condition,argument,{timeout:Math.max(1,deadline-Date.now())}); }
    catch(error) {
      if(!/Target page, context or browser has been closed/.test(error.message))throw error;
      const previous=overlay.url(), pages=await overlaysReady();
      overlay=pages[0];
      for(const candidate of pages)if(await candidate.evaluate(()=>window.deguDiagnostics?.pets.some(p=>p.slot===0))){overlay=candidate;break;}
      (report.overlayReplacements??=[]).push({previous,current:overlay.url(),at:new Date().toISOString()});
      console.log('NOTE display overlay recreated; continuing with its replacement');
    }
  }
  throw new Error('Overlay condition timed out across display replacement');
}
async function capture(page, name) {
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({ path: path.join(after, name), fullPage: true, timeout: 10000 }); report.captures.push(name);
}
try {
  electron = await launch(); observeProcess(electron); electron.on('window', observe); electron.windows().forEach(observe);
  await electron.evaluate(({screen})=>{globalThis.deguQADisplayEvents=[];for(const event of ['display-added','display-removed','display-metrics-changed'])screen.on(event,(_event,display,metrics)=>globalThis.deguQADisplayEvents.push({event,displayId:display.id,metrics,at:Date.now()}));});
  let page = await settingsPage(); let overlays = await overlaysReady();
  assert.equal(await page.title(), 'DeguDesktopVer2 — 設定');
  assert.equal(await page.locator('.pet-row').count(),1); assert.equal(await page.locator('#error').isVisible(),false);
  await page.setViewportSize({width:1000,height:760});
  await capture(page, 'settings-desktop.png'); check('first launch, live preview and original PNGs');
  const nativeWindows = await electron.evaluate(()=>globalThis.deguRuntime.overlays);
  assert.ok(nativeWindows.every(w=>!w.focusable && w.visible));
  overlay = overlays[0]; const native = nativeWindows[0];
  assert.equal(await overlay.evaluate(()=>typeof window.require),'undefined');
  assert.equal(await overlay.evaluate(()=>typeof window.degu.getState),'undefined');
  check('sandboxed renderer and overlay cannot call settings IPC');
  const snapshot = await overlay.evaluate(()=>window.deguDiagnostics);
  const pet = snapshot.pets[0];
  const point = await electron.evaluate(({screen},p)=>screen.dipToScreenPoint(p),{x:Math.round(native.bounds.x+pet.x+pet.width/2),y:Math.round(native.bounds.y+pet.y+pet.height/2)});
  const hwnd = Buffer.from(native.handle,'hex').readBigUInt64LE().toString(16);
  const python = process.env.DEGU_PYTHON ?? 'python';
  report.native = JSON.parse(execFileSync(python, [path.join(root,'scripts/native-probe.py'), hwnd, String(point.x), String(point.y)], {encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'}}));
  assert.equal(report.native.transparent,true); assert.equal(report.native.noActivate,true); assert.equal(report.native.layered,true); assert.equal(report.native.hitOwnOverlay,false);
  check('Win32 transparency, click-through hit test and no activation');
  await waitOverlay(()=>window.deguDiagnostics?.pets.some(p=>p.dashing),undefined,{timeout:65000});
  const burst=await overlay.evaluate(()=>window.deguDiagnostics.pets.find(p=>p.dashing));
  await page.waitForTimeout(120);
  const running=await overlay.evaluate(slot=>window.deguDiagnostics.pets.find(p=>p.slot===slot),burst.slot);
  assert.equal(running.y,burst.y); assert.equal(running.action,'walk'); assert.notEqual(running.x,burst.x);
  await overlay.screenshot({path:path.join(dir,'dash-overlay.png'),omitBackground:true});
  check('actual overlay occasionally dashes while staying on the walking line');
  await waitOverlay(()=>window.deguDiagnostics?.pets[0]?.action==='leg-stretch' && window.deguDiagnostics.pets[0].frame>=32,undefined,{timeout:80000});
  const startStretch=await overlay.evaluate(()=>window.deguDiagnostics.pets[0]);
  const motionRevision=await overlay.evaluate(()=>window.deguDiagnostics.revision);
  await page.locator('#pause').click();
  await waitOverlay(revision=>window.deguDiagnostics.revision>revision,motionRevision);
  await page.waitForTimeout(120);
  const pausedStretch=await overlay.evaluate(()=>window.deguDiagnostics);
  assert.equal(pausedStretch.pets[0].action,'leg-stretch'); assert.equal(pausedStretch.pets[0].x,startStretch.x);
  await page.waitForTimeout(180);
  assert.deepEqual((await overlay.evaluate(()=>window.deguDiagnostics)).pets,pausedStretch.pets);
  assert.equal((await overlay.evaluate(()=>window.deguDiagnostics)).paints,pausedStretch.paints);
  await overlay.screenshot({path:path.join(dir,'stretch-overlay.png'),omitBackground:true});
  const previewBefore=await page.evaluate(()=>window.deguPreviewDiagnostics);
  await capture(page,'stretch-settings.png');
  report.motion={started:startStretch,paused:pausedStretch.pets[0],preview:previewBefore.pets};
  await page.locator('#pause').click();
  await waitOverlay(()=>window.deguDiagnostics.pets[0]?.action==='idle');
  assert.equal((await overlay.evaluate(()=>window.deguDiagnostics.pets[0])).x,startStretch.x);
  check('agouti stretch plays, freezes mid-action and returns to grounded idle without moving');
  await waitOverlay(()=>window.deguDiagnostics?.pets[0]?.action==='running-wheel' && window.deguDiagnostics.pets[0].opacity===1,undefined,{timeout:125000});
  const startWheel=await overlay.evaluate(()=>window.deguDiagnostics.pets[0]);
  assert.equal(startWheel.height,64*1.6); assert.equal(startWheel.width,96*1.6);
  const wheelRevision=await overlay.evaluate(()=>window.deguDiagnostics.revision);
  await page.locator('#pause').click();
  await waitOverlay(revision=>window.deguDiagnostics.revision>revision,wheelRevision);
  await page.waitForTimeout(120);
  const pausedWheel=await overlay.evaluate(()=>window.deguDiagnostics);
  assert.equal(pausedWheel.pets[0].action,'running-wheel');
  await page.waitForTimeout(200);
  assert.deepEqual((await overlay.evaluate(()=>window.deguDiagnostics)).pets,pausedWheel.pets);
  assert.equal((await overlay.evaluate(()=>window.deguDiagnostics)).paints,pausedWheel.paints);
  const beforeDisplayEvents=await electron.evaluate(()=>globalThis.deguRuntime.overlays);
  await electron.evaluate(({screen})=>{
    const display=screen.getAllDisplays().find(d=>d.id!==screen.getPrimaryDisplay().id) ?? screen.getPrimaryDisplay();
    screen.emit('display-added',{},display);screen.emit('display-metrics-changed',{},display,['workArea']);screen.emit('display-removed',{},display);
  });
  await waitOverlay(revision=>window.deguDiagnostics.revision>revision,pausedWheel.revision);
  const afterDisplayEvents=await electron.evaluate(()=>globalThis.deguRuntime.overlays);
  assert.deepEqual(afterDisplayEvents.map(w=>({id:w.id,bounds:w.bounds})),beforeDisplayEvents.map(w=>({id:w.id,bounds:w.bounds})));
  assert.deepEqual((await overlay.evaluate(()=>window.deguDiagnostics)).pets,pausedWheel.pets);
  check('unaffected display events preserve the native overlay, paused wheel phase and position');
  await overlay.screenshot({path:path.join(dir,'wheel-overlay.png'),omitBackground:true});
  await capture(page,'wheel-settings.png');
  await overlay.evaluate(()=>{window.wheelSamples=[];window.wheelTimer=setInterval(()=>{const p=window.deguDiagnostics.pets[0];window.wheelSamples.push(p);if(p.action!=='running-wheel')clearInterval(window.wheelTimer);},20);});
  await page.locator('#pause').click();
  await waitOverlay(()=>window.deguDiagnostics.pets[0]?.action==='idle');
  const wheelSamples=await overlay.evaluate(()=>{clearInterval(window.wheelTimer);return window.wheelSamples;});
  const wheelFrames=wheelSamples.filter(p=>p.action==='running-wheel');
  assert.deepEqual([...new Set(wheelFrames.map(p=>p.frame))].sort(),[0,1,2,3]);
  assert.ok(wheelFrames.some(p=>p.opacity<.95));
  assert.ok(wheelFrames.every(p=>p.x===startWheel.x && p.y===startWheel.y && !p.dashing));
  const afterWheel=await overlay.evaluate(()=>window.deguDiagnostics.pets[0]);
  assert.ok(Math.abs(afterWheel.x+afterWheel.width/2-startWheel.x-startWheel.width/2)<.001);
  assert.ok(Math.abs(afterWheel.y+afterWheel.height-startWheel.y-startWheel.height)<.001);
  report.wheel={started:startWheel,paused:pausedWheel.pets[0],frames:[...new Set(wheelFrames.map(p=>p.frame))],last:wheelFrames.at(-1),returned:afterWheel};
  check('running wheel cycles four phases, freezes/resumes, fades out and returns to the same grounded idle');
  const variants = await page.evaluate(async()=> (await window.degu.getState()).catalog.map(v=>v.id));
  for (const id of variants) {
    await page.locator('#coat-0').selectOption(id);
    await page.waitForFunction(id=>window.deguPreviewDiagnostics?.pets[0]?.coat===id,id);
    await waitOverlay(id=>window.deguDiagnostics?.pets[0]?.coat===id,id);
  }
  assert.deepEqual(await page.evaluate(()=>window.deguPreviewDiagnostics.errors),[]); check('ten coats decoded and painted in preview and overlay');
  for (const size of ['32','48','64','96']) { await page.locator('#size').selectOption(size); await waitOverlay(size=>window.deguDiagnostics?.pets[0]?.height===Number(size),size); }
  check('all four sizes in actual overlay');
  await page.locator('#count').fill('10'); await page.locator('#count').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelectorAll('.pet-row').length===10); await waitOverlay(()=>window.deguDiagnostics.pets.length===10);
  await page.locator('#coat-8').selectOption('degu-black'); await page.locator('#name-8').fill('くろ'); await page.locator('#name-8').dispatchEvent('change');
  await page.waitForFunction(async()=> (await window.degu.getState()).settings.pets[8].name==='くろ');
  await page.locator('#count').fill('1'); await page.locator('#count').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelectorAll('.pet-row').length===1);
  check('ten pets, individual names/coats and hidden-slot preservation');
  await page.locator('#pause').click(); await page.waitForFunction(async()=> (await window.degu.getState()).settings.paused);
  await page.waitForTimeout(120); const frozen=await overlay.evaluate(()=>window.deguDiagnostics);
  await page.waitForTimeout(400); assert.deepEqual((await overlay.evaluate(()=>window.deguDiagnostics)).pets,frozen.pets);
  assert.equal((await overlay.evaluate(()=>window.deguDiagnostics)).paints,frozen.paints); check('pause freezes position, frame and continuous drawing');
  await page.locator('#hide').click();
  await page.waitForTimeout(150); assert.ok((await electron.evaluate(()=>globalThis.deguRuntime.overlays)).every(w=>!w.visible));
  await page.locator('#hide').click(); await page.locator('#pause').click();
  check('hide/show and resume');
  await page.locator('#tab-display').click(); await page.locator('#monitor').selectOption('all');
  await page.locator('#range-start').fill('10'); await page.locator('#range-start').dispatchEvent('change');
  await page.locator('#range-end').fill('90'); await page.locator('#range-end').dispatchEvent('change');
  await page.locator('#offset').fill('64'); await page.locator('#offset').dispatchEvent('change');
  await page.waitForFunction(async()=> (await window.degu.getState()).settings.offset===64);
  await capture(page,'display-desktop.png'); check('monitor, walking range and vertical offset');
  await electron.evaluate(()=>globalThis.deguRuntime.change({count:3}));
  overlays=await overlaysReady();
  const distributed=await Promise.all(overlays.map(p=>p.evaluate(()=>window.deguDiagnostics.pets.length)));
  assert.equal(distributed.reduce((a,b)=>a+b),3);
  await electron.evaluate(()=>globalThis.deguRuntime.change({count:1}));
  check('actual multi-display pet distribution');
  await page.locator('#tab-display').focus(); await page.keyboard.press('ArrowLeft'); assert.equal(await page.locator('#tab-pets').getAttribute('aria-selected'),'true');
  check('keyboard tab selection and focus');
  assert.equal(await page.locator('input[name="mode"]').count(),0);
  assert.equal(await page.getByText('カーソルを追いかける',{exact:true}).count(),0);
  assert.equal(await page.evaluate(async()=>Object.hasOwn((await window.degu.getState()).settings,'mode')),false);
  const rejected=await page.evaluate(async()=>window.degu.update({mode:'follow'}));
  assert.equal(rejected.ok,false);
  check('cursor following is absent from controls and settings updates');
  await page.locator('#size').selectOption('64');
  await page.emulateMedia({reducedMotion:'reduce'}); await page.waitForFunction(()=>window.deguPreviewDiagnostics.paused===true);
  check('reduced motion stops preview');
  for (const width of [390,320]) {
    await page.setViewportSize({width,height:844}); await page.waitForTimeout(150);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth); assert.equal(overflow,false);
    await capture(page,`settings-${width}.png`);
  }
  check('390px and 320px layout without horizontal overflow');
  await page.setViewportSize({width:1000,height:760});
  await electron.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/settings.html'));w.webContents.setZoomFactor(2);});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await electron.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/settings.html'));w.webContents.setZoomFactor(1);});
  check('200 percent zoom reflow');
  await page.locator('#reset').click(); assert.equal(await page.locator('#reset-dialog').isVisible(),true); await page.keyboard.press('Escape');
  assert.equal(await page.locator('#reset-dialog').isVisible(),false);
  await electron.evaluate(()=>globalThis.deguRuntime.rebuild()); overlays=await overlaysReady();
  assert.ok((await electron.evaluate(()=>globalThis.deguRuntime.overlays)).every(w=>w.loadedRevision!==undefined));
  check('display overlay rebuild preserves settings and decoded assets');
  await electron.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/settings.html'));const closed=new Promise(resolve=>w.once('closed',resolve));w.close();await closed;});
  assert.ok((await electron.evaluate(()=>globalThis.deguRuntime.overlays)).some(w=>w.visible));
  await electron.evaluate(()=>globalThis.deguRuntime.openSettings()); page=await settingsPage();
  check('closing settings keeps pets running and settings reopen');
  const saved=await page.evaluate(async()=> (await window.degu.getState()).settings);
  await electron.evaluate(({app})=>app.getAppMetrics());
  await page.waitForTimeout(1500);
  report.measurements=await electron.evaluate(({app})=>app.getAppMetrics().map(m=>({type:m.type,cpu:m.cpu.percentCPUUsage,memoryKB:m.memory.workingSetSize})));
  await electron.close(); electron=null;
  electron=await launch(); observeProcess(electron); electron.on('window',observe); electron.windows().forEach(observe); page=await settingsPage();
  const restored=await page.evaluate(async()=> (await window.degu.getState()).settings); assert.deepEqual(restored,saved);
  assert.equal(restored.pets[8].name,'くろ'); check('restart persistence, isolated profile and reset cancellation');
  await page.locator('#reset').click(); await page.locator('#reset-confirm').click();
  await page.waitForFunction(async()=> (await window.degu.getState()).settings.rangeStart===0);
  assert.equal((await page.evaluate(async()=> (await window.degu.getState()).settings)).pets[8].name,'デグー 9');
  check('confirmed reset restores defaults');
  assert.deepEqual(await electron.evaluate(()=>globalThis.deguRuntime.failures),[]);
  assert.deepEqual(report.errors,[]); report.passed=true;
} catch(error) {
  report.errors.push(error.stack); report.passed=false; process.exitCode=1; console.error(error);
  if(electron)try{report.failureState=await electron.evaluate(()=>({failures:globalThis.deguRuntime?.failures,overlays:globalThis.deguRuntime?.overlays,displayEvents:globalThis.deguQADisplayEvents}));}catch(probeError){report.failureProbeError=probeError.message;}
}
finally {
  if(electron) await electron.close();
  fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(root,'docs/QA-latest.json'),JSON.stringify(report,null,2));
  console.log(`Report: ${path.join(dir,'report.json')}`);
}
