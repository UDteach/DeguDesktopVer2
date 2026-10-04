"""Promote the reviewed fixed-prop revision. import-running-wheel.py is the historical v1 importer."""
import hashlib,json,os
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parent.parent
snapshot_dir=Path((root/'.codex/qa/wheel-v2-path.txt').read_text(encoding='utf-8')).resolve()
assert snapshot_dir.is_relative_to(root/'.codex/qa')
snapshot=json.loads((snapshot_dir/'snapshot.json').read_text(encoding='utf-8'))
review=json.loads((snapshot_dir/'render-report.json').read_text(encoding='utf-8'))
assert review['passed'] and review['componentSha256']==snapshot['componentSha256']
sha=lambda b:hashlib.sha256(b).hexdigest()
for record in snapshot['files']:assert sha((snapshot_dir/record['path']).read_bytes())==record['sha256']
pack_file=root/'app/motions/manifest.json';pack=json.loads(pack_file.read_text(encoding='utf-8'))
previous=[m for m in pack['motions'] if m['action']=='running-wheel']
order={(m['action'],m['coat']):index for index,m in enumerate(pack['motions'])}
assert len(previous)==10
archive=root/'.codex/qa'/('wheel-replaced-'+sha(json.dumps(previous,sort_keys=True).encode()))
archive.mkdir(parents=True,exist_ok=True);(archive/'motions.json').write_text(json.dumps(previous,ensure_ascii=False,indent=2),encoding='utf-8')
for record in pack['files']:
    if record['path'].startswith('running-wheel/'):
        target=archive/record['path'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((root/'app/motions'/record['path']).read_bytes())
pack['motions']=[m for m in pack['motions'] if m['action']!='running-wheel'];pack['files']=[f for f in pack['files'] if not f['path'].startswith('running-wheel/')]
batch=snapshot['batch']
for coat in batch['coats']:
    candidate=json.loads((snapshot_dir/coat['manifest']).read_text(encoding='utf-8'))
    receipt=json.loads((snapshot_dir/coat['coat']/'generation.json').read_text(encoding='utf-8'))
    frames={str(t):[] for t in [32,48,64,96,144,192,384]}
    for tier in map(int,frames):
        for index in range(4):
            source=snapshot_dir/f"render/{coat['coat']}/{tier}-{index:03}.png"
            relative=f"running-wheel/degu-{coat['coat']}/{tier}-{index:03}.png"
            target=root/'app/motions'/relative;target.write_bytes(source.read_bytes());frames[str(tier)].append(relative)
            pack['files'].append({'path':relative,'sha256':sha(source.read_bytes()),'sourceFrame':index})
    pack['motions'].append({'action':'running-wheel','label':'回し車','coat':'degu-'+coat['coat'],'singlePlay':True,'cycles':6,'transitionMs':300,'displayScale':1.6,'durations':batch['durations_ms'],'tiers':frames,
      'presentation':{'scale':1,'x':0,'y':.803-snapshot['ground']/384},'provenance':{
        'provider':'built-in image_gen','model':'not exposed by tool','adoptedOn':datetime.now(timezone.utc).date().isoformat(),
        'sourceSha256':coat['source_sha256'],'candidateDirectory':snapshot['sourceCandidate']+'/'+coat['coat'],
        'sourceSheet':snapshot['sourceCandidate']+'/'+coat['source'],'candidateManifestSha256':sha((snapshot_dir/coat['manifest']).read_bytes()),
        'reviewedSnapshotSha256':snapshot['componentSha256'],'reviewSnapshot':snapshot_dir.relative_to(root).as_posix(),'review':'docs/motions/INTEGRATION-QA.md',
        'generation':receipt,'references':snapshot['references'][coat['coat']],'prompt':(snapshot_dir/coat['coat']/receipt['prompt_file']).read_text(encoding='utf-8'),
        'fixedWheel':{'sha256':sha((snapshot_dir/'wheel-fixed.png').read_bytes()),'sourceSha256':sha((snapshot_dir/'wheel-source-v1.png').read_bytes()),'generation':json.loads((snapshot_dir/'wheel-generation.json').read_text(encoding='utf-8')),'prompt':(snapshot_dir/'prompt-wheel.txt').read_text(encoding='utf-8')},
        'replacesSourceSha256':next(m['provenance']['sourceSha256'] for m in previous if m['coat']=='degu-'+coat['coat']),
        'processing':candidate['transform'],'fixedBodyPhase0':True,'frameMetrics':candidate['files_sha256'],'nativeTierEdgeNote':snapshot['nativeTierEdgeNote'],'userBlurAllowed':True,
        'adoptionNotes':'One wheel/stand and phase0 torso/head/tail are fixed across all four phases and all ten coats; only lower legs move. No nonuniform scaling, morph, crossfade or new anatomy edits. Shared transform and ground from saved alpha bounding box. Native tiers copied unchanged; higher tiers uniformly downsampled from RGBA master. 583ms cycle x6 with 300ms event fades; actual mount/dismount frames unavailable. Artistic timing.'
      }})
pack['motions'].sort(key=lambda m:order[(m['action'],m['coat'])])
temporary=pack_file.with_suffix('.tmp');temporary.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');os.replace(temporary,pack_file)
print('Adopted stable wheel: ten coats, fixed prop/body, four running phases, 280 PNGs.')
