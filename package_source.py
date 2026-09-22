"""Package and independently verify the source-only 2.30.2 release."""
import argparse
import hashlib
import json
import re
import shutil
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
FILES += ['RELEASE-2.21.8.md','mobile.js','mobile.css','RELEASE-2.22.0.md','RELEASE-2.23.0.md','app.webmanifest','sw.js','assets/app-icon-192.png','assets/app-icon-512.png']
# Verification tooling: pinned development dependencies and the audit-regression ledger.
FILES += ['package.json','package-lock.json','tests/known-defects.json','RELEASE-2.24.0.md','review_queue.cjs','RELEASE-2.25.0.md','RELEASE-2.26.0.md','RELEASE-2.26.1.md','RELEASE-2.26.2.md']
# Website delivery projection (audit item 11).
FILES += ['projection.py','projection_client.js','PROJECTION-DESIGN.md','RELEASE-2.27.0.md','RELEASE-2.28.0.md','RELEASE-2.28.1.md','RELEASE-2.28.2.md']
FILES += ['RELEASE-2.30.0.md','RELEASE-2.30.0-VERIFICATION.json','RELEASE-2.30.2.md','RELEASE-2.30.2-VERIFICATION.json','STRATEGY-REVIEW-POLICY.md']
FILES += ['RELEASE-2.30.1.md','RELEASE-2.30.1-VERIFICATION.json']
FILES += ['companion_state.js','recommendation_view.js','skill_guide.js','companion_simple.js','companion_simple.css']
FILES += ['RELEASE-2.29.0.md','DESIGN-2.29-ACCEPTANCE.md','DESIGN-2.29-VERIFICATION.json','public-seed-gold.json.gz']

def package(node=None):
    files = [ROOT / name for name in FILES]
    files += sorted((ROOT / '.github').rglob('*.yml'))
    for extension in ('*.py','*.cjs','*.js'):
        files += sorted((ROOT / 'tests').rglob(extension))
    hashes = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    assert len(files) == len(hashes)
    manifest = {'version':'2.30.2','hosting_revision':20,'design_revision':5,
                'baseline_commit':'e11c814',
                'verification_report':'RELEASE-2.30.2-VERIFICATION.json','release_status':'verified source; installation and deployment recorded separately','files':hashes}
    (ROOT / 'SOURCE-MANIFEST.json').write_bytes((json.dumps(manifest,indent=2)+'\n').encode('utf8'))
    archive = ROOT.parent / 'Predecessor Meta Tool 2.30.2 - Source.zip'
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
        # The JavaScript suite is mandatory: a package whose engine tests were skipped is not verified.
        node = node or shutil.which('node')
        if not node: raise RuntimeError('Node.js was not found. Install Node 22 or newer, or pass --node <path>; the JavaScript suite cannot be skipped.')
        js = subprocess.run([node,'--test',*[p.relative_to(clean).as_posix() for p in sorted((clean/'tests').glob('*.test.cjs'))]],cwd=clean,
                            capture_output=True,text=True,encoding='utf8')
        if js.returncode: raise RuntimeError(js.stdout+'\n'+js.stderr)
    receipt = {'archive':str(archive),'bytes':archive.stat().st_size,'files':len(files),
               'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
               'clean_python_tests':re.search(r'Ran (\d+) tests',result.stderr).group(1)+' run: '+result.stderr.strip().splitlines()[-1],
               'clean_javascript_tests':re.search(r'(?:#|ℹ) pass (\d+)',js.stdout).group(1)+' passed, '+re.search(r'(?:#|ℹ) skipped (\d+)',js.stdout).group(1)+' skipped, '+re.search(r'(?:#|ℹ) todo (\d+)',js.stdout).group(1)+' recorded todo'}
    print(json.dumps(receipt,indent=2))
    return receipt

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--node');args=parser.parse_args()
    package(args.node)
