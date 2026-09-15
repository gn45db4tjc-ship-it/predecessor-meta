"""Package and independently verify the source-only 2.21.7 release."""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FILES = ['predecessor_meta.py','engine.js','ui.js','ui.html','reviewed_guidance.json','shared_server.py',
         'static_publish.py','static_client.js','rank_view.js','publication_activity.py','free_hosting.json',
         'README.md','VERIFICATION.md','.gitignore','package_source.py','local_updater.py','import_local_feed.py',
         'Install Windows Updater.ps1','BROWSER-VERIFICATION.json','CHANGE-REPORT.md','INSTALL-AND-ROLLBACK.md',
         'RELEASE-VERIFICATION.md','RELEASE-2.21.1.md','RELEASE-2.21.2.md','RELEASE-2.21.3.md','RELEASE-2.21.4.md','RELEASE-2.21.5.md','RELEASE-2.21.6.md']
FILES += ['RELEASE-2.21.7.md','STRATEGY-REVIEW-2026-09-14.json','STRATEGY-REVIEW-VERIFICATION.json']

def package(node=None):
    files = [ROOT / name for name in FILES]
    files += sorted((ROOT / '.github').rglob('*.yml'))
    for extension in ('*.py','*.cjs','*.js'):
        files += sorted((ROOT / 'tests').rglob(extension))
    hashes = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    assert len(files) == len(hashes)
    manifest = {'version':'2.21.7','hosting_revision':5,'design_revision':2,
                'baseline_commit':'df558b7c69b3bf01063ceb9d531d3b236affb9cb',
                'verification_report':'RELEASE-2.21.7.md','files':hashes}
    (ROOT / 'SOURCE-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
    archive = ROOT.parent / 'Predecessor Meta Tool 2.21.7 - Source.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in files + [ROOT/'SOURCE-MANIFEST.json']:
            z.write(p,p.relative_to(ROOT).as_posix())
    with tempfile.TemporaryDirectory(prefix='pred-source-check-') as temp:
        clean = Path(temp)
        with zipfile.ZipFile(archive) as z:
            assert set(z.namelist()) == set(hashes) | {'SOURCE-MANIFEST.json'}
            for name in z.namelist():
                target = (clean / name).resolve()
                assert target.is_relative_to(clean.resolve())
                raw = z.read(name)
                if name in hashes: assert hashlib.sha256(raw).hexdigest() == hashes[name]
                target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
        result = subprocess.run([sys.executable,'-X','utf8','-B','-m','unittest','discover','-s','tests',
                                 '-p','test_static*.py','-q'],cwd=clean,capture_output=True,text=True,encoding='utf8')
        if result.returncode: raise RuntimeError(result.stdout+'\n'+result.stderr)
        if node:
            js = subprocess.run([node,'--test',*[p.relative_to(clean).as_posix() for p in sorted((clean/'tests').glob('*.test.cjs'))]],cwd=clean,
                                capture_output=True,text=True,encoding='utf8')
            if js.returncode: raise RuntimeError(js.stdout+'\n'+js.stderr)
    receipt = {'archive':str(archive),'bytes':archive.stat().st_size,'files':len(files),
               'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
               'clean_python_tests':re.search(r'Ran (\d+) tests',result.stderr).group(1)+' passed',
               'clean_javascript_tests':re.search(r'(?:#|ℹ) pass (\d+)',js.stdout).group(1)+' passed' if node else 'not run'}
    print(json.dumps(receipt,indent=2))
    return receipt

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--node');args=parser.parse_args()
    package(args.node)
