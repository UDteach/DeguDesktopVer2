import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), {extractFile,listPackage}=require('@electron/asar');
const root=path.resolve(import.meta.dirname,'..');
const supplied=process.argv.find(a=>a.startsWith('--archive='))?.slice(10);
const archive=supplied?path.resolve(supplied):path.join(root,'release/win-unpacked/resources/app.asar');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>extractFile(archive,p.replaceAll('/',path.sep));
if(hash(fs.readFileSync(path.join(root,'app/media/manifest.json')))!==hash(read('app/media/manifest.json'))) throw new Error('Packaged original manifest differs');
const catalog=JSON.parse(read('app/media/manifest.json'));
require('../app/catalog.cjs').verifyCatalog(catalog,p=>read('app/media/'+p));
const added=JSON.parse(read('app/motions/manifest.json'));
require('../app/extra-motions.cjs').verifyMotionPack(added,p=>read('app/motions/'+p),catalog);
if(hash(fs.readFileSync(path.join(root,'app/motions/manifest.json')))!==hash(read('app/motions/manifest.json'))) throw new Error('Packaged additional manifest differs');
for(const file of added.files) if(hash(fs.readFileSync(path.join(root,'app/motions',file.path)))!==hash(read('app/motions/'+file.path))) throw new Error(`Packaged additional frame differs: ${file.path}`);
for(const file of fs.readdirSync(path.join(root,'app')).filter(f=>/\.(cjs|mjs|html|css|ico|icns|png)$/.test(f))) {
  if(hash(fs.readFileSync(path.join(root,'app',file)))!==hash(read('app/'+file))) throw new Error(`Packaged source differs: ${file}`);
}
const entries=listPackage(archive);
if(entries.some(p=>/node_modules|\.codex|test\//.test(p))) throw new Error('Development files in app.asar');
const pkg=JSON.parse(read('package.json')); if(pkg.version!==JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version) throw new Error('Wrong package version');
console.log(`Packaged source, ${catalog.files.length} original and ${added.files.length} additional PNG hashes match (${archive}).`);
