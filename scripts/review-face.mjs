import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {_electron} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),directory=path.resolve(process.argv[2]);
assert.ok(directory.startsWith(path.join(root,'.codex','qa')+path.sep));
const snapshot=JSON.parse(fs.readFileSync(path.join(directory,'snapshot.json')));
const nativeVariant=JSON.parse(fs.readFileSync(path.join(root,'app/media/manifest.json'))).variants[0];
const fileURL=(folder,file)=>pathToFileURL(path.join(folder,file)).href;
const motion={durations:snapshot.durations,presentation:{scale:1,x:0,y:0},tiers:Object.fromEntries(Object.entries(snapshot.variant.tiers).map(([tier,files])=>[tier,files.map(f=>fileURL(directory,f))]))};
const variant={...nativeVariant,motions:{...Object.fromEntries(Object.entries(nativeVariant.motions).map(([action,m])=>[action,{...m,tiers:Object.fromEntries(Object.entries(m.tiers).map(([tier,files])=>[tier,files.map(f=>fileURL(path.join(root,'app/media'),f))]))}])), 'face-grooming':motion}};
const {ELECTRON_RUN_AS_NODE,...env}=process.env;
const electron=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root,`--qa-profile=${path.join(directory,'review-profile')}`],env});
try {
  let page;for(let i=0;i<100;i++){page=electron.windows().find(p=>p.url().endsWith('/settings.html'));if(page)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(page);await page.waitForFunction(()=>window.deguPreviewDiagnostics?.ready);
  await electron.evaluate(()=>globalThis.deguRuntime.change({paused:true,hidden:true}));
  await page.setViewportSize({width:1100,height:820});
  await page.evaluate(async variant=>{
    const {PetPainter}=await import('./painter.mjs'),{frameAt}=await import('./motion.mjs');
    const board=document.createElement('section');board.id='face-board';board.style.cssText='position:absolute;inset:0 auto auto 0;z-index:10000;background:#f7f8f3;padding:24px;font:14px sans-serif;color:#283e32';
    const title=document.createElement('h1');title.textContent='お顔くしくし / 実描画サイズ / 既存の散歩と比較';board.append(title);
    const items=[];
    for(const background of ['#f7f8f3','#24342b','#e6ecdf']) {
      const row=document.createElement('div');row.style.cssText='display:flex;gap:16px;margin:20px 0;';
      for(const size of [32,48,64,96]) {
        const width=size*3+20,cell=document.createElement('div'),caption=document.createElement('p');caption.textContent=`${size}px設定`;
        const canvas=document.createElement('canvas');canvas.style.cssText=`width:${width}px;height:120px;background:${background};display:block;border-bottom:1px solid #89a578`;
        cell.append(caption,canvas);row.append(cell);const painter=new PetPainter(canvas,'');await painter.load([variant]);
        const pets=[{slot:0,coat:variant.id,name:'',x:0,y:120-size,width:size*1.5,height:size,left:false,action:'face-grooming',frame:0},{slot:1,coat:variant.id,name:'',x:width-size*1.5,y:120-size,width:size*1.5,height:size,left:false,action:'walk',frame:8}];
        if(painter.failed.size)throw new Error('Decode failed');items.push({painter,pets,width,size,background});
      }
      board.append(row);
    }
    document.body.append(board);
    const seen=new Set();
    window.faceReview={frame:0,playing:true,seen:[],items:items.map(i=>({size:i.size,background:i.background}))};
    window.facePaint=frame=>{for(const i of items){i.pets[0].frame=frame;i.painter.paint(i.pets,[variant],i.width,120,1);}window.faceReview.frame=frame;};
    await new Promise(resolve=>{const start=performance.now();function play(now){const frame=frameAt(now-start,variant.motions['face-grooming'].durations);seen.add(frame);window.facePaint(frame);if(now-start<8000)requestAnimationFrame(play);else resolve();}requestAnimationFrame(play);});
    window.faceReview.playing=false;window.faceReview.seen=[...seen].sort((a,b)=>a-b);
    // Check all frame bounds in the actual Canvas painter, without changing source pixels.
    const bounds=[];
    for(let frame=0;frame<96;frame++)for(const i of items){
      i.pets[0].frame=frame;i.painter.paint([i.pets[0]],[variant],i.width,120,1);
      const pixels=i.painter.context.getImageData(0,0,i.width,120).data;let minX=i.width,minY=120,maxX=-1,maxY=-1;
      for(let y=0;y<120;y++)for(let x=0;x<i.width;x++)if(pixels[(y*i.width+x)*4+3]>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
      if(minX<=0 || minY<=0 || maxX>=i.width-1 || maxY>=120)throw new Error(`Clipped frame ${frame}/${i.size}`);
      bounds.push({frame,size:i.size,background:i.background,alphaBounds:[minX,minY,maxX,maxY]});
    }
    window.faceReview.bounds=bounds;window.facePaint(48);
  },variant);
  const report=await page.evaluate(()=>window.faceReview);assert.equal(report.items.length,12);assert.ok(report.seen.length>=90);
  for(const frame of [0,32,48,64,95]) {await page.evaluate(frame=>window.facePaint(frame),frame);await page.locator('#face-board').screenshot({path:path.join(directory,`face-${frame}.png`)});}
  assert.deepEqual(await electron.evaluate(()=>globalThis.deguRuntime.failures),[]);
  fs.writeFileSync(path.join(directory,'render-report.json'),JSON.stringify({passed:true,componentSha256:snapshot.componentSha256,...report},null,2));
  console.log(`Face reviewed: 8s timed playback (${report.seen.length} frames), 96 frames x 4 sizes x 3 backgrounds: ${directory}`);
} finally {await electron.close();}
