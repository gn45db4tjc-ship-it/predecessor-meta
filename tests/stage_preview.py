"""Render a static preview site from saved bundles. No network, no date changes.

Used by the browser regression suites locally and in CI:

    python -B tests/stage_preview.py                       # the committed gold seed
    python -B tests/stage_preview.py --seed a.json --seed b.json.gz --output qa/six-site --state-dir qa/six-state

Each seed is a dated snapshot (plain or gzipped JSON). The publisher's own preview mode renders it
exactly as collected: it marks the publication as a preview and never claims a source was checked now.
Seeds are only read; nothing is written outside the repository's ignored qa/ folder.
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


def stage(output, state_dir, seeds=()):
    output, state_dir = Path(output).resolve(), Path(state_dir).resolve()
    seeds = [Path(s) for s in seeds] or [ROOT / 'public-seed-gold.json.gz']
    for folder in (output, state_dir):
        # Only ever write or clear folders inside the repository's ignored qa/ area.
        if ROOT / 'qa' not in folder.parents:
            raise SystemExit('Refusing to write outside qa/: ' + str(folder))
        if folder.exists():
            shutil.rmtree(folder)
    with tempfile.TemporaryDirectory() as tmp:
        plain = []
        for index, seed in enumerate(seeds):
            raw = seed.read_bytes()
            target = Path(tmp) / ('seed-%d.json' % index)
            target.write_bytes(gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw)
            plain.append(target)
        manifest = publication.run(state_dir, output, preview_seeds=plain)
    available = sorted(k for k, v in manifest['cohorts'].items() if v.get('status') == 'available')
    return {'output': str(output), 'available': available,
            'generated_at': {k: manifest['cohorts'][k].get('generated_at') for k in available}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'qa' / 'audit-site')
    parser.add_argument('--state-dir', type=Path, default=ROOT / 'qa' / 'audit-state')
    parser.add_argument('--seed', type=Path, action='append', default=[], help='bundle JSON or .json.gz; repeat for several brackets')
    args = parser.parse_args()
    print(json.dumps(stage(args.output, args.state_dir, args.seed)))
