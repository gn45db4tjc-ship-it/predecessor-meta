"""Render a static preview site from the committed public seed. No network, no date changes.

Used by the browser regression suites locally and in CI:

    python -B tests/stage_preview.py --output qa/audit-site --state-dir qa/audit-state

The seed is a dated public snapshot. The publisher's own preview mode renders it exactly as
collected (it marks the publication as a preview and never claims a source was checked now).
"""
import argparse
import gzip
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import static_publish as publication  # noqa: E402


def stage(output, state_dir, seed=ROOT / 'public-seed-gold.json.gz'):
    output, state_dir = Path(output).resolve(), Path(state_dir).resolve()
    for folder in (output, state_dir):
        # Only ever clear folders this helper owns, inside the repository's ignored qa/ area.
        if folder.exists():
            if ROOT / 'qa' not in folder.parents:
                raise SystemExit('Refusing to clear a folder outside qa/: ' + str(folder))
            shutil.rmtree(folder)
    with tempfile.TemporaryDirectory() as tmp:
        plain = Path(tmp) / 'seed.json'
        plain.write_text(gzip.decompress(Path(seed).read_bytes()).decode('utf8'), encoding='utf8')
        manifest = publication.run(state_dir, output, preview_seeds=[plain])
    available = sorted(k for k, v in manifest['cohorts'].items() if v.get('status') == 'available')
    return {'output': str(output), 'available': available,
            'generated_at': {k: manifest['cohorts'][k].get('generated_at') for k in available}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'qa' / 'audit-site')
    parser.add_argument('--state-dir', type=Path, default=ROOT / 'qa' / 'audit-state')
    args = parser.parse_args()
    print(json.dumps(stage(args.output, args.state_dir)))
