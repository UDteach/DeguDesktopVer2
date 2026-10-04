"""Verify every ZIP member against the tested Windows directory, without extraction."""
import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

root=Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
archive=root/f'release/DeguDesktopVer2-{version}-windows-x64.zip'
directory=root/'release/win-unpacked'
sha=lambda value:hashlib.sha256(value).hexdigest()
expected={file.relative_to(directory).as_posix() for file in directory.rglob('*') if file.is_file()}
critical={'resources/app.asar','DeguDesktopVer2.exe','はじめに.txt'}
checked=[]
with zipfile.ZipFile(archive) as bundle:
    names={entry.filename for entry in bundle.infolist() if not entry.is_dir()}
    assert len(names)==len([e for e in bundle.infolist() if not e.is_dir()]), 'Duplicate ZIP member'
    installer_only={'resources/app-update.yml','resources/elevate.exe'}
    assert not names-expected and expected-names<=installer_only, 'ZIP contents differ from tested Windows directory beyond installer helper files'
    for name in sorted(names):
        relative=PurePosixPath(name)
        assert not relative.is_absolute() and '..' not in relative.parts, name
        digest=sha(bundle.read(name))
        assert digest==sha((directory/name).read_bytes()), name
        if name in critical:checked.append({'path':name,'sha256':digest})
report={'passed':True,'checkedAt':datetime.now(timezone.utc).isoformat(),'zipSha256':sha(archive.read_bytes()),'zipBytes':archive.stat().st_size,'membersVerified':len(names),'installerOnlyFiles':sorted(expected-names),'critical':checked}
output=root/'.codex/qa/zip-report.json';output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
