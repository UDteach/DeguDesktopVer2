import {PetWorld} from './assets/generated/motion.mjs';

// Walk/rest loads first; added motions load only as individual pets need them.
export class Flock {
  constructor(painter,catalog,onProgress = () => {}) {
    this.painter = painter; this.catalog = catalog; this.onProgress = onProgress;
    this.variants = new Map(); this.baseJobs = new Map(); this.errors = new Set();
    this.world = new PetWorld();
    this.queued = new Set(); this.next = new Map(); this.specialJobs = new Map();
  }
  async load() {
    await Promise.all(this.catalog.map(async variant => {
      if (this.variants.has(variant.id) || this.baseJobs.has(variant.id)) return;
      const job = this.painter.load([{...variant,motions:{walk:variant.motions.walk,idle:variant.motions.idle}}]);
      this.baseJobs.set(variant.id,job);
      try {
        await job;
        this.variants.set(variant.id,{...variant,motions:{walk:variant.motions.walk,idle:variant.motions.idle}});
        this.errors.delete(variant.id);
      } catch { this.errors.add(variant.id); }
      finally { this.baseJobs.delete(variant.id); this.onProgress(); }
    }));
  }
  resetTime() { this.world.last = null; }
  draw(now,canvas,paused) {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const size = Math.max(24,Math.min(64,width/17));
    const variants = [...this.variants.values()];
    const members = this.catalog.flatMap((v,slot) => this.variants.has(v.id) ? [{slot,coat:v.id}] : []);
    const settings = {size,speed:1,rangeStart:0,rangeEnd:100,offset:0,paused,hidden:false,showNames:false};
    const pets = this.world.step(now,{x:0,y:0,width,height:height-26},settings,members,variants);
    if (!paused) for (const pet of members) this.prepareSpecial(pet,this.world.members.get(pet.slot));
    this.painter.paint(pets,this.catalog,width,height);
    return pets;
  }
  prepareSpecial(pet,member) {
    if (!member) return;
    if (member.specialWait>8) { this.queued.delete(pet.coat); return; }
    if (this.queued.has(pet.coat) || this.specialJobs.has(pet.coat)) return;
    this.queued.add(pet.coat);
    const source = this.catalog.find(v => v.id===pet.coat), variant = this.variants.get(pet.coat);
    const actions = Object.entries(source.motions).filter(([,m]) => m.singlePlay);
    if (!actions.length) return;
    const start = this.next.get(pet.coat) ?? pet.slot;
    for (let offset=0;offset<actions.length;offset++) {
      const index = (start+offset)%actions.length, [action,motion] = actions[index];
      if (variant.motions[action]) continue;
      this.next.set(pet.coat,index+1);
      const job = this.painter.load([{...source,motions:{[action]:motion}}]);
      this.specialJobs.set(pet.coat,job);
      void job.then(() => {variant.motions[action]=motion;this.errors.delete(`${pet.coat}/${action}`);})
        .catch(() => this.errors.add(`${pet.coat}/${action}`))
        .finally(() => {this.specialJobs.delete(pet.coat);this.onProgress();});
      break;
    }
  }
  retry() {this.queued.clear();this.errors.clear();void this.load();}
}
