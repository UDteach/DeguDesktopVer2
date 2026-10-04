"""Promote a reviewed, immutable finished-coat snapshot, preserving its receipts."""
import hashlib
import io
import json
import sys
import os
from datetime import datetime,timezone
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parent.parent
snapshot_dir=Path(sys.argv[1]).resolve()
assert snapshot_dir.is_relative_to(root/'.codex/qa')
snapshot=json.loads((snapshot_dir/'snapshot.json').read_text(encoding='utf-8'))
review=json.loads((snapshot_dir/'render-report.json').read_text(encoding='utf-8'))
assert review['passed'] and review['componentSha256']==snapshot['componentSha256']
variant=snapshot['variant'];coat=variant['id']
assert snapshot['finishedComponent'] and variant['complete'] and variant['available_frames']==list(range(96))
pack_path=root/'app/motions/manifest.json';pack=json.loads(pack_path.read_text(encoding='utf-8'))
previous=next((m for m in pack['motions'] if m['action']=='face-grooming' and m['coat']==coat),None)
previous_index=pack['motions'].index(previous) if previous else None
if previous:
    assert '--replace' in sys.argv,'Coat already adopted; explicit reviewed replacement required'
    assert previous['provenance']['sourceSha256']!=snapshot['componentSha256'],'Version already adopted'
    archive=root/'.codex/qa'/('grooming-replaced-'+previous['provenance']['sourceSha256'])
    archive.mkdir(parents=True,exist_ok=True)
    (archive/'motion.json').write_text(json.dumps(previous,ensure_ascii=False,indent=2),encoding='utf-8')
    for record in pack['files']:
        if record['path'].startswith('face-grooming/'+coat+'/'):
            old=root/'app/motions'/record['path'];target=archive/record['path'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(old.read_bytes())
    pack['motions']=[m for m in pack['motions'] if not(m['action']=='face-grooming' and m['coat']==coat)]
    pack['files']=[f for f in pack['files'] if not f['path'].startswith('face-grooming/'+coat+'/')]
sha=lambda data:hashlib.sha256(data).hexdigest()
sources=[]
for source in snapshot['sources']:
    assert sha((snapshot_dir/source['path']).read_bytes())==source['sha256']
    receipt=(snapshot_dir/source['receipt']).read_bytes();assert sha(receipt)==source['receiptSha256']
    metadata=json.loads(receipt)
    references=[{'path':str(Path(p).relative_to(root)).replace('\\','/'),'sha256':sha(Path(p).read_bytes())} for p in metadata['referencePaths']]
    sources.append({**source,'generationReceipt':metadata,'references':references})
tiers={str(t):[] for t in [32,48,64,96,144,192]}
for metric in variant['frame_metrics']:
    index=metric['index'];master_file=snapshot_dir/f'{coat}/full/{index:03}.png'
    assert sha(master_file.read_bytes())==metric['full_sha256']
    master=Image.open(master_file);assert master.mode=='RGBA' and master.size==(540,360)
    for tier in map(int,tiers):
        if tier<=96:
            source=metric['tiers'][str(tier)];data=(snapshot_dir/source['path']).read_bytes()
            assert sha(data)==source['sha256'];image=Image.open(io.BytesIO(data))
        else:
            image=master.resize((tier*3//2,tier),Image.Resampling.LANCZOS)
            buffer=io.BytesIO();image.save(buffer,format='PNG');data=buffer.getvalue()
        assert image.mode=='RGBA' and image.size==(tier*3//2,tier)
        assert image.getchannel('A').getextrema()==(0,255)
        assert all(image.getchannel('A').getpixel(p)==0 for p in [(0,0),(image.width-1,0),(0,image.height-1),(image.width-1,image.height-1)])
        relative=f'face-grooming/{coat}/{tier}-{index:03}.png'
        destination=root/'app/motions'/relative;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data)
        tiers[str(tier)].append(relative);pack['files'].append({'path':relative,'sha256':sha(data),'sourceFrame':index})
pack['motions'].append({'action':'face-grooming','label':'お顔くしくし','coat':coat,'singlePlay':True,'durations':snapshot['durations'],'tiers':tiers,'presentation':{'scale':1,'x':0,'y':0},'provenance':{
    'provider':'built-in image_gen','model':'not exposed by tool','adoptedOn':datetime.now(timezone.utc).date().isoformat(),
    'replacesSourceSha256':previous['provenance']['sourceSha256'] if previous else None,
    'sourceSha256':snapshot['componentSha256'],'sourceHashKind':'canonical completed coat manifest',
    'candidateDirectory':snapshot['sourceCandidate'],'sourceGlobalStatusAtSnapshot':snapshot['sourceGlobalStatus'],
    'finishedCoat':True,'sources':sources,'frameMetrics':variant['frame_metrics'],
    'processing':snapshot['processing'],'frameTiming':'24fps guide timing; 96 frames/4000ms, artistic timing',
    'review':'docs/motions/INTEGRATION-QA.md','reviewSnapshot':snapshot_dir.relative_to(root).as_posix(),
    'adoptionNotes':'Completed 96-frame coat component reviewed before adoption. Source sheets and receipts are immutable copies, all hashes checked before/after snapshot. Native four tiers retained; 144/192 tiers uniformly downsampled from the original normalized RGBA master. No added pause/fade or frame interpolation; stand, crouch, forepaws to mouth/cheek, lower paws, stand.'
}})
if previous_index is not None:pack['motions'].insert(previous_index,pack['motions'].pop())
temporary=pack_path.with_suffix('.tmp');temporary.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');os.replace(temporary,pack_path)
print(f'Adopted {coat}: 96 frames/4000ms, 576 PNGs, completed component {snapshot["componentSha256"]}.')
