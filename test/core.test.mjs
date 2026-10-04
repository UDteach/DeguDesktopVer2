import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PetWorld, frameAt, geometry } from '../app/motion.mjs';
const require = createRequire(import.meta.url);
const { defaults, validate, readSettings, writeSettings } = require('../app/settings.cjs');
const { selectedDisplays, distribute } = require('../app/display.cjs');
const catalog = JSON.parse(fs.readFileSync(new URL('../app/media/manifest.json', import.meta.url))).variants;
const pets = s => s.pets.slice(0, s.count).map((p, slot) => ({ ...p, slot }));
test('original frame timings wrap and retain exact boundaries', () => {
  assert.equal(frameAt(18, [19, 18]), 0); assert.equal(frameAt(19, [19, 18]), 1); assert.equal(frameAt(37, [19, 18]), 0); assert.equal(frameAt(-1, [19, 18]), 1);
  assert.equal(catalog[0].motions.walk.durations.reduce((a, b) => a + b), 556);
});
test('invalid settings and unknown coats cannot reach the renderer', () => {
  for (const bad of [{count:0}, {count:11}, {size:95}, {speed:NaN}, {paused:'false'}, {rangeStart:99}, {monitor:'file:foo'}, {mode:'unknown'}, {offset:-1}, {pets:[]}]) assert.throws(() => validate({ ...defaults(), ...bad }));
  const s = defaults(); s.pets[0].name = '<script>hi</script>'; assert.equal(validate(s).pets[0].name, s.pets[0].name);
});
test('settings persist every hidden individual without touching old app paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'degu-ver2-settings-'));
  try {
    const file = path.join(dir, 'settings.json'), s = defaults(); s.pets[8] = { coat:'degu-black', name:'くろ' }; s.count=1;
    writeSettings(file, s); assert.deepEqual(readSettings(file).settings, s); assert.equal(fs.existsSync(file+'.tmp'), false);
    fs.writeFileSync(file, '{invalid'); assert.equal(readSettings(file).recovered, true); assert.equal(fs.readFileSync(file, 'utf8'), '{invalid');
  } finally { fs.rmSync(dir, { recursive:true, force:true }); }
});
test('display selection falls back after unplug and pets stay spread across enabled displays', () => {
  const d = [{id:1}, {id:2}]; assert.deepEqual(selectedDisplays(d,1,'display:3'), [d[0]]);
  const s = defaults(); s.count=3; const p=pets(s);
  assert.deepEqual(distribute(p,d).get(1).map(p=>p.slot), [0,2]);
  assert.equal(distribute(p,[d[0]]).get(1).length,3);
  assert.deepEqual(distribute(p,d).get(2).map(p=>p.slot), [1]);
  assert.equal(distribute(p,[]).size,0);
});
test('all sizes and 10 pets stay within negative-origin, narrow and mixed-layout work areas', () => {
  for (const area of [{x:-1536,y:-200,width:1536,height:850},{x:0,y:0,width:150,height:80},{x:0,y:45,width:320,height:400}]) for (const size of [32,48,64,96]) {
    const s = { ...defaults(), count:10, size, rangeStart:25, rangeEnd:75, offset:40 };
    const model = new PetWorld(() => .6); let seenWalk=false, seenIdle=false;
    for (let i=0;i<6000;i++) for (const p of model.step(i*33,area,s,pets(s),catalog)) {
      assert.ok(p.x>=area.x && p.x+p.width<=area.x+area.width+.001); assert.ok(p.y>=area.y && p.y+p.height<=area.y+area.height+.001);
      const durations = catalog.find(v=>v.id===p.coat).motions[p.action].durations; assert.ok(p.frame>=0 && p.frame<durations.length);
      seenWalk ||= p.action==='walk'; seenIdle ||= p.action==='idle';
    }
    assert.ok(seenIdle); if (geometry(area,s).maxX>geometry(area,s).minX) assert.ok(seenWalk);
    assert.equal(model.members.size,10);
  }
});
test('cursor position cannot change wandering; pause and long sleep do not move pets', () => {
  const s={ ...defaults(), count:1 }, area={x:0,y:0,width:1200,height:800}, model=new PetWorld(()=>.5), other=new PetWorld(()=>.5);
  const cursor={x:850,y:300}; let last;
  for(let i=0;i<1000;i++) {
    last=model.step(i*16,area,s,pets(s),catalog,cursor)[0];
    const independent=other.step(i*16,area,s,pets(s),catalog,{x:i%1200,y:i%800})[0];
    assert.deepEqual({...last,name:''},{...independent,name:''});
    assert.equal(last.y,geometry(area,s).y);
  }
  const before=last.x;
  const resume=model.step(999*16+3600000,area,s,pets(s),catalog,{x:0,y:0})[0]; assert.equal(resume.x,before);
  const paused={...s,paused:true}; const a=model.step(3600000+999*16+16,area,paused,pets(s),catalog,cursor)[0];
  const b=model.step(3600000+999*16+200,area,paused,pets(s),catalog,cursor)[0]; assert.equal(a.x,b.x); assert.equal(a.frame,b.frame);
});
test('legacy follow settings retain individual choices and remove the obsolete mode', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'degu-ver2-legacy-'));
  try {
    const file=path.join(dir,'settings.json'), saved={...defaults(),mode:'follow',count:3,size:96,offset:40};
    saved.pets[8]={coat:'degu-black',name:'くろ'};
    fs.writeFileSync(file,JSON.stringify(saved),'utf8');
    const read=readSettings(file);
    assert.equal(read.recovered,false);
    const {mode,...expected}=saved; assert.deepEqual(read.settings,expected);
    writeSettings(file,read.settings);
    assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(file,'utf8')),'mode'),false);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('dash bursts are occasional, brief, faster than walking and suppressed in cramped ranges', () => {
  const s=defaults(), area={x:0,y:0,width:3000,height:800}, model=new PetWorld(()=>.6);
  let last, startedAt=null, bursts=0, maxSpeed=0;
  for(let i=0;i<7500;i++) {
    const pet=model.step(i*16,area,s,pets(s),catalog)[0];
    if(pet.dashing && !last?.dashing) { assert.ok(i*16>=12000); startedAt=i*16; bursts++; }
    if(!pet.dashing && last?.dashing) { assert.ok(i*16-startedAt<=1200); startedAt=null; }
    if(last && pet.dashing) maxSpeed=Math.max(maxSpeed,Math.abs(pet.x-last.x)/.016);
    last=pet;
  }
  assert.ok(bursts>=1 && bursts<=6); assert.ok(maxSpeed>45*1.5);
  const narrow=new PetWorld(()=>.6), tiny={...area,width:200};
  for(let i=0;i<7500;i++) assert.equal(narrow.step(i*16,tiny,s,pets(s),catalog)[0].dashing,false);
});
test('changing count prunes world members and restores individual settings', () => {
  const model=new PetWorld(()=>.5), s={...defaults(),count:10}, area={x:0,y:0,width:1920,height:1080};
  model.step(0,area,s,pets(s),catalog); assert.equal(model.members.size,10);
  s.count=1; model.step(16,area,s,pets(s),catalog); assert.equal(model.members.size,1);
  s.count=10; const frame=model.step(32,area,s,pets(s),catalog); assert.equal(frame[8].coat,s.pets[8].coat);
});
