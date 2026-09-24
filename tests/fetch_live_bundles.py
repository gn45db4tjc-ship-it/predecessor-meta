"""Download the six rank bundles the live site currently publishes, for the nightly live-data browser check.

    python -B tests/fetch_live_bundles.py qa/live-bundles

Read-only. Every bundle must match the sha256 in the live manifest; a mismatch or a missing cohort fails loudly.
A Pages deploy can briefly serve a new manifest before its bundles, so each fetch is retried a few times.
"""
import argparse
import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path

DEFAULT_BASE = 'https://gn45db4tjc-ship-it.github.io/predecessor-meta/'
RANKS = ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'paragon')


def fetch(url, attempts=4, wait=30):
    for attempt in range(1, attempts + 1):
        try:
            separator = '&' if '?' in url else '?'
            with urllib.request.urlopen(url + separator + 'live-check=' + str(int(time.time())), timeout=120) as response:
                return response.read()
        except Exception as error:  # network or CDN window: retry, then fail loudly
            if attempt == attempts:
                raise RuntimeError('Could not download ' + url + ': ' + str(error)) from error
            time.sleep(wait)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('output', type=Path)
    parser.add_argument('--base', default=DEFAULT_BASE)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, 4):
        manifest = json.loads(fetch(args.base + 'manifest.json'))
        cohorts = manifest.get('cohorts') or {}
        missing = [rank for rank in RANKS if rank not in cohorts or not cohorts[rank].get('url')]
        if missing:
            raise SystemExit('Live manifest has no published bundle for: ' + ', '.join(missing))
        problems = []
        for rank in RANKS:
            cohort = cohorts[rank]
            url = cohort['url'] if cohort['url'].startswith('http') else args.base + cohort['url']
            raw = fetch(url)
            digest = hashlib.sha256(raw).hexdigest()
            if digest != cohort.get('sha256'):
                problems.append(rank + ' sha256 ' + digest[:12] + ' != manifest ' + str(cohort.get('sha256'))[:12])
                continue
            (args.output / (rank + '.json')).write_bytes(raw)
        if not problems:
            print(json.dumps({'app': manifest.get('app'), 'published_at': manifest.get('published_at'),
                              'run_id': manifest.get('run_id'), 'ranks': list(RANKS)}))
            return
        if attempt == 3:
            raise SystemExit('Live bundles do not match their manifest: ' + '; '.join(problems))
        time.sleep(60)  # a deploy in progress: read the manifest again


if __name__ == '__main__':
    sys.exit(main())
