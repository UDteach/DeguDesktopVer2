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
  assert.equal(await page.locator('#coat option').count(),10);
  for(const option of await page.locator('#coat option').evaluateAll(e=>e.map(o=>o.value))){await page.locator('#coat').selectOption(option);await page.waitForFunction(id=>window.deguSiteDiagnostics?.coat===id,option);assert.ok(await page.locator('#action option[value="face-grooming"]').count());}
  await page.locator('#coat').selectOption('degu-agouti');await page.waitForFunction(()=>window.deguSiteDiagnostics.coat==='degu-agouti');
  for(const option of await page.locator('#action option').evaluateAll(e=>e.map(o=>o.value))){await page.locator('#action').selectOption(option);await page.waitForFunction(action=>window.deguSiteDiagnostics.action===action,option);const first=await page.evaluate(()=>window.deguSiteDiagnostics.frame);await page.waitForFunction(frame=>window.deguSiteDiagnostics.frame!==frame,first);}
  await page.locator('#demo-toggle').click();await page.waitForFunction(()=>window.deguSiteDiagnostics.paused);const frame=await page.evaluate(()=>window.deguSiteDiagnostics.frame);await page.waitForTimeout(220);assert.equal(await page.evaluate(()=>window.deguSiteDiagnostics.frame),frame);pass('ten coats, all available actions and pause');
  await page.locator('#hero-toggle').click();assert.equal(await page.locator('#hero-toggle').getAttribute('aria-pressed'),'true');
  for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.evaluate(()=>document.activeElement?.blur());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);await page.screenshot({path:path.join(evidence,`site-${width}.png`),fullPage:true});}pass('desktop, 390px and 320px layout');
  await context.close();
  const reduced=await browser.newContext({reducedMotion:'reduce',viewport:{width:390,height:844}}),quiet=await reduced.newPage();await quiet.goto(base);await quiet.waitForFunction(()=>window.deguSiteDiagnostics?.ready);assert.ok(await quiet.evaluate(()=>window.deguSiteDiagnostics.paused&&window.deguSiteDiagnostics.heroPaused));await reduced.close();pass('reduced motion starts paused');
  const downloads=await browser.newContext({viewport:{width:1440,height:1000}}),download=await downloads.newPage();
  await download.route('**/release.json',r=>r.fulfill({status:404,body:'{}'}));
  await download.route('https://api.github.com/repos/UDteach/DeguDesktopVer2/releases/latest',r=>r.fulfill({status:404,body:'{}'}));await download.goto(base+'/download.html');await download.waitForFunction(()=>document.querySelector('#release-status').textContent.includes('準備中'));assert.equal(await download.locator('[data-artifact]').count(),6);await download.screenshot({path:path.join(evidence,'download-desktop.png'),fullPage:true});
  await download.unrouteAll();const names=['windows-x64.exe','windows-x64.zip','mac-arm64.dmg','mac-arm64.zip','mac-x64.dmg','mac-x64.zip','SHA256SUMS.txt'];
  const release={tag_name:'v0.2.1',published_at:'2026-10-05T00:00:00Z',html_url:'https://github.com/UDteach/DeguDesktopVer2/releases/tag/v0.2.1',assets:names.map(name=>({name:name==='SHA256SUMS.txt'?name:`DeguDesktopVer2-0.2.1-${name}`,size:100000000,browser_download_url:`https://github.com/UDteach/DeguDesktopVer2/releases/download/v0.2.1/${name}`}))};
  await download.route('https://api.github.com/repos/UDteach/DeguDesktopVer2/releases/latest',r=>r.fulfill({json:release}));await download.reload();await download.waitForFunction(()=>document.querySelector('#release-status').textContent.includes('v0.2.1'));assert.equal(await download.locator('[data-artifact][href*="/download/v0.2.1/"]').count(),6);
  for(const width of [390,320]){await download.setViewportSize({width,height:844});assert.ok(await download.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await download.screenshot({path:path.join(evidence,`download-${width}.png`),fullPage:true});}pass('six release links, preparing state and responsive download guide');
  await download.keyboard.press('Tab');assert.ok(await download.evaluate(()=>document.activeElement.tagName!=='BODY'));
  await download.unrouteAll();await download.route('https://api.github.com/repos/UDteach/DeguDesktopVer2/releases/latest',r=>r.fulfill({status:403,body:'{}'}));await download.route('**/release.json',r=>r.fulfill({json:release}));await download.reload();await download.waitForFunction(()=>document.querySelector('#release-status').textContent.includes('v0.2.1'));assert.equal(await download.locator('[data-artifact][href*="/download/v0.2.1/"]').count(),6);pass('published snapshot keeps six downloads available during API limits');
  await download.unroute('**/release.json');await download.route('**/release.json',r=>r.abort());await download.reload();await download.waitForFunction(()=>document.querySelector('#release-status').textContent.includes('取得できません'));assert.equal(await download.locator('[data-artifact][href="https://github.com/UDteach/DeguDesktopVer2/releases"]').count(),6);pass('unavailable network keeps release-list links and accurate message');await downloads.close();
  assert.equal(report.errors.length,0);report.passed=true;
}catch(error){report.failure=error.stack;report.passed=false;process.exitCode=1;console.error(error);}
finally{if(browser)await browser.close();server.close();const dir=path.join(root,'.codex/qa');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'site-browser.json'),JSON.stringify(report,null,2));}
