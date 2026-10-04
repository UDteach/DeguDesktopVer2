import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const root = path.resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url);
for (const folder of ['app', 'scripts']) for (const file of fs.readdirSync(path.join(root, folder))) {
  if (!/\.(cjs|mjs)$/.test(file)) continue;
  const result = spawnSync(process.execPath, ['--check', path.join(root, folder, file)], { encoding: 'utf8' });
  if (result.status) { console.error(result.stderr); process.exit(result.status); }
}
const catalog = require('../app/catalog.cjs').loadCatalog(path.join(root, 'app/media'));
for (const file of catalog.files) {
  const png = fs.readFileSync(path.join(root, 'app/media', file.path));
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Not PNG: ${file.path}`);
  const tier = Number(file.path.match(/\/(64|96)-/)[1]);
  if (png.readUInt32BE(16) !== tier * 1.5 || png.readUInt32BE(20) !== tier || ![4, 6].includes(png[25])) throw new Error(`Wrong canvas or alpha: ${file.path}`);
}
console.log(`Original hashes, alpha and canvas verified: ${catalog.variants.length} coats, ${catalog.files.length} PNGs.`);
const additional = JSON.parse(fs.readFileSync(path.join(root, 'app/motions/manifest.json'), 'utf8'));
require('../app/extra-motions.cjs').verifyMotionPack(additional, file => fs.readFileSync(path.join(root, 'app/motions', file)), catalog);
console.log(`Additional motion hashes and canvas verified: ${additional.motions.length} motions, ${additional.files.length} PNGs.`);
const tests = spawnSync(process.execPath, ['--test', 'test/*.test.mjs'], { cwd: root, encoding: 'utf8' });
process.stdout.write(tests.stdout); process.stderr.write(tests.stderr); process.exit(tests.status ?? 1);
