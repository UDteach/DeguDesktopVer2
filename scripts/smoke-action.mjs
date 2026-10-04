import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {_electron} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),packaged=process.argv.includes('--packaged'),action=process.argv.find(a=>a.startsWith('--action='))?.slice(9) ?? 'face-grooming';
const directory=path.join(root,'.codex/qa',`${action}-${packaged?'packaged':'source'}-${Date.now()}`),profile=path.join(directory,'profile');fs.mkdirSync(directory,{recursive:true});
const {ELECTRON_RUN_AS_NODE,...env}=process.env;
const launch=()=>_electron.launch({executablePath:path.join(root,packaged?'release/win-unpacked/DeguDesktopVer2.exe':'node_modules/electron/dist/electron.exe'),args:[...(packaged?[]:[root]),`--qa-profile=${profile}`,'--settings'],env,timeout:60000});
const report={action,packaged,checks:[],errors:[]};let electron;
assert.ok(['face-grooming','rearing'].includes(action));
const targetCoat=process.argv.find(a=>a.startsWith('--coat='))?.slice(7) ?? (action==='rearing'?'degu-blue':'degu-agouti');
const pack=JSON.parse(fs.readFileSync(path.join(root,'app/motions/manifest.json')));
const frameCount=pack.motions.find(m=>m.coat===targetCoat && m.action===action).durations.length;
const pauseFrame=Math.floor(frameCount/3);
const check=name=>{report.checks.push(name);console.log('PASS '+name);};
async function settingsPage(){for(let i=0;i<100;i++){const page=electron.windows().find(p=>p.url().endsWith('/settings.html'));if(page){await page.waitForFunction(()=>window.deguPreviewDiagnostics?.ready);page.on('pageerror',e=>report.errors.push(e.message));return page;}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Settings not ready');}
try {
  electron=await launch();let page=await settingsPage();await page.locator('#size').selectOption('96');
  if(targetCoat!=='degu-agouti')await page.locator('#coat-0').selectOption(targetCoat);
  let overlay=electron.windows().find(p=>p.url().endsWith('/overlay.html'));assert.ok(overlay);
  overlay.on('pageerror',e=>report.errors.push(e.message));await overlay.waitForFunction(coat=>window.deguDiagnostics?.ready && window.deguDiagnostics.pets[0]?.height===96 && window.deguDiagnostics.pets[0].coat===coat,targetCoat);
  assert.deepEqual(await overlay.evaluate(()=>window.deguDiagnostics.errors),[]);check('new motion pack decodes in the actual app and settings preview');
  report.naturalTimeline=await overlay.evaluate(()=>{
    window.naturalTimeline=[];let previous='';const started=performance.now();
    window.naturalTimer=setInterval(()=>{const p=window.deguDiagnostics?.pets[0];if(p && p.action!==previous){window.naturalTimeline.push({elapsedMs:Math.round(performance.now()-started),...p});previous=p.action;}},50);
    return [];
  });
  const deadline=Date.now()+300000;
  while(true){try{await overlay.waitForFunction(({action,pauseFrame})=>window.deguDiagnostics?.pets[0]?.action===action && window.deguDiagnostics.pets[0].frame>=pauseFrame,{action,pauseFrame},{timeout:Math.max(1,deadline-Date.now())});break;}catch(error){if(!/Target page, context or browser has been closed/.test(error.message) || Date.now()>=deadline)throw error;overlay=electron.windows().find(p=>p.url().endsWith('/overlay.html') && !p.isClosed());if(!overlay)throw error;}}
  report.naturalTimeline=await overlay.evaluate(()=>{clearInterval(window.naturalTimer);return window.naturalTimeline;});
  const start=await overlay.evaluate(()=>window.deguDiagnostics),pet=start.pets[0];assert.equal(pet.opacity,1);assert.equal(pet.dashing,false);
  await page.locator('#pause').click();await overlay.waitForFunction(revision=>window.deguDiagnostics.revision>revision,start.revision);await page.waitForTimeout(100);
  const frozen=await overlay.evaluate(()=>window.deguDiagnostics);assert.equal(frozen.pets[0].action,action);assert.equal(frozen.pets[0].x,pet.x);
  await page.waitForTimeout(200);assert.deepEqual((await overlay.evaluate(()=>window.deguDiagnostics)).pets,frozen.pets);assert.equal((await overlay.evaluate(()=>window.deguDiagnostics)).paints,frozen.paints);
  await overlay.screenshot({path:path.join(directory,'action-overlay.png'),omitBackground:true});await page.screenshot({path:path.join(directory,'action-settings.png'),fullPage:true});
  check('natural action starts between wander/rest events and freezes position and frame');
  const native=await electron.evaluate(()=>globalThis.deguRuntime.overlays[0]);assert.equal(native.focusable,false);assert.equal(native.visible,true);
  const point=await electron.evaluate(({screen},point)=>screen.dipToScreenPoint(point),{x:Math.round(native.bounds.x+pet.x+pet.width/2),y:Math.round(native.bounds.y+pet.y+pet.height/2)});
  const handle=Buffer.from(native.handle,'hex').readBigUInt64LE().toString(16);
  report.native=JSON.parse(execFileSync(process.env.DEGU_PYTHON ?? 'python',[path.join(root,'scripts/native-probe.py'),handle,String(point.x),String(point.y)],{encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'}}));
  assert.ok(report.native.transparent && report.native.layered && report.native.noActivate && !report.native.hitOwnOverlay);check('new action keeps Win32 transparency, click-through and no activation');
  await overlay.evaluate(action=>{window.actionSamples=[];window.actionTimer=setInterval(()=>{const p=window.deguDiagnostics.pets[0];window.actionSamples.push(p);if(p.action!==action)clearInterval(window.actionTimer);},20);},action);
  await page.locator('#pause').click();await overlay.waitForFunction(()=>window.deguDiagnostics.pets[0]?.action==='idle');
  const samples=await overlay.evaluate(()=>{clearInterval(window.actionTimer);return window.actionSamples;});const active=samples.filter(p=>p.action===action),returned=await overlay.evaluate(()=>window.deguDiagnostics.pets[0]);
  assert.ok(active.length>0 && active.every(p=>p.x===pet.x && p.y===pet.y));assert.equal(active.at(-1).frame,frameCount-1);assert.equal(returned.x,pet.x);assert.equal(returned.y,pet.y);
  report.motion={started:pet,paused:frozen.pets[0],last:active.at(-1),returned};check('resume reaches terminal frame once and returns to the same grounded idle');
  await page.locator('#pause').click();await page.waitForFunction(async()=>(await window.degu.getState()).settings.paused);
  const changedCoat=targetCoat==='degu-white'?'degu-blue':'degu-white';
  await page.locator('#coat-0').selectOption(changedCoat);await overlay.waitForFunction(coat=>window.deguDiagnostics?.pets[0]?.coat===coat && window.deguDiagnostics.pets[0].action==='idle',changedCoat);
  const changedMotion=await page.evaluate(async({coat,action})=>(await window.degu.getState()).catalog.find(v=>v.id===coat).motions[action],{coat:changedCoat,action});
  if(!pack.motions.some(m=>m.coat===changedCoat && m.action===action)){assert.equal(changedMotion,undefined);check('unmade coat action safely retains its own existing motion');}
  else{assert.equal(changedMotion.durations.length,frameCount);assert.ok(changedMotion.tiers['96'].every(f=>f.includes('/'+changedCoat+'/')));check('coat changes keep their own action frames and safely return to idle');}
  if(action==='face-grooming' && pack.motions.filter(m=>m.action===action).length===10){
    await page.locator('#coat-0').selectOption('degu-agouti');await page.locator('#count').fill('10');await page.locator('#count').dispatchEvent('change');
    await overlay.waitForFunction(()=>window.deguDiagnostics?.pets.length===10 && new Set(window.deguDiagnostics.pets.map(p=>p.coat)).size===10);
    for(const size of [32,48,64,96]){await page.locator('#size').selectOption(String(size));await overlay.waitForFunction(size=>window.deguDiagnostics.pets.every(p=>p.height===size),size);}
    const catalog=await page.evaluate(async()=>(await window.degu.getState()).catalog);assert.ok(catalog.every(v=>v.motions['face-grooming'].durations.length===96));
    assert.deepEqual(await overlay.evaluate(()=>window.deguDiagnostics.errors),[]);await overlay.screenshot({path:path.join(directory,'ten-colors-overlay.png'),omitBackground:true});await page.screenshot({path:path.join(directory,'ten-colors-settings.png'),fullPage:true});
    check('all ten own-coat catalogs decode and ten pets retain four sizes in the actual overlay');
  }
  await page.locator('#hide').click();await page.waitForTimeout(100);assert.ok((await electron.evaluate(()=>globalThis.deguRuntime.overlays)).every(w=>!w.visible));await page.locator('#hide').click();check('hide/show remains available after the new action');
  const saved=await page.evaluate(async()=>(await window.degu.getState()).settings);
  assert.deepEqual(await electron.evaluate(()=>globalThis.deguRuntime.failures),[]);await electron.close();electron=await launch();page=await settingsPage();assert.deepEqual(await page.evaluate(async()=>(await window.degu.getState()).settings),saved);check('restart retains size, coat and paused state in the isolated profile');
  assert.deepEqual(await electron.evaluate(()=>globalThis.deguRuntime.failures),[]);assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.passed=false;report.errors.push(error.stack);process.exitCode=1;console.error(error);if(electron)for(const window of electron.windows())if(!window.isClosed() && window.url().endsWith('/overlay.html')){report.failureDiagnostics=await window.evaluate(()=>({state:window.deguDiagnostics,timeline:window.naturalTimeline})).catch(()=>null);}}
finally{if(electron)await electron.close();fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+path.join(directory,'report.json'));}
