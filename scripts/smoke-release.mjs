import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
const root=path.resolve(import.meta.dirname,'..');
const explicit=process.argv.find(a=>a.startsWith('--executable='))?.slice(13);
const executablePath=explicit?path.resolve(explicit):process.platform==='darwin'
  ? path.join(root,`release/${process.arch==='arm64'?'mac-arm64':'mac'}/DeguDesktopVer2.app/Contents/MacOS/DeguDesktopVer2`)
  :path.join(root,'release/win-unpacked/DeguDesktopVer2.exe');
const reportDir=path.join(root,'.codex/qa',`release-${process.platform}-${process.arch}-${Date.now()}`);
fs.mkdirSync(reportDir,{recursive:true});
const profile=path.join(reportDir,'profile');
const {ELECTRON_RUN_AS_NODE,...env}=process.env;
const report={platform:process.platform,arch:process.arch,executablePath,checks:[],errors:[]};
report.timings=[];
let application;
const pass=name=>{report.checks.push(name);console.log(`PASS ${name}`);};
async function waitSettings(){const start=Date.now();for(let i=0;i<200;i++){const p=application.windows().find(p=>p.url().endsWith('/settings.html'));if(p){await p.waitForFunction(()=>window.deguPreviewDiagnostics?.ready,undefined,{timeout:90000});report.timings.push({stage:'settings-ready',ms:Date.now()-start});return p;}await new Promise(r=>setTimeout(r,100));}throw Error('Settings did not become ready');}
async function overlays(){await application.evaluate(()=>{if(globalThis.deguRuntime.failures.length)throw Error(globalThis.deguRuntime.failures.join(';'));});for(let i=0;i<200;i++){const pages=application.windows().filter(p=>p.url().endsWith('/overlay.html'));if(pages.length&& (await Promise.all(pages.map(p=>p.evaluate(()=>window.deguDiagnostics?.ready)))).every(Boolean))return pages;await new Promise(r=>setTimeout(r,100));}throw Error('Overlays did not load');}
try{
  application=await _electron.launch({executablePath,args:[`--qa-profile=${profile}`,'--settings'],env,timeout:90000});
  application.on('window',p=>p.on('pageerror',e=>report.errors.push(e.message)));
  let page=await waitSettings();let surfaces=await overlays();
  assert.equal(await page.title(),'DeguDesktopVer2 — 設定');
  assert.equal(await page.locator('.pet-row').count(),1);
  const native=await application.evaluate(()=>globalThis.deguRuntime.overlays);
  assert.ok(native.length&&native.every(w=>!w.focusable));
  pass('packaged first launch, live preview, non-focusing overlays');
  await page.screenshot({path:path.join(reportDir,'settings.png'),fullPage:true});
  for(const p of surfaces){assert.equal(await p.evaluate(()=>typeof window.require),'undefined');await p.waitForFunction(()=>window.deguDiagnostics.paints>0);}
  pass('sandboxed overlays paint original and additional assets');
  const state=await page.evaluate(()=>window.degu.getState());
  assert.equal(state.catalog.length,10);
  assert.ok(state.catalog.every(v=>v.motions['face-grooming']&&v.motions.rearing&&v.motions['running-wheel']));
  const updated=await page.evaluate(async()=>{const state=await window.degu.getState();return window.degu.update({count:10,size:96,pets:state.settings.pets.map((p,i)=>({...p,coat:state.catalog[i].id,name:`テスト${i+1}`}))});});
  assert.ok(updated.ok);
  await page.waitForFunction(()=>document.querySelectorAll('.pet-row').length===10);
  pass('ten coats and individual names, count and size');
  assert.ok((await page.evaluate(()=>window.degu.update({paused:true}))).ok);
  for(const p of surfaces){await p.waitForTimeout(150);const a=await p.evaluate(()=>window.deguDiagnostics);await p.waitForTimeout(180);const b=await p.evaluate(()=>window.deguDiagnostics);assert.equal(a.paints,b.paints);}
  assert.ok((await page.evaluate(()=>window.degu.update({hidden:true}))).ok);
  await page.waitForTimeout(200);assert.ok((await application.evaluate(()=>globalThis.deguRuntime.overlays)).every(w=>!w.visible));
  assert.ok((await page.evaluate(()=>window.degu.update({hidden:false,paused:false}))).ok);
  pass('pause stops rendering, hide and resume');
  const saved=JSON.parse(fs.readFileSync(path.join(profile,'settings.json')));
  await application.close();application=null;
  application=await _electron.launch({executablePath,args:[`--qa-profile=${profile}`,'--settings'],env,timeout:90000});page=await waitSettings();
  assert.deepEqual((await page.evaluate(()=>window.degu.getState())).settings,saved);
  assert.equal(report.errors.length,0);pass('restart restores settings with no renderer errors');
  report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;if(application){try{report.runtime=await application.evaluate(()=>({failures:globalThis.deguRuntime?.failures,overlays:globalThis.deguRuntime?.overlays}));report.pages=await Promise.all(application.windows().map(async p=>({url:p.url(),state:await p.evaluate(()=>({visibility:document.visibilityState,preview:window.deguPreviewDiagnostics,error:document.querySelector('#error')?.textContent}))})));}catch(probe){report.diagnosticFailure=probe.message;}}console.error(error);process.exitCode=1;}
finally{if(application)await application.close();fs.writeFileSync(path.join(reportDir,'report.json'),JSON.stringify(report,null,2));console.log(path.relative(root,reportDir));}
