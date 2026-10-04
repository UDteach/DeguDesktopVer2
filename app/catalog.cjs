const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function verifyCatalog(data, readFile) {
  if (data.schema !== 2 || !data.variants?.length || !data.files?.length) throw new Error('Invalid animal catalog');
  const ids = new Set(), files = new Map();
  for (const file of data.files) {
    if (!/^[a-z0-9_-]+\/(walk|idle)\/(64|96)-\d{3,}\.png$/.test(file.path) || files.has(file.path)) throw new Error('Invalid or duplicate image path');
    if (hash(readFile(file.path)) !== file.sha256) throw new Error(`Image changed: ${file.path}`);
    files.set(file.path, file);
  }
  for (const animal of data.variants) {
    if (!/^[a-z0-9_-]+$/.test(animal.id) || ids.has(animal.id)) throw new Error('Invalid or duplicate animal');
    ids.add(animal.id);
    for (const action of ['walk', 'idle']) {
      const motion = animal.motions?.[action];
      if (!motion?.durations?.length || motion.durations.some(d => !Number.isFinite(d) || d <= 0)) throw new Error('Invalid frame duration');
      if (motion.presentation && (!Number.isFinite(motion.presentation.scale) || motion.presentation.scale < .5 || motion.presentation.scale > 1.5 || !Number.isFinite(motion.presentation.x) || !Number.isFinite(motion.presentation.y))) throw new Error('Invalid presentation transform');
      for (const tier of [64, 96]) {
        const frames = motion.tiers?.[tier];
        if (frames?.length !== motion.durations.length || frames.some(p => !files.has(p) || !p.startsWith(animal.id + '/'))) throw new Error('Missing or cross-animal frame');
        const staticIdle = action === 'idle' && animal.idleFallback === true;
        if (staticIdle ? frames.length !== 1 || frames[0] !== animal.motions.walk.tiers[tier][0]
          : frames.some(p => !p.startsWith(`${animal.id}/${action}/${tier}-`))) throw new Error('Wrong action or tier mapping');
      }
    }
    const used = new Set(Object.values(animal.motions).flatMap(m => Object.values(m.tiers).flat()));
    if (animal.files.length !== used.size || animal.files.some(f => !used.has(f.path) || files.get(f.path)?.sha256 !== f.sha256)) throw new Error('Invalid animal file index');
  }
  if (!ids.has(data.defaultId)) throw new Error('Missing default animal');
  return data;
}
function loadCatalog(directory) {
  return verifyCatalog(JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')), p => fs.readFileSync(path.join(directory, p)));
}
function resolveAnimalId(catalog, saved) { return catalog.variants.some(v => v.id === saved) ? saved : catalog.defaultId; }
function resolveAnimalIds(catalog, saved = {}) {
  const old = resolveAnimalId(catalog, saved.animalId);
  return Array.from({ length: 10 }, (_, i) => resolveAnimalId(catalog, Array.isArray(saved.animalIds) ? (saved.animalIds[i] ?? old) : old));
}
function animalMenu(catalog, selectedId, select, prefix = 'animal') {
  const groups = new Map();
  for (const animal of catalog.variants) {
    if (!groups.has(animal.species)) groups.set(animal.species, { label: animal.speciesLabel, submenu: [] });
    groups.get(animal.species).submenu.push({ id: `${prefix}-${animal.id}`, label: animal.coatLabel + (animal.idleFallback ? '（待機は静止画）' : ''), type: 'radio', checked: animal.id === selectedId, click: () => select(animal.id) });
  }
  return [...groups.values()];
}
module.exports = { loadCatalog, verifyCatalog, resolveAnimalId, resolveAnimalIds, animalMenu };
