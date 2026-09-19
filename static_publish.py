"""Free static publication, independent of the owner app and its saved data.

Only this module collects. The browser reads immutable, dated public bundles.
--preview-seed renders existing evidence without downloading or changing its dates.
"""
import argparse
import concurrent.futures
import copy
import datetime as dt
import gzip
import zlib
import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

import predecessor_meta as base
import projection
from shared_server import public_bundle

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / 'free_hosting.json').read_text(encoding='utf8'))
UTC = dt.timezone.utc


def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding='utf8'))
    except FileNotFoundError:
        return copy.deepcopy(default)


def write_json(path, value):
    base.atomic_write(Path(path), json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def utc_time(value):
    date = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if not date.tzinfo:
        raise ValueError('Publication timestamps require a time zone')
    return date.astimezone(UTC)


def daily_boundary(now):
    hour, minute = map(int, CONFIG['daily_utc'].split(':'))
    boundary = now.astimezone(UTC).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return boundary if now >= boundary else boundary - dt.timedelta(days=1)


def live_signature(official):
    """Fingerprint current/released article content, not future announcements or check time."""
    if official.get('status') != 'verified':
        return None
    live = official.get('live', {})
    if live.get('status') != 'live' or not live.get('version') or not live.get('fingerprint'):
        return None
    # The preceding launch article can contain hotfix sections relevant to this balance patch.
    articles = [a for a in official.get('articles', []) if a.get('status') == 'live']
    rows = sorted((a['version'], a['fingerprint']) for a in articles)
    rows.append(('current', live['version'], live['fingerprint']))
    return hashlib.sha256(json.dumps(rows).encode()).hexdigest()


def collection_reason(state, official, now, manual=False):
    signature = live_signature(official)
    if manual:
        return 'Manual update'
    last = state.get('last_full_attempt_at')
    if not last or utc_time(last) < daily_boundary(now):
        return 'Daily update'
    retry = state.get('required_retry') or {}
    if (retry.get('pending') and not retry.get('blocked')
            and int(retry.get('attempts', 0)) < int(CONFIG.get('required_retry_limit', 2))
            and now-utc_time(last) >= dt.timedelta(hours=CONFIG.get('required_retry_hours', 3))):
        return 'Automatic required-source retry'
    # Remember attempts as well as successes: an unavailable source is not hammered every check.
    if signature and signature != state.get('last_attempted_signature'):
        return 'Live patch or hotfix article changed'
    if retry and (retry.get('blocked') or int(retry.get('attempts', 0)) >= int(CONFIG.get('required_retry_limit', 2))):
        return None
    transition = state.get('patch_transition_at')
    if (signature and transition and not state.get('blocked_in_last_full')
            and signature != state.get('last_completed_signature')
            and dt.timedelta(0) <= now-utc_time(transition) <= dt.timedelta(hours=CONFIG['patch_window_hours'])
            and now-utc_time(last) >= dt.timedelta(hours=CONFIG['patch_catchup_hours'])):
        return 'Patch-day source catch-up'
    return None


def patch_summary(official):
    live = official.get('live', {})
    return {
        'status': official.get('status', 'failed'),
        'checked_at': official.get('checked_at'),
        'version': live.get('version'), 'url': live.get('url', base.OFFICIAL_INDEX),
        'signature': live_signature(official), 'error': official.get('error'),
        'announcements': [{k: a.get(k) for k in ('version', 'release_date', 'url', 'title')}
                          for a in official.get('articles', []) if a.get('status') == 'announced'],
    }


def configure_collector(folder):
    folder = Path(folder).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    # This directory is dedicated cloud/cache state; never use the installed owner's directory.
    base.DATA_DIR = folder
    base.SNAP_DIR = folder / 'snapshots'
    base.LATEST_BUNDLE = folder / 'latest_bundle.json'
    base.SETTINGS_FILE = folder / 'settings.json'
    base.OUT_HTML = folder / 'unused-export.html'


class RunFetchCache:
    """Deduplicate across cohorts, including failures; stop a blocked host for the entire run."""
    def __init__(self, fetch):
        self.fetch = fetch
        self.lock = threading.Lock()
        self.futures = {}
        self.blocked = set()

    def __call__(self, url, *args, **kwargs):
        host = urlsplit(url).netloc
        with self.lock:
            if host in self.blocked:
                raise base.SourceBlocked('This source was blocked earlier in this publication run: ' + host)
            future = self.futures.get(url)
            owner = future is None
            if owner:
                future = self.futures[url] = concurrent.futures.Future()
        if not owner:
            return future.result()
        try:
            result = self.fetch(url, *args, **kwargs)
            future.set_result(result)
            return result
        except Exception as error:
            if isinstance(error, base.SourceBlocked):
                with self.lock:
                    self.blocked.add(host)
            future.set_exception(error)
            raise


COLLECTOR_HOST = None   # the Windows updater sets this to 'windows'; GitHub Actions is detected; anything else is 'local'
COLLECTOR_HOSTS = ('cloud', 'windows', 'local')
CORE_SOURCES = ('statz_tierlist', 'statz_hero_pages', 'omeda_heroes', 'omeda_items')
DATED_SOURCES = CORE_SOURCES + ('pred_scoped', 'pred_game_data')


def collector_identity():
    """Who actually ran this collection. Recorded on the bundle so the manifest reports facts, not configuration."""
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        return {'host': 'cloud', 'run_id': os.environ.get('GITHUB_RUN_ID'), 'run_attempt': os.environ.get('GITHUB_RUN_ATTEMPT'),
                'tool_version': base.VERSION}
    # Outside GitHub Actions a collection is never labelled cloud, whatever a caller sets.
    return {'host': 'windows' if COLLECTOR_HOST == 'windows' else 'local', 'run_id': None, 'run_attempt': None,
            'tool_version': base.VERSION}


def validate_collector(bundle):
    """Provenance arrives with imported data, so it is checked like data: a known host and short plain values."""
    collector = bundle.get('collector')
    if collector is None:
        return   # collected before provenance was recorded; the manifest says so
    if not isinstance(collector, dict) or collector.get('host') not in COLLECTOR_HOSTS or set(collector) - {'host', 'run_id', 'run_attempt', 'tool_version', 'retained_from'}:
        raise ValueError('Bundle carries an invalid collector record')
    if 'retained_from' in collector:
        origin = collector['retained_from']
        if not isinstance(origin, dict) or not origin or set(origin) - {'statz', 'pred'} or any(v not in COLLECTOR_HOSTS + ('unrecorded',) for v in origin.values()):
            raise ValueError('Bundle carries an invalid collector retained_from')
    for key in ('run_id', 'run_attempt', 'tool_version'):
        value = collector.get(key)
        if value is not None and (not isinstance(value, str) or not re.fullmatch(r'[0-9A-Za-z._-]{1,40}', value)):
            raise ValueError('Bundle carries an invalid collector ' + key)


def older_sources(previous, incoming):
    """Dated sources (Statz, Omeda and Pred.gg) whose fetch date in an incoming bundle is older than, or missing
    compared with, what is already published.

    A newer assembly date never makes an older source fresh, so such a bundle must not replace the publication."""
    older = []
    for key in DATED_SOURCES:
        before = (previous.get('sources') or {}).get(key) or {}
        after = (incoming.get('sources') or {}).get(key) or {}
        status = str(before.get('status') or '')
        if not (status in ('ok', 'retained') or status.startswith('partial')):
            continue   # a published source that holds no data (failed, unavailable) has no date to protect
        try:
            if before.get('fetched_at') and (not after.get('fetched_at') or utc_time(after['fetched_at']) < utc_time(before['fetched_at'])):
                older.append(key)
        except (TypeError, ValueError):
            older.append(key)
    return older


def validate_public_bundle(bundle, bracket):
    validate_collector(bundle)
    if bracket not in base.BRACKETS or bundle.get('bracket', {}).get('segment') != bracket:
        raise ValueError('Published bundle has the wrong rank bracket')
    if not isinstance(bundle.get('heroes'), dict) or not bundle['heroes'] or not isinstance(bundle.get('tier_list'), list) or not bundle['tier_list']:
        raise ValueError('Published bundle is missing heroes or tier rows')
    utc_time(bundle['generated_at'])
    good, reason = base.bundle_is_complete(bundle)
    if not good:
        raise ValueError('Bundle is not a complete successful collection: ' + reason)
    # Clean statuses are not enough: the same row validation guards every publication path.
    try:
        base.validate_bundle_rows(bundle)
    except (KeyError, TypeError, AttributeError) as error:
        raise ValueError('Bundle failed validation: unexpected structure (%r)' % (error,))
    except ValueError as error:
        raise ValueError('Bundle failed validation: ' + str(error))
    return public_bundle(bundle)


def retain_success(bundle, folder):
    bracket = bundle.get('bracket', {}).get('segment')
    clean = validate_public_bundle(bundle, bracket)
    raw = json.dumps(clean, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    target = Path(folder) / 'bundles' / (bracket + '.json.gz')
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix('.tmp')
    temp.write_bytes(gzip.compress(raw, mtime=0))
    os.replace(temp, target)
    return clean


# Everything reading a stored file can raise when the file is truncated, corrupted, or not a JSON object.
STORED_BUNDLE_ERRORS = (OSError, ValueError, KeyError, TypeError, AttributeError, EOFError, zlib.error)


def load_success(folder, bracket):
    target = Path(folder) / 'bundles' / (bracket + '.json.gz')
    if not target.exists():
        return None
    return validate_public_bundle(json.loads(gzip.decompress(target.read_bytes())), bracket)


def validate_publication_bundle(bundle, bracket):
    if base.bundle_is_complete(bundle)[0]:
        return validate_public_bundle(bundle, bracket)
    validate_collector(bundle)
    if bracket not in base.BRACKETS or bundle.get('bracket', {}).get('segment') != bracket:
        raise ValueError('Published bundle has the wrong rank bracket')
    utc_time(bundle['generated_at'])
    if not base.bundle_is_publishable(bundle):
        raise ValueError('Partial collection has no validated independent source update')
    if not bundle.get('heroes') or not isinstance(bundle.get('tier_list'), list):
        raise ValueError('Partial collection is missing its roster or tier structure')
    if not any(e.get('severity') == 'error' for e in bundle.get('errors', [])):
        raise ValueError('Partial collection must name its unavailable source')
    clean = stamp_page_coverage(public_bundle(bundle), bundle)
    coverage = clean['sources'].get('statz_hero_pages', {}).get('coverage') or {}
    clean['refresh_result'] = ('partial: %d of %d Statz hero pages failed; those roles are unavailable and nothing was filled in; inspect each source date'
                               % (coverage['failed'], coverage['requested']) if coverage.get('usable') and coverage.get('failed')
                               else 'partial: independent sources updated; inspect each source date')
    return clean


def stamp_page_coverage(clean, bundle):
    """Publish the publisher's own verdict on hero-page coverage, never the collector's claim.

    The apps use Statz roles from a collection with failed pages only when this says usable, which
    requires the counts to reconcile within the failure share AND the whole update to validate."""
    pages = (clean.get('sources') or {}).get('statz_hero_pages')
    if not isinstance(pages, dict):
        return clean
    coverage = base.hero_page_coverage(pages.get('requested'), pages.get('ok'), pages.get('failed'), pages.get('conflicting'))
    if not coverage['failed'] and not coverage['conflicting'] and 'coverage' not in pages:
        return clean   # nothing is missing: the source record is published exactly as collected
    coverage['usable'] = bool(coverage['usable'] and base.bundle_has_fresh_statz(bundle))
    clean['sources'] = dict(clean['sources'], statz_hero_pages=dict(pages, coverage=coverage))
    return clean


def retain_publication(bundle, folder):
    if base.bundle_is_complete(bundle)[0]:
        return retain_success(bundle, folder)
    bracket = bundle.get('bracket', {}).get('segment')
    clean = validate_publication_bundle(bundle, bracket)
    target = Path(folder) / 'partial-bundles' / (bracket + '.json.gz')
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix('.tmp')
    raw = json.dumps(clean, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    temp.write_bytes(gzip.compress(raw, mtime=0))
    os.replace(temp, target)
    return clean


def load_publication(folder, bracket):
    try:
        complete = load_success(folder, bracket)
    except STORED_BUNDLE_ERRORS as error:
        # A stored bundle that no longer validates is never published and never crashes the run.
        complete = None
        base.log('Stored complete bundle rejected for ' + bracket + ': ' + str(error))
    target = Path(folder) / 'partial-bundles' / (bracket + '.json.gz')
    partial = None
    if target.exists():
        try:
            partial = validate_publication_bundle(json.loads(gzip.decompress(target.read_bytes())), bracket)
        except STORED_BUNDLE_ERRORS as error:
            base.log('Independent update unavailable for ' + bracket + ': ' + str(error))
    candidates = [b for b in (complete, partial) if b]
    return max(candidates, key=lambda b: utc_time(b['generated_at'])) if candidates else None


def import_public_seed(path, folder):
    """Import a validated public snapshot without changing its date or replacing newer data."""
    seed = json.loads(gzip.decompress(Path(path).read_bytes()))
    bracket = seed.get('bracket', {}).get('segment')
    seed = validate_public_bundle(seed, bracket)
    try:
        previous = load_success(folder, bracket)
    except STORED_BUNDLE_ERRORS as error:
        # A stored bundle that fails validation is unusable: treat it as absent so the validated, dated seed
        # replaces it, instead of stopping every scheduled run before anything is published.
        base.log('Stored complete bundle rejected for ' + str(bracket) + ': ' + str(error))
        previous = None
        # The run keeps a verified copy of the last publication beside its collector. When that copy is newer than
        # the seed, restore it (dates unchanged) instead of moving the published date back to the seed's.
        backup = Path(folder) / 'collector' / ('last_successful_' + str(bracket) + '.json')
        try:
            if backup.exists():
                copy_ = validate_public_bundle(base.load_bundle(backup), bracket)
                if utc_time(copy_['generated_at']) > utc_time(seed['generated_at']):
                    retain_success(copy_, folder)
                    base.log('Restored ' + str(bracket) + ' from the verified collector copy dated ' + copy_['generated_at'] + '.')
                    return False
        except STORED_BUNDLE_ERRORS as problem:
            base.log('Collector copy unusable for ' + str(bracket) + ': ' + str(problem))
    if previous and utc_time(previous['generated_at']) >= utc_time(seed['generated_at']):
        return False
    retain_success(seed, folder)
    return True


def output_flag(name, value):
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf8') as stream:
            stream.write(name + '=' + str(value).lower() + '\n')


def publication_report(state):
    """Small public diagnostic: source failures remain inspectable without a website."""
    report = {key: state.get(key) for key in ('last_full_attempt_at', 'last_full_seconds')}
    report['patch_check'] = {key: state.get('patch_check', {}).get(key)
                             for key in ('status', 'checked_at', 'version', 'error')}
    report['cohorts'] = {}
    for bracket in CONFIG['brackets']:
        attempt = state.get('attempts', {}).get(bracket, {})
        report['cohorts'][bracket] = {
            key: attempt.get(key) for key in ('status', 'at', 'seconds')}
        report['cohorts'][bracket]['errors'] = [
            {key: error.get(key) for key in ('source', 'severity', 'detail')}
            for error in attempt.get('errors', [])]
    return report


def diagnose_pred(folder):
    """Explicit maintenance probe: one public page, no statistical collection."""
    folder = Path(folder)
    state = read_json(folder / 'publication.json', {})
    if state.get('blocked_in_last_full'):
        result = {'status': 'withheld', 'reason': 'Previous source block; no new request sent'}
    else:
        try:
            raw, http_status, seconds = base.http_get(base.PRED_BASE + '/heroes')
            scripts = re.findall(r'<script([^>]*)>', raw, re.I)
            # Report visible text and asset paths, never inline script values or challenge tokens.
            visible = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', raw, flags=re.S | re.I)
            asset_paths = [urlsplit(src).path for attrs in scripts
                           for src in re.findall(r'\bsrc=["\']([^"\']+)["\']', attrs)]
            result = {'seconds': seconds, 'characters': len(raw),
                      'title': [base.clean_text(v)[:160] for v in re.findall(r'<title>(.*?)</title>', raw, re.S | re.I)],
                      'script_count': len(scripts), 'embedded_marker_count': raw.count('data-sveltekit-fetched'),
                      'http_status': http_status,
                      'headings': [base.clean_text(v)[:240] for v in re.findall(r'<h1\b[^>]*>(.*?)</h1>', visible, re.S | re.I)],
                      'noscript': [base.clean_text(v)[:240] for v in re.findall(r'<noscript\b[^>]*>(.*?)</noscript>', visible, re.S | re.I)],
                      'script_paths': asset_paths,
                      'sveltekit_markers': raw.count('sveltekit'),
                      'access_notice_markers': [v for v in ('challenge-platform', 'just a moment', 'access denied',
                                                          'verify you are human', 'enable javascript and cookies') if v in raw.lower()]}
            try:
                result.update(status='ok', payload_count=len(base.pred_payloads(raw)))
            except ValueError as error:
                result.update(status='failed', error=str(error))
        except Exception as error:
            result = {'status': 'failed', 'error': str(error)}
    result['checked_at'] = base.iso(base.now_utc())
    write_json(folder / 'pred-diagnostic.json', result)
    base.log('Pred.gg diagnostic: ' + json.dumps(result, ensure_ascii=False))
    return result


def optional_pred_only(attempt, bundle):
    """Nonfatal missing optional source, never a claim of complete/fresh Pred data."""
    errors = attempt.get('errors', [])
    return bool(CONFIG.get('pred_optional') and attempt.get('status') == 'partial'
                and bundle and base.bundle_has_fresh_statz(bundle) and errors
                and all(re.fullmatch(r'Pred\.gg(?: .*|)', e.get('source', '')) for e in errors))


def attempt_satisfied(attempt, bundle):
    return attempt.get('status') == 'ok' or optional_pred_only(attempt, bundle)


def required_source_block(attempt):
    return any(re.search(r'403|429|blocked|rate.limit', e.get('detail', ''), re.I)
               and not (CONFIG.get('pred_optional') and re.fullmatch(r'Pred\.gg(?: .*|)', e.get('source', '')))
               for e in attempt.get('errors', []))


def required_source_failure(attempt):
    """Required-source errors only; optional Pred never controls core refresh health."""
    return any(not (CONFIG.get('pred_optional') and re.fullmatch(r'Pred\.gg(?: .*|)', e.get('source', '')))
               for e in attempt.get('errors', []) if e.get('severity') == 'error')


def next_daily_at(now):
    boundary = daily_boundary(now) + dt.timedelta(days=1)
    return base.iso(boundary)


def source_age_state(when, now=None):
    now = now or base.now_utc()
    try:
        hours = (now-utc_time(when)).total_seconds()/3600
        if hours < 0: return {'state': 'Unavailable', 'age_hours': None}
    except (AttributeError, TypeError, ValueError): return {'state': 'Unavailable', 'age_hours': None}
    return {'state': 'Current' if hours <= 30 else 'Aging' if hours <= 48 else 'Stale',
            'age_hours': round(hours, 2)}


def render_site(folder, out, state):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    now = base.now_utc()
    manifest = {'schema': 2, 'published_at': base.iso(now),
                'default_bracket': CONFIG['default_bracket'],
                'schedule': {'daily_utc': CONFIG['daily_utc'], 'patch_check_hours': CONFIG['patch_check_hours']},
                'patch_check': state.get('patch_check', {}), 'cohorts': {},
                'last_verified_patch_check': state.get('last_verified_patch_check'),
                'last_full_attempt_at': state.get('last_full_attempt_at'),
                'next_expected_attempt_at': (state.get('required_retry') or {}).get('next_at') or next_daily_at(now),
                'run_id': os.environ.get('GITHUB_RUN_ID'),
                'run_attempt': os.environ.get('GITHUB_RUN_ATTEMPT'),
                'required_retry': state.get('required_retry', {})}
    manifest['local_collector'] = state.get('local_collector')
    manifest['collection_host'] = 'cloud' if not CONFIG.get('cloud_collection_paused_reason') else 'windows'
    manifest['source_pauses'] = {'pred': CONFIG['pred_collection_paused_reason']} if CONFIG.get('pred_collection_paused_reason') else {}
    manifest['optional_sources'] = {'pred': {'mode': 'public_pages_only',
        'note': 'Pred.gg is optional. Use validated data embedded in public pages when available; no API or account is required. Access denials stop further requests. Other sources continue, and retained Pred.gg data keeps its original date.'}} if CONFIG.get('pred_optional') else {}
    manifest['collection_paused_reason'] = None if state.get('local_collector') else CONFIG.get('cloud_collection_paused_reason')
    for bracket in CONFIG['brackets']:
        bundle = load_publication(folder, bracket)
        attempt = state.get('attempts', {}).get(bracket, {})
        entry = {'label': bracket.capitalize() + '+', 'last_attempt': attempt}
        if bundle:
            reviewed = base.review_saved_sources(bundle)
            if reviewed is not bundle:
                # Store the audited replay once; a guidance release never advances
                # the original collection or source fetch dates.
                bundle = retain_publication(reviewed, folder)
            raw = json.dumps(bundle, ensure_ascii=False, separators=(',', ':')).encode('utf8')
            digest = hashlib.sha256(raw).hexdigest()
            relative = 'bundles/' + bracket + '-' + digest + '.json'
            target = out / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            # Website delivery projection (audit item 11): a compact core and evidence annexes, verified to
            # reproduce this exact bundle. The full bundle above stays published for compatibility and export.
            parts = projection.build(bundle)
            def publish_part(kind, raw):
                part_digest = hashlib.sha256(raw).hexdigest()
                part_path = 'bundles/' + bracket + '-' + kind + '-' + part_digest + '.json'
                (out / part_path).write_bytes(raw)
                return {'url': part_path, 'sha256': part_digest, 'bytes': len(raw)}
            entry['projection'] = {'version': projection.VERSION, 'core': publish_part('core', parts['core']),
                                   'shared': publish_part('shared', parts['shared']),
                                   'heroes': {slug: publish_part('hero-' + slug, raw) for slug, raw in sorted(parts['heroes'].items())}}
            entry.update(url=relative, sha256=digest, generated_at=bundle['generated_at'],
                         patch=bundle.get('official', {}).get('live', {}).get('version'),
                         source_signature=live_signature(bundle.get('official', {})), status='available',
                         collection_status='complete' if base.bundle_is_complete(bundle)[0] else 'partial',
                         source_dates={k: {'status': v.get('status'), 'fetched_at': v.get('fetched_at')}
                                       for k, v in bundle.get('sources', {}).items()})
            entry['collector'] = bundle.get('collector') or {'host': 'unrecorded', 'note': 'Collected before provenance was recorded (2.24.0 or earlier).'}
            statz = bundle.get('sources', {}).get('statz_hero_pages', {})
            core = source_age_state(statz.get('fetched_at'), now)
            coverage = statz.get('coverage') if isinstance(statz.get('coverage'), dict) else {}
            gaps = bool(coverage.get('usable') and coverage.get('failed'))
            core.update(updated_at=statz.get('fetched_at'), source='Statz hero pages',
                        status='available' if statz.get('status') in ('ok','retained') or gaps else 'unavailable')
            if gaps:
                # Fresh statistics with named gaps: the failed roles are listed, never filled in.
                core['coverage'] = {key: coverage.get(key) for key in ('requested', 'ok', 'failed')}
                entry['failed_roles'] = [{'slug': page.get('slug'), 'role': page.get('role')}
                                         for page in bundle.get('failed_pages') or []]
            if core['status'] == 'unavailable': core['state'] = 'Unavailable'
            core['retained'] = statz.get('status') == 'retained'
            entry['health'] = {'core_statistics': core,
                'mechanics': {'status': bundle.get('sources', {}).get('omeda_heroes', {}).get('status', 'unavailable'),
                              'updated_at': bundle.get('sources', {}).get('omeda_heroes', {}).get('fetched_at')},
                'guidance': {'status': bundle.get('guidance', {}).get('status', 'needs review'),
                             'reviewed_at': bundle.get('guidance', {}).get('reviewed_at'),
                             'next_review_at': bundle.get('guidance', {}).get('maintenance_review', {}).get('next_weekly_review')},
                'optional_pred': {'status': bundle.get('sources', {}).get('pred_scoped', {}).get('status', 'unavailable'),
                                  'updated_at': bundle.get('sources', {}).get('pred_scoped', {}).get('fetched_at')}}
        else:
            entry['status'] = 'unavailable'
        manifest['cohorts'][bracket] = entry
    # A failed first collection must never deploy an empty replacement over a working site.
    available = any(c['status'] == 'available' for c in manifest['cohorts'].values())
    default_entry = manifest['cohorts'].get(CONFIG['default_bracket'], {})
    manifest['health'] = dict(default_entry.get('health', {}),
        live_patch={'status': manifest['patch_check'].get('status'), 'version': manifest['patch_check'].get('version'),
                    'checked_at': manifest['patch_check'].get('checked_at')},
        last_attempt_at=state.get('last_full_attempt_at'), next_expected_attempt_at=manifest['next_expected_attempt_at'])
    output_flag('publishable', available)
    if not available:
        return manifest
    config = {'mode': 'static', 'tool_version': base.VERSION, 'manifest': 'manifest.json'}
    html = base.render_html(None, config)
    marker = '// START CLIENT'
    if html.count(marker) != 1:
        raise ValueError('UI startup marker changed; static adapter needs review')
    adapters = '\n'.join((ROOT / name).read_text(encoding='utf8') for name in ('rank_view.js', 'projection_client.js', 'static_client.js'))
    html = html.replace(marker, adapters + '\n' + marker, 1)
    (out / 'index.html').write_text(html, encoding='utf8')
    (out / '.nojekyll').write_text('', encoding='utf8')
    for name in ('app.webmanifest', 'sw.js'):
        (out / name).write_bytes((ROOT / name).read_bytes())
    icons = out / 'assets'; icons.mkdir(exist_ok=True)
    for name in ('app-icon-192.png', 'app-icon-512.png'):
        (icons / name).write_bytes((ROOT / 'assets' / name).read_bytes())
    write_json(out / 'manifest.json', manifest)
    return manifest


def run(folder, out, *, manual=False, preview_seeds=(), check_only=False):
    folder = Path(folder).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    state = read_json(folder / 'publication.json', {'schema': 1, 'attempts': {}})
    configure_collector(folder / 'collector')
    if preview_seeds:
        for path in preview_seeds:
            # The same validation as production: a complete seed, or a validated independent update.
            clean = retain_publication(base.load_bundle(Path(path)), folder)
            if clean['bracket']['segment'] == CONFIG['default_bracket']:
                state['patch_check'] = patch_summary(clean.get('official', {}))
        # A seed is a dated preview, never a claim that a source was checked now.
        state['preview'] = True
        write_json(folder / 'publication.json', state)
        return render_site(folder, out, state)
    started = time.perf_counter()
    original_fetch, original_official = base.http_get, base.fetch_official
    base.http_get = RunFetchCache(original_fetch)
    try:
        base.log('Checking official release notes and embedded hotfixes before deciding on a full collection…')
        try:
            official = original_official()
        except Exception as error:
            official = {'status': 'failed', 'checked_at': base.iso(base.now_utc()), 'error': str(error)}
        previous_signature = state.get('patch_check', {}).get('signature') or state.get('last_attempted_signature')
        signature = live_signature(official)
        if previous_signature and signature and previous_signature != signature:
            state['patch_transition_at'] = base.iso(base.now_utc())
        state['patch_check'] = patch_summary(official)
        if signature:
            state['last_verified_patch_check'] = copy.deepcopy(state['patch_check'])
        now = base.now_utc()
        paused = CONFIG.get('cloud_collection_paused_reason')
        output_flag('collection_paused', bool(paused and not state.get('local_collector')))
        reason = None if check_only or paused else collection_reason(state, official, now, manual)
        release = os.environ.get('COLLECTION_RELEASE')
        if release and not check_only and not paused and state.get('collection_release') != release:
            reason = 'Release cloud verification'
        day = now.astimezone(UTC).date().isoformat()
        output_flag('maintenance_record', state.get('maintenance_day') != day)
        state['maintenance_day'] = day
        if reason:
            if release: state['collection_release'] = release
            changed_patch = live_signature(official) != state.get('last_attempted_signature')
            prior_retry_count = int((state.get('required_retry') or {}).get('attempts', 0))
            retry_count = prior_retry_count + 1 if reason == 'Automatic required-source retry' else 0
            state['last_full_attempt_at'] = base.iso(now)
            state['last_attempted_signature'] = live_signature(official)
            state['blocked_in_last_full'] = False
            state['required_retry'] = {'pending': True, 'blocked': False, 'attempts': retry_count,
                'next_at': base.iso(now + dt.timedelta(hours=CONFIG.get('required_retry_hours', 3)))}
            # Checkpoint before any slow work. A crash cannot cause a retry storm.
            for bracket in CONFIG['brackets']:
                state['attempts'][bracket] = {'at': base.iso(now), 'status': 'interrupted',
                    'reason': reason, 'errors': [{'source': 'Daily collection', 'severity': 'error',
                    'detail': 'This collection did not finish. The last successful data is retained.'}]}
            write_json(folder / 'publication.json', state)
            base.fetch_official = lambda **kwargs: copy.deepcopy(official)
            for bracket in CONFIG['brackets']:
                attempt = state['attempts'][bracket]
                try:
                    previous = load_publication(folder, bracket)
                    if previous:
                        name = 'last_successful_' if base.bundle_is_complete(previous)[0] else 'last_available_'
                        base.save_bundle(previous, base.DATA_DIR / (name + bracket + '.json'))
                    bundle = base.collect_bundle(dict(base.DEFAULT_SETTINGS, bracket=bracket, open_browser=False,
                                                       pred_collection_paused_reason=CONFIG.get('pred_collection_paused_reason'),
                                                       force_history_refresh=changed_patch or manual),
                                                 lambda message: base.log(bracket + ': ' + message))
                    bundle['collector'] = collector_identity()
                    # Retained partitions keep their original dates; name who collected each one (recorded when it was
                    # retained), not only who assembled this bundle.
                    sources, kept = bundle.get('sources') or {}, bundle.get('retained_sources') or {}
                    origin = {name: (kept.get(name) or {}).get('collector') or 'unrecorded'
                              for name, keys in (('statz', ('statz_tierlist', 'statz_hero_pages')), ('pred', ('pred_scoped', 'pred_game_data')))
                              if any((sources.get(k) or {}).get('status') == 'retained' for k in keys)}
                    if origin:
                        bundle['collector']['retained_from'] = {k: (v if v in COLLECTOR_HOSTS else 'unrecorded') for k, v in origin.items()}
                    complete, why = base.bundle_is_complete(bundle)
                    pages = (bundle.get('sources') or {}).get('statz_hero_pages') or {}
                    if not complete and pages.get('failed') and not any(e.get('severity') == 'error' and str(e.get('source', '')).startswith('statz.gg hero pages') for e in bundle.get('errors', [])):
                        # A tolerated gap is still a required-source failure: it is named, retried and reported the
                        # same way whether or not Pred.gg is also unavailable, while the collected roles publish.
                        bundle.setdefault('errors', []).append({'source': 'statz.gg hero pages', 'severity': 'error',
                            'detail': '%d of %d hero/role pages failed. The collected roles were published; the failed roles have no hero-page statistics until a later collection succeeds.' % (pages['failed'], pages.get('requested') or 0)})
                    if not complete and not any(e.get('severity') == 'error' for e in bundle.get('errors', [])):
                        # A small Statz gap may have only per-page warnings. Name
                        # the structural failure before persisting valid Pred data.
                        bundle.setdefault('errors', []).append({'source': 'Collection validation',
                            'severity': 'error', 'detail': why})
                    attempt.update(at=base.iso(base.now_utc()), status='ok' if complete else 'failed',
                                   seconds=bundle.get('timings', {}).get('cold_refresh_secs'),
                                   errors=[e for e in bundle.get('errors', []) if e.get('severity') == 'error'])
                    if complete:
                        retain_success(bundle, folder)
                        base.save_bundle(public_bundle(bundle), base.DATA_DIR / ('last_successful_' + bracket + '.json'))
                    elif base.bundle_is_publishable(bundle):
                        retain_publication(bundle, folder)
                        base.save_bundle(public_bundle(bundle), base.DATA_DIR / ('last_available_' + bracket + '.json'), False)
                        attempt['status'] = 'partial'
                    elif not attempt['errors']:
                        attempt['errors'] = [{'source': 'Collection validation', 'severity': 'error', 'detail': why}]
                except Exception as error:
                    attempt.update(status='failed', errors=[{'source': 'Collection: ' + bracket,
                                   'severity': 'error', 'detail': str(error)}])
                state['blocked_in_last_full'] = state['blocked_in_last_full'] or required_source_block(attempt)
                write_json(folder / 'publication.json', state)
            state['last_full_seconds'] = round(time.perf_counter() - started, 2)
            state['blocked_in_last_full'] = any(required_source_block(a) for a in state['attempts'].values())
            required_failed = any(required_source_failure(a) for a in state['attempts'].values())
            retry_limit = int(CONFIG.get('required_retry_limit', 2))
            retry_pending = required_failed and not state['blocked_in_last_full'] and retry_count < retry_limit
            state['required_retry'] = {'pending': retry_pending, 'blocked': state['blocked_in_last_full'],
                'attempts': retry_count, 'limit': retry_limit,
                'next_at': base.iso(now + dt.timedelta(hours=CONFIG.get('required_retry_hours', 3))) if retry_pending else None,
                'reason': 'A required source failed transiently; successful dated data remains published.' if retry_pending else
                          'A required source blocked collection; wait for the next daily window.' if state['blocked_in_last_full'] else None}
            if all(attempt_satisfied(state['attempts'].get(k, {}), load_publication(folder, k)) for k in CONFIG['brackets']):
                state['last_completed_signature'] = signature
                state['required_retry'] = {'pending': False, 'blocked': False, 'attempts': retry_count,
                                           'limit': retry_limit, 'next_at': None, 'reason': None}
            output_flag('full_attempt', True)
        else:
            base.log('Statistics collection paused: ' + paused if paused else
                     'Official-only maintenance check; no statistics requested.' if check_only else
                     'No daily update due and no changed live patch. Retaining the original sample dates.')
        write_json(folder / 'publication.json', state)
        report = publication_report(state)
        write_json(folder / 'publication-report.json', report)
        base.log('Publication diagnostic: ' + json.dumps(report, ensure_ascii=False))
        manifest = render_site(folder, out, state)
        failed = official.get('status') != 'verified' or ((not paused or bool(state.get('local_collector'))) and any(
            not attempt_satisfied(a, load_publication(folder, k)) for k, a in state.get('attempts', {}).items()))
        optional_missing = [k for k, a in state.get('attempts', {}).items() if optional_pred_only(a, load_publication(folder, k))]
        if optional_missing:
            base.log('Optional Pred.gg unavailable for '+', '.join(optional_missing)+'. Required sources validated; source gaps and original dates remain visible.')
        output_flag('source_failed', failed)
        base.log(json.dumps({'full_collection_reason': reason, 'seconds': round(time.perf_counter()-started, 2),
                             'available_cohorts': [k for k, v in manifest['cohorts'].items() if v['status']=='available'],
                             'source_failed': failed}))
        return manifest
    finally:
        base.http_get, base.fetch_official = original_fetch, original_official


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-dir', type=Path, default=ROOT / '.cloud-state')
    parser.add_argument('--output', type=Path, default=ROOT / '_site')
    parser.add_argument('--manual', action='store_true')
    parser.add_argument('--diagnose-pred', action='store_true', help='Maintenance: inspect one public Pred.gg response without collecting statistics')
    parser.add_argument('--check-only', action='store_true', help='Developer/maintenance check of official notes without statistical collection')
    parser.add_argument('--preview-seed', type=Path, action='append', default=[])
    parser.add_argument('--import-public-seed', type=Path, action='append', default=[])
    args = parser.parse_args()
    if args.diagnose_pred:
        if args.manual or args.check_only or args.preview_seed:
            parser.error('--diagnose-pred cannot be combined with collection or preview flags')
        diagnose_pred(args.state_dir)
        return 0
    if args.manual and args.check_only: parser.error('--manual and --check-only cannot be combined')
    for path in args.import_public_seed:
        import_public_seed(path, args.state_dir)
    result = run(args.state_dir, args.output, manual=args.manual, preview_seeds=args.preview_seed, check_only=args.check_only)
    return 0 if any(c['status']=='available' for c in result['cohorts'].values()) else 1


if __name__ == '__main__':
    raise SystemExit(main())
