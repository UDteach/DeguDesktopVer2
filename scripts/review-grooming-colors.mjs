import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {_electron} from 'playwright';
const root=path.resolve(import.meta.dirname,'..'),batchPath=path.resolve(process.argv[2]);
const directories=JSON.parse(fs.readFileSync(batchPath)).snapshots;
const snapshots=directories.map(directory=>JSON.parse(fs.readFileSync(path.join(directory,'snapshot.json'))));
const original=JSON.parse(fs.readFileSync(path.join(root,'app/media/manifest.json')));
const variants=snapshots.map((snapshot,index)=>{
  const native=original.variants.find(v=>v.id===snapshot.variant.id);
  const base=Object.fromEntries(Object.entries(native.motions).map(([action,m])=>[action,{...m,tiers:Object.fromEntries(Object.entries(m.tiers).map(([tier,files])=>[tier,files.map(f=>pathToFileURL(path.join(root,'app/media',f)).href)]))}]));
  const motion={durations:snapshot.durations,presentation:{scale:1,x:0,y:0},tiers:Object.fromEntries(Object.entries(snapshot.variant.tiers).map(([tier,files])=>[tier,files.map(f=>pathToFileURL(path.join(directories[index],f)).href)]))};
  assert.equal(motion.durations.length,96);assert.equal(motion.durations.reduce((a,b)=>a+b,0),4000);
  return {...native,motions:{...base,'face-grooming':motion}};
});
const {ELECTRON_RUN_AS_NODE,...env}=process.env;
const electron=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root,`--qa-profile=${path.join(path.dirname(batchPath),'grooming-color-review-profile')}`],env});
try{
  let page;for(let i=0;i<100;i++){page=electron.windows().find(p=>p.url().endsWith('/settings.html'));if(page)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(page);await page.waitForFunction(()=>window.deguPreviewDiagnostics?.ready);
  await electron.evaluate(()=>globalThis.deguRuntime.change({paused:true,hidden:true}));
  await page.setViewportSize({width:1100,height:820});
  await page.evaluate(async variants=>{
    const {PetPainter}=await import('./painter.mjs'),{frameAt}=await import('./motion.mjs');
    const board=document.createElement('section');board.id='grooming-board';board.style.cssText='position:absolute;inset:0 auto auto 0;z-index:10000;background:#f7f8f3;padding:24px;font:14px sans-serif;color:#283e32';
    const items=[],contacts=[];
    for(const variant of variants){
      const section=document.createElement('section');section.id=variant.id;const title=document.createElement('h2');title.textContent=`お顔くしくし / ${variant.id} / 散歩と比較`;section.append(title);
      const cache=new PetPainter(document.createElement('canvas'),'');await cache.load([variant]);if(cache.failed.size)throw new Error('Decode failed: '+variant.id);
      for(const background of ['#f7f8f3','#24342b','#e6ecdf']){
        const row=document.createElement('div');row.style.cssText='display:flex;gap:16px;margin:10px 0;';
        for(const size of [32,48,64,96]){
          const width=size*3+20,cell=document.createElement('div'),caption=document.createElement('span');caption.textContent=`${size}px`;
          const canvas=document.createElement('canvas');canvas.style.cssText=`width:${width}px;height:120px;background:${background};display:block;border-bottom:1px solid #89a578`;
          cell.append(caption,canvas);row.append(cell);const painter=new PetPainter(canvas,'');painter.images=cache.images;
          const pets=[{slot:0,coat:variant.id,name:'',x:0,y:120-size,width:size*1.5,height:size,left:false,action:'face-grooming',frame:0},{slot:1,coat:variant.id,name:'',x:width-size*1.5,y:120-size,width:size*1.5,height:size,left:false,action:'walk',frame:8}];
          items.push({painter,pets,width,size,background,variant});
        }section.append(row);
      }board.append(section);
      // All 96 native frames use the real painter, copied into a labeled contact canvas.
      const contact=document.createElement('canvas');contact.id=variant.id+'-contact';contact.width=1800;contact.height=960;contact.style.cssText='display:block;width:1800px;height:960px';
      const ctx=contact.getContext('2d'),canvas=document.createElement('canvas'),painter=new PetPainter(canvas,'');painter.images=cache.images;
      for(let frame=0;frame<96;frame++){
        const x=(frame%12)*150,y=Math.floor(frame/12)*120;ctx.fillStyle=frame%2?'#24342b':'#f7f8f3';ctx.fillRect(x,y,150,120);
        painter.paint([{slot:0,coat:variant.id,name:'',x:0,y:24,width:144,height:96,left:false,action:'face-grooming',frame}],[variant],144,120,1);ctx.drawImage(canvas,x+3,y);
        ctx.fillStyle=frame%2?'#edf3ea':'#283e32';ctx.font='10px sans-serif';ctx.fillText(String(frame).padStart(3,'0'),x+4,y+12);
      }contacts.push(contact);
    }
    document.body.append(board);const contactBoard=document.createElement('section');contactBoard.style.cssText='position:absolute;left:0;top:10000px;z-index:10001';contacts.forEach(c=>contactBoard.append(c));document.body.append(contactBoard);
    window.groomingReview={frame:0,seen:[],items:items.map(i=>({coat:i.variant.id,size:i.size,background:i.background}))};
    window.groomingPaint=frame=>{for(const i of items){i.pets[0].frame=frame;i.painter.paint(i.pets,[i.variant],i.width,120,1);}window.groomingReview.frame=frame;};
    const seen=new Set();await new Promise(resolve=>{const start=performance.now();function play(now){const frame=frameAt(now-start,variants[0].motions['face-grooming'].durations);seen.add(frame);window.groomingPaint(frame);if(now-start<12000)requestAnimationFrame(play);else resolve();}requestAnimationFrame(play);});window.groomingReview.seen=[...seen].sort((a,b)=>a-b);
    const bounds=[];
    for(let frame=0;frame<96;frame++)for(const i of items){
      i.pets[0].frame=frame;i.painter.paint([i.pets[0]],[i.variant],i.width,120,1);const pixels=i.painter.context.getImageData(0,0,i.width,120).data;let minX=i.width,minY=120,maxX=-1,maxY=-1;
      for(let y=0;y<120;y++)for(let x=0;x<i.width;x++)if(pixels[(y*i.width+x)*4+3]>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
      if(minX<=0 || minY<=0 || maxX>=i.width-1 || maxY>=120)throw new Error(`Clipped ${i.variant.id}/${frame}/${i.size}`);
      bounds.push({coat:i.variant.id,frame,size:i.size,background:i.background,alphaBounds:[minX,minY,maxX,maxY]});
    }window.groomingReview.bounds=bounds;window.groomingPaint(48);
  },variants);
  const report=await page.evaluate(()=>window.groomingReview);assert.equal(report.seen.length,96);assert.equal(report.items.length,variants.length*12);
  for(const frame of [0,32,48,64,95]){
    await page.evaluate(frame=>window.groomingPaint(frame),frame);
    for(let i=0;i<variants.length;i++)await page.locator('#'+variants[i].id).screenshot({path:path.join(directories[i],`face-${frame}.png`)});
  }
  for(let i=0;i<variants.length;i++){
    await page.locator('#'+variants[i].id+'-contact').screenshot({path:path.join(directories[i],'contact-native.png')});
    fs.writeFileSync(path.join(directories[i],'render-report.json'),JSON.stringify({passed:true,componentSha256:snapshots[i].componentSha256,timedPlaybackMs:12000,seen:report.seen,items:report.items.filter(x=>x.coat===variants[i].id),bounds:report.bounds.filter(x=>x.coat===variants[i].id)},null,2));
  }
  assert.deepEqual(await electron.evaluate(()=>globalThis.deguRuntime.failures),[]);
  fs.writeFileSync(path.join(path.dirname(batchPath),'grooming-colors-render-report.json'),JSON.stringify({passed:true,timedPlaybackMs:12000,components:snapshots.map(s=>({coat:s.variant.id,sha256:s.componentSha256})),...report},null,2));
  console.log(`Grooming: ${variants.length} coats, all96 timed phases, 4 sizes x 3 backgrounds checked; reports saved.`);
}finally{await electron.close();}
