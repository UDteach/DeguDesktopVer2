import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const source = path.resolve(process.argv[2] ?? path.join(root, '.codex/upstream/MofuMouse'));
const base = path.join(source, 'electron-prototype/app/media');
const original = fs.readFileSync(path.join(base, 'manifest.json'));
const data = JSON.parse(original);
const variants = data.variants.filter(v => v.species === 'degu');
if (variants.length !== 10) throw new Error('Expected the ten reviewed MofuMouse degu coats');
const paths = new Set(variants.flatMap(v => v.files.map(f => f.path)));
const files = data.files.filter(f => paths.has(f.path));
const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const manifest = { ...data, variants, files, upstream: { repository: 'https://github.com/UDteach/MofuMouse', commit, path: 'electron-prototype/app/media/manifest.json', manifestSha256: hash(original), importedAt: new Date().toISOString(), transformations: 'None; original PNG bytes, ordering, timings and presentation transforms preserved' } };
for (const file of files) {
  const bytes = fs.readFileSync(path.join(base, file.path));
  if (hash(bytes) !== file.sha256) throw new Error(`Upstream hash mismatch: ${file.path}`);
  const dest = path.join(root, 'app/media', file.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, bytes);
}
fs.writeFileSync(path.join(root, 'app/media/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.copyFileSync(path.join(source, 'electron-prototype/app/catalog.cjs'), path.join(root, 'app/catalog.cjs'));
console.log(JSON.stringify({ commit, variants: variants.length, images: files.length, originalPngs: true }));
