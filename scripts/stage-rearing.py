"""Copy a completed ten-coat production batch to an immutable review snapshot."""
import hashlib
import json
import time
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parent.parent
source=root/'assets/candidates/popcorn-jump/rearing-ten-colors'
sha=lambda data:hashlib.sha256(data).hexdigest()
manifest_bytes=(source/'manifest.json').read_bytes()
manifest=json.loads(manifest_bytes)
assert manifest['status']=='ready_for_parent_integration'
assert manifest['frame_count']==32 and manifest['coat_count']==10 and manifest['duration_ms']==4042
audit=json.loads((source/'final-audit.json').read_text(encoding='utf-8'))
assert audit['passed'] and audit['visual_review_confirmed'] and not audit['runtime_integration']
directory=root/'.codex/qa'/f'rearing-candidate-{int(time.time()*1000)}'
records={};edge_residuals=[]
def snapshot(relative,expected=None):
    original=(source/relative).resolve()
    assert original.is_relative_to(root/'assets/candidates/popcorn-jump')
    data=original.read_bytes(); digest=sha(data)
    if expected: assert digest==expected,str(original)
    # A v3 parent reference stays within this QA snapshot, without .. paths.
    local='source/'+original.relative_to(root/'assets/candidates/popcorn-jump').as_posix()
    target=directory/local; target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    records[str(original)]={'original':original.relative_to(root).as_posix(),'path':local,'sha256':digest}
    return data
snapshot('manifest.json',sha(manifest_bytes));snapshot('final-audit.json');snapshot('sheet-selections.json')
snapshot('../v3/source.mp4',manifest['source_video']['sha256']);snapshot('../v3/candidate-manifest.json')
for entry in audit['files']:
    snapshot(entry['path'],entry['sha256'])
    image=Image.open(source/entry['path']);alpha=image.getchannel('A')
    assert image.mode=='RGBA' and image.width*2==image.height*3 and alpha.getextrema()==(0,255)
    edge=max(alpha.crop(box).getextrema()[1] for box in [(0,0,image.width,1),(0,image.height-1,image.width,image.height),(0,0,1,image.height),(image.width-1,0,image.width,image.height)])
    # Downsampled tiers retain source Lanczos ringing (at most 3/255 alpha).
    # The full master and visible silhouette must still have actual clearance.
    assert edge<=3 and (entry['role']!='master' or edge==0),entry['path']
    if edge:edge_residuals.append({'path':entry['path'],'maximumEdgeAlpha':edge})
for coat in manifest['coats']:
    assert len(coat['frames'])==32 and [f['frame'] for f in coat['frames']]==list(range(32))
    for frame in coat['frames']:
        if 'color_source_sheet' in frame: snapshot(frame['color_source_sheet'],frame['color_source_sheet_sha256'])
        provenance=frame['color_provenance']
        for key in ['receipt','prompt']:
            if key in provenance:snapshot(provenance[key],provenance[key+'_sha256'])
        for reference in provenance.get('inputs',[]):
            absolute=Path(reference['path']).resolve();assert absolute.is_relative_to(source)
            snapshot(absolute.relative_to(source).as_posix(),reference['sha256'])
    for entry in coat['audits']:snapshot(entry['path'],entry['sha256'])
assert sha((source/'manifest.json').read_bytes())==sha(manifest_bytes),'Producer changed manifest'
for record in records.values():assert sha((root/record['original']).read_bytes())==record['sha256'],'Source changed during snapshot'
prompt=root/'docs/motions/popcorn-jump/prompt-v3.txt'
flow_prompt={'path':prompt.relative_to(root).as_posix(),'sha256':sha(prompt.read_bytes()),'text':prompt.read_text(encoding='utf-8')}
snapshot_report={'schema':1,'sourceCandidate':source.relative_to(root).as_posix(),'sourceManifestSha256':sha(manifest_bytes),'manifest':manifest,'finalAudit':audit,'files':list(records.values()),'flowPrompt':flow_prompt,'sourceAction':'rear','runtimeAction':'rearing','edgeResiduals':edge_residuals}
(directory/'snapshot.json').write_text(json.dumps(snapshot_report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(directory)
