"""Delivery projection for the website (audit item 11).

A published bundle is split into a compact core (everything the engine and the main screens read) and evidence
annexes (display-only evidence, loaded when a hero page or an audit view needs it). The split is lossless:
merge(core, annexes) reproduces the full bundle exactly, key order included, and the publisher refuses to publish
otherwise. The engine only ever sees the core, and a field leaves the core only when no engine code reads it, or
when the engine provably cannot read it for this bundle (see ``split``). Fields that are not listed here, including
fields added later, stay in the core.

Encoding: an array of three or more objects with identical keys in the same order is written as
``{"$c": [keys], "$r": [[values], ...]}`` (columnar). ``decode`` restores identical objects.
Annexes are overlays: a dict mirrors the bundle's structure, ``"$order"`` records a dict's original key order when
keys were moved out of it, and ``"$items"`` addresses list elements by index.
"""
import copy, json, re

VERSION = 1
TIER3 = ('firstTier3', 'secondTier3', 'thirdTier3', 'fourthTier3', 'fifthTier3', 'sixthTier3')
# Per hero, display-only (kit tab, hero Builds and Counters tabs) or read by no page code at all.
HERO_FIELDS = ('statz_abilities', '_teammates_raw', 'tag_evidence', 'lane_previews', 'previous_abilities', 'pred_attributes')
ABILITY_FIELDS = ('pred_raw', 'pred_source')
ROLE_FIELDS = ('matchups',)   # on each hero's per-role statistics; read by no page code
# Shared, display-only (Sources, library and audit views) or read by no page code at all.
SHARED_PATHS = (('pred_game_data', 'assets'), ('pred_game_data', 'items_catalog'), ('pred_game_data', 'eternals_catalog'),
                ('pred_game_data', 'heroes'), ('pred_game_data', 'field_protections'), ('pred_game_data', 'records'),
                ('official', 'definition_history'), ('official', 'publisher_news'),
                ('image_index',), ('omeda_items',), ('unverified_changes',), ('scoped_changes',))
CATALOG_FIELDS = ('pred_raw', 'previous_source')   # on each item and perk
RESERVED = ('$c', '$r', '$order', '$items')
SLUG = re.compile(r'^[a-z0-9-]+$')   # what the page and the service worker accept in an evidence file name


def encode(value):
    if isinstance(value, list):
        if len(value) >= 3 and all(isinstance(x, dict) for x in value):
            keys = list(value[0].keys())
            if keys and all(list(x.keys()) == keys for x in value):
                return {'$c': keys, '$r': [[encode(x[k]) for k in keys] for x in value]}
        return [encode(x) for x in value]
    if isinstance(value, dict):
        return {k: encode(v) for k, v in value.items()}
    return value


def decode(value):
    if isinstance(value, dict):
        if set(value) == {'$c', '$r'}:
            return [dict(zip(value['$c'], (decode(x) for x in row))) for row in value['$r']]
        return {k: decode(v) for k, v in value.items()}
    if isinstance(value, list):
        return [decode(x) for x in value]
    return value


def _check_reserved(value, path='bundle'):
    if isinstance(value, dict):
        for k, v in value.items():
            if k in RESERVED:
                raise ValueError('Bundle uses a reserved projection key at ' + path + '.' + k)
            _check_reserved(v, path + '.' + str(k))
    elif isinstance(value, list):
        for i, v in enumerate(value):
            _check_reserved(v, path + '[' + str(i) + ']')


def _js_truthy(value):
    """JavaScript truthiness, which is what the engine tests (an empty dict or list is truthy there)."""
    return not (value is None or value is False or value == '' or (isinstance(value, (int, float)) and not isinstance(value, bool) and value == 0))


def _move(source, key, overlay):
    """Move source[key] into overlay[key], remembering source's original key order once."""
    overlay.setdefault('$order', list(source.keys()))
    overlay[key] = source.pop(key)


def split(bundle):
    """Return (core, heroes, shared): the core bundle and the annex overlays (per hero slug, and shared)."""
    _check_reserved(bundle)
    core = copy.deepcopy(bundle)
    heroes, shared = {}, {}
    hero_overlay = lambda slug: heroes.setdefault(slug, {})
    for slug, hero in (core.get('heroes') or {}).items():
        if not isinstance(hero, dict):
            continue
        over = None
        for field in HERO_FIELDS:
            if field in hero:
                over = over or hero_overlay(slug).setdefault('heroes', {}).setdefault(slug, {})
                _move(hero, field, over)
        abilities = hero.get('abilities')
        if isinstance(abilities, list):
            for index, ability in enumerate(abilities):
                if isinstance(ability, dict) and any(f in ability for f in ABILITY_FIELDS):
                    over = over or hero_overlay(slug).setdefault('heroes', {}).setdefault(slug, {})
                    part = over.setdefault('abilities', {'$items': {}})['$items'].setdefault(str(index), {})
                    for field in ABILITY_FIELDS:
                        if field in ability: _move(ability, field, part)
        for role, data in (hero.get('roles') or {}).items():
            for field in ROLE_FIELDS:
                if isinstance(data, dict) and field in data:
                    over = over or hero_overlay(slug).setdefault('heroes', {}).setdefault(slug, {})
                    _move(data, field, over.setdefault('roles', {}).setdefault(role, {}))
    scoped_ok = (core.get('scoped_statistics') or {}).get('status') == 'ok'
    for slug, roles in ((core.get('pred_game_data') or {}).get('role_data') or {}).items():
        if not isinstance(roles, dict):
            continue
        for role, data in roles.items():
            if not isinstance(data, dict):
                continue
            target = lambda: hero_overlay(slug).setdefault('pred_game_data', {}).setdefault('role_data', {}).setdefault(slug, {}).setdefault(role, {})
            if 'overview' in data:
                _move(data, 'overview', target())
            tables = (data.get('items') or {}).get('tables') if isinstance(data.get('items'), dict) else None
            if isinstance(tables, dict):
                # engine currentItemPool reads only the six Tier 3 tables, and only when scoped_statistics.status is 'ok'.
                for key in [k for k in tables if k not in TIER3 or not scoped_ok]:
                    _move(tables, key, target().setdefault('items', {}).setdefault('tables', {}))
            counters = (data.get('counters') or {}).get('tables') if isinstance(data.get('counters'), dict) else None
            if isinstance(counters, dict):
                # engine matchup reads only tables.counters, and only its rows when cohort_verified is truthy (JavaScript).
                for key in [k for k in counters if k != 'counters' or not (isinstance(counters[k], dict) and _js_truthy(counters[k].get('cohort_verified')))]:
                    _move(counters, key, target().setdefault('counters', {}).setdefault('tables', {}))
    for path in SHARED_PATHS:
        node, over = core, shared
        for key in path[:-1]:
            if not isinstance(node.get(key), dict):
                node = None
                break
            node, over = node[key], over.setdefault(key, {})
        if isinstance(node, dict) and path[-1] in node:
            _move(node, path[-1], over)
    for section in ('items', 'perks'):
        for key, entry in (core.get(section) or {}).items():
            if isinstance(entry, dict) and any(f in entry for f in CATALOG_FIELDS):
                part = shared.setdefault(section, {}).setdefault(key, {})
                for field in CATALOG_FIELDS:
                    if field in entry: _move(entry, field, part)
    return core, heroes, shared


def _merge(target, overlay):
    order = overlay.get('$order')
    for key, value in overlay.items():
        if key == '$order':
            continue
        if isinstance(value, dict) and '$items' in value and isinstance(target.get(key), list):
            for index, part in value['$items'].items():
                _merge(target[key][int(index)], part)
        elif isinstance(value, dict) and isinstance(target.get(key), dict) and key in target:
            _merge(target[key], value)
        else:
            target[key] = value
    if order:
        rest = [k for k in target if k not in order]
        reordered = {k: target[k] for k in order if k in target}
        reordered.update((k, target[k]) for k in rest)
        target.clear(); target.update(reordered)


def merge(core, *overlays):
    """Apply annex overlays to a copy of the core; with every annex this reproduces the full bundle."""
    full = copy.deepcopy(core)
    for overlay in overlays:
        _merge(full, overlay)
    return full


def dumps(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf8')


def build(bundle):
    """Split, encode and verify. Returns {'core': bytes, 'shared': bytes, 'heroes': {slug: bytes}}."""
    core, heroes, shared = split(bundle)
    bad = sorted(slug for slug in heroes if not SLUG.fullmatch(str(slug)))
    if bad:
        raise ValueError('Hero keys cannot name evidence files: ' + ', '.join(map(repr, bad[:5])))
    parts = {'core': dumps(encode(core)), 'shared': dumps(encode(shared)), 'heroes': {slug: dumps(encode(v)) for slug, v in heroes.items()}}
    rebuilt = merge(decode(json.loads(parts['core'])), decode(json.loads(parts['shared'])),
                    *(decode(json.loads(raw)) for raw in parts['heroes'].values()))
    if dumps(rebuilt) != dumps(bundle):
        raise ValueError('Projection does not reproduce the full bundle; refusing to publish it')
    return parts
