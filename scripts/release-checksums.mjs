import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const directory=path.resolve(process.argv[2]??'release');
const version=JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'../package.json'))).version;
const files=fs.readdirSync(directory).filter(f=>f.startsWith(`DeguDesktopVer2-${version}-`)&&/\.(exe|zip|dmg)$/.test(f)).sort();
if(!files.length)throw Error('No release artifacts');
const lines=files.map(file=>`${crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,file))).digest('hex')}  ${file}`);
fs.writeFileSync(path.join(directory,'SHA256SUMS.txt'),lines.join('\n')+'\n');console.log(lines.join('\n'));
