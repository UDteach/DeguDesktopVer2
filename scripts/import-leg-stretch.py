"""Promote the reviewed agouti v2 without changing its source or original PNGs."""
import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
source = root / 'assets/candidates/leg-stretch/agouti-v2'
destination = root / 'app/motions'
manifest = json.loads((source / 'animation-manifest.json').read_text(encoding='utf-8'))
sha = lambda data: hashlib.sha256(data).hexdigest()
assert sha((source / manifest['source']).read_bytes()) == manifest['sourceSha256']
assert sha((source / manifest['promptPath']).read_bytes()) == manifest['promptSha256']
assert manifest['frameCount'] == 93 and manifest['durationMs'] == 3875
pack_file = destination / 'manifest.json'
pack = json.loads(pack_file.read_text(encoding='utf-8')) if pack_file.exists() else {'schema': 1, 'motions': [], 'files': []}
assert not any(m['action'] == 'leg-stretch' and m['coat'] == 'degu-agouti' for m in pack['motions']), 'Already imported; do not overwrite a reviewed pack'
tiers = {str(tier): [] for tier in [32, 48, 64, 96]}
for frame in manifest['frames']:
    for tier, paths in tiers.items():
        file = source / frame['tiers'][tier]
        image = Image.open(file)
        assert image.mode == 'RGBA' and image.size == (int(tier)*3//2, int(tier))
        alpha = image.getchannel('A')
        assert alpha.getextrema() == (0, 255) and alpha.getbbox()
        assert all(alpha.getpixel(point) == 0 for point in [(0,0),(image.width-1,0),(0,image.height-1),(image.width-1,image.height-1)])
        relative = f"leg-stretch/degu-agouti/{tier}-{frame['index']:03}.png"
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        data = file.read_bytes()
        target.write_bytes(data)
        paths.append(relative)
        pack['files'].append({'path': relative, 'sha256': sha(data), 'sourceFrame': frame['sourceFrame']})
provenance = {k:v for k,v in manifest.items() if k != 'frames'}
provenance.update({
    'adoptedOn': '2026-10-04', 'review': 'docs/motions/INTEGRATION-QA.md',
    'candidateManifestSha256': sha((source/'animation-manifest.json').read_bytes()),
    'candidateDirectory': 'assets/candidates/leg-stretch/agouti-v2',
    'prompt': (source/manifest['promptPath']).read_text(encoding='utf-8'),
    'adoptionNotes': 'One hind-leg extension and return; artistic motion, not a measured biological cycle. Contact-sheet and runtime review. Fixed vertical correction aligns front supporting feet with original agouti baseline; no frame-specific warping.'
})
pack['motions'].append({
    'action': 'leg-stretch', 'label': 'あしぴーん', 'coat': 'degu-agouti',
    'singlePlay': True, 'durations': [f['durationMs'] for f in manifest['frames']],
    'tiers': tiers, 'presentation': {'scale':1, 'x':0, 'y':-3/96},
    'provenance': provenance
})
assert sum(pack['motions'][-1]['durations']) == 3875
pack_file.parent.mkdir(parents=True, exist_ok=True)
pack_file.write_text(json.dumps(pack, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f"Promoted agouti leg stretch: {len(manifest['frames'])} frames, {len(tiers)*len(manifest['frames'])} PNGs, 3875ms")
