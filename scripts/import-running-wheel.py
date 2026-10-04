"""Copy reviewed ImageGen cycles; retain producers' source sheets and hashes."""
import hashlib
import json
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent.parent
source=root/'assets/candidates/running-wheel/imagegen-four-frame'
destination=root/'app/motions'
batch=json.loads((source/'batch-manifest.json').read_text(encoding='utf-8'))
pack_file=destination/'manifest.json'
pack=json.loads(pack_file.read_text(encoding='utf-8'))
sha=lambda data:hashlib.sha256(data).hexdigest()
assert len(batch['coats'])==10 and batch['durations_ms']==[167,125,166,125]
assert not any(m['action']=='running-wheel' for m in pack['motions']), 'Wheel already imported'
tiers=[32,48,64,96,144,192,384]
for coat in batch['coats']:
    directory=source/coat['coat']
    candidate=json.loads((source/coat['candidate_manifest']).read_text(encoding='utf-8'))
    assert sha((source/coat['source']).read_bytes())==coat['source_sha256']
    assert candidate['nonuniform_stretch'] is False and candidate['frames']==4
    frames={str(tier):[] for tier in tiers}
    for index in range(4):
        master_file=directory/f'rgba/frame-{index:03}.png'
        assert sha(master_file.read_bytes())==candidate['files_sha256'][f'rgba/frame-{index:03}.png']
        master=Image.open(master_file)
        assert master.mode=='RGBA' and master.size==(576,384)
        assert master.getchannel('A').getextrema()==(0,255)
        for tier in tiers:
            if tier<=96:
                file=directory/f'{tier}/frame-{index:03}.png'
                data=file.read_bytes()
                assert sha(data)==candidate['files_sha256'][f'{tier}/frame-{index:03}.png']
                image=Image.open(file)
            else:
                image=master.resize((tier*3//2,tier),Image.Resampling.LANCZOS)
                import io
                buffer=io.BytesIO(); image.save(buffer,format='PNG'); data=buffer.getvalue()
            assert image.size==(tier*3//2,tier) and image.mode=='RGBA'
            assert all(image.getchannel('A').getpixel(p)==0 for p in [(0,0),(image.width-1,0),(0,image.height-1),(image.width-1,image.height-1)])
            relative=f"running-wheel/degu-{coat['coat']}/{tier}-{index:03}.png"
            target=destination/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
            frames[str(tier)].append(relative)
            pack['files'].append({'path':relative,'sha256':sha(data),'sourceFrame':index})
    pack['motions'].append({
        'action':'running-wheel','label':'回し車','coat':'degu-'+coat['coat'],
        'singlePlay':True,'cycles':6,'transitionMs':300,'displayScale':1.6,
        'durations':batch['durations_ms'],'tiers':frames,
        'presentation':{'scale':1,'x':0,'y':.803-365/384},
        'provenance':{
            'provider':'built-in image_gen','model':'not exposed by tool','adoptedOn':'2026-10-04',
            'sourceSha256':coat['source_sha256'],'sourceSheet':f"assets/candidates/running-wheel/imagegen-four-frame/{coat['source']}",
            'candidateManifestSha256':sha((source/coat['candidate_manifest']).read_bytes()),
            'candidateDirectory':f"assets/candidates/running-wheel/imagegen-four-frame/{coat['coat']}",
            'prompt':(source/coat['prompt']).read_text(encoding='utf-8'),
            'generation':candidate['generation'],'cleanup':candidate['alpha_cleanup'],
            'phaseTransforms':candidate['phase_transforms'],'review':'docs/motions/INTEGRATION-QA.md',
            'userBlurAllowed':True,
            'adoptionNotes':'User-authorized four-cell ImageGen sheets. 583ms staged cycle, six repeats, 300ms appearance/disappearance; actual mounting/dismounting are not generated. Uniform 1.6x complete canvas keeps the animal footprint near walking size; higher-resolution tiers prevent small-canvas enlargement.'
        }
    })
pack_file.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Promoted 10 wheel coats, 4 phases, 280 PNGs including native higher-resolution tiers.')
