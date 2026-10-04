import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'), site=path.join(root,'site');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const metadata=JSON.parse(fs.readFileSync(path.join(site,'assets/generated/build.json')));
assert.equal(metadata.originalManifest,sha(path.join(root,'app/media/manifest.json')));
assert.equal(metadata.additionalManifest,sha(path.join(root,'app/motions/manifest.json')));
const catalog=JSON.parse(fs.readFileSync(path.join(site,'assets/generated/catalog.json')));
assert.equal(catalog.length,10);
let files=0;
for(const variant of catalog)for(const motion of Object.values(variant.motions)){
  assert.equal(motion.tiers[96].length,motion.durations.length);
  for(const relative of motion.tiers[96]){
    assert.match(relative,/^(media|motions)\/[a-z0-9_/-]+\.png$/);
    assert.equal(sha(path.join(site,'assets/generated',relative)),sha(path.join(root,'app',relative)));files++;
  }
}
for(const html of ['index.html','download.html']){
  const content=fs.readFileSync(path.join(site,html),'utf8');
  assert.match(content,/<html lang="ja">/);
  for(const match of content.matchAll(/(?:href|src)="([^"#]+)"/g)){
    if(/^https?:/.test(match[1]))continue;
    assert.ok(fs.existsSync(path.join(site,match[1].split('#')[0])),`${html}: missing ${match[1]}`);
  }
}
console.log(`Site references and ${files} frame copies match the verified runtime pack.`);
