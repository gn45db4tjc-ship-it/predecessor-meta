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

Live re-check (three small requests, no key):  python -B pred_api.py --validate
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

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


def page_fetch(url, *, token=None, post=None):
    """Drop-in for http_get on the collector's Pred.gg hero URLs: (page_html, status, seconds).

    The API data is wrapped exactly like the page's embedded response, so pred_payloads and every existing check
    downstream apply unchanged. Other Pred.gg pages (hero detail, items, Eternals) are not covered yet.
    """
    started = time.perf_counter()
    token = token if token is not None else token_from_environment()
    if url == PRED_BASE + '/heroes':
        data = graphql(CATALOG_QUERY, token=token, post=post)
    else:
        data = graphql(STATS_QUERY, stats_variables(url), token=token, post=post)
    embedded = json.dumps({'status': 200, 'statusText': 'OK', 'headers': {}, 'body': json.dumps({'data': data})})
    # pred_payloads reads the script body as JSON without unescaping, so only a closing tag is neutralised ("<\/" is valid JSON).
    page = '<script type="application/json" data-sveltekit-fetched data-url="/gql">' + embedded.replace('</', '<\\/') + '</script>'
    return page, 200, round(time.perf_counter() - started, 3)


def validate_live():
    """Three anonymous requests: the catalog answers, statistics are refused for authorization only, and a misspelt
    field is rejected by name (proof that the statistics query itself is valid)."""
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


if __name__ == '__main__':
    if sys.argv[1:] == ['--validate']:
        validate_live()
    else:
        print(__doc__)
