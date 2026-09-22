"""Build a separate, local-only review package from an existing saved bundle."""
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tests'))
from stage_preview import stage

parser = argparse.ArgumentParser()
parser.add_argument('--seed', required=True, type=Path)
args = parser.parse_args()
raw = args.seed.read_bytes()
bundle = json.loads(raw)
out = ROOT / 'qa' / 'mobile-review'
out.mkdir(parents=True, exist_ok=True)
stage(out / 'full', ROOT / 'qa' / 'mobile-review-state', [args.seed])
for name in ('index.html', 'prototype.css', 'prototype.js', 'recommendation-view.js', 'skill-guide.js'):
    shutil.copyfile(Path(__file__).parent / name, out / name)
shutil.copyfile(ROOT / 'engine.js', out / 'engine.js')
(out / 'bundle.js').write_text('window.REVIEW_BUNDLE=' + json.dumps(bundle, ensure_ascii=True, separators=(',', ':')) + ';', encoding='utf-8')
(out / 'BUILD-RECEIPT.json').write_text(json.dumps({'seed_sha256': hashlib.sha256(raw).hexdigest(), 'generated_at': bundle.get('generated_at'), 'bracket': bundle.get('bracket'), 'engine_sha256': hashlib.sha256((ROOT / 'engine.js').read_bytes()).hexdigest(), 'purpose': 'Local design preview. Source dates unchanged; production app untouched.'}, indent=2), encoding='utf-8')
print(out)
