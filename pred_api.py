"""Pred.gg GraphQL API client, prepared ahead of API access (26 Sep 2026). NOT wired into collection yet.

Why: the website's Pred.gg sample currently comes only from the Windows collector, which reads Pred.gg's public pages.
The cloud collector cannot, so the reviewed tiers depend on Will's PC being on. Will has asked Pred.gg (Omeda City
Discord) for a registered API application and permission to show its statistics publicly. Until Pred.gg answers,
this module is groundwork only.

What is known (checked against https://pred.gg/gql without a key):
  - The catalog query below answers anonymously and returns the same data the /heroes page embeds (heroes, the
    NewestVersion alias, versions, items, ratings with ranks, Eternal categories).
  - The statistics query below is well formed (a misspelt field is rejected by name), and every statistic field is
    refused with "Forbidden": statistics need an authorized application.
  - Applications are OAuth-style (clientId, clientSecret, confidential, scopes); Mutation.authorize(clientId, scope,
    consent) returns a token. How a confidential server client obtains and sends its token is NOT confirmed. The
    bearer header used here is an assumption to replace with Pred.gg's instructions.

Design: page_fetch() answers the exact URLs the collector already requests (PRED_BASE + '/heroes' and
pred_stats_url(cohort, role)) with the API's result wrapped as the page's embedded response, so pred_payloads,
pred_catalog, pred_cohort and pred_parse_stats run unchanged and keep all their checks (cohort echo, hero join,
counts). Wiring later is one argument: attach_scoped_statistics(bundle, fetch=pred_api.page_fetch).

Live re-check (nine small requests, no key):  python -B pred_api.py --validate
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API_URL = 'https://pred.gg/gql'
PRED_BASE = 'https://pred.gg'
USER_AGENT = 'PredecessorMetaTool (free non-commercial planning site; https://github.com/gn45db4tjc-ship-it/predecessor-meta)'
TOKEN_ENV = 'PRED_API_TOKEN'

# Mirrors the fields of the catalog response embedded in https://pred.gg/heroes.
CATALOG_QUERY = """query PredMetaCatalog {
  heroes { id name slug data { id name displayName icon altDisplayName classes roles hero { id slug } } }
  NewestVersion: version { id }
  versions { id name patchType releaseDate }
  items { id name slug data { id displayName icon smallIcon rarity } }
  ratings { id group name suffix startTime endTime ranks { id abbreviation divisionIdx icon name ratingMax ratingMin tierIdx tierName } }
  eternalCategories { id name data { id displayName perks { id name displayName } } }
}"""

# Mirrors the statistics response embedded in https://pred.gg/heroes?versions=..&gameMode=..&ranks=..&role=..
# The alias keeps pred_parse_stats unchanged; the echoed filter is what it checks against the requested cohort.
STATS_QUERY = """query PredMetaStats($versions: [ID!], $gameModes: [GameMode!], $ranks: [ID!], $roles: [Role!]) {
  heroes {
    id slug data { id displayName roles }
    currentBalanceStatistic: generalStatistic(filter: {versions: $versions, gameModes: $gameModes, ranks: $ranks, roles: $roles}) {
      filter { versions gameModes ranks roles }
      result { matchesPlayed matchesWon matchesBanned }
    }
  }
}"""


# Per-hero page queries, generated from the responses Pred.gg embeds in its own pages and validated live (see the file's note).
QUERIES = {k: v for k, v in json.loads((Path(__file__).with_name('pred_api_queries.json')).read_text(encoding='utf-8')).items() if not k.startswith('_')}


class PredApiError(ValueError):
    """The API answered with errors other than a missing authorization."""


class PredApiUnauthorized(PredApiError):
    """Statistics were refused ("Forbidden"): no, or an insufficient, application token."""


def token_from_environment(environ=None):
    """The application token, from a GitHub Actions secret or the Windows collector's private state. Never logged."""
    value = (environ if environ is not None else os.environ).get(TOKEN_ENV, '').strip()
    return value or None


def _post(body, headers, timeout=60):
    request = urllib.request.Request(API_URL, data=body, headers=headers, method='POST')
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status, response.read()


def graphql(query, variables=None, *, token=None, post=None):
    """Run one query. Returns its data; any error fails loudly, and "Forbidden" is reported as unauthorized."""
    headers = {'Content-Type': 'application/json', 'User-Agent': USER_AGENT}
    if token:
        headers['Authorization'] = 'Bearer ' + token  # ASSUMPTION: replace with Pred.gg's documented scheme.
    status, raw = (post or _post)(json.dumps({'query': query, 'variables': variables or {}}).encode('utf-8'), headers)
    if status != 200:
        raise PredApiError('Pred.gg API returned HTTP ' + str(status))
    payload = json.loads(raw)
    errors = payload.get('errors') or []
    if errors:
        if all(e.get('message') == 'Forbidden' for e in errors):
            raise PredApiUnauthorized('Pred.gg API: statistics need an authorized application (' + str(len(errors)) + ' fields refused)')
        raise PredApiError('Pred.gg API: ' + str(errors[0].get('message')))
    if not isinstance(payload.get('data'), dict):
        raise PredApiError('Pred.gg API: response has no data')
    return payload['data']


def stats_variables(url):
    """Translate a pred_stats_url() into query variables. Anything else is refused rather than guessed."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme + '://' + parts.netloc != PRED_BASE or parts.path != '/heroes':
        raise ValueError('pred_api: not a Pred.gg hero statistics URL: ' + url)
    query = urllib.parse.parse_qs(parts.query, strict_parsing=True)
    if set(query) - {'versions', 'gameMode', 'ranks', 'role'} or not {'versions', 'gameMode', 'ranks'} <= set(query):
        raise ValueError('pred_api: unexpected statistics filters: ' + url)
    split = lambda key: [v for v in query[key][0].split(',') if v]
    variables = {'versions': split('versions'), 'gameModes': [query['gameMode'][0]], 'ranks': split('ranks'), 'roles': None}
    if 'role' in query: variables['roles'] = [query['role'][0].upper()]
    return variables


HERO_PAGE = re.compile(r'/heroes/([a-z0-9-]+)(/hero|/counters|/items)?')


def route(url):
    """Map a collector URL to (query, variables, hero slug or None). Unknown routes are refused rather than guessed.

    Hero pages use every requested version for observations and the newest one for kit definitions, like pred_cohort.
    """
    parts = urllib.parse.urlsplit(url)
    if parts.scheme + '://' + parts.netloc != PRED_BASE or parts.fragment:
        raise ValueError('pred_api: not a Pred.gg URL: ' + url)
    if parts.path == '/heroes':
        return (CATALOG_QUERY, {}, None) if not parts.query else (STATS_QUERY, stats_variables(url), None)
    query = urllib.parse.parse_qs(parts.query, strict_parsing=True) if parts.query else {}
    if parts.path in ('/items', '/eternals'):
        if set(query) != {'version'}: raise ValueError('pred_api: definitions need exactly one version: ' + url)
        return QUERIES['items' if parts.path == '/items' else 'eternals'], {'definitionVersion': query['version'][0]}, None
    match = HERO_PAGE.fullmatch(parts.path)
    if not match: raise ValueError('pred_api: unsupported Pred.gg page: ' + url)
    slug, page = match.group(1), (match.group(2) or '/overview')[1:]
    stats = stats_variables(PRED_BASE + '/heroes?' + parts.query)
    if (page == 'hero') != (stats['roles'] is None): raise ValueError('pred_api: role filter does not fit this page: ' + url)
    name = {'hero': 'kit', 'overview': 'overview', 'counters': 'counters', 'items': 'hero_items'}[page]
    variables = {'slug': slug, **stats, 'definitionVersion': max(stats['versions'], key=int)}
    used = QUERIES[name].split('{', 1)[0]
    return QUERIES[name], {k: v for k, v in variables.items() if '$' + k + ':' in used}, slug


def _icons(value):
    if isinstance(value, dict):
        for k, v in value.items():
            if k in ('icon', 'smallIcon') and isinstance(v, str) and re.fullmatch(r'[0-9a-f]{8,}', v): yield v
            else: yield from _icons(v)
    elif isinstance(value, list):
        for v in value: yield from _icons(v)


def page_fetch(url, *, token=None, post=None):
    """Drop-in for http_get / PredPages(fetch=...) on the collector's Pred.gg URLs: (page_html, status, seconds).

    The API data is wrapped like the page's embedded response, so pred_payloads and every downstream check apply
    unchanged. The API has no navigation or image markup, so the page also carries the links the collector follows
    (hero routes named by the API's own slugs) and image URLs in Pred.gg's observed '/assets/<icon>_64.webp' form;
    if that naming ever differs, images degrade to names as the site already allows.
    """
    started = time.perf_counter()
    token = token if token is not None else token_from_environment()
    query, variables, slug = route(url)
    data = graphql(query, variables, token=token, post=post)
    embedded = json.dumps({'status': 200, 'statusText': 'OK', 'headers': {}, 'body': json.dumps({'data': data})})
    # pred_payloads reads the script body as JSON without unescaping, so only a closing tag is neutralised ("<\/" is valid JSON).
    page = ['<script type="application/json" data-sveltekit-fetched data-url="/gql">' + embedded.replace('</', '<\\/') + '</script>']
    slugs = [slug] if slug else ([h['slug'] for h in data.get('heroes') or [] if re.fullmatch(r'[a-z0-9-]+', str(h.get('slug')))] if query == CATALOG_QUERY else [])
    for s in slugs:
        page += ['<a href="/heroes/%s%s"></a>' % (s, suffix) for suffix in ('', '/hero', '/counters', '/items')]
    page += ['<img src="%s/assets/%s_64.webp">' % (PRED_BASE, icon) for icon in sorted(set(_icons(data)))]
    return ''.join(page), 200, round(time.perf_counter() - started, 3)


def validate_live():
    """Nine anonymous requests: the catalog answers, statistics are refused for authorization only, a misspelt field
    is rejected by name (proof that the statistics query itself is valid), and each per-hero page query either answers
    (kit, item and Eternal definitions) or is refused for authorization only (builds, items, matchups)."""
    catalog = graphql(CATALOG_QUERY)
    print('catalog ok:', len(catalog['heroes']), 'heroes; newest version', catalog['NewestVersion'])
    variables = {'versions': [catalog['NewestVersion']['id']], 'gameModes': ['RANKED'], 'ranks': None, 'roles': ['JUNGLE']}
    try:
        graphql(STATS_QUERY, variables)
        print('statistics: ANSWERED without a key (unexpected; access rules changed)')
    except PredApiUnauthorized as error:
        print('statistics: refused for authorization only, as expected:', error)
    try:
        graphql(STATS_QUERY.replace('matchesBanned', 'matchesBannedMisspelt'), variables)
    except PredApiUnauthorized:
        print('control: NOT rejected as invalid (validation is not running first; re-check the control)')
    except PredApiError as error:
        print('control: misspelt field rejected by name, as expected:', error)
    # Per-hero pages: definitions answer anonymously; observations are refused for authorization only.
    newest = catalog['NewestVersion']['id']
    cohort = 'versions=' + newest + '&gameMode=RANKED&ranks=' + ','.join(r['id'] for g in catalog['ratings'] for r in g['ranks'][:1])
    for url in ('/heroes/valmont/hero?' + cohort, '/items?version=' + newest, '/eternals?version=' + newest,
                '/heroes/valmont?' + cohort + '&role=MIDLANE', '/heroes/valmont/items?' + cohort + '&role=MIDLANE',
                '/heroes/valmont/counters?' + cohort + '&role=MIDLANE'):
        query, variables, _ = route(PRED_BASE + url)
        try:
            data = graphql(query, variables)
            print(url.split('?')[0] + ': answered (' + str(len(json.dumps(data))) + ' bytes)')
        except PredApiUnauthorized as error:
            print(url.split('?')[0] + ': refused for authorization only:', error)


if __name__ == '__main__':
    if sys.argv[1:] == ['--validate']:
        validate_live()
    else:
        print(__doc__)
