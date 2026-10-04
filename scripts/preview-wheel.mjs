import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),directory=path.join(root,'.codex/qa',`preview-wheel-${Date.now()}`);
fs.mkdirSync(directory,{recursive:true});
const {ELECTRON_RUN_AS_NODE,...env}=process.env;
const electron=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root,`--qa-profile=${path.join(directory,'profile')}`],env});
try {
  let page;
  for(let i=0;i<100;i++){page=electron.windows().find(p=>p.url().endsWith('/settings.html'));if(page)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(page);await page.waitForFunction(()=>window.deguPreviewDiagnostics?.ready);
  await page.setViewportSize({width:1000,height:900});
  await page.locator('#size').selectOption('96');
  await page.locator('#count').fill('3');await page.locator('#count').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelectorAll('.pet-row').length===3);
  await page.locator('#coat-1').selectOption('degu-blue');await page.locator('#coat-2').selectOption('degu-white');
  await page.waitForFunction(()=>window.deguPreviewDiagnostics?.pets.some(p=>p.action==='running-wheel' && p.opacity===1),undefined,{timeout:125000});
  await page.locator('#pause').click();await page.waitForFunction(async()=>(await window.degu.getState()).settings.paused);
  await page.waitForTimeout(120);
  const result=await page.evaluate(()=>({diagnostics:window.deguPreviewDiagnostics,scene:{width:document.querySelector('#scene').clientWidth,height:document.querySelector('#scene').clientHeight,outerHeight:document.querySelector('#scene').getBoundingClientRect().height},overflow:document.documentElement.scrollWidth>innerWidth}));
  assert.equal(result.scene.outerHeight,174);assert.ok(result.scene.height>=173);assert.equal(result.overflow,false);
  assert.deepEqual(result.diagnostics.errors,[]);
  const wheel=result.diagnostics.pets.find(p=>p.action==='running-wheel');assert.ok(wheel);
  assert.equal(wheel.height,96*1.6);assert.ok(wheel.y>=0 && wheel.y+wheel.height<=result.scene.height+.001);
  assert.ok(wheel.x>=0 && wheel.x+wheel.width<=result.scene.width+.001);
  await page.locator('.preview').screenshot({path:path.join(directory,'preview-96px.png')});
  await page.screenshot({path:path.join(directory,'settings-96px.png'),fullPage:true});
  assert.deepEqual(await electron.evaluate(()=>globalThis.deguRuntime.failures),[]);
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({passed:true,...result},null,2));
  console.log(`Actual 96px preview fits the enlarged wheel: ${directory}`);
} finally { await electron.close(); }
