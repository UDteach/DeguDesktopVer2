import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
const root=path.resolve(import.meta.dirname,'..');
const directory=path.join(root,'.codex/qa',`motion-render-${Date.now()}`);
fs.mkdirSync(directory,{recursive:true});
const {ELECTRON_RUN_AS_NODE,...env}=process.env;
const electron=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root,`--qa-profile=${path.join(directory,'profile')}`],env});
try {
  let page;
  for(let i=0;i<100;i++) {
    page=electron.windows().find(p=>!p.isClosed() && p.url().endsWith('/settings.html'));
    if(page)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(page,'Settings window did not load');
  await page.waitForFunction(()=>window.deguPreviewDiagnostics?.ready);
  await electron.evaluate(()=>globalThis.deguRuntime.change({paused:true,hidden:true}));
  await page.setViewportSize({width:1200,height:1000});
  const dimensions=await page.evaluate(async()=>{
    const {PetPainter}=await import('./painter.mjs');
    const catalog=(await window.degu.getState()).catalog;
    const variant=catalog.find(v=>v.id==='degu-agouti');
    const board=document.createElement('section'); board.id='motion-review-board';
    board.style.cssText='position:fixed;inset:0;z-index:10000;background:#f7f8f3;padding:24px;overflow:auto;font:14px sans-serif;color:#283e32';
    const title=document.createElement('h1'); title.textContent='あしぴーん / 実描画サイズ'; board.append(title);
    const sizes=[];
    for(const background of ['#f7f8f3','#24342b','#e6ecdf']) {
      const row=document.createElement('div'); row.style.cssText='display:flex;gap:20px;margin:20px 0;';
      for(const height of [32,48,64,96]) {
        const cell=document.createElement('div'); cell.style.cssText='width:180px;';
        const label=document.createElement('p'); label.textContent=`${height}px / 36コマ目`;
        const canvas=document.createElement('canvas'); canvas.style.cssText=`width:160px;height:110px;background:${background};display:block;border-bottom:1px solid #89a578`;
        cell.append(label,canvas);row.append(cell);
        const painter=new PetPainter(canvas); await painter.load([variant]);
        painter.paint([{slot:0,coat:variant.id,name:'',x:(160-height*1.5)/2,y:110-height,width:height*1.5,height,left:false,action:'leg-stretch',frame:36}],catalog,160,110,1);
        assertNoAlphaError(painter);
        sizes.push({height,canvas:[canvas.width,canvas.height],errors:[...painter.failed]});
      }
      board.append(row);
    }
    function assertNoAlphaError(painter) { if(painter.failed.size)throw new Error('Frame decode failed'); }
    document.body.append(board);
    return sizes;
  });
  assert.equal(dimensions.length,12); assert.ok(dimensions.every(v=>v.errors.length===0 && v.canvas[0]===160 && v.canvas[1]===110));
  await page.locator('#motion-review-board').screenshot({path:path.join(directory,'motion-sizes.png')});
  const wheels=await page.evaluate(async()=>{
    document.querySelector('#motion-review-board').remove();
    const {PetPainter}=await import('./painter.mjs');
    const {frameAt}=await import('./motion.mjs');
    const catalog=(await window.degu.getState()).catalog;
    const board=document.createElement('section');board.id='wheel-review-board';
    board.style.cssText='position:absolute;inset:0 auto auto 0;width:1160px;z-index:10000;background:#f7f8f3;padding:20px;font:14px sans-serif;color:#283e32;';
    const title=document.createElement('h1');title.textContent='回し車 / 10色・4位相 / 96px設定';board.append(title);
    const results=[],playing=[];
    for(const variant of catalog) {
      const row=document.createElement('div');row.style.cssText='display:flex;gap:12px;margin:16px 0;';
      const label=document.createElement('p');label.textContent=variant.coatLabel;label.style.width='80px';row.append(label);
      for(let frame=0;frame<4;frame++) {
        const cell=document.createElement('div'),caption=document.createElement('p');caption.textContent=`位相 ${frame+1}`;
        const canvas=document.createElement('canvas');canvas.style.cssText='width:240px;height:174px;background:#24342b;display:block;border-bottom:1px solid #89a578';
        cell.append(caption,canvas);row.append(cell);
        const painter=new PetPainter(canvas);await painter.load([variant]);
        const height=96*variant.motions['running-wheel'].displayScale;
        const pet={slot:0,coat:variant.id,name:'',x:(240-height*1.5)/2,y:174-height,width:height*1.5,height,left:false,action:'running-wheel',frame};
        painter.paint([pet],catalog,240,174,1);
        const pixels=painter.context.getImageData(0,0,canvas.width,canvas.height).data;
        let first=174,last=-1,left=240,right=-1;
        for(let y=0;y<174;y++)for(let x=0;x<240;x++)if(pixels[(y*240+x)*4+3]>16){first=Math.min(first,y);last=Math.max(last,y);left=Math.min(left,x);right=Math.max(right,x);}
        if(painter.failed.size || last<0 || first<=0 || left<=0 || right>=239)throw new Error(`Wheel decode or clipping: ${variant.id}/${frame}`);
        results.push({coat:variant.id,frame,height,alphaBounds:[left,first,right,last]});
        playing.push({painter,pet,variant});
      }
      board.append(row);
    }
    document.body.append(board);
    // Exercise the actual image painter at each coat's recorded phase timing.
    const seen=new Map(catalog.map(v=>[v.id,new Set()]));
    await new Promise(resolve=>{
      const start=performance.now();
      function draw(now){
        for(const {painter,pet,variant} of playing){pet.frame=frameAt(now-start,variant.motions['running-wheel'].durations);seen.get(variant.id).add(pet.frame);painter.paint([pet],catalog,240,174,1);}
        if(now-start<1200)requestAnimationFrame(draw);else resolve();
      }
      requestAnimationFrame(draw);
    });
    playing.forEach(({painter,pet},i)=>{pet.frame=i%4;painter.paint([pet],catalog,240,174,1);});
    return {results,played:[...seen].map(([coat,frames])=>({coat,frames:[...frames].sort()}))};
  });
  assert.equal(wheels.results.length,40);assert.ok(wheels.played.every(v=>v.frames.length===4));
  await page.locator('#wheel-review-board').screenshot({path:path.join(directory,'wheel-colors-phases.png')});
  const wheelSizes=await page.evaluate(async()=>{
    document.querySelector('#wheel-review-board').remove();
    const {PetPainter}=await import('./painter.mjs');
    const catalog=(await window.degu.getState()).catalog,variant=catalog.find(v=>v.id==='degu-agouti');
    const board=document.createElement('section');board.id='wheel-size-board';board.style.cssText='position:absolute;inset:0 auto auto 0;z-index:10000;background:#f7f8f3;padding:24px;font:14px sans-serif;color:#283e32';
    const title=document.createElement('h1');title.textContent='回し車 / 実描画サイズ / 通常の散歩との比較';board.append(title);
    const results=[];
    for(const background of ['#f7f8f3','#24342b','#e6ecdf']) {
      const row=document.createElement('div');row.style.cssText='display:flex;gap:16px;margin:16px 0';
      for(const size of [32,48,64,96]) {
        const cell=document.createElement('div'),caption=document.createElement('p');caption.textContent=`${size}px設定 / 回し車は${size*1.6}px`;
        const width=Math.ceil(size*3.9+20);
        const canvas=document.createElement('canvas');canvas.style.cssText=`width:${width}px;height:180px;background:${background};display:block;border-bottom:1px solid #89a578`;
        cell.append(caption,canvas);row.append(cell);
        const painter=new PetPainter(canvas);await painter.load([variant]);
        const height=size*1.6;
        painter.paint([{slot:0,coat:variant.id,name:'',x:0,y:180-height,width:height*1.5,height,left:false,action:'running-wheel',frame:1},{slot:1,coat:variant.id,name:'',x:width-size*1.5,y:180-size,width:size*1.5,height:size,left:false,action:'walk',frame:8}],catalog,width,180,1);
        if(painter.failed.size)throw new Error('Wheel tier decode failed');
        results.push({size,height,background});
      }
      board.append(row);
    }
    document.body.append(board);return results;
  });
  assert.equal(wheelSizes.length,12);
  await page.locator('#wheel-size-board').screenshot({path:path.join(directory,'wheel-sizes.png')});
  assert.deepEqual(await electron.evaluate(()=>globalThis.deguRuntime.failures),[]);
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({passed:true,dimensions,wheels,wheelSizes},null,2));
  console.log(`Actual PetPainter: stretch and wheel at four sizes / three backgrounds, wheel ten coats / four phases: ${directory}`);
} finally { await electron.close(); }
