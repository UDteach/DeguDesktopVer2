"""Snapshot a finished coat independently of the producer's in-progress other coats."""
import hashlib
import json
import time
import sys
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parent.parent
candidate=sys.argv[2] if len(sys.argv)>2 else 'imagegen-v1'
assert candidate in ['imagegen-v1','imagegen-v2']
source=root/'assets/candidates/face-grooming'/candidate
manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
if candidate=='imagegen-v2':
    for report in ['verification.json','independent-size-verification.json','ui-verification.json']:
        proof=json.loads((source/report).read_text(encoding='utf-8'))
        assert proof.get('status')=='passed' or proof.get('passed') is True,(report,proof.get('status'))
coat_id=sys.argv[1] if len(sys.argv)>1 else 'degu-agouti'
variant=next(v for v in manifest['variants'] if v['id']==coat_id)
assert variant['complete'] and variant['available_frames']==list(range(96))
sha=lambda data:hashlib.sha256(data).hexdigest()
canonical=lambda data:json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
variant_hash=sha(canonical(variant))
directory=root/'.codex/qa'/f'face-candidate-{int(time.time()*1000)}'
files=[];sources=[]
def snapshot(relative,expected=None):
    origin=(source/relative).resolve()
    assert origin.is_relative_to(root/'assets/candidates/face-grooming')
    data=origin.read_bytes()
    if expected:assert sha(data)==expected,relative
    local=relative if not relative.startswith('../') else 'original-sources/'+Path(relative).relative_to('../imagegen-v1').as_posix()
    target=directory/local;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    return data
for batch in variant['batches']:
    metric=variant['frame_metrics'][batch['frames'][0]]
    data=snapshot(batch['source'],metric['source_sha256'])
    metadata=str(Path(batch['source']).with_suffix('.json')).replace('\\','/')
    receipt=snapshot(metadata)
    local=batch['source'] if not batch['source'].startswith('../') else 'original-sources/'+Path(batch['source']).relative_to('../imagegen-v1').as_posix()
    local_receipt=metadata if not metadata.startswith('../') else 'original-sources/'+Path(metadata).relative_to('../imagegen-v1').as_posix()
    sources.append({'path':local,'originalPath':batch['source'],'sha256':sha(data),'receipt':local_receipt,'receiptSha256':sha(receipt)})
for metric in variant['frame_metrics']:
    index=metric['index']
    full=f'{coat_id}/full/{index:03}.png'
    snapshot(full,metric['full_sha256'])
    for tier in [32,48,64,96]:
        record=metric['tiers'][str(tier)]
        data=snapshot(record['path'],record['sha256'])
        image=Image.open(directory/record['path'])
        assert image.mode=='RGBA' and image.size==(tier*3//2,tier)
        alpha=image.getchannel('A');assert alpha.getextrema()==(0,255)
        assert max(alpha.crop((0,0,image.width,1)).getextrema()[1],alpha.crop((0,image.height-1,image.width,image.height)).getextrema()[1],alpha.crop((0,0,1,image.height)).getextrema()[1],alpha.crop((image.width-1,0,image.width,image.height)).getextrema()[1])==0
        files.append({'path':record['path'],'sha256':sha(data)})
# A global manifest may advance while another coat is made; this component must not.
latest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
assert sha(canonical(next(v for v in latest['variants'] if v['id']==coat_id)))==variant_hash,'Coat changed during snapshot'
for entry in sources+files:assert sha((source/entry.get('originalPath',entry['path'])).read_bytes())==entry['sha256'],'Source changed during snapshot'
report={'schema':1,'sourceCandidate':source.relative_to(root).as_posix(),'sourceGlobalStatus':manifest['status'],'finishedComponent':True,'componentSha256':variant_hash,'durations':manifest['durationsMs'],'durationMs':manifest['durationMs'],'processing':manifest['processing'],'variant':variant,'sources':sources,'files':files}
(directory/'snapshot.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(str(directory))
