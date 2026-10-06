"""Delivery projection for the website (audit item 11).

A published bundle is split into a compact core, a guide and evidence annexes. The split is lossless:
merge(core, guide, annexes) reproduces the full bundle exactly, key order included, in any merge order, and the
publisher refuses to publish otherwise.
- The core (version 2, 2.38.0) holds what the phone's first screen reads: the Meta list, the rank bar and the
  limitations chip, including every reviewed build's preconditions (buildReview runs for every Meta row).
- The guide holds the rest of what the engine reads: pairs, corrections, official changes, Statz builds, patch
  context, the reviewed strategy and each reviewed build's text. The page fetches it right after the first screen
  and every other screen waits for it (``guideGate`` in ui.js and static_client.js), so no engine answer outside
  the first screen is ever computed without it. tests/projection.test.cjs holds both claims: the first-screen
  answers are equal on the core alone, and every answer is equal on core + guide.
- Evidence annexes hold display-only evidence, or fields no page code reads: one file per hero, and (version 3,
  2.39.0) three shared files split by the view that reads them. ``catalog`` is what an item or loadout dialog reads,
  ``history`` is what Changes, Sources and the reviewed-definition dialog read, and ``shared`` is the rest of the
  source audit.
Fields that are not listed here, including fields added later, stay in the core.

Encoding: an array of three or more objects with identical keys in the same order is written as
``{"$c": [keys], "$r": [[values], ...]}`` (columnar). ``decode`` restores identical objects.
Annexes are overlays: a dict mirrors the bundle's structure, ``"$order"`` records a dict's key order in the original
bundle when keys were moved out of it, and ``"$items"`` addresses list elements by index. Every parent object stays
in the core, so each overlay only adds leaves and the parts can be merged in any order.
"""
import copy, json, re

VERSION = 3
TIER3 = ('firstTier3', 'secondTier3', 'thirdTier3', 'fourthTier3', 'fifthTier3', 'sixthTier3')
# Per hero, display-only (kit tab, hero Builds and Counters tabs) or read by no page code at all.
HERO_FIELDS = ('statz_abilities', '_teammates_raw', 'tag_evidence', 'lane_previews', 'previous_abilities', 'pred_attributes')
ABILITY_FIELDS = ('pred_raw', 'pred_source', 'game_description', 'menu_description')   # the descriptions: no reader
ROLE_FIELDS = ('matchups',)   # on each hero's per-role statistics; read by no page code
# Shared, display-only (Sources, library and audit views) or read by no page code at all.
SHARED_PATHS = (('pred_game_data', 'assets'), ('pred_game_data', 'items_catalog'), ('pred_game_data', 'eternals_catalog'),
                ('pred_game_data', 'heroes'), ('pred_game_data', 'records'),
                ('image_index',), ('omeda_items',), ('unverified_changes',))
# Version 3 (2.39.0): what an item or loadout dialog reads (ui.js predCatalogAudit), so a tap downloads only this.
CATALOG_PATHS = (('pred_game_data', 'field_protections'),)
CATALOG_FIELDS = ('pred_raw', 'previous_source')   # on each item and perk
# Version 3: what Changes, Sources and the reviewed-definition dialog read (publisherNewsHTML, scopedHistoryHTML,
# reviewedDefinitionHTML, definitionReviewAuditHTML).
HISTORY_PATHS = (('official', 'definition_history'), ('official', 'publisher_news'),
                 # 2.53.0: the Pred.gg history's status and movement digest stay in the core for the phone's Meta screen.
                 ('scoped_changes', 'vs_previous_run'), ('scoped_changes', 'vs_previous_patch'), ('scoped_changes', 'current'))
# The overlays after the core, in the order the page usually needs them.
PARTS = ('guide', 'catalog', 'history', 'shared')
# The guide (2.38.0): read by the engine for hero pages, Match, the reviewed guide and desktop views, never by the phone's
# first screen. See the module docstring.
GUIDE_PATHS = (('pairs',), ('corrections',), ('official_changes',), ('patch_support',), ('mechanics_resolutions',),
               ('guidance', 'strategic_review'), ('guidance', 'capability_reviews'), ('guidance', 'sequence_review'),
               ('guidance', 'compositions'))
GUIDE_HERO_FIELDS = ('patch_context', 'general_strong_against', 'general_counters', 'hero_wide', 'hero_wide_url',
                     'hero_wide_fetched_at', 'tags', 'tags_source')
GUIDE_ROLE_FIELDS = ('builds',)        # Statz playstyles on each hero's per-role statistics
GUIDE_ABILITY_FIELDS = ('game_text',)
# What buildReview reads on each reviewed build (the Meta list runs it for every row); the rest of a build is text.
BUILD_CORE_FIELDS = frozenset(('slug', 'role', 'style', 'damage', 'core', 'finish', 'crest', 'augment', 'eternal', 'blessings',
                               'skill_priority', 'patch', 'reviewed_at', 'patch_review', 'source_preconditions', 'auto_recommend',
                               'experimental_role', 'penetration_focus'))
PATCH_REVIEW_GUIDE_FIELDS = ('sources', 'reason', 'alternative', 'reviewer')
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


def _key_orders(value, orders):
    """Remember every object's key order before anything moves, so each overlay can restore the original order."""
    if isinstance(value, dict):
        orders[id(value)] = list(value.keys())
        for v in value.values():
            _key_orders(v, orders)
    elif isinstance(value, list):
        for v in value:
            _key_orders(v, orders)


def _node(overlay, *keys):
    for key in keys:
        overlay = overlay.setdefault(key, {})
    return overlay


def _item(overlay, key, index):
    return overlay.setdefault(key, {'$items': {}})['$items'].setdefault(str(index), {})


def split(bundle):
    """Return (core, heroes, parts): the core bundle, the per-hero overlays and the named overlays in PARTS."""
    _check_reserved(bundle)
    core = copy.deepcopy(bundle)
    orders = {}
    _key_orders(core, orders)

    def move(source, key, overlay):
        """Move source[key] into overlay[key], remembering source's key order in the original bundle once."""
        overlay.setdefault('$order', list(orders.get(id(source), source.keys())))
        overlay[key] = source.pop(key)

    heroes, parts = {}, {name: {} for name in PARTS}
    guide, shared, catalog = parts['guide'], parts['shared'], parts['catalog']
    hero_overlay = lambda slug: heroes.setdefault(slug, {})
    for slug, hero in (core.get('heroes') or {}).items():
        if not isinstance(hero, dict):
            continue
        over = None
        for field in HERO_FIELDS:
            if field in hero:
                over = over or _node(hero_overlay(slug), 'heroes', slug)
                move(hero, field, over)
        for field in GUIDE_HERO_FIELDS:
            if field in hero:
                move(hero, field, _node(guide, 'heroes', slug))
        abilities = hero.get('abilities')
        if isinstance(abilities, list):
            for index, ability in enumerate(abilities):
                if not isinstance(ability, dict):
                    continue
                if any(f in ability for f in ABILITY_FIELDS):
                    over = over or _node(hero_overlay(slug), 'heroes', slug)
                    part = _item(over, 'abilities', index)
                    for field in ABILITY_FIELDS:
                        if field in ability: move(ability, field, part)
                for field in GUIDE_ABILITY_FIELDS:
                    if field in ability:
                        move(ability, field, _item(_node(guide, 'heroes', slug), 'abilities', index))
        for role, data in (hero.get('roles') or {}).items():
            if not isinstance(data, dict):
                continue
            for field in ROLE_FIELDS:
                if field in data:
                    over = over or _node(hero_overlay(slug), 'heroes', slug)
                    move(data, field, _node(over, 'roles', role))
            for field in GUIDE_ROLE_FIELDS:
                if field in data:
                    move(data, field, _node(guide, 'heroes', slug, 'roles', role))
    scoped_ok = (core.get('scoped_statistics') or {}).get('status') == 'ok'
    for slug, roles in ((core.get('pred_game_data') or {}).get('role_data') or {}).items():
        if not isinstance(roles, dict):
            continue
        for role, data in roles.items():
            if not isinstance(data, dict):
                continue
            target = lambda: _node(hero_overlay(slug), 'pred_game_data', 'role_data', slug, role)
            if 'overview' in data:
                move(data, 'overview', target())
            tables = (data.get('items') or {}).get('tables') if isinstance(data.get('items'), dict) else None
            if isinstance(tables, dict):
                # engine currentItemPool reads only the six Tier 3 tables, and only when scoped_statistics.status is 'ok'.
                for key in [k for k in tables if k not in TIER3 or not scoped_ok]:
                    move(tables, key, _node(target(), 'items', 'tables'))
            counters = (data.get('counters') or {}).get('tables') if isinstance(data.get('counters'), dict) else None
            if isinstance(counters, dict):
                # engine matchup reads only tables.counters, and only its rows when cohort_verified is truthy (JavaScript).
                for key in [k for k in counters if k != 'counters' or not (isinstance(counters[k], dict) and _js_truthy(counters[k].get('cohort_verified')))]:
                    move(counters, key, _node(target(), 'counters', 'tables'))
            # What the engine reads here (Tier 3 tables, verified counters, section details) goes to the guide as leaves;
            # the emptied sections stay in the core so every overlay merges into existing objects.
            for key in list(data):
                section = data[key]
                if key in ('items', 'counters') and isinstance(section, dict):
                    for skey in list(section):
                        if skey == 'tables' and isinstance(section['tables'], dict):
                            for tkey in list(section['tables']):
                                move(section['tables'], tkey, _node(guide, 'pred_game_data', 'role_data', slug, role, key, 'tables'))
                        elif skey != 'tables':
                            move(section, skey, _node(guide, 'pred_game_data', 'role_data', slug, role, key))
                else:
                    move(data, key, _node(guide, 'pred_game_data', 'role_data', slug, role))
    for paths, overlay in ((SHARED_PATHS, shared), (CATALOG_PATHS, catalog), (HISTORY_PATHS, parts['history']), (GUIDE_PATHS, guide)):
        for path in paths:
            node, over = core, overlay
            for key in path[:-1]:
                if not isinstance(node.get(key), dict):
                    node = None
                    break
                node, over = node[key], over.setdefault(key, {})
            if isinstance(node, dict) and path[-1] in node:
                move(node, path[-1], over)
    for section in ('items', 'perks'):
        for key, entry in (core.get(section) or {}).items():
            if isinstance(entry, dict) and any(f in entry for f in CATALOG_FIELDS):
                part = _node(catalog, section, key)
                for field in CATALOG_FIELDS:
                    if field in entry: move(entry, field, part)
    # Official article text blocks: no page code reads them (the fingerprints the engine checks stay).
    official = core.get('official')
    if isinstance(official, dict):
        for index, article in enumerate(official.get('articles') or []):
            if isinstance(article, dict) and 'blocks' in article:
                move(article, 'blocks', _item(_node(shared, 'official'), 'articles', index))
        if isinstance(official.get('live'), dict) and 'blocks' in official['live']:
            move(official['live'], 'blocks', _node(shared, 'official', 'live'))
    builds = (core.get('guidance') or {}).get('builds')
    if isinstance(builds, list):
        for index, build in enumerate(builds):
            if not isinstance(build, dict):
                continue
            for key in [k for k in build if k not in BUILD_CORE_FIELDS]:
                move(build, key, _item(_node(guide, 'guidance'), 'builds', index))
            review = build.get('patch_review')
            if isinstance(review, dict):
                for key in PATCH_REVIEW_GUIDE_FIELDS:
                    if key in review:
                        move(review, key, _node(_item(_node(guide, 'guidance'), 'builds', index), 'patch_review'))
    return core, heroes, parts


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
    """Split, encode and verify. Returns {'core': bytes, <each name in PARTS>: bytes, 'heroes': {slug: bytes}}."""
    core, heroes, named = split(bundle)
    bad = sorted(slug for slug in heroes if not SLUG.fullmatch(str(slug)))
    if bad:
        raise ValueError('Hero keys cannot name evidence files: ' + ', '.join(map(repr, bad[:5])))
    parts = {'core': dumps(encode(core)), **{name: dumps(encode(named[name])) for name in PARTS},
             'heroes': {slug: dumps(encode(v)) for slug, v in heroes.items()}}
    overlays = [decode(json.loads(parts[name])) for name in PARTS] + [decode(json.loads(raw)) for raw in parts['heroes'].values()]
    expected = dumps(bundle)
    # The page merges parts in the order it receives them, so the rebuild must hold in either direction.
    for ordered in (overlays, overlays[::-1]):
        if dumps(merge(decode(json.loads(parts['core'])), *ordered)) != expected:
            raise ValueError('Projection does not reproduce the full bundle; refusing to publish it')
    return parts
