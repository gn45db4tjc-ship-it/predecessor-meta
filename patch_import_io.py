"""Safe I/O for the patch importer. Parsing/CLI held pending reference reconciliation."""
import csv
import hashlib
import io
import json
import os
import re
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.robotparser import RobotFileParser

ORIGIN = 'https://www.predecessorgame.com'
USER_AGENT = 'PatchNotesImporter/1.0'
FIELDS = ['Category', 'Target', 'Ability_or_Stat', 'Old_Value', 'New_Value', 'Change_Type', 'Source']
CATEGORIES = {'Hero', 'Item', 'System', 'Map/Mode'}
TYPES = {'Buff', 'Nerf', 'Adjustment', 'Rework', 'New'}
MAX_BYTES = 8 * 1024 * 1024


class ImportFailure(ValueError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ImportFailure('Redirect refused; use the canonical official URL')


def official_url(url, page=False):
    try:
        p = urlsplit(url)
        valid = p.scheme == 'https' and p.netloc == 'www.predecessorgame.com'
        valid = valid and not p.query and not p.fragment
        if page:
            valid = valid and bool(re.fullmatch(r'/news/patch-notes/[A-Za-z0-9_.-]+', p.path))
        else:
            valid = valid and p.path in ('/news', '/news/patch-notes', '/robots.txt')
        if not valid:
            raise ImportFailure('Only canonical official news URLs are allowed')
    except (ValueError, TypeError) as exc:
        raise ImportFailure('Invalid official URL') from exc
    return url


class OfficialFetcher:
    """One robots, at most one listing and one page; no retries or redirects."""
    def __init__(self, opener=None):
        self.opener = opener or build_opener(NoRedirect())
        self.used = set()
        self.robots = None
        self.last_request_finished = None

    def _request(self, url, kind):
        if kind in self.used:
            raise ImportFailure('Request budget exhausted: ' + kind)
        self.used.add(kind)
        # Measure from completion, including robots itself, to avoid a burst
        # immediately after discovering the site's crawl-delay directive.
        delay = self.robots.crawl_delay(USER_AGENT) if self.robots else None
        if delay and self.last_request_finished is not None:
            remaining = delay - (time.monotonic() - self.last_request_finished)
            while remaining > 0:
                time.sleep(remaining)
                remaining = delay - (time.monotonic() - self.last_request_finished)
        try:
            with self.opener.open(Request(url, headers={'User-Agent': USER_AGENT}), timeout=30) as response:
                if response.status != 200 or response.geturl() != url:
                    raise ImportFailure('Unexpected HTTP status or destination')
                body = response.read(MAX_BYTES + 1)
                if len(body) > MAX_BYTES:
                    raise ImportFailure('Response exceeds size limit')
                return body
        except (HTTPError, OSError) as exc:
            raise ImportFailure('Official source request failed') from exc
        finally:
            self.last_request_finished = time.monotonic()

    def fetch(self, url, kind):
        if kind not in ('listing', 'page'):
            raise ImportFailure('Unknown request kind')
        official_url(url, page=kind == 'page')
        if self.robots is None:
            raw = self._request(ORIGIN + '/robots.txt', 'robots')
            try:
                text = raw.decode('utf-8-sig')
            except UnicodeError as exc:
                raise ImportFailure('Unreadable robots.txt') from exc
            # A successful HTML error page must not silently grant permission.
            if not re.search(r'^\s*user-agent\s*:', text, re.I | re.M) or '<html' in text.lower():
                raise ImportFailure('Invalid robots.txt')
            self.robots = RobotFileParser()
            self.robots.parse(text.splitlines())
        if not self.robots.can_fetch(USER_AGENT, url):
            raise ImportFailure('robots.txt disallows this request')
        return self._request(url, kind)


def _atomic(path, data):
    fd, temp = tempfile.mkstemp(prefix='.' + path.name + '-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def write_import(directory, version, date, url, html, rows):
    """Write validated rows and metadata, refusing corrupt or inconsistent history.

    CSV then index are each atomic. A crash between them is detected on next run,
    never accepted as a no-op. This helper does not infer or parse any patch rows.
    """
    if not re.fullmatch(r'\d+\.\d+(?:\.\d+)?', version):
        raise ImportFailure('Invalid version')
    official_url(url, page=True)
    if not date or not isinstance(date, str):
        raise ImportFailure('Missing source date')
    rows = list(rows)
    if not rows:
        raise ImportFailure('No parsed rows; refusing output')
    for row in rows:
        if set(row) != set(FIELDS) or not all(isinstance(v, str) for v in row.values()):
            raise ImportFailure('Invalid row schema')
        if row['Category'] not in CATEGORIES or row['Change_Type'] not in TYPES or row['Source'] != 'Patch Notes':
            raise ImportFailure('Invalid row classification')
    root = Path(directory)
    index_path = root / 'index.json'
    try:
        index = json.loads(index_path.read_text(encoding='utf-8')) if index_path.exists() else {}
    except (ValueError, OSError) as exc:
        raise ImportFailure('Unreadable index; refusing overwrite') from exc
    if not isinstance(index, dict):
        raise ImportFailure('Invalid index')
    csv_path = root / (version + '.csv')
    previous = index.get(version)
    if previous is not None:
        if not isinstance(previous, dict) or not csv_path.exists() or hashlib.sha256(csv_path.read_bytes()).hexdigest() != previous.get('csv_sha256'):
            raise ImportFailure('Existing CSV/index inconsistent; manual recovery required')
    elif csv_path.exists():
        raise ImportFailure('Unindexed CSV; refusing overwrite')
    source_hash = hashlib.sha256(html).hexdigest()
    if previous and previous.get('sha256') == source_hash:
        if previous.get('url') != url or previous.get('date') != date:
            raise ImportFailure('Source metadata changed without source bytes')
        return {'status': 'unchanged', 'version': version, 'row_count': previous['row_count']}
    out = io.StringIO(newline='')
    writer = csv.DictWriter(out, fieldnames=FIELDS)
    writer.writeheader()
    writer.writerows(rows)
    data = out.getvalue().encode('utf-8')
    old_rows = []
    if previous:
        old_rows = list(csv.DictReader(io.StringIO(csv_path.read_text(encoding='utf-8'))))
    from collections import Counter
    old = Counter(tuple(r[k] for k in FIELDS) for r in old_rows)
    new = Counter(tuple(r[k] for k in FIELDS) for r in rows)
    summary = {'status': 'updated' if previous else 'created', 'version': version, 'date': date,
               'row_count': len(rows), 'counts': dict(Counter(r['Category'] for r in rows)),
               'added': [dict(zip(FIELDS, r)) for r in (new-old).elements()],
               'removed': [dict(zip(FIELDS, r)) for r in (old-new).elements()]}
    index[version] = {'url': url, 'date': date, 'row_count': len(rows), 'sha256': source_hash,
                      'csv_sha256': hashlib.sha256(data).hexdigest()}
    root.mkdir(parents=True, exist_ok=True)
    _atomic(csv_path, data)
    _atomic(index_path, (json.dumps(index, indent=2, ensure_ascii=False) + '\n').encode('utf-8'))
    return summary
