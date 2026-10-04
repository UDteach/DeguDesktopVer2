import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {_electron} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),directory=path.resolve(process.argv[2]);
assert.ok(directory.startsWith(path.join(root,'.codex','qa')+path.sep));
const snapshot=JSON.parse(fs.readFileSync(path.join(directory,'snapshot.json')));
const original=JSON.parse(fs.readFileSync(path.join(root,'app/media/manifest.json')));
const variants=snapshot.manifest.coats.map(coat=>{
  const native=original.variants.find(v=>v.id===coat.id);
  const base=Object.fromEntries(Object.entries(native.motions).map(([action,m])=>[action,{...m,tiers:Object.fromEntries(Object.entries(m.tiers).map(([tier,files])=>[tier,files.map(f=>pathToFileURL(path.join(root,'app/media',f)).href)]))}]));
  const motion={durations:snapshot.manifest.durations_ms,presentation:{scale:1,x:0,y:0},tiers:Object.fromEntries(Object.entries(coat.tiers).map(([tier,files])=>[tier,files.map(f=>pathToFileURL(path.join(directory,'source/rearing-ten-colors',f)).href)]))};
  return {...native,motions:{...base,rearing:motion}};
});
const {ELECTRON_RUN_AS_NODE,...env}=process.env;
const electron=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root,`--qa-profile=${path.join(directory,'review-profile')}`],env});
try {
  let page;for(let i=0;i<100;i++){page=electron.windows().find(p=>p.url().endsWith('/settings.html'));if(page)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(page);await page.waitForFunction(()=>window.deguPreviewDiagnostics?.ready);
  await electron.evaluate(()=>globalThis.deguRuntime.change({paused:true,hidden:true}));
  await page.setViewportSize({width:1100,height:820});
  await page.evaluate(async variants=>{
    const {PetPainter}=await import('./painter.mjs'),{frameAt}=await import('./motion.mjs');
    const board=document.createElement('section');board.id='rearing-board';board.style.cssText='position:absolute;inset:0 auto auto 0;z-index:10000;background:#f7f8f3;padding:24px;font:14px sans-serif;color:#283e32';
    const items=[];
    for(const variant of variants){
      const section=document.createElement('section');section.id=variant.id;const title=document.createElement('h2');title.textContent=`立ち上がり / ${variant.id} / 散歩と比較`;section.append(title);
      for(const background of ['#f7f8f3','#24342b','#e6ecdf']) {
        const row=document.createElement('div');row.style.cssText='display:flex;gap:16px;margin:10px 0;';
        for(const size of [32,48,64,96]) {
          const width=size*3+20,cell=document.createElement('div'),caption=document.createElement('span');caption.textContent=`${size}px`;
          const canvas=document.createElement('canvas');canvas.style.cssText=`width:${width}px;height:120px;background:${background};display:block;border-bottom:1px solid #89a578`;
          cell.append(caption,canvas);row.append(cell);const painter=new PetPainter(canvas,'');await painter.load([variant]);
          const pets=[{slot:0,coat:variant.id,name:'',x:0,y:120-size,width:size*1.5,height:size,left:false,action:'rearing',frame:0},{slot:1,coat:variant.id,name:'',x:width-size*1.5,y:120-size,width:size*1.5,height:size,left:false,action:'walk',frame:8}];
          if(painter.failed.size)throw new Error('Decode failed');items.push({painter,pets,width,size,background,variant});
        }section.append(row);
      }board.append(section);
    }document.body.append(board);
    window.rearingReview={frame:0,playing:true,seen:[],items:items.map(i=>({coat:i.variant.id,size:i.size,background:i.background}))};
    window.rearingPaint=frame=>{for(const i of items){i.pets[0].frame=frame;i.painter.paint(i.pets,[i.variant],i.width,120,1);}window.rearingReview.frame=frame;};
    const seen=new Set();await new Promise(resolve=>{const start=performance.now();function play(now){const frame=frameAt(now-start,variants[0].motions.rearing.durations);seen.add(frame);window.rearingPaint(frame);if(now-start<8084)requestAnimationFrame(play);else resolve();}requestAnimationFrame(play);});
    window.rearingReview.playing=false;window.rearingReview.seen=[...seen].sort((a,b)=>a-b);
    const bounds=[];
    for(let frame=0;frame<32;frame++)for(const i of items){
      i.pets[0].frame=frame;i.painter.paint([i.pets[0]],[i.variant],i.width,120,1);
      const pixels=i.painter.context.getImageData(0,0,i.width,120).data;let minX=i.width,minY=120,maxX=-1,maxY=-1;
      for(let y=0;y<120;y++)for(let x=0;x<i.width;x++)if(pixels[(y*i.width+x)*4+3]>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
      if(minX<=0 || minY<=0 || maxX>=i.width-1 || maxY>=120)throw new Error(`Clipped ${i.variant.id}/${frame}/${i.size}`);
      bounds.push({coat:i.variant.id,frame,size:i.size,background:i.background,alphaBounds:[minX,minY,maxX,maxY]});
    }window.rearingReview.bounds=bounds;window.rearingPaint(16);
  },variants);
  const report=await page.evaluate(()=>window.rearingReview);assert.equal(report.items.length,120);assert.equal(report.seen.length,32);
  for(const frame of [0,16,31]){await page.evaluate(frame=>window.rearingPaint(frame),frame);for(const v of variants)await page.locator('#'+v.id).screenshot({path:path.join(directory,`${v.id}-${frame}.png`)});}
  assert.deepEqual(await electron.evaluate(()=>globalThis.deguRuntime.failures),[]);
  fs.writeFileSync(path.join(directory,'render-report.json'),JSON.stringify({passed:true,sourceManifestSha256:snapshot.sourceManifestSha256,...report},null,2));
  console.log(`Rearing reviewed: timed 8084ms / all 32 phases / 10 coats x 4 sizes x 3 backgrounds: ${directory}`);
}finally{await electron.close();}
