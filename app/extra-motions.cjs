const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ACTIONS = ['face-grooming', 'popcorn-jump', 'leg-stretch', 'rearing', 'running-wheel'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function verifyMotionPack(pack, readFile, catalog) {
  if (pack.schema !== 1 || !Array.isArray(pack.motions) || !Array.isArray(pack.files)) throw new Error('Invalid additional motion pack');
  const files = new Map(), pairs = new Set(), used = new Set();
  for (const file of pack.files) {
    if (!/^[a-z-]+\/degu-[a-z_]+\/(32|48|64|96|144|192|384)-\d{3,}\.png$/.test(file.path) || files.has(file.path)) throw new Error('Invalid additional image path');
    const bytes = readFile(file.path), tier = Number(file.path.match(/\/(32|48|64|96|144|192|384)-/)[1]);
    if (hash(bytes) !== file.sha256 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== tier * 1.5 || bytes.readUInt32BE(20) !== tier || bytes[25] !== 6) throw new Error(`Additional image failed verification: ${file.path}`);
    files.set(file.path, file);
  }
  for (const motion of pack.motions) {
    const pair = `${motion.coat}/${motion.action}`;
    if (!ACTIONS.includes(motion.action) || !catalog.variants.some(v => v.id === motion.coat) || pairs.has(pair) || motion.singlePlay !== true) throw new Error('Invalid additional action');
    pairs.add(pair);
    if (!motion.durations?.length || motion.durations.some(d => !Number.isFinite(d) || d <= 0) || !motion.provenance?.sourceSha256 || !motion.provenance?.review) throw new Error('Missing additional motion timing or provenance');
    const p = motion.presentation;
    if (!p || !Number.isFinite(p.scale) || p.scale < .5 || p.scale > 1.5 || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('Invalid additional presentation');
    if (!Number.isFinite(motion.displayScale ?? 1) || (motion.displayScale ?? 1) < 1 || (motion.displayScale ?? 1) > 2 || !Number.isInteger(motion.cycles ?? 1) || (motion.cycles ?? 1) < 1 || (motion.cycles ?? 1) > 20 || !Number.isFinite(motion.transitionMs ?? 0) || (motion.transitionMs ?? 0) < 0 || (motion.transitionMs ?? 0) > 1000) throw new Error('Invalid additional playback');
    if (![32,48,64,96].every(tier=>Array.isArray(motion.tiers?.[tier]))) throw new Error('Missing standard additional tier');
    for (const tier of Object.keys(motion.tiers)) {
      if (![32,48,64,96,144,192,384].includes(Number(tier))) throw new Error('Unknown additional tier');
      const frames = motion.tiers?.[tier];
      if (frames?.length !== motion.durations.length || frames.some(file => !files.has(file) || !file.startsWith(`${motion.action}/${motion.coat}/${tier}-`))) throw new Error('Missing or cross-coat additional frame');
      frames.forEach(file => used.add(file));
    }
  }
  if (used.size !== files.size) throw new Error('Unreferenced additional image');
  return pack;
}

function mergeMotions(catalog, pack) {
  return { ...catalog, variants: catalog.variants.map(variant => {
    const added = pack.motions.filter(m => m.coat === variant.id);
    if (!added.length) return variant;
    return { ...variant, motions: { ...variant.motions, ...Object.fromEntries(added.map(m => [m.action, {
      durations: m.durations, presentation: m.presentation, singlePlay: true, displayScale: m.displayScale, cycles: m.cycles, transitionMs: m.transitionMs,
      tiers: Object.fromEntries(Object.entries(m.tiers).map(([tier, files]) => [tier, files.map(file => '../motions/' + file)]))
    }])) } };
  }) };
}

function loadAdditionalMotions(catalog, directory) {
  const file = path.join(directory, 'manifest.json');
  if (!fs.existsSync(file)) return catalog;
  const pack = verifyMotionPack(JSON.parse(fs.readFileSync(file, 'utf8')), file => fs.readFileSync(path.join(directory, file)), catalog);
  return mergeMotions(catalog, pack);
}
module.exports = { verifyMotionPack, mergeMotions, loadAdditionalMotions };
