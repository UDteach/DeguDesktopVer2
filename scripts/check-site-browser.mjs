import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const root=path.resolve(import.meta.dirname,'..'), site=path.join(root,'site');
const evidence=path.join(root,'docs/design/evidence/after');fs.mkdirSync(evidence,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.mjs':'text/javascript','.json':'application/json','.png':'image/png'};
const server=http.createServer((req,res)=>{const file=path.resolve(site,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');fs.createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const report={checks:[],errors:[]};let browser;
const pass=name=>{report.checks.push(name);console.log(`PASS ${name}`);};
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>window.deguSiteDiagnostics?.ready);await page.screenshot({path:path.join(evidence,'site-desktop.png'),fullPage:true});
  await page.waitForFunction(()=>window.deguSiteDiagnostics.heroCount===10);
  assert.equal(await page.locator('#coat option').count(),10);
  for(const option of await page.locator('#coat option').evaluateAll(e=>e.map(o=>o.value))){await page.locator('#coat').selectOption(option);await page.waitForFunction(id=>window.deguSiteDiagnostics?.ready&&window.deguSiteDiagnostics.coat===id,option);assert.ok(await page.locator('#action option[value="face-grooming"]').count());}
  await page.locator('#coat').selectOption('degu-agouti');await page.waitForFunction(()=>window.deguSiteDiagnostics.ready&&window.deguSiteDiagnostics.coat==='degu-agouti');
  for(const option of await page.locator('#action option').evaluateAll(e=>e.map(o=>o.value))){await page.locator('#action').selectOption(option);await page.waitForFunction(action=>window.deguSiteDiagnostics.ready&&window.deguSiteDiagnostics.action===action,option);const first=await page.evaluate(()=>window.deguSiteDiagnostics.frame);await page.waitForFunction(frame=>window.deguSiteDiagnostics.frame!==frame,first);}
  await page.locator('#demo-toggle').click();await page.waitForFunction(()=>window.deguSiteDiagnostics.paused);const frame=await page.evaluate(()=>window.deguSiteDiagnostics.frame);await page.waitForTimeout(220);assert.equal(await page.evaluate(()=>window.deguSiteDiagnostics.frame),frame);pass('ten coats, all available actions and pause');
  await page.locator('#hero-toggle').click();assert.equal(await page.locator('#hero-toggle').getAttribute('aria-pressed'),'true');
  for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.evaluate(()=>document.activeElement?.blur());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);await page.screenshot({path:path.join(evidence,`site-${width}.png`),fullPage:true});}pass('desktop, 390px and 320px layout');
  await context.close();
  const reduced=await browser.newContext({reducedMotion:'reduce',viewport:{width:390,height:844}}),quiet=await reduced.newPage();await quiet.goto(base);await quiet.waitForFunction(()=>window.deguSiteDiagnostics?.ready);assert.ok(await quiet.evaluate(()=>window.deguSiteDiagnostics.paused&&window.deguSiteDiagnostics.heroPaused));await reduced.close();pass('reduced motion starts paused');
  const downloads=await browser.newContext({viewport:{width:1440,height:1000}}),download=await downloads.newPage();download.on('pageerror',e=>report.errors.push(e.message));
  await download.route('**/release.json',r=>r.fulfill({status:404,body:'{}'}));
  await download.route('https://api.github.com/repos/UDteach/DeguDesktopVer2/releases/latest',r=>r.fulfill({status:404,body:'{}'}));await download.goto(base+'/download.html');await download.waitForFunction(()=>document.querySelector('#release-status').textContent.includes('準備中'));assert.equal(await download.locator('[data-artifact]').count(),6);
  await download.unrouteAll();const names=['windows-x64.exe','windows-x64.zip','mac-arm64.dmg','mac-arm64.zip','mac-x64.dmg','mac-x64.zip','SHA256SUMS.txt'];
  const release={tag_name:'v0.2.1',published_at:'2026-10-05T00:00:00Z',html_url:'https://github.com/UDteach/DeguDesktopVer2/releases/tag/v0.2.1',assets:names.map(name=>({name:name==='SHA256SUMS.txt'?name:`DeguDesktopVer2-0.2.1-${name}`,size:100000000,browser_download_url:`https://github.com/UDteach/DeguDesktopVer2/releases/download/v0.2.1/${name}`}))};
  await download.route('https://api.github.com/repos/UDteach/DeguDesktopVer2/releases/latest',r=>r.fulfill({json:release}));await download.reload();await download.waitForFunction(()=>document.querySelector('#release-status').textContent.includes('v0.2.1'));assert.equal(await download.locator('[data-artifact][href*="/download/v0.2.1/"]').count(),6);
  await download.waitForFunction(()=>window.deguSiteDiagnostics?.ready&&window.deguSiteDiagnostics.count===10&&window.deguSiteDiagnostics.pets.length===10);
  assert.equal(await download.locator('#coat option').count(),10);
  assert.equal(await download.evaluate(()=>window.deguSiteDiagnostics.mode),'flock');
  assert.equal(await download.evaluate(()=>new Set(window.deguSiteDiagnostics.pets.map(p=>p.coat)).size),10);
  const catalog=JSON.parse(fs.readFileSync(path.join(site,'assets/generated/catalog.json'),'utf8'));
  const baseFrames=catalog.reduce((n,v)=>n+v.motions.walk.tiers[96].length+v.motions.idle.tiers[96].length,0);
  assert.equal(await download.evaluate(()=>window.deguSiteDiagnostics.files),baseFrames,'first scene loads only walk/rest frames for all ten coats');
  const initialFrame=await download.evaluate(()=>window.deguSiteDiagnostics.frame);
  await download.waitForFunction(frame=>window.deguSiteDiagnostics.frame!==frame,initialFrame);
  await download.screenshot({path:path.join(evidence,'download-desktop.png'),fullPage:true});
  report.layout=[];
  for(const width of [1440,390,320]){
    await download.setViewportSize({width,height:width===1440?1000:844});
    assert.ok(await download.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await download.waitForFunction(()=>window.deguSiteDiagnostics.size>0);
    const suffix=width===1440?'desktop':width;
    await download.screenshot({path:path.join(evidence,`download-${suffix}.png`),fullPage:true});
    report.layout.push({width,height:await download.evaluate(()=>document.documentElement.scrollHeight),firstDownloadTop:await download.locator('[data-artifact]').first().evaluate(e=>e.getBoundingClientRect().top)});
  }
  const positions=await download.evaluate(()=>window.deguSiteDiagnostics.pets.map(p=>p.x));await download.waitForTimeout(180);
  assert.notDeepEqual(await download.evaluate(()=>window.deguSiteDiagnostics.pets.map(p=>p.x)),positions);
  await download.locator('#demo-toggle').click();await download.waitForTimeout(100);const flockStopped=await download.evaluate(()=>window.deguSiteDiagnostics);
  await download.waitForTimeout(200);assert.equal(await download.evaluate(()=>window.deguSiteDiagnostics.draws),flockStopped.draws);
  await download.locator('#demo-toggle').click();
  pass('both pages have ten independently moving coats; flock loads only base frames; pause and responsive six downloads');
  await download.setViewportSize({width:1440,height:1000});
  await download.locator('#action').selectOption('leg-stretch');
  await download.waitForFunction(()=>window.deguSiteDiagnostics.ready&&window.deguSiteDiagnostics.action==='leg-stretch');
  const stretchFrame=await download.evaluate(()=>window.deguSiteDiagnostics.frame);
  await download.waitForFunction(frame=>window.deguSiteDiagnostics.frame!==frame,stretchFrame);
  await download.waitForFunction(()=>window.deguSiteDiagnostics.frame>=30&&window.deguSiteDiagnostics.frame<=42);
  await download.locator('#preview-canvas').screenshot({path:path.join(evidence,'download-leg-stretch.png')});
  await download.locator('#coat').selectOption('degu-blue');
  await download.waitForFunction(()=>window.deguSiteDiagnostics.ready&&window.deguSiteDiagnostics.coat==='degu-blue');
  assert.equal(await download.locator('#action').inputValue(),'walk');assert.equal(await download.locator('#action option[value="leg-stretch"]').count(),0);
  for(const id of await download.locator('#coat option').evaluateAll(items=>items.map(o=>o.value))){
    await download.locator('#coat').selectOption(id);
    for(const motion of ['face-grooming','rearing','running-wheel']){
      await download.locator('#action').selectOption(motion);
      await download.waitForFunction(([coat,action])=>window.deguSiteDiagnostics.ready&&window.deguSiteDiagnostics.coat===coat&&window.deguSiteDiagnostics.action===action,[id,motion]);
      const frame=await download.evaluate(()=>window.deguSiteDiagnostics.frame);
      await download.waitForFunction(frame=>window.deguSiteDiagnostics.frame!==frame,frame);
    }
  }
  await download.locator('#preview-canvas').screenshot({path:path.join(evidence,'download-wheel.png')});
  await download.locator('#demo-toggle').click();
  await download.waitForFunction(()=>window.deguSiteDiagnostics.paused);
  await download.waitForTimeout(100);const stopped=await download.evaluate(()=>window.deguSiteDiagnostics);
  await download.waitForTimeout(250);const still=await download.evaluate(()=>window.deguSiteDiagnostics);
  assert.equal(still.frame,stopped.frame);assert.equal(still.draws,stopped.draws);
  await download.locator('#demo-toggle').click();await download.waitForFunction(()=>!window.deguSiteDiagnostics.paused);
  await download.locator('#coat').selectOption('degu-agouti');await download.locator('#action').selectOption('face-grooming');
  await download.waitForFunction(()=>window.deguSiteDiagnostics.ready&&window.deguSiteDiagnostics.coat==='degu-agouti'&&window.deguSiteDiagnostics.action==='face-grooming');
  assert.equal(await download.evaluate(()=>window.deguSiteDiagnostics.mode),'single');
  await download.locator('#flock-mode').click();await download.waitForFunction(()=>window.deguSiteDiagnostics.mode==='flock'&&window.deguSiteDiagnostics.count===10&&window.deguSiteDiagnostics.pets.length===10);
  const ground=await download.evaluate(()=>{const pets=window.deguSiteDiagnostics.pets;return pets.map(p=>Math.round((p.y+p.height)*100)/100);});
  assert.equal(new Set(ground).size,1,'all ten pets share the desktop work-area floor');
  assert.ok(await download.locator('.demo-desktop').isVisible());
  await download.locator('#demo-expand').click();await download.waitForFunction(()=>document.fullscreenElement!==null);
  await download.screenshot({path:path.join(evidence,'download-desktop-fullscreen.png')});
  await download.locator('#demo-expand').click();await download.waitForFunction(()=>document.fullscreenElement===null);
  await download.locator('#single-mode').click();await download.waitForFunction(()=>window.deguSiteDiagnostics.ready&&window.deguSiteDiagnostics.mode==='single');
  const guide=download.locator('.help-detail').first();await guide.locator('summary').focus();await download.keyboard.press('Enter');assert.ok(await guide.getAttribute('open')!==null);await guide.locator('summary').click();
  await download.setViewportSize({width:720,height:500});assert.ok(await download.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await download.evaluate(()=>document.activeElement?.blur());
  await download.screenshot({path:path.join(evidence,'download-zoom-reflow.png'),fullPage:true});
  pass('agouti stretch, all ten coats and three added motions animate; unsupported stretch falls back; pause, keyboard disclosure and 200% equivalent reflow');
  await download.keyboard.press('Tab');assert.ok(await download.evaluate(()=>document.activeElement.tagName!=='BODY'));
  await download.unrouteAll();await download.route('https://api.github.com/repos/UDteach/DeguDesktopVer2/releases/latest',r=>r.fulfill({status:403,body:'{}'}));await download.route('**/release.json',r=>r.fulfill({json:release}));await download.reload();await download.waitForFunction(()=>document.querySelector('#release-status').textContent.includes('v0.2.1'));assert.equal(await download.locator('[data-artifact][href*="/download/v0.2.1/"]').count(),6);pass('published snapshot keeps six downloads available during API limits');
  await download.unroute('**/release.json');await download.route('**/release.json',r=>r.abort());await download.reload();await download.waitForFunction(()=>document.querySelector('#release-status').textContent.includes('取得できません'));assert.equal(await download.locator('[data-artifact][href="https://github.com/UDteach/DeguDesktopVer2/releases"]').count(),6);pass('unavailable network keeps release-list links and accurate message');await downloads.close();
  const recovery=await browser.newContext({viewport:{width:390,height:844}}),broken=await recovery.newPage();broken.on('pageerror',e=>report.errors.push(e.message));
  await broken.route('https://api.github.com/repos/UDteach/DeguDesktopVer2/releases/latest',r=>r.fulfill({json:release}));
  await broken.route('**/assets/generated/catalog.json',r=>r.abort());
  await broken.goto(base+'/download.html');await broken.waitForFunction(()=>window.deguSiteDiagnostics?.failed);
  assert.ok(await broken.locator('#retry').isVisible());assert.equal(await broken.locator('[data-artifact][href*="/download/v0.2.1/"]').count(),6);
  await broken.unroute('**/assets/generated/catalog.json');await broken.locator('#retry').click();await broken.waitForFunction(()=>window.deguSiteDiagnostics.ready);
  await broken.route('**/assets/generated/**/*.png',r=>r.abort());await broken.locator('#action').selectOption('leg-stretch');await broken.waitForFunction(()=>window.deguSiteDiagnostics.failed);
  assert.equal(await broken.locator('.preview-stage').getAttribute('data-ready'),'false');
  await broken.screenshot({path:path.join(evidence,'download-image-error.png'),fullPage:true});
  await broken.unroute('**/assets/generated/**/*.png');await broken.locator('#retry').click();await broken.waitForFunction(()=>window.deguSiteDiagnostics.ready&&window.deguSiteDiagnostics.action==='leg-stretch');
  // An older, slower image request must never replace the last selected coat.
  await broken.route('**/assets/generated/**/*.png',async r=>{await new Promise(resolve=>setTimeout(resolve,80));await r.continue();});
  await broken.locator('#coat').selectOption('degu-blue');await broken.locator('#coat').selectOption('degu-sand');await broken.locator('#coat').selectOption('degu-white');
  await broken.waitForFunction(()=>window.deguSiteDiagnostics.ready&&window.deguSiteDiagnostics.coat==='degu-white');await broken.waitForTimeout(150);
  assert.equal(await broken.evaluate(()=>window.deguSiteDiagnostics.coat),'degu-white');assert.ok((await broken.locator('#demo-status').textContent()).includes('ホワイト'));
  await broken.locator('#action').selectOption('rearing');await broken.locator('#flock-mode').click();await broken.waitForFunction(()=>window.deguSiteDiagnostics.count===10&&window.deguSiteDiagnostics.mode==='flock');await broken.waitForTimeout(350);
  assert.equal(await broken.evaluate(()=>window.deguSiteDiagnostics.mode),'flock');assert.ok((await broken.locator('#demo-status').textContent()).includes('10匹'));
  await recovery.close();pass('catalog and image failures keep downloads usable; retry repairs decoded-image errors; rapid coat changes keep the last choice');
  const staticContext=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:844}}),staticPage=await staticContext.newPage();await staticPage.goto(base+'/download.html');assert.equal(await staticPage.locator('[data-artifact][href="https://github.com/UDteach/DeguDesktopVer2/releases"]').count(),6);assert.ok(await staticPage.locator('.demo-poster').isVisible());assert.ok(await staticPage.locator('noscript').isVisible());await staticContext.close();
  const quietDownload=await browser.newContext({reducedMotion:'reduce'}),quietPage=await quietDownload.newPage();await quietPage.goto(base+'/download.html');await quietPage.waitForFunction(()=>window.deguSiteDiagnostics?.ready&&window.deguSiteDiagnostics.count===10);assert.ok(await quietPage.evaluate(()=>window.deguSiteDiagnostics.paused));await quietPage.locator('#demo-toggle').click();await quietPage.waitForFunction(()=>!window.deguSiteDiagnostics.paused);await quietDownload.close();pass('no-JS static preview and links; ten-pet reduced motion pauses until explicit resume');
  const partial=await browser.newContext(),partialPage=await partial.newPage();await partialPage.route('**/assets/generated/media/degu-agouti/**',r=>r.abort());await partialPage.goto(base+'/download.html');await partialPage.waitForFunction(()=>window.deguSiteDiagnostics?.count===9&&!window.deguSiteDiagnostics.loading);assert.ok(await partialPage.locator('#retry').isVisible());await partialPage.unroute('**/assets/generated/media/degu-agouti/**');await partialPage.locator('#retry').click();await partialPage.waitForFunction(()=>window.deguSiteDiagnostics.count===10);await partial.close();pass('one failed coat leaves nine pets moving and retry restores all ten');
  assert.equal(report.errors.length,0);report.passed=true;
}catch(error){report.failure=error.stack;report.passed=false;process.exitCode=1;console.error(error);}
finally{if(browser)await browser.close();server.close();const dir=path.join(root,'.codex/qa');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'site-browser.json'),JSON.stringify(report,null,2));}
