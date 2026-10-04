"""Freeze stable PNG components independently of producer GIF edits."""
import hashlib,json,time,io
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent.parent
source=root/'assets/candidates/running-wheel/imagegen-stable-v2'
target=root/'.codex/qa'/f'wheel-candidate-{int(time.time()*1000)}'
sha=lambda b:hashlib.sha256(b).hexdigest()
batch=json.loads((source/'batch-manifest.json').read_text(encoding='utf-8'))
proof=json.loads((source/'saved-audit-report.json').read_text(encoding='utf-8'))
assert proof['status']=='pass' and not proof['failures'] and len(batch['coats'])==10
records=[]
for file in source.rglob('*'):
    if file.is_file() and file.suffix in ['.png','.json','.txt'] and file.name not in ['loop.png','ten-coats.apng']:
        relative=file.relative_to(source);data=file.read_bytes();destination=target/relative;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data)
        records.append({'path':relative.as_posix(),'sha256':sha(data)})
ground=None
references={}
for coat in batch['coats']:
    candidate=json.loads((target/coat['manifest']).read_text(encoding='utf-8'))
    assert candidate['status']=='stable_candidate' and candidate['frames']==4 and candidate['nonuniform_stretch'] is False
    assert sha((target/coat['source']).read_bytes())==coat['source_sha256']
    receipt=json.loads((source/coat['coat']/'generation.json').read_text(encoding='utf-8'))
    references[coat['coat']]=[]
    for index,relative in enumerate(receipt['inputs']):
        origin=(source/coat['coat']/relative).resolve();assert origin.is_relative_to(root/'assets/candidates/running-wheel')
        data=origin.read_bytes();local=f"ref-inputs/{coat['coat']}/{index:02}.png";destination=target/local;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data)
        record={'path':local,'sha256':sha(data),'sourceProjectPath':origin.relative_to(root).as_posix()};records.append(record);references[coat['coat']].append(record)
    for relative,expected in candidate['files_sha256'].items():assert sha((target/coat['coat']/relative).read_bytes())==expected
    for index in range(4):
        master=Image.open(target/coat['coat']/f'rgba/frame-{index:03}.png')
        assert master.size==(576,384) and master.mode=='RGBA'
        this_ground=master.getchannel('A').getbbox()[3]
        if ground is None:ground=this_ground
        assert this_ground==ground
        for tier in [32,48,64,96,144,192,384]:
            if tier<=96:data=(target/coat['coat']/f'{tier}/frame-{index:03}.png').read_bytes()
            else:
                buffer=io.BytesIO();master.resize((tier*3//2,tier),Image.Resampling.LANCZOS).save(buffer,format='PNG');data=buffer.getvalue()
            image=Image.open(io.BytesIO(data));alpha=image.getchannel('A');bbox=alpha.point(lambda value:255 if value>4 else 0).getbbox()
            assert image.mode=='RGBA' and image.size==(tier*3//2,tier) and alpha.getextrema()==(0,255)
            assert bbox[0]>0 and bbox[1]>0 and bbox[2]<image.width and bbox[3]<image.height
            relative=f"render/{coat['coat']}/{tier}-{index:03}.png";destination=target/relative;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data)
            records.append({'path':relative,'sha256':sha(data)})
for record in records:
    if not record['path'].startswith('render/'):assert sha((root/record['sourceProjectPath'] if 'sourceProjectPath' in record else source/record['path']).read_bytes())==record['sha256'],'Producer component changed'
component=sha(json.dumps(records,sort_keys=True,separators=(',',':')).encode())
(target/'snapshot.json').write_text(json.dumps({'sourceCandidate':source.relative_to(root).as_posix(),'componentSha256':component,'batch':batch,'files':records,'references':references,'ground':ground,'nativeTierEdgeNote':'32px top alpha <=4 and 48px bottom alpha <=1 are unchanged Lanczos fringe. Solid alpha has full margin; at actual displayScale1.6 the renderer selects 64px or larger source tiers, which have empty edges.'},ensure_ascii=False,indent=2),encoding='utf-8')
(root/'.codex/qa/wheel-v2-path.txt').write_text(str(target),encoding='utf-8')
print(target)
