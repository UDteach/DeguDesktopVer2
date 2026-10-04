export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const motionDuration = motion => motion.durations.reduce((a, b) => a + b, 0) * (motion.cycles ?? 1) + 2 * (motion.transitionMs ?? 0);
export function frameAt(time, durations) {
  const total = durations.reduce((a, b) => a + b, 0);
  let phase = ((time % total) + total) % total;
  for (let i = 0; i < durations.length; i++) { if (phase < durations[i]) return i; phase -= durations[i]; }
  return 0;
}
export function geometry(area, settings) {
  const height = Math.min(settings.size, Math.max(16, area.height));
  const width = Math.min(height * 1.5, area.width);
  const start = area.x + area.width * settings.rangeStart / 100;
  const end = area.x + area.width * settings.rangeEnd / 100;
  const minX = clamp(start, area.x, area.x + Math.max(0, area.width - width));
  const maxX = Math.max(minX, clamp(end - width, area.x, area.x + Math.max(0, area.width - width)));
  const ground = clamp(area.y + area.height - settings.offset, area.y + height, area.y + area.height);
  return { minX, maxX, y: ground - height, width, height };
}
export class PetWorld {
  constructor(random = Math.random) { this.random = random; this.members = new Map(); this.key = ''; this.last = null; }
  step(now, area, settings, pets, catalog, cursor = null) {
    const g = geometry(area, settings);
    const key = JSON.stringify([area, settings.size, settings.rangeStart, settings.rangeEnd, settings.offset]);
    const reset = this.key !== key;
    const elapsed = this.last === null ? 0 : now - this.last;
    // Resume without integrating the entire sleep/minimize interval.
    const dt = elapsed > 250 ? 0 : clamp(elapsed / 1000, 0, 0.05);
    this.last = now; this.key = key;
    const ids = new Set(pets.map(p => p.slot));
    for (const id of this.members.keys()) if (!ids.has(id)) this.members.delete(id);
    return pets.map((pet, i) => {
      let m = this.members.get(pet.slot);
      if (!m || reset) {
        m = { x: g.minX + (g.maxX - g.minX) * (i + 1) / (pets.length + 1), y: g.y, vx: 0, left: i % 2 === 1, action: 'walk', phase: i * 163, remaining: 2.5 + this.random() * 4, walk: true, dash: 0, dashWait: 12 + this.random() * 18 + i * 1.7, special: null, specialIndex: i, specialWait: 25 + this.random() * 20 + i * 7, coat: pet.coat };
        this.members.set(pet.slot, m);
      }
      if (m.coat !== pet.coat) { m.coat = pet.coat; m.phase = 0; m.special = null; m.action = 'idle'; m.walk = false; m.remaining = 1.5; m.dash = 0; }
      const variant = catalog.find(v => v.id === pet.coat);
      const oldX = m.x, oldY = m.y;
      let action = settings.paused ? m.action : 'idle';
      if (!settings.paused) {
        m.specialWait -= dt;
        if (m.special) {
          const total = motionDuration(variant.motions[m.special]);
          if (m.phase >= total) { m.special = null; m.walk = false; m.remaining = 1.5; }
          else action = m.special;
        }
        if (!m.special) {
          const baseSpeed = 45 * settings.speed * g.height / 64;
          m.dashWait -= dt; m.dash = Math.max(0, m.dash - dt);
          m.remaining -= dt;
          if (m.remaining <= 0) {
            m.walk = !m.walk; m.remaining = m.walk ? 3 + this.random() * 5 : 2 + this.random() * 4;
            if (m.walk && this.random() < 0.4) m.left = !m.left;
          }
          const room = m.left ? m.x - g.minX : g.maxX - m.x;
          // A short burst needs space and enough walking time to finish naturally.
          if (m.dashWait <= 0 && m.walk && m.remaining > 1.2 && g.maxX - g.minX > g.width * 2 && room > baseSpeed * 2.2 * 1.3) {
            m.dash = 0.65 + this.random() * 0.45; m.dashWait = 18 + this.random() * 22;
          }
          if (!m.walk) m.dash = 0;
          const targetSpeed = m.walk && g.maxX > g.minX ? (m.left ? -1 : 1) * baseSpeed * (m.dash > 0 ? 2.2 : 1) : 0;
          m.vx += (targetSpeed - m.vx) * (1 - Math.exp(-dt / 0.22));
          m.x += m.vx * dt; m.y = g.y;
          if (m.x <= g.minX && m.vx < 0) { m.x = g.minX; m.left = false; m.vx = 0; m.walk = false; m.dash = 0; m.remaining = 0.6; }
          if (m.x >= g.maxX && m.vx > 0) { m.x = g.maxX; m.left = true; m.vx = 0; m.walk = false; m.dash = 0; m.remaining = 0.6; }
          if (Math.hypot(m.x - oldX, m.y - oldY) > 0.04 || Math.abs(m.vx) > 4) action = 'walk';
          const supported = Object.entries(variant.motions).filter(([, motion]) => motion.singlePlay === true);
          const fits = motion => {
            const scale=motion.displayScale ?? 1, width=g.width*scale, x=m.x-(width-g.width)/2;
            return x>=g.minX && x+width<=g.maxX+g.width && g.y+g.height-area.y>=g.height*scale;
          };
          if (action === 'idle' && !m.walk && m.remaining > .5 && m.specialWait <= 0 && supported.length) {
            // Keep each coat's order stable when an enlarged prop cannot fit here.
            for (let offset=0;offset<supported.length;offset++) {
              const index=(m.specialIndex+offset)%supported.length;
              if (!fits(supported[index][1])) continue;
              action=supported[index][0]; m.specialIndex=index+1;
              m.special = action; m.vx = 0; m.dash = 0; m.phase = 0;
              m.specialWait = 40 + this.random() * 30;
              break;
            }
          }
        } else { m.vx = 0; m.dash = 0; }
      }
      m.x = clamp(m.x, g.minX, g.maxX); m.y = clamp(m.y, area.y, area.y + Math.max(0, area.height - g.height));
      if (m.action !== action) { m.phase = 0; m.action = action; }
      const rate = action === 'walk' ? clamp(Math.abs(m.vx) / (45 * g.height / 64), 0.35, 4.5) : 1;
      if (!settings.paused) m.phase += dt * 1000 * rate;
      const motion = variant.motions[action], total = motionDuration(motion);
      if (!motion.singlePlay) m.phase %= total;
      const transition=motion.transitionMs ?? 0, cycle=motion.durations.reduce((a,b)=>a+b,0);
      const phase=motion.singlePlay ? clamp(m.phase-transition,0,cycle*(motion.cycles ?? 1)-.001) : m.phase;
      const opacity=transition ? clamp(Math.min(m.phase/transition,(total-m.phase)/transition),0,1) : 1;
      const scale=motion.displayScale ?? 1, width=g.width*scale, height=g.height*scale, x=m.x-(width-g.width)/2, y=m.y+g.height-height;
      const hover = cursor && cursor.x >= x && cursor.x <= x + width && cursor.y >= y && cursor.y <= y + height;
      return { slot: pet.slot, coat: pet.coat, name: settings.showNames && hover ? pet.name : '', x, y, width, height, opacity, left: m.left, action, dashing: action === 'walk' && m.dash > 0, frame: frameAt(phase, motion.durations) };
    });
  }
}
