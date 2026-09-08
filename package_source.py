"""Create and verify a source-only hosting archive; never includes owner data."""
import hashlib
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RUNTIME = ['predecessor_meta.py','engine.js','ui.js','ui.html','reviewed_guidance.json','shared_server.py']


def package(installed=None):
    hashes = {}
    if installed:
        for name in RUNTIME:
            assert (ROOT/name).read_bytes() == (Path(installed)/name).read_bytes(), 'Installed baseline changed: '+name
    files = [ROOT/name for name in RUNTIME + ['static_publish.py','static_client.js','rank_view.js','publication_activity.py',
        'free_hosting.json','README.md','VERIFICATION.md','.gitignore','package_source.py',
        'local_updater.py','import_local_feed.py','Install Windows Updater.ps1']]
    files += sorted((ROOT/'.github').rglob('*.yml'))
    files += sorted((ROOT/'tests').rglob('*.py')) + sorted((ROOT/'tests').rglob('*.cjs')) + sorted((ROOT/'tests').rglob('*.js'))
    receipts = {}
    for engine in ['edge','webkit']:
        path = ROOT/'qa'/(engine+'-static-acceptance.json')
        report = json.loads(path.read_text(encoding='utf8'))
        assert len(report['runs']) == 2
        assert all(not run['errors'] and len(run['checks']) >= 51 for run in report['runs'])
        receipts[engine] = report
    (ROOT/'BROWSER-VERIFICATION.json').write_text(json.dumps(receipts,indent=2)+'\n',encoding='utf8')
    files.append(ROOT/'BROWSER-VERIFICATION.json')
    for file in files:
        relative = file.relative_to(ROOT).as_posix()
        assert not any(part in ('data','qa','backups','.cloud-state','.local-publisher') for part in file.relative_to(ROOT).parts)
        hashes[relative] = hashlib.sha256(file.read_bytes()).hexdigest()
    manifest = {'hosting_revision':3,'desktop_baseline':'2.21.0','runtime_unchanged':RUNTIME,
                'publication_approved':True,'publicly_deployed':True,'files':hashes}
    (ROOT/'SOURCE-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
    archive = ROOT.parent/'Predecessor Meta Tool - Free Hosting Source.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for file in files+[ROOT/'SOURCE-MANIFEST.json']: z.write(file,file.relative_to(ROOT).as_posix())
    clean = ROOT/'qa'/'clean-package'
    clean.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        assert set(z.namelist()) == set(hashes)|{'SOURCE-MANIFEST.json'}
        for name, digest in hashes.items(): assert hashlib.sha256(z.read(name)).hexdigest()==digest
        for name in z.namelist():
            target=(clean/name).resolve()
            assert target.is_relative_to(clean.resolve())
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(name))
    result=subprocess.run([sys.executable,'-B','-m','unittest','discover','-s','tests','-p','test_static*.py','-v'],cwd=clean,capture_output=True,text=True)
    (ROOT/'qa'/'clean-tests.txt').write_text(result.stdout+'\n'+result.stderr,encoding='utf8')
    assert result.returncode==0, result.stderr
    receipt={'archive':archive.name,'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
             'manifest_files':len(hashes),'zip_entries':len(hashes)+1,
             'clean_unit_tests':re.search(r'Ran (\d+) tests',result.stderr).group(1)+' passed',
             'installed_runtime_unchanged':bool(installed)}
    (ROOT/'qa'/'package-verification.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8')
    print(json.dumps(receipt,indent=2))


if __name__=='__main__': package(sys.argv[1] if len(sys.argv)>1 else None)
