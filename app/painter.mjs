export class PetPainter {
  constructor(canvas, base = './media/') { this.canvas = canvas; this.context = canvas.getContext('2d', { alpha: true }); this.base = base; this.images = new Map(); this.pending = new Map(); this.failed = new Set(); this.draws = 0; this.signature = ''; }
  async load(variants) {
    await Promise.all(variants.flatMap(v => Object.values(v.motions).flatMap(m => Object.values(m.tiers).flat())).map(file => {
      if (this.images.has(file)) return;
      if (!this.pending.has(file)) {
        const job = (async () => { const img = new Image(); img.src = this.base + file; await img.decode(); this.images.set(file, img); })();
        this.pending.set(file, job);
        job.catch(() => this.failed.add(file));
      }
      return this.pending.get(file);
    }));
  }
  paint(pets, catalog, width, height, dpr = devicePixelRatio || 1) {
    const signature = JSON.stringify([pets, width, height, dpr]);
    if (signature === this.signature) return;
    this.signature = signature;
    const canvas = this.canvas, ctx = this.context;
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (const pet of pets) {
      const variant = catalog.find(v => v.id === pet.coat), motion = variant.motions[pet.action];
      const desired = pet.height * dpr;
      const tiers = Object.keys(motion.tiers).map(Number).sort((a, b) => a - b);
      const tier = tiers.find(tier => tier >= desired) ?? tiers.at(-1);
      const image = this.images.get(motion.tiers[tier][pet.frame]);
      if (!image) continue;
      const transform = motion.presentation ?? { scale: 1, x: 0, y: 0 };
      // Across the original ten coats, solid-foot alpha ends at .781–.803 of
      // the normalized motion canvas. One stage offset grounds every motion;
      // per-frame images and upstream presentation transforms stay unchanged.
      ctx.save(); ctx.translate(pet.x + (pet.left ? pet.width : 0), pet.y + pet.height * 0.197); if (pet.left) ctx.scale(-1, 1);
      ctx.globalAlpha = pet.opacity ?? 1;
      ctx.drawImage(image, transform.x * pet.height, transform.y * pet.height, pet.width * transform.scale, pet.height * transform.scale); ctx.restore();
      if (pet.name) {
        ctx.font = '12px "Yu Gothic UI", sans-serif'; ctx.textAlign = 'center';
        const nameWidth = ctx.measureText(pet.name).width + 16;
        const labelX = Math.max(2 + nameWidth / 2, Math.min(width - 2 - nameWidth / 2, pet.x + pet.width / 2));
        const labelY = Math.max(22, pet.y + pet.height * 0.25 - 5);
        ctx.fillStyle = '#fffffff0'; ctx.beginPath(); ctx.roundRect(labelX - nameWidth / 2, labelY - 18, nameWidth, 24, 6); ctx.fill();
        ctx.fillStyle = '#283b32'; ctx.fillText(pet.name, labelX, labelY - 1);
      }
    }
    this.draws++;
  }
}
