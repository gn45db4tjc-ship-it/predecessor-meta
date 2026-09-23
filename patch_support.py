"""Dated official additions and guarded mechanics corrections, independent of statistics.

This is a reviewed release artifact, not an automatic interpretation of patch notes.
Unchanged article fingerprints are required to apply its corrections or advice.
"""
import copy
import hashlib
import json
import re
from pathlib import Path

PATH = Path(__file__).with_name('patch-1.17.json')
PROTECTED = {'winRate', 'pickRate', 'banRate', 'playedGames', 'wonGames', 'hero_wide', 'roles', 'source_stats'}


def load():
    return json.loads(PATH.read_text(encoding='utf8'))


def current(bundle, data):
    official = bundle.get('official', {})
    articles = [a for a in official.get('articles', []) if a.get('status') != 'announced']
    expected = data['article_fingerprints']
    return (official.get('status') == 'verified' and official.get('live', {}).get('version') == data['patch']
            and bool(articles) and all(a.get('status') == 'live' and expected.get(a.get('version')) == a.get('fingerprint') for a in articles)
            and all(any(a.get('version') == v and a.get('fingerprint') == h for a in articles) for v, h in expected.items()))


def prepare(bundle, data=None):
    """Retain a dated official identity when statistical sources lack the new hero."""
    data = data or load()
    version = bundle.get('official', {}).get('live', {}).get('version', '')
    if bundle.get('official', {}).get('status') != 'verified' or not re.fullmatch(r'\d+\.\d+(?:\.\d+)?', version) or tuple(map(int, version.split('.'))) < (1, 17):
        return
    for slug, entry in data['heroes'].items():
        if slug not in bundle.setdefault('heroes', {}):
            bundle['heroes'][slug] = copy.deepcopy(entry)
        # Never overwrite a newly available statistical source's kit or role sample.
        bundle['heroes'][slug]['patch_context'] = copy.deepcopy(data['hero_context'][slug])
    for key, entry in data['perks'].items():
        bundle.setdefault('perks', {}).setdefault(key, copy.deepcopy(entry))


def apply(bundle, packet, validate, clean, capabilities):
    data = load()
    if 'valmont' not in bundle.get('heroes', {}):
        return
    active = current(bundle, data)
    receipts = []
    if active:
        for rule in data['corrections']:
            path = rule['path']
            # Statistics, collection timestamps and raw source values are immutable.
            allowed = ((len(path) == 5 and path[0] == 'heroes' and path[2] == 'abilities' and isinstance(path[3], int) and path[4] in ('menu_description', 'cooldown', 'cost'))
                       or (len(path) == 3 and path[0] == 'perks' and path[2] == 'description')
                       or (path[0] == 'items' and ((len(path) == 3 and path[2] == 'total_price') or (len(path) == 4 and path[2] == 'stats') or (len(path) == 5 and path[2] == 'effects' and path[4] in ('text', 'cooldown')))))
            if not allowed or any(k in PROTECTED for k in path):
                raise ValueError('Official patch correction attempted to change a protected field')
            receipt = {k: copy.deepcopy(rule[k]) for k in ('id', 'path', 'patch', 'source', 'before', 'after')}
            try:
                parent = bundle
                for key in path[:-1]: parent = parent[key]
                value = parent[path[-1]]
                receipt['original'] = copy.deepcopy(value)
                if value == rule['after']:
                    receipt['status'] = 'source already updated'
                elif value == rule['before'] or value in rule.get('accepted_before', []):
                    receipt['status'] = 'official correction applied'
                    parent[path[-1]] = copy.deepcopy(rule['after'])
                else:
                    receipt['status'] = 'conflict: unexpected source value'
            except (KeyError, IndexError, TypeError):
                receipt['status'] = 'conflict: source field missing'
            receipts.append(receipt)
        # One audit row per correction; repeat replay cannot erase the original receipt.
        existing = {r.get('id'): r for r in bundle.get('corrections', [])}
        for row in receipts:
            old = existing.get(row['id'])
            if old and old.get('after') == row['after'] and row['status'] == 'source already updated': row = old
            existing[row['id']] = row
        bundle['corrections'] = list(existing.values())
    for slug, context in data['hero_context'].items():
        hero = bundle.get('heroes', {}).get(slug)
        if not hero: continue
        hero['patch_context'] = {**copy.deepcopy(context), 'active': active}
    for hero in bundle.get('heroes', {}).values():
        for ability in hero.get('abilities', []):
            ability['text'] = clean(ability.get('menu_description') or ability.get('text') or ability.get('game_description'))
        hero['capabilities'], hero['capability_evidence'] = capabilities(hero)
    g = bundle.setdefault('guidance', {})
    build_pass = g.get('build_patch_review')
    if build_pass and build_pass.get('patch') == data['patch']:
        build_pass.setdefault('loadout_definitions', {}).update(copy.deepcopy(data['definitions']))
        # Validate the new plan through the normal build validator, separately from
        # the historical 54-hero strategic review, whose date and coverage remain intact.
        supplement = {'patch': data['patch'], 'reviewed_at': data['reviewed_at'], 'article_fingerprints': data['article_fingerprints'],
                      'loadout_catalog': packet['loadout_catalog'], 'guidance': {'builds': data['plans'], 'build_patch_review': copy.deepcopy(build_pass)}}
        supplement['guidance']['build_patch_review']['summary'] = {'changed': len(data['plans']), 'checked and retained': 0, 'unresolved': 0}
        validate(supplement, bundle)
        for plan in data['plans']:
            g['builds'] = [p for p in g.get('builds', []) if (p['slug'], p['role']) != (plan['slug'], plan['role'])] + [copy.deepcopy(plan)]
        build_pass['summary'] = {k: sum(p.get('patch_review', {}).get('result') == k for p in g['builds']) for k in ('changed', 'checked and retained', 'unresolved')}
    conflicts = [r['id'] for r in receipts if r['status'].startswith('conflict')]
    bundle['patch_support'] = {'patch': data['patch'], 'reviewed_at': data['reviewed_at'], 'source': data['source'],
                             'sha256': hashlib.sha256(PATH.read_bytes()).hexdigest(), 'active': active,
                             'status': 'Official patch additions checked' if active else 'Dated additions; live patch or article changed',
                             'coverage': copy.deepcopy(data['coverage']), 'conflicts': conflicts,
                             'limitations': data['limitations']}
    if conflicts:
        row = {'source': 'Official 1.17 mechanics reconciliation', 'severity': 'warning',
               'detail': 'Unmatched source fields: ' + ', '.join(conflicts) + '. Official notes remain visible; affected build preconditions prevent automatic endorsement.'}
        if row not in bundle.setdefault('errors', []): bundle['errors'].append(row)
