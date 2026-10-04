"""Promote the reviewed immutable batch; map producer rear to runtime rearing."""
import hashlib
import io
import json
import sys
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parent.parent;directory=Path(sys.argv[1]).resolve()
assert directory.is_relative_to(root/'.codex/qa')
snapshot=json.loads((directory/'snapshot.json').read_text(encoding='utf-8'))
review=json.loads((directory/'render-report.json').read_text(encoding='utf-8'))
assert review['passed'] and review['sourceManifestSha256']==snapshot['sourceManifestSha256']
sha=lambda data:hashlib.sha256(data).hexdigest()
for entry in snapshot['files']:assert sha((directory/entry['path']).read_bytes())==entry['sha256'],entry['path']
manifest=snapshot['manifest'];source=directory/'source/rearing-ten-colors'
path=root/'app/motions/manifest.json';pack=json.loads(path.read_text(encoding='utf-8'))
assert not any(m['action']=='rearing' for m in pack['motions']),'Batch already adopted'
reference=root/'assets/candidates/popcorn-jump/reference/idle-gray-input-padded-v2.png'
pack.setdefault('productionSources',{})['rearing']={
    'candidateDirectory':snapshot['sourceCandidate'],'candidateManifestSha256':snapshot['sourceManifestSha256'],
    'sourceAction':'rear','runtimeAction':'rearing','model':'Google Flow / Veo 3.1 Fast; built-in image_gen model not exposed by tool',
    'flowPrompt':snapshot['flowPrompt'],'flowReference':{'path':reference.relative_to(root).as_posix(),'sha256':sha(reference.read_bytes())},
    'flowReferenceUsage':'same padded image at start/end; 720p/24fps/8s source',
    'flowSource':json.loads((directory/'source/v3/candidate-manifest.json').read_text(encoding='utf-8')),
    'snapshot':directory.relative_to(root).as_posix(),'sourceFiles':snapshot['files'],
    'generation':manifest['generation'],'processing':manifest['processing'],'producerAudit':snapshot['finalAudit'],
    'edgeResiduals':snapshot['edgeResiduals'],'knownSourceLimits':manifest['known_source_limits']
}
for coat in manifest['coats']:
    tiers={str(t):[] for t in [32,48,64,96,144,192]}
    for frame in coat['frames']:
        master=Image.open(source/frame['master']);assert master.size==(768,512) and master.mode=='RGBA'
        for tier in map(int,tiers):
            if tier<=96:
                entry=next(e for e in frame['files'] if Path(e['path']).name.startswith(str(tier)+'-'))
                data=(source/entry['path']).read_bytes();assert sha(data)==entry['sha256']
            else:
                image=master.resize((tier*3//2,tier),Image.Resampling.LANCZOS);buffer=io.BytesIO();image.save(buffer,format='PNG');data=buffer.getvalue()
            image=Image.open(io.BytesIO(data));assert image.mode=='RGBA' and image.size==(tier*3//2,tier)
            assert image.getchannel('A').getextrema()==(0,255)
            relative=f'rearing/{coat["id"]}/{tier}-{frame["frame"]:03}.png'
            destination=root/'app/motions'/relative;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data)
            tiers[str(tier)].append(relative);pack['files'].append({'path':relative,'sha256':sha(data),'sourceFrame':frame['source_frame']})
    pack['motions'].append({'action':'rearing','label':'立ち上がり','coat':coat['id'],'singlePlay':True,
        'durations':manifest['durations_ms'],'tiers':tiers,'presentation':{'scale':1,'x':0,'y':0},'provenance':{
            'sourceSha256':manifest['source_video']['sha256'],'candidateManifestSha256':snapshot['sourceManifestSha256'],
            'productionSource':'rearing','sourceFrames':manifest['source_video']['selected_frames'],'frameProvenance':coat['frames'],
            'adoptedOn':'2026-10-04','review':'docs/motions/INTEGRATION-QA.md','reviewSnapshot':directory.relative_to(root).as_posix(),
            'timing':'32 selected frames, original 4042ms retained, no interpolation, no added fade or pause',
            'adoptionNotes':'User accepted this motion as rearing. All ten coats preserve the same original pose alpha and timing. Native four tiers byte-preserved; 144/192 uniformly downsampled from RGBA masters. Visible ears, paws and tail retain canvas clearance; native downsampling may leave alpha <=3/255 ringing at top edge.'
        }})
path.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Adopted ten rearing coats: 32 frames/4042ms, 1920 PNGs; source manifest '+snapshot['sourceManifestSha256'])
