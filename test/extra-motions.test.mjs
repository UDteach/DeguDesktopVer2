import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { PetWorld } from '../app/motion.mjs';
const require = createRequire(import.meta.url);
const { verifyMotionPack, mergeMotions } = require('../app/extra-motions.cjs');
const { defaults } = require('../app/settings.cjs');
const original = JSON.parse(fs.readFileSync(new URL('../app/media/manifest.json', import.meta.url)));
const pack = JSON.parse(fs.readFileSync(new URL('../app/motions/manifest.json', import.meta.url)));
const read = file => fs.readFileSync(new URL('../app/motions/' + file, import.meta.url));
const catalog = mergeMotions(original, verifyMotionPack(pack, read, original)).variants;
const stretchOnly=catalog.map(v=>({...v,motions:Object.fromEntries(Object.entries(v.motions).filter(([action])=>['walk','idle','leg-stretch'].includes(action)))}));
const pets = s => s.pets.slice(0, s.count).map((p, slot) => ({ ...p, slot }));

test('additional frames preserve original catalog and reject tampering, wrong paths and cross-coat mappings', () => {
  assert.equal(original.variants[0].motions['leg-stretch'], undefined);
  assert.deepEqual(catalog[0].motions.walk, original.variants[0].motions.walk);
  assert.deepEqual(catalog[0].motions.idle, original.variants[0].motions.idle);
  assert.equal(catalog[1].motions['leg-stretch'], undefined);
  assert.throws(() => verifyMotionPack(pack, () => Buffer.from('damaged'), original));
  for (const modify of [
    p => p.files[0].path = '../../outside.png',
    p => p.motions[0].action = 'walk',
    p => p.motions[0].coat = 'degu-white',
    p => p.motions[0].durations[0] = 0,
    p => p.motions[0].tiers['64'].pop()
  ]) { const p = structuredClone(pack); modify(p); assert.throws(() => verifyMotionPack(p, read, original)); }
});

test('stretch plays once at fixed speed and position then returns to idle; unmade coats keep wandering', () => {
  const area = { x:0, y:0, width:3000, height:800 };
  for (const speed of [.5, 1, 2]) {
    const s={...defaults(),speed}, w=new PetWorld(()=>.6);
    let start=null, fixedX=null, lastFrame=-1, ended=false, walkedAfter=false;
    for(let i=0;i<7500;i++) {
      const p=w.step(i*16,area,s,pets(s),stretchOnly)[0];
      if(p.action==='leg-stretch' && start===null) { start=i*16; fixedX=p.x; }
      if(start!==null && !ended) {
        if(p.action==='leg-stretch') { assert.equal(p.x,fixedX); assert.equal(p.dashing,false); assert.ok(p.frame>=lastFrame); lastFrame=p.frame; }
        else { assert.equal(p.action,'idle'); assert.ok(i*16-start>=3850 && i*16-start<=3900); assert.equal(lastFrame,92); ended=true; }
      }
      if(ended && p.action==='walk') walkedAfter=true;
    }
    assert.ok(start!==null && ended && walkedAfter);
  }
  const s=defaults(); s.pets[0].coat='degu-blue'; const w=new PetWorld(()=>.6);
  for(let i=0;i<5000;i++) assert.ok(['walk','idle'].includes(w.step(i*16,area,s,pets(s),stretchOnly)[0].action));
});

test('ten wheel coats repeat all four phases, fade at the edges and fit enlarged props; small areas suppress them', () => {
  const s={...defaults(),count:10,size:96}, area={x:-3000,y:-100,width:6000,height:900}, w=new PetWorld(()=>.6);
  const wheels=catalog.map(v=>({...v,motions:Object.fromEntries(Object.entries(v.motions).filter(([action])=>['walk','idle','running-wheel'].includes(action)))}));
  const seen=new Map(), phases=new Set(), fades=new Set();
  for(let i=0;i<15000;i++) for(const p of w.step(i*16,area,s,pets(s),wheels)) {
    assert.ok(p.x>=area.x && p.x+p.width<=area.x+area.width+.001);
    assert.ok(p.y>=area.y && p.y+p.height<=area.y+area.height+.001);
    if(p.action==='running-wheel') {seen.set(p.coat,true);phases.add(p.frame);if(p.opacity<1)fades.add(p.coat);assert.equal(p.height,96*1.6);assert.equal(p.dashing,false);}
  }
  assert.equal(seen.size,10);assert.equal(fades.size,10);assert.deepEqual([...phases].sort(),[0,1,2,3]);
  const tiny={x:0,y:0,width:100,height:50}, narrow=new PetWorld(()=>.6);
  for(let i=0;i<10000;i++) for(const p of narrow.step(i*16,tiny,s,pets(s),wheels))assert.notEqual(p.action,'running-wheel');
});

test('pause, sleep, coat changes and layout changes safely preserve or end a single-play action', () => {
  const s=defaults(), area={x:0,y:0,width:3000,height:800}, w=new PetWorld(()=>.6);
  let p, now=0;
  for(;now<100000;now+=16) { p=w.step(now,area,s,pets(s),catalog)[0]; if(p.action==='leg-stretch' && p.frame>10) break; }
  assert.equal(p.action,'leg-stretch');
  const paused={...s,paused:true};
  assert.deepEqual(w.step(now+16,area,paused,pets(paused),catalog)[0],p);
  assert.deepEqual(w.step(now+1016,area,paused,pets(paused),catalog)[0],p);
  assert.deepEqual(w.step(now+3600000,area,s,pets(s),catalog)[0],p);
  const changed=structuredClone(paused); changed.pets[0].coat='degu-blue';
  assert.equal(w.step(now+3600016,area,changed,pets(changed),catalog)[0].action,'idle');
  const resized=w.step(now+3600032,{...area,width:80,height:40},s,pets(s),catalog)[0];
  assert.ok(resized.x>=0 && resized.x+resized.width<=80); assert.ok(resized.y>=0 && resized.y+resized.height<=40);
});

test('a wheel that cannot fit at the edge does not skip the next ordinary action', () => {
  for (const seed of [6,98]) {
    let state=seed;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const s={...defaults(),size:96};s.pets[0].coat='degu-blue';
    const w=new PetWorld(random),area={x:0,y:0,width:1920,height:1032},actions=[];
    let previous='';
    for(let now=0;now<=240000;now+=16){
      const p=w.step(now,area,s,pets(s),catalog)[0];
      if(p.action!==previous && !['walk','idle'].includes(p.action)){
        actions.push(p.action);if(p.action==='face-grooming')break;
      }
      previous=p.action;
    }
    assert.equal(actions.at(-1),'face-grooming');
    assert.deepEqual(actions,seed===6?['running-wheel','rearing','face-grooming']:['rearing','face-grooming']);
  }
});

test('ten grooming coats preserve four-second phases; missing action data safely falls back', () => {
  const grooming=catalog[0].motions['face-grooming'];assert.equal(grooming.durations.length,96);
  assert.equal(grooming.durations.reduce((a,b)=>a+b,0),4000);
  for(const variant of catalog){assert.deepEqual(variant.motions['face-grooming'].durations,grooming.durations);assert.equal(variant.motions['face-grooming'].tiers['96'].length,96);}
  const isolated=catalog.map(v=>({...v,motions:Object.fromEntries(Object.entries(v.motions).filter(([action])=>['walk','idle','face-grooming'].includes(action)))}));
  const s=defaults(),w=new PetWorld(()=>.6),area={x:-1200,y:0,width:2400,height:800};
  let started=null,fixedX,lastFrame=-1,ended=false;
  for(let i=0;i<6000;i++){
    const p=w.step(i*16,area,s,pets(s),isolated)[0];
    if(p.action==='face-grooming' && started===null){started=i*16;fixedX=p.x;}
    if(started!==null && !ended){
      if(p.action==='face-grooming'){assert.equal(p.x,fixedX);assert.equal(p.height,s.size);assert.equal(p.opacity,1);assert.ok(p.frame>=lastFrame);lastFrame=p.frame;}
      else{assert.equal(p.action,'idle');assert.ok(i*16-started>=3980 && i*16-started<=4030);assert.equal(lastFrame,95);ended=true;}
    }
  }
  assert.ok(started!==null && ended);
  const blue=structuredClone(s);blue.pets[0].coat='degu-blue';const fallback=new PetWorld(()=>.6);
  const absent=isolated.map(v=>({...v,motions:Object.fromEntries(Object.entries(v.motions).filter(([a])=>v.id!=='degu-blue' || a!=='face-grooming'))}));
  for(let i=0;i<5000;i++)assert.ok(['walk','idle'].includes(fallback.step(i*16,area,blue,pets(blue),absent)[0].action));
  const all={...defaults(),count:10},group=new PetWorld(()=>.6),wide={x:-3000,y:-100,width:6000,height:900},seen=new Map(),ends=new Set(),startTimes=new Set();
  for(let i=0;i<7500;i++)for(const p of group.step(i*16,wide,all,pets(all),isolated)){
    if(p.action==='face-grooming' && !seen.has(p.coat)){seen.set(p.coat,{time:i*16,x:p.x,y:p.y,frame:-1});startTimes.add(i*16);}
    if(!seen.has(p.coat) || ends.has(p.coat))continue;
    const start=seen.get(p.coat);assert.equal(p.x,start.x);assert.equal(p.y,start.y);
    if(p.action==='face-grooming'){assert.ok(p.frame>=start.frame);assert.equal(p.opacity,1);start.frame=p.frame;}
    else{assert.equal(p.action,'idle');assert.equal(start.frame,95);assert.ok(i*16-start.time>=3980 && i*16-start.time<=4030);ends.add(p.coat);}
  }
  assert.equal(ends.size,10);assert.ok(startTimes.size>1);
});

test('all ten rearing coats preserve phase and 4042ms timing, stay grounded and return once without wrapping', () => {
  const isolated=catalog.map(v=>({...v,motions:Object.fromEntries(Object.entries(v.motions).filter(([action])=>['walk','idle','rearing'].includes(action)))}));
  const durations=isolated[0].motions.rearing.durations;
  assert.equal(durations.length,32);assert.equal(durations.reduce((a,b)=>a+b,0),4042);
  for(const v of isolated)assert.deepEqual(v.motions.rearing.durations,durations);
  for(const size of [32,48,64,96]){
    const s={...defaults(),count:10,size},w=new PetWorld(()=>.6),area={x:-2000,y:-500,width:4000,height:1400};
    const seen=new Map(),ended=new Set(),starts=new Set();
    for(let i=0;i<7000;i++)for(const p of w.step(i*16,area,s,pets(s),isolated)){
      if(p.action==='rearing' && !seen.has(p.coat)){seen.set(p.coat,{time:i*16,x:p.x,y:p.y,frame:-1});starts.add(i*16);}
      if(!seen.has(p.coat) || ended.has(p.coat))continue;
      const start=seen.get(p.coat);assert.equal(p.x,start.x);assert.equal(p.y,start.y);
      if(p.action==='rearing'){assert.equal(p.height,size);assert.equal(p.opacity,1);assert.equal(p.dashing,false);assert.ok(p.frame>=start.frame);start.frame=p.frame;}
      else{assert.equal(p.action,'idle');assert.equal(start.frame,31);assert.ok(i*16-start.time>=4020 && i*16-start.time<=4080);ended.add(p.coat);}
    }
    assert.equal(ended.size,10);assert.ok(starts.size>1,'Pets must not all start together');
  }
});
