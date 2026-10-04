import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const root = path.resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url);
const catalog = require('../app/extra-motions.cjs').loadAdditionalMotions(require('../app/catalog.cjs').loadCatalog(path.join(root, 'app/media')), path.join(root, 'app/motions'));
const destination = path.join(root, 'site/assets/generated');
fs.mkdirSync(destination, { recursive: true });
const variants = catalog.variants.map(({ id, coatLabel, motions }) => ({ id, coatLabel,
  motions: Object.fromEntries(Object.entries(motions).map(([action, m]) => [action, {
    durations: m.durations, presentation: m.presentation, singlePlay: m.singlePlay,
    displayScale: m.displayScale, cycles: m.cycles, transitionMs: m.transitionMs,
    tiers: { 96: m.tiers[96].map(file => {
      const source = path.join(root, 'app/media', file);
      const relative = file.startsWith('../motions/') ? file.slice(3) : `media/${file}`;
      const target = path.join(destination, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target);
      return relative;
    }) }
  }])) }));
fs.writeFileSync(path.join(destination, 'catalog.json'), JSON.stringify(variants));
for (const module of ['painter.mjs', 'motion.mjs']) fs.copyFileSync(path.join(root, 'app', module), path.join(destination, module));
fs.copyFileSync(path.join(root, 'app/media/degu-agouti/idle/96-000.png'), path.join(root, 'site/assets/degu.png'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.writeFileSync(path.join(destination, 'build.json'), JSON.stringify({ version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version,
  originalManifest: sha(path.join(root, 'app/media/manifest.json')), additionalManifest: sha(path.join(root, 'app/motions/manifest.json')) }, null, 2));
console.log(`Site assets copied from verified app pack: ${variants.length} coats; native 96px tier only.`);
