import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
const dir=path.join(root,'.codex/qa',`distribution-payload-${process.platform}-${process.arch}-${Date.now()}`);fs.mkdirSync(dir,{recursive:true});
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),checks=[];
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
const verify=(base,reference,relative)=>{if(sha(path.join(base,relative))!==sha(path.join(reference,relative)))throw Error(`Distribution bytes differ: ${relative}`);checks.push(relative);};
if(process.platform==='win32'){
  const seven=await require('app-builder-lib/out/toolsets/7zip.js').getPath7za();
  const installer=path.join(dir,'installer'),zip=path.join(dir,'zip'),reference=path.join(root,'release/win-unpacked');
  for(const [type,destination] of [['exe',installer],['zip',zip]]){run(seven,['x',path.join(root,`release/DeguDesktopVer2-${pkg.version}-windows-x64.${type}`),'-o'+destination,'-y']);for(const file of ['resources/app.asar','DeguDesktopVer2.exe','LICENSE.electron.txt','LICENSES.chromium.html','はじめに.txt'])verify(destination,reference,file);}
  run(process.execPath,[path.join(root,'scripts/smoke-release.mjs'),'--executable='+path.join(zip,'DeguDesktopVer2.exe')]);
}else if(process.platform==='darwin'){
  const base=`DeguDesktopVer2-${pkg.version}-mac-${process.arch}`,reference=path.join(root,`release/${process.arch==='arm64'?'mac-arm64':'mac'}/DeguDesktopVer2.app`),zip=path.join(dir,'zip');
  run('ditto',['-x','-k',path.join(root,'release',base+'.zip'),zip]);
  for(const file of ['Contents/Resources/app.asar','Contents/MacOS/DeguDesktopVer2','Contents/Info.plist'])verify(path.join(zip,'DeguDesktopVer2.app'),reference,file);
  const mount=path.join(dir,'dmg');fs.mkdirSync(mount);let mounted=false;
  try{run('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,path.join(root,'release',base+'.dmg')]);mounted=true;for(const file of ['Contents/Resources/app.asar','Contents/MacOS/DeguDesktopVer2','Contents/Info.plist'])verify(path.join(mount,'DeguDesktopVer2.app'),reference,file);}
  finally{if(mounted)run('hdiutil',['detach',mount]);}
  run('codesign',['--verify','--deep','--strict',path.join(zip,'DeguDesktopVer2.app')]);
  run(process.execPath,[path.join(root,'scripts/smoke-release.mjs'),'--executable='+path.join(zip,'DeguDesktopVer2.app/Contents/MacOS/DeguDesktopVer2')]);
}else throw Error('Unsupported distribution host');
fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({passed:true,platform:process.platform,arch:process.arch,checks},null,2));console.log(`Installer/disk image and ZIP payloads match the tested package; extracted ZIP starts and preserves settings. ${dir}`);
