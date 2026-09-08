# -*- coding: utf-8 -*-
"""
Predecessor Meta Tool
=====================
Fetches live Predecessor data from statz.gg and omeda.city, computes pairing
synergies, matchups and comp coverage, writes a data bundle (JSON) to disk, and
renders a self-contained HTML page ("Predecessor Meta.html") from that bundle.

Windows + Python 3.10 or newer. Standard library only - nothing to pip install.

Normal use is via "Predecessor Meta Tool.bat". Command line options:
  python predecessor_meta.py                 local app; show dated cache and refresh in the background
  python predecessor_meta.py --refresh       explicit refresh (every normal opening already refreshes)
  python predecessor_meta.py --once          fetch, write JSON and standalone HTML, then exit
  python predecessor_meta.py --render-only   rebuild the HTML from the latest bundle without fetching
  python predecessor_meta.py --bracket platinum   use another rank bracket (bronze..paragon) this run
  python predecessor_meta.py --no-open       start without opening a browser tab
  python predecessor_meta.py --no-fetch --data-dir DIR   isolated developer cache/UI verification

File layout (all next to this script):
  ui.html / ui.js          interface template and behavior, inlined at render time
  engine.js               independent recommendation engine, inlined at render time
  reviewed_guidance.json   dated advice and reviewed official field corrections
  settings.json           bracket and request settings (legacy fields preserved)
  data/bundle_*.json      one bundle per patch + bracket (the cache)
  data/latest_bundle.json the bundle that was rendered most recently
  snapshots/tierlist_*.json  small tier-list snapshots, one per live run (patch-over-patch view)
  Predecessor Meta.html   the rendered page

Sections in this file:
  1. CONFIG
  2. HTTP (polite fetching)
  3. STATZ INGESTION   <-- every bit of statz.gg parsing lives here. If statz changes, fix it here.
  4. OMEDA INGESTION   <-- every bit of omeda.city parsing lives here.
  5. NORMALIZE + JOIN
  6. KIT TAGGING (derived from omeda ability text)
  7. SYNERGY + MATCHUP COMPUTATION
  8. SNAPSHOTS + PATCH-OVER-PATCH
  9. BUNDLE + CACHE
 10. RENDER
 11. OFFICIAL PATCH REVIEW, VALIDATION, COLLECTOR, LOCAL SERVER + MAIN
"""

import argparse
import copy
import hashlib
import secrets
import socket
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import concurrent.futures
import datetime as dt
import html as htmllib
import json
import math
import os
import re
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# ============================================================================
# 1. CONFIG
# ============================================================================

VERSION = "2.21.0"
TOOL_DIR = Path(__file__).resolve().parent
DATA_DIR = TOOL_DIR / "data"
SNAP_DIR = TOOL_DIR / "snapshots"
UI_TEMPLATE = TOOL_DIR / "ui.html"
OUT_HTML = TOOL_DIR / "Predecessor Meta.html"
OUT_HTML_OFFLINE = TOOL_DIR / "Predecessor Meta (offline).html"
SETTINGS_FILE = TOOL_DIR / "settings.json"
LATEST_BUNDLE = DATA_DIR / "latest_bundle.json"
OFFLINE_BUNDLE = DATA_DIR / "offline_bundle.json"

DEFAULT_SETTINGS = {"bracket": "gold", "max_age_hours": 24, "concurrency": 5, "open_browser": True}

USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) PredecessorMetaTool/%s "
              "(personal planning tool; Python urllib)" % VERSION)
STATZ_BASE = "https://statz.gg"
OMEDA_BASE = "https://omeda.city"
BRACKETS = ["bronze", "silver", "gold", "platinum", "diamond", "paragon"]

# Internal role vocabulary. Jungle first because that is the user's main role.
ROLES = ["jungle", "offlane", "midlane", "carry", "support"]
ROLE_LABEL = {"jungle": "Jungle", "offlane": "Offlane", "midlane": "Midlane", "carry": "Carry", "support": "Support"}
TIER_ORDER = {"S+": 0, "S": 1, "A": 2, "B": 3, "C": 4, "D": 5}

REQUEST_STAGGER = 0.2      # seconds between submitting requests to statz (politeness)
REQUEST_TIMEOUT = 25       # seconds per statz request
OMEDA_TIMEOUT = 25         # omeda.city can be slow (heroes.json took 18 s once)
MIN_PAIR_GAMES = 100        # pairs with fewer games are hidden from ranking
THIN_PAIR_GAMES = 100      # pairs with fewer games are shown but marked "thin"
FAILED_PAGE_ERROR_SHARE = 0.10   # more than this share of hero pages failing is a red-banner error, not a warning

T_START = time.time()
SETTINGS_PROBLEMS = []     # human-readable problems with settings.json; shown in the page's warning box


def log(msg):
    print("[%6.1fs] %s" % (time.time() - T_START, msg), flush=True)


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


def iso(t):
    return t.astimezone().isoformat(timespec="seconds")


def load_settings():
    s = dict(DEFAULT_SETTINGS)
    if not SETTINGS_FILE.exists():
        return s
    try:
        user = json.loads(SETTINGS_FILE.read_text(encoding="utf-8-sig"))
        if not isinstance(user, dict):
            raise ValueError("top level is not an object")
    except Exception as e:
        SETTINGS_PROBLEMS.append("settings.json could not be read (%s); all defaults used" % e)
        log("WARNING: " + SETTINGS_PROBLEMS[-1])
        return s

    def num(key, lo, hi, cast):
        v = user.get(key)
        if v is None:
            return
        try:
            x = cast(v)
            if not (lo <= x <= hi):
                raise ValueError("outside %s..%s" % (lo, hi))
            s[key] = x
        except Exception as e:
            SETTINGS_PROBLEMS.append("settings.json %r = %r ignored (%s); default %r used" % (key, v, e, DEFAULT_SETTINGS[key]))

    num("max_age_hours", 0, 24 * 365, float)
    num("concurrency", 1, 5, int)
    if user.get("bracket") is not None:
        b = str(user["bracket"]).strip().lower()
        if b in BRACKETS:
            s["bracket"] = b
        else:
            SETTINGS_PROBLEMS.append("settings.json 'bracket' = %r is not one of %s; default 'gold' used" % (user["bracket"], ", ".join(BRACKETS)))
    if user.get("open_browser") is not None:
        s["open_browser"] = str(user["open_browser"]).strip().lower() in ("true", "1", "yes", "on")
    for p in SETTINGS_PROBLEMS:
        log("WARNING: " + p)
    return s


# ============================================================================
# 2. HTTP (polite fetching)
# ============================================================================

class FetchError(Exception):
    pass


class SourceBlocked(FetchError):
    """Raised on HTTP 429/403: the site is rate-limiting or blocking us. We stop, we do not hammer."""


ABORT = threading.Event()   # set when statz.gg blocks a request; only statz requests honour it


def http_get(url, timeout=REQUEST_TIMEOUT, retries=0):
    """GET once by default; opt-in bounded retries only on 5xx/network errors, never 4xx."""
    last = None
    for attempt in range(retries + 1):
        if ABORT.is_set() and url.startswith(STATZ_BASE):
            raise FetchError("aborted: an earlier request to statz.gg was blocked")
        t0 = time.time()
        try:
            headers = {
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
            if url.startswith("https://www.predecessorgame.com/"):
                # The official site repeatedly reset the mixed browser/API header
                # profile. A plainly identified document request works with urllib;
                # no alternate transport, browser impersonation or extra retry.
                headers = {"User-Agent": "PredecessorMetaTool/%s (personal planning tool; Windows verification)" % VERSION,
                           "Accept": "*/*"}
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                charset = resp.headers.get_content_charset() or "utf-8"
                return raw.decode(charset, "replace"), resp.status, round(time.time() - t0, 2)
        except urllib.error.HTTPError as e:
            if e.code in (429, 403):
                if url.startswith(STATZ_BASE):
                    ABORT.set()
                raise SourceBlocked("HTTP %d from %s - the site is rate-limiting or blocking requests; stopping." % (e.code, url))
            last = FetchError("HTTP %d for %s" % (e.code, url))
            if e.code < 500:
                raise last
        except Exception as e:
            last = FetchError("%s: %s (for %s)" % (type(e).__name__, e, url))
        if attempt < retries:
            time.sleep(1.5)
    raise last


# ============================================================================
# 3. STATZ INGESTION  (all statz.gg parsing lives here)
# ============================================================================
#
# Facts verified 2026-09-07 against statz.gg (Patch 1.16):
#   * Tier list: https://statz.gg/predecessor/hero-tier-list/{bracket}
#       - server-rendered <tr class="stats-table-row"> rows; attributes are UNQUOTED
#         (href=/predecessor/heroes/grux/build/jungle, src=/images/predecessor/hero-image-data/Grux.webp)
#       - the ?role= query string does nothing server-side
#       - active bracket label sits in <div id="rankDropdownToggle"><span>Gold+</span>
#   * Hero page: https://statz.gg/predecessor/heroes/{slug}/build/{role}/{bracket}
#       - embeds  var laneStats = {...};  var abilities = {...};  var items = {...};  var perks = {...};  var heroes = [...];
#       - a hero/role with no data (or a nonexistent hero) returns HTTP 200 with  var laneStats = null;
#         so the parser validates CONTENT, never trusts the status code
#       - heroLanes.teamMatesStats lists ONLY teammates the hero wins with (every entry >= ~51% in the
#         2026-09-07 sample, sorted by win rate). It is a censored "best teammates" list, not a full sample.
#       - lane_counters / strong_against are capped at 8 entries each per build variant.
#   * Bracket is a URL path segment (bronze/silver/gold/platinum/diamond/paragon), meaning "that rank and above".
#     No segment == gold. laneStats.ranked reports the bracket ("Gold").
#   * Image names: hero portraits are harvested from the tier list; perk and item icons follow
#     display_name.replace(' ', '-') + '.webp' (verified on every harvested example).

class StatzParseError(Exception):
    pass


PATCH_RX = re.compile(r"Patch\s+(\d+\.\d+(?:\.\d+)?)")
ROW_RX = re.compile(r'<tr class="stats-table-row">(.*?)</tr>', re.S)
TD_RX = re.compile(r'<td class="stats-table-data([^"]*)">(.*?)</td>', re.S)
BRACKET_LABEL_RX = re.compile(r'id="rankDropdownToggle"[^>]*>\s*<span>([^<]*)</span>', re.S)


def statz_tierlist_url(bracket):
    return "%s/predecessor/hero-tier-list/%s" % (STATZ_BASE, bracket)


def statz_hero_url(slug, role, bracket):
    return "%s/predecessor/heroes/%s/build/%s/%s" % (STATZ_BASE, slug, role, bracket)


def statz_script_var(html, name):
    """Return (found, value) for a `var NAME = <json>;` block embedded in a statz page."""
    m = re.search(r"var %s = (null|\{.*?\}|\[.*?\]);\s*\n" % re.escape(name), html, re.S)
    if not m:
        return False, None
    raw = m.group(1)
    if raw == "null":
        return True, None
    return True, json.loads(raw)


def statz_role_normalize(lane):
    """statz uses 'Support', 'Midlane' ...; internal vocabulary is lowercase."""
    r = str(lane or "").strip().lower()
    if r not in ROLES:
        raise StatzParseError("unknown statz role/lane value: %r" % lane)
    return r


def statz_image_name(display_name):
    """statz's own JS rule for portrait/perk/item icons: display name with spaces -> hyphens."""
    return str(display_name).replace(" ", "-") + ".webp"


def _pct(s):
    return float(htmllib.unescape(s).strip().rstrip("%"))


def _int(s):
    return int(str(htmllib.unescape(str(s))).strip().replace(",", ""))


def statz_parse_tierlist(html):
    title = re.search(r"<title>(.*?)</title>", html, re.S)
    pm = PATCH_RX.search(title.group(1) if title else "") or PATCH_RX.search(html)
    if not pm:
        raise StatzParseError("tier list: no 'Patch X.Y' label found on the page")
    patch = pm.group(1)
    bm = BRACKET_LABEL_RX.search(html)
    bracket_label = bm.group(1).strip() if bm else None
    options = [(seg, htmllib.unescape(lbl).strip())
               for seg, lbl in re.findall(r"href=/predecessor/hero-tier-list/([a-z]+)>([^<]*)<", html)]
    rows = []
    for raw in ROW_RX.findall(html):
        link = re.search(r'href=["\']?(/predecessor/heroes/([a-z0-9-]+)/build/([a-z]+))' , raw)
        img = re.search(r'hero-image-data/([^\s>"]+)', raw)
        tier = re.search(r'tier-[a-z]+">([^<]*)<', raw)
        name = re.search(r"_display_name\s*/>\s*([^<\n]+)", raw)
        tds = [t[1].strip() for t in TD_RX.findall(raw)]
        if not (link and tier and len(tds) >= 7):
            raise StatzParseError("tier list row did not match the expected layout: " + re.sub(r"\s+", " ", raw)[:240])
        rows.append({
            "slug": link.group(2),
            "role": statz_role_normalize(link.group(3)),
            "build_path": link.group(1),
            "display_name": htmllib.unescape(name.group(1)).strip() if name else link.group(2),
            "image": htmllib.unescape(img.group(1)) if img else None,
            "rank": _int(tds[0]),
            "tier": htmllib.unescape(tier.group(1)).strip(),
            "winRate": _pct(tds[-3]),
            "pickRate": _pct(tds[-2]),
            "matches": _int(tds[-1]),
        })
    if not rows:
        raise StatzParseError("tier list: 0 rows parsed (page layout may have changed)")
    for row in rows:
        for key in ("winRate", "pickRate"):
            checked_number(row[key], key, 0, 100)
        if row["matches"] <= 0:
            raise StatzParseError("tier row has zero or invalid matches")
    if len({(r["slug"], r["role"]) for r in rows}) != len(rows):
        raise StatzParseError("duplicate hero/role rows")
    return {"patch": patch, "bracket_label": bracket_label, "bracket_options": options, "rows": rows}


def statz_parse_hero_page(html, slug, role, bracket=None):
    found, ls = statz_script_var(html, "laneStats")
    if not found or ls is None:
        raise StatzParseError("%s/%s: %s" % (slug, role, "laneStats is null: no data" if found else "var laneStats was not found"))
    if not isinstance(ls, dict) or ls.get("hero") != slug or statz_role_normalize(ls.get("lane")) != role:
        raise StatzParseError("%s/%s: hero or role identity mismatch" % (slug, role))
    if not isinstance(ls.get("heroLanes"), dict) or not isinstance(ls.get("builds_by_perk"), list) or not ls["builds_by_perk"]:
        raise StatzParseError("%s/%s: missing hero-wide data or build variants" % (slug, role))
    actual_bracket = str(ls.get("ranked") or "").lower()
    if actual_bracket not in BRACKETS or (bracket and actual_bracket != bracket):
        raise StatzParseError("%s/%s: requested %s, page reports bracket %r" % (slug, role, bracket, ls.get("ranked")))
    if str(ls["heroLanes"].get("ranked") or "").lower() != actual_bracket:
        raise StatzParseError("hero-wide and role data disagree on rank bracket")
    pm = PATCH_RX.search(html)
    if not pm:
        raise StatzParseError("%s/%s: no patch label; cohort cannot be verified" % (slug, role))
    validate_metrics(ls, "%s/%s" % (slug, role))
    for metrics, context in ((ls, 'role'), (ls['heroLanes'], 'hero-wide')):
        for field in ('winRate', 'pickRate', 'banRate'):
            checked_number(metrics.get(field), context + '.' + field, 0, 100)
    if _games(ls.get("playedGames")) == 0:
        raise StatzParseError("hero/role has zero games")
    for key in ("teamMatesStats", "generalCountersStats", "generalStrongAgainstStats"):
        if not isinstance(ls["heroLanes"].get(key), list):
            raise StatzParseError("heroLanes.%s is missing or not a list" % key)
    for i, b in enumerate(ls["builds_by_perk"]):
        if not isinstance(b, dict):
            raise StatzParseError("invalid build variant")
        for key in ("perk", "eternal", "common_perks_1", "common_perks_2", "core_items", "items4", "items5", "items6", "best_base_crests", "popular_skill_order", "skillUpgradePriority", "lane_counters", "strong_against"):
            if key not in b or b[key] is None:
                raise StatzParseError("build %d is missing %s" % (i + 1, key))
    d = {"laneStats": ls, "patch": pm.group(1), "image_names": statz_harvest_image_names(html)}
    for name in ("abilities", "items", "perks", "heroes"):
        exists, value = statz_script_var(html, name)
        if not exists or not isinstance(value, list if name == "heroes" else dict) or not value:
            raise StatzParseError("%s/%s: missing or empty %s descriptions/roster" % (slug, role, name))
        if name in ('abilities', 'perks'):
            for key, definition in value.items():
                if not isinstance(definition,dict) or not definition.get('display_name'):
                    raise StatzParseError(name + '.' + str(key) + ': missing named definition')
                description=definition.get('description') if name=='perks' else definition.get('menu_description') or definition.get('game_description')
                if not isinstance(description,str) or not description.strip():
                    raise StatzParseError(name + '.' + str(key) + ': missing description')
        d[name] = value
    bm = BRACKET_LABEL_RX.search(html)
    d["bracket_label"] = bm.group(1).strip() if bm else None
    return d


def statz_harvest_image_names(html):
    out = {"heroes": set(), "items": set(), "perks": set()}
    for kind, folder in (("heroes", "hero-image-data"), ("items", "item-images"), ("perks", "perk-images")):
        for fn in re.findall(r"/images/predecessor/%s/([^\s\"'>$]+\.webp)" % folder, html):
            out[kind].add(htmllib.unescape(fn))
    return out


def statz_pull_hero_pages(targets, bracket, concurrency, offline_dir=None):
    """Bounded, spaced requests using tier-list links. Never fetch the same URL twice in a run."""
    results = {}
    def work(target):
        slug, role, build_path = target
        key = slug + "|" + role
        url = STATZ_BASE + build_path.rstrip("/") + "/" + bracket
        if ABORT.is_set():
            return key, {"ok": False, "error": "skipped after statz blocked this run", "url": url}
        try:
            if offline_dir:
                html = (Path(offline_dir) / (slug + "__" + role + ".html")).read_text(encoding="utf-8")
                seconds = None
            else:
                html, _, seconds = http_get(url)
            parsed = statz_parse_hero_page(html, slug, role, bracket)
            return key, {"ok": True, "data": parsed, "secs": seconds, "url": url, "fetched_at": None if offline_dir else iso(now_utc())}
        except Exception as e:
            return key, {"ok": False, "error": str(e), "blocked": isinstance(e, SourceBlocked), "url": url}
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(5, concurrency)) as ex:
        pending = set()
        todo = iter(dict.fromkeys(tuple(t) for t in targets))
        exhausted = False
        last_launch = 0.0
        while pending or not exhausted:
            while not exhausted and len(pending) < min(5, concurrency):
                try:
                    target = next(todo)
                except StopIteration:
                    exhausted = True
                    break
                if not offline_dir:
                    time.sleep(max(0, REQUEST_STAGGER - (time.monotonic() - last_launch)))
                pending.add(ex.submit(work, target))
                last_launch = time.monotonic()
            done, pending = concurrent.futures.wait(pending, return_when=concurrent.futures.FIRST_COMPLETED)
            for f in done:
                key, result = f.result()
                results[key] = result
                log("Hero pages %d/%d" % (len(results), len(targets)))
    return results


# ============================================================================
# 4. OMEDA INGESTION  (all omeda.city parsing lives here)
# ============================================================================
#
# Verified 2026-09-07: /heroes.json and /items.json return 200 with no API key.
# heroes.json: 54 heroes with id, name (internal codename, NOT the display name), display_name,
# slug (matches statz slugs for all 54), roles[], classes[], abilities[] (game_description carries
# machine-readable tags such as <CC_Text>Roots</CC_Text>), image (relative to omeda.city).
# /dashboard/hero_statistics.json returns 503; /eternals.json, /blessings.json, /augments.json,
# /crests.json return 403 - those come from statz instead.

class OmedaParseError(Exception):
    pass


def omeda_fetch_heroes():
    text, status, secs = http_get(OMEDA_BASE + "/heroes.json", timeout=OMEDA_TIMEOUT, retries=0)
    data = json.loads(text)
    if not isinstance(data, list) or not data:
        raise OmedaParseError("heroes.json: expected a non-empty list")
    for h in data:
        for k in ("id", "slug", "display_name", "roles", "abilities", "classes"):
            if k not in h:
                raise OmedaParseError("heroes.json: hero entry missing '%s'" % k)
    return data, secs


def omeda_fetch_items():
    text, status, secs = http_get(OMEDA_BASE + "/items.json", timeout=OMEDA_TIMEOUT, retries=0)
    data = json.loads(text)
    if not isinstance(data, list) or not data:
        raise OmedaParseError("items.json: expected a non-empty list")
    return data, secs


def omeda_role_normalize(r):
    r = str(r or "").strip().lower()
    return r if r in ROLES else None


# ============================================================================
# 5. NORMALIZE + JOIN
# ============================================================================

TAG_RX = re.compile(r"<[^>]+>")


def clean_text(s):
    """Readable semantic text; image scaling attributes are information, not decoration."""
    s = htmllib.unescape(s or "")
    attrs = {"ADIconOrange": "physical power", "APIconBlue": "magical power", "HealthIconGreen": "health",
             "PhysPen": "physical penetration", "ArmorIcon": "physical armor", "ArmorOrange": "physical armor", "MRIcon": "magical armor",
             "ASIcon": "attack speed", "ManaIcon": "mana", "ManaBlue": "mana", "MagicPen": "magical penetration"}
    def icon(m):
        raw = m.group(0)
        for key, label in attrs.items():
            if key.lower() in raw.lower():
                return " " + label
        ident = re.search(r'(?:icon-id|id)=["\']([^"\']+)', raw)
        return (" [" + ident.group(1) + "]") if ident else ""
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<img[^>]*>", icon, s, flags=re.I)
    s = TAG_RX.sub("", s)
    s = re.sub(r"\{([^}]*)\}", lambda m: "[" + m.group(1) + "]", s)
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", s)).strip()


def norm_key(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


# ============================================================================
# 6. KIT TAGGING (derived from omeda ability text; every tag carries evidence)
# ============================================================================
#
# These tags are COMPUTED BY THIS TOOL, not measured. They exist to explain why a measured pair
# works and to cover pairs with too little data. The UI must always label them as derived.
# The goal is honest explanation, not completeness: a tag must point at the sentence that earned it.

CC_RX = re.compile(r"<CC_Text>([^<]*)</CC_Text>")
# (stem regex, kind). Matched at the start of a normalised <CC_Text> token, and searched in
# sentence text when an ability carries no usable tokens.
CC_STEMS = [
    (r"stun", "stun"), (r"root", "root"), (r"suspend", "suspend"), (r"sup+ress", "suppress"),
    (r"mesmeri[sz]", "mesmerize"), (r"grab", "grab"), (r"pull|drag", "pull"),
    (r"knock\w*[ -]*(?:\w+ )?(?:up|airborne)|launch(?:es|ed|ing)?\b(?=[^.]{0,40}\b(?:up|enemies|heroes|targets|them)\b)", "knock-up"),
    (r"knock\w*[ -]*(?:\w+ )?back|push|forc\w* (?:\w+ )?away", "knockback"),
    (r"fear", "fear"), (r"silence", "silence"), (r"tether", "tether"), (r"restrain", "restrain"),
    (r"interrupt", "interrupt"), (r"taunt", "taunt"), (r"polymorph", "polymorph"), (r"charm", "charm"),
    (r"blind(?!ing speed)", "blind"), (r"ground(?:ed|s)\b", "ground"),
    (r"slow(?:s|ed|ing)?\b(?!ly)", "slow"), (r"cripple", "slow"),
]
CC_STEM_RX = [(re.compile(r"(?:%s)" % stem, re.I), kind) for stem, kind in CC_STEMS]
CC_SEARCH_RX = [(re.compile(r"\b(?:%s)" % stem, re.I), kind) for stem, kind in CC_STEMS]
# Only these kinds actually hold an enemy in place for a follow-up.
HOLD_KINDS = {"stun", "root", "knock-up", "pull", "grab", "suppress", "fear", "mesmerize", "taunt", "polymorph", "charm", "tether", "restrain", "suspend"}
CC_NEGATION_RX = re.compile(r"\b(immun\w*|cannot be|can't be|unstoppable|whilst cooking|while cooking|if (?:\w+ )?(?:is |are )?(?:stunned|rooted|killed|silenced|slowed))\b", re.I)
CC_SELF_RX = re.compile(r"\b(?:him|her|it)self\b|\byou are\b|\bself[- ]?slow", re.I)

ALLY_RX = re.compile(r"\b(all(y|ies)|allied|teammates?)\b", re.I)
ENEMY_RX = re.compile(r"\b(enem(y|ies)|targets?|opponents?)\b", re.I)
PROTECT_RX = re.compile(r"\b(heal(s|ed|ing)?|restor(e|es|ing)|shield(s|ed|ing)?|spell ?shield|barrier|damage mitigation|damage reduction|mitigat\w+|tenacity|cleanse[sd]?|immun\w+|invulnerab\w+|protect\w*|untargetable|reviv\w*|resurrect\w*)\b", re.I)
AMPLIFY_RX = re.compile(r"\b(attack speed|physical power|magical power|ability haste|lifesteal|omnivamp|bonus damage|more damage|increased damage|damage amp\w*|crit\w*|penetration|true damage)\b", re.I)
GRANT_RX = re.compile(r"\b(grant\w*|gain\w*|receive\w*|deal\w*|increas\w*|empower\w*)\b", re.I)
SHRED_RX = re.compile(r"\b(reduc\w+|shred\w*|lose|loses|lower\w*|strip\w*)\b[^.]*\b(armor|resist\w*)\b|\b(armor|resist\w*)\b[^.]*\b(reduc\w+|shred\w*|lower\w*|strip\w*)\b", re.I)
MOBILITY_RX = re.compile(r"\b(dash\w*|leap\w*|blink\w*|lunge\w*|teleport\w*|vault\w*|pounce\w*|charge\w* (?:forward|toward|towards|at|into|through)|jump\w* (?:to|forward|toward|towards|at|over)|fl(?:y|ies) (?:to|toward|towards|forward)|hook\w*|grapple\w*|sprint\w*)\b", re.I)
MOBILITY_SKIP_RX = re.compile(r"\b(teleport|pull|drag|fly|flies)\w*\s+(?:an?\s+|the\s+)?(?:enemy|hero|target|ally|allied|linked)\b(?!\s+to\b)|\b(hair|clone|wolf|wolves|orb|drone|projectile|missile|spear|blade)\s+(?:leaps?|dash\w*|flies)\b|\bblink cooldown\b|replaces blink\b|phase blink\b", re.I)
ZONE_NOUN = r"((?:area|zone|field|circle|ring|radius|wall|barrier|pool|pillar|totem|turret|trap|fence|patch|portal|thornbush|coliseum|dome|storm|singularity|mine|standard|beam|drone|gate|gas|cloud|crystal)s?)"
ZONE_RX = re.compile(ZONE_NOUN + r"\b[^.]{0,60}?\b(?:for|lasts?|persists?|remains?)\b[^.]{0,25}?(?:\d|X)|\b(?:lasts?|persists?|remains?)\b[^.]{0,50}?\b" + ZONE_NOUN + r"|" + ZONE_NOUN + r"\b[^.]{0,40}?\b(?:lasts?|persists?|remains?)\b", re.I)
NOT_ZONE_RX = re.compile(r"\b(slow\w*|stun\w*|root\w*|shield|damage reduction|ablaze|attack speed|movement speed|hover\w*|mesmeri\w*|knock\w*|blocks?)\b[^.]{0,30}\bfor\b", re.I)
GLOBAL_RX = re.compile(r"\b(anywhere|global\w*|across the map|entire map|any location|map-wide|from anywhere|unlimited range|infinite range|(?:all|every) heroes? in the world)\b", re.I)
SELF_SUSTAIN_RX = re.compile(r"\b(heal(s|ed|ing)?|lifesteal|omnivamp|regenerat(e|es|ing|ion)|health regen\w*|restor\w+ (?:\S+ )?health)\b", re.I)
ATTACK_SPEED_RX = re.compile(r"\battack speed\b", re.I)
SUMMON_RX = re.compile(r"\b(turret|clone|wolves|wolf|drone|minion|pet)s?\b", re.I)
BASIC_ATTACK_RX = re.compile(r"\bbasic attack", re.I)
DAMAGE_DEAL_RX = re.compile(r"\bdeal\w*\b[^.]*\bdamage\b", re.I)
PLACEHOLDER_RX = re.compile(r"\[[^\]]*\]")


def sentences(text):
    return [x.strip() for x in re.split(r"[\n•]|(?<=[.!?])\s+", text) if x.strip()]


def derive_tags(hero):
    abilities = hero.get("abilities") or []
    classes = set(hero.get("classes") or [])
    hero_name = hero.get("display_name") or ""
    ev = {}
    shred_types = set()

    def add(tag, ability_label, sentence):
        ev.setdefault(tag, [])
        s = "%s: %s" % (ability_label, sentence.strip())
        if s not in ev[tag] and len(ev[tag]) < 4:
            ev[tag].append(s)

    def cc_sentence_ok(m):
        """A CC mention only counts when it is applied to enemies: not immunity, not ally-targeted, not self."""
        if CC_NEGATION_RX.search(m) or CC_SELF_RX.search(m):
            return False
        if ALLY_RX.search(m) and not ENEMY_RX.search(m):
            return False
        return True

    hard_kinds = set()
    hard_in_ult = False
    protect_in_ult = mobility_in_ult = zone_in_ult = damage_in_ult = False
    ult_name = None
    ad = ap = 0
    self_attack_speed = False
    basic_attack_mentions = 0
    any_cc_tags = False
    self_subject_rx = re.compile(r"^\s*(?:%s|he|she|you)\b[^.]{0,30}\bgains?\b" % re.escape(hero_name or "\x00"), re.I)

    for a in abilities:
        key = a.get("key") or ""
        name = a.get("display_name") or key
        label = "%s (%s)" % (name, key)
        gd = a.get("game_description") or ""
        md = a.get("menu_description") or ""
        is_ult = key == "R"
        if is_ult:
            ult_name = name
        ad += len(re.findall(r"<AttackDamageText>", gd + md))
        ap += len(re.findall(r"<AbilityPowerText>", gd + md))
        text = clean_text(gd) + "\n" + clean_text(md)
        sents = sentences(text)
        masked = [PLACEHOLDER_RX.sub("X", s) for s in sents]

        # ---- crowd control: from <CC_Text> tokens first, plain-word scan when tokens gave nothing ----
        raw_cc = CC_RX.findall(gd) + CC_RX.findall(md)
        if raw_cc:
            any_cc_tags = True
        token_kinds = set()
        for tok in raw_cc:
            if "{" in tok:
                continue
            t = re.sub(r"[\s\-]+", " ", tok.strip().lower())
            for rx, kind in CC_STEM_RX:
                if rx.match(t):
                    token_kinds.add(kind)
                    break
        cc_kinds_here = set()
        for kind in (token_kinds if token_kinds else [k for _, k in CC_SEARCH_RX]):
            rx = next(r for r, k in CC_SEARCH_RX if k == kind)
            for s, m in zip(sents, masked):
                if rx.search(m) and cc_sentence_ok(m):
                    cc_kinds_here.add(kind)
                    add("hard_cc" if kind != "slow" else "soft_cc", label, s)
                    break
        for kind in cc_kinds_here:
            if kind != "slow":
                hard_kinds.add(kind)
                if is_ult and kind in HOLD_KINDS:
                    hard_in_ult = True
        if "pull" in cc_kinds_here or "grab" in cc_kinds_here:
            for s, m in zip(sents, masked):
                if re.search(r"\b(pull|grab|drag)", m, re.I) and cc_sentence_ok(m):
                    add("engage", label, s)
                    break

        # ---- everything else, sentence by sentence (bullets inherit the ally/enemy subject of their header) ----
        header_ally = None
        for s, m in zip(sents, masked):
            is_header = m.rstrip().endswith(":")
            ally_here = bool(ALLY_RX.search(m))
            enemy_here = bool(ENEMY_RX.search(m))
            if is_header:
                header_ally = ally_here and not enemy_here
                has_ally = ally_here
            else:
                has_ally = ally_here or (bool(header_ally) and not enemy_here)
            has_enemy = enemy_here and not has_ally
            if has_ally and PROTECT_RX.search(m):
                add("ally_protect", label, s)
                if is_ult:
                    protect_in_ult = True
            if has_ally and AMPLIFY_RX.search(m) and GRANT_RX.search(m) and not self_subject_rx.match(m):
                add("amplify", label, s)
            if not has_ally and SHRED_RX.search(m):
                add("shred", label, s)
                low = m.lower()
                if "magical armor" in low or "magic armor" in low or "magical resist" in low:
                    shred_types.add("magical")
                if "physical armor" in low or re.search(r"\b(?<!magical )(?<!magic )armor\b", low) or "physical resist" in low:
                    shred_types.add("physical")
            if MOBILITY_RX.search(m) and not MOBILITY_SKIP_RX.search(m):
                add("mobility", label, s)
                if is_ult:
                    mobility_in_ult = True
                if not has_ally and (has_enemy or (cc_kinds_here & HOLD_KINDS)):
                    add("engage", label, s)
            if ZONE_RX.search(m) and not NOT_ZONE_RX.search(m):
                add("zone", label, s)
                if is_ult:
                    zone_in_ult = True
            if GLOBAL_RX.search(m):
                add("global", label, s)
            if not has_ally and SELF_SUSTAIN_RX.search(m):
                add("self_sustain", label, s)
            if not has_ally and ATTACK_SPEED_RX.search(m) and not SUMMON_RX.search(m) and not re.search(r"\breduc", m, re.I):
                self_attack_speed = True
            if is_ult and DAMAGE_DEAL_RX.search(m):
                damage_in_ult = True
        basic_attack_mentions += len(BASIC_ATTACK_RX.findall(text))

    frontline = bool(classes & {"Tank", "Warden", "Fighter"})
    sustained_dps = bool(classes & {"Sharpshooter", "Executioner"}) or ("Fighter" in classes and (self_attack_speed or basic_attack_mentions >= 3))
    burst = bool(classes & {"Assassin", "Executioner", "Mage"})
    ally_protect = "ally_protect" in ev
    time_buyer = ally_protect or bool(classes & {"Enchanter", "Support", "Warden", "Catcher", "Tank"})
    amplify_direct = "amplify" in ev
    shred = "shred" in ev
    if ad == 0 and ap == 0:
        damage_type = "magical" if "Mage" in classes else "unknown"
    elif ad >= 2 * ap:
        damage_type = "physical"
    elif ap >= 2 * ad:
        damage_type = "magical"
    else:
        damage_type = "mixed"
    if protect_in_ult and (classes & {"Enchanter", "Support"} or not hard_in_ult):
        ult_type = "protective"
    elif hard_in_ult:
        ult_type = "setup"
    elif zone_in_ult:
        ult_type = "area"
    elif mobility_in_ult:
        ult_type = "dive"
    elif damage_in_ult:
        ult_type = "damage"
    else:
        ult_type = "other"
    tags = {
        "hard_cc": bool(hard_kinds), "hard_cc_kinds": sorted(hard_kinds), "hold_cc": bool(hard_kinds & HOLD_KINDS),
        "soft_cc": "soft_cc" in ev, "engage": "engage" in ev, "mobility": "mobility" in ev, "ally_protect": ally_protect,
        "amplifier": amplify_direct or shred, "amplify_direct": amplify_direct, "shred": shred, "shred_types": sorted(shred_types),
        "zone": "zone" in ev, "global": "global" in ev, "self_sustain": "self_sustain" in ev, "frontline": frontline,
        "sustained_dps": sustained_dps, "burst": burst, "time_buyer": time_buyer, "damage_type": damage_type,
        "ult_type": ult_type, "ult_name": ult_name, "classes": sorted(classes), "ad_refs": ad, "ap_refs": ap,
        "cc_tags_found": any_cc_tags,
    }
    return tags, ev


# ============================================================================
# 7. SYNERGY + MATCHUP COMPUTATION
# ============================================================================

def sample_label(n):
    if n >= 300:
        return "solid"
    if n >= THIN_PAIR_GAMES:
        return "ok"
    if n >= MIN_PAIR_GAMES:
        return "thin"
    return "hidden"


def _games(x):
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or int(x) != x or x < 0:
        raise ValueError("missing or invalid sample count: %r" % x)
    return int(x)


def compute_pairs(heroes):
    """Keep each direction, choose one observation, never add overlapping pair samples."""
    observations, unresolved = {}, []
    for slug, h in heroes.items():
        for t in h.get("_teammates_raw") or []:
            other = t.get("name")
            if other not in heroes or other == slug:
                unresolved.append("%s -> %s" % (slug, other)); continue
            try:
                validate_observation(t, "%s + %s" % (slug, other))
                for member in (slug, other):
                    checked_number((heroes[member].get("hero_wide") or {}).get("winRate"), "hero-wide baseline", 0, 100)
            except (ValueError, StatzParseError):
                unresolved.append("%s -> %s (missing or invalid observation/baseline)" % (slug, other)); continue
            if not t["playedGames"]:
                continue
            observations.setdefault("|".join(sorted((slug, other))), []).append({
                "from": slug, "wr": t["winRate"], "played": t["playedGames"], "won": t["wonGames"],
                "source": (h.get("hero_wide") or {}).get("source"), "url": h.get("hero_wide_url"),
                "fetched_at": h.get("hero_wide_fetched_at")})
    pairs = {}
    for key, obs in observations.items():
        # Largest sample, then stable source order. The selected direction is disclosed.
        obs.sort(key=lambda x: (-x["played"], x["from"]))
        o = obs[0]; a, b = key.split("|")
        ba, bb = heroes[a]["hero_wide"]["winRate"], heroes[b]["hero_wide"]["winRate"]
        mean = (ba + bb) / 2
        pairs[key] = {"a": a, "b": b, "wr": o["wr"], "played": o["played"], "won": o["won"],
                      "base_a": ba, "base_b": bb, "baseline_mean": round(mean, 3),
                      "lift": round(o["wr"] - max(ba, bb), 3), "lift_mean": round(o["wr"] - mean, 3),
                      "lift_a": round(o["wr"] - ba, 3), "lift_b": round(o["wr"] - bb, 3),
                      "beats_both": o["wr"] > max(ba, bb), "interval95": wilson(o["won"], o["played"]),
                      "sample": sample_label(o["played"]), "observations": obs,
                      "disagreement": len({(x["played"], x["won"]) for x in obs}) > 1,
                      "source": o["source"], "url": o["url"], "fetched_at": o["fetched_at"]}
    return pairs, unresolved


def aggregate_matchups(ls):
    """Preserve disjoint variant rows and label their selected-list pool as calculated."""
    agg = {}
    for i, b in enumerate(ls.get("builds_by_perk") or []):
        seen = set()
        for e in (b.get("lane_counters") or []) + (b.get("strong_against") or []):
            validate_observation(e, "variant matchup")
            slug = e.get("name")
            if not slug or slug in seen:
                continue
            seen.add(slug)
            a = agg.setdefault(slug, {"slug": slug, "display_name": e.get("display_name") or slug, "observations": []})
            a["observations"].append({"variant": i, "augment": b.get("perk"), "eternal": b.get("eternal"),
                                       "wr": e["winRate"], "played": e["playedGames"], "won": e["wonGames"]})
    for a in agg.values():
        a["played"] = sum(x["played"] for x in a["observations"])
        a["won"] = sum(x["won"] for x in a["observations"])
        a["wr"] = round(100 * a["won"] / a["played"], 2) if a["played"] else None
        a["variants"] = len(a["observations"])
        a["of_variants"] = len(ls["builds_by_perk"])
        a["calculated"] = True
    return sorted(agg.values(), key=lambda x: -x["played"])


def trim_build(b):
    keep = ("perk", "eternal", "winRate", "pickRate", "wonGames", "playedGames", "score", "common_perks_1", "common_perks_2",
            "core_items", "items4", "items5", "items6", "best_base_crests", "popular_skill_order", "skillUpgradePriority",
            "lane_counters", "strong_against")
    return {k: b.get(k) for k in keep}


# ============================================================================
# 8. SNAPSHOTS + PATCH-OVER-PATCH
# ============================================================================

def write_snapshot(tier, bracket, fetched_at):
    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    snap = {
        "patch": tier["patch"], "bracket": bracket, "fetched_at": iso(fetched_at),
        "rows": [{"slug": r["slug"], "role": r["role"], "tier": r["tier"], "winRate": r["winRate"],
                  "pickRate": r["pickRate"], "matches": r["matches"]} for r in tier["rows"]],
    }
    fn = SNAP_DIR / ("tierlist_%s_patch%s_%s.json" % (fetched_at.astimezone().strftime("%Y-%m-%d_%H%M%S_%f"), tier["patch"], bracket))
    atomic_write(fn, json.dumps(snap, indent=0))
    return fn, snap


def load_snapshots(bracket):
    snaps = []
    if not SNAP_DIR.exists():
        return snaps
    for p in sorted(SNAP_DIR.glob("tierlist_*.json")):
        try:
            s = json.loads(p.read_text(encoding="utf-8"))
            if s.get("bracket") == bracket and s.get("rows") and not s.get("offline"):
                s["_file"] = p.name
                snaps.append(s)
        except Exception:
            continue
    snaps.sort(key=lambda s: s["fetched_at"])
    return snaps


def diff_snapshots(old, new):
    o = {(r["slug"], r["role"]): r for r in old["rows"]}
    n = {(r["slug"], r["role"]): r for r in new["rows"]}
    changes, added, gone = [], [], []
    for k, r in n.items():
        if k in o:
            p = o[k]
            changes.append({
                "slug": r["slug"], "role": r["role"], "tier_from": p["tier"], "tier_to": r["tier"],
                "wr_from": p["winRate"], "wr_to": r["winRate"], "wr_delta": round(r["winRate"] - p["winRate"], 2),
                "pr_from": p["pickRate"], "pr_to": r["pickRate"], "pr_delta": round(r["pickRate"] - p["pickRate"], 2),
                "matches_from": p["matches"], "matches_to": r["matches"],
                "tier_move": TIER_ORDER.get(p["tier"], 9) - TIER_ORDER.get(r["tier"], 9),
            })
        else:
            added.append({"slug": r["slug"], "role": r["role"], "tier": r["tier"], "winRate": r["winRate"], "matches": r["matches"]})
    for k, r in o.items():
        if k not in n:
            gone.append({"slug": r["slug"], "role": r["role"], "tier": r["tier"], "winRate": r["winRate"], "matches": r["matches"]})
    changes.sort(key=lambda c: -abs(c["wr_delta"]))
    return {"from": {"patch": old["patch"], "fetched_at": old["fetched_at"], "file": old.get("_file")},
            "to": {"patch": new["patch"], "fetched_at": new["fetched_at"]},
            "changes": changes, "new": added, "gone": gone}


def compute_changes(current, bracket):
    snaps = [s for s in load_snapshots(bracket) if s["fetched_at"] < current["fetched_at"]]
    prev_run = snaps[-1] if snaps else None
    prev_patch = None
    for s in reversed(snaps):
        if s["patch"] != current["patch"]:
            prev_patch = s
            break
    return {
        "snapshots_on_disk": len(snaps) + 1,
        "vs_previous_run": diff_snapshots(prev_run, current) if prev_run else None,
        "vs_previous_patch": diff_snapshots(prev_patch, current) if prev_patch else None,
    }


# Pred.gg history is independently validated and never reads Statz snapshots.
def history_time(value):
    if not isinstance(value,str): raise ValueError('History source timestamp missing')
    parsed=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
    if parsed.tzinfo is None: raise ValueError('History source timestamp lacks timezone')
    return parsed.astimezone(dt.timezone.utc)


def history_cohort(value):
    if value.get('source')!='Pred.gg': raise ValueError('History source must be Pred.gg')
    if not re.fullmatch(r'\d+\.\d+(?:\.\d+)?',str(value.get('patch',''))): raise ValueError('History patch missing')
    if value.get('bracket') not in BRACKETS or value.get('bracket_label')!=value['bracket'].title()+'+': raise ValueError('History bracket missing/mismatched')
    if not isinstance(value.get('rating'),str) or not value['rating'].strip(): raise ValueError('History rating system missing')
    result={k:value[k] for k in ('source','patch','bracket','bracket_label','rating')}
    for k in ('versions','ranks','gameModes'):
        a=value.get(k)
        if not isinstance(a,list) or not a or any(not isinstance(x,str) or not x for x in a) or len(set(a))!=len(a): raise ValueError('History invalid '+k)
        if k!='gameModes' and any(not x.isdigit() for x in a): raise ValueError('History invalid '+k+' IDs')
        result[k]=sorted(a,key=int) if k!='gameModes' else sorted(a)
    if len(result['versions'])!=1 or result['gameModes']!=['RANKED']: raise ValueError('History needs one patch and ranked mode')
    return result


def history_row(row,role=None):
    slug=row.get('slug');r=row.get('role')
    if not isinstance(slug,str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',slug) or r not in ROLES or role and r!=role: raise ValueError('History hero/role identity missing')
    n=row.get('matches');w=row.get('wonGames');wr=row.get('winRate');b=row.get('banGames')
    if type(n) is not int or n<0 or type(w) is not int or not 0<=w<=n: raise ValueError('History wins/games invalid: '+slug)
    if (n==0 and wr is not None) or (n>0 and (type(wr) not in (int,float) or not math.isfinite(wr) or abs(wr-100*w/n)>1e-7)): raise ValueError('History rate does not reconcile: '+slug)
    if b is not None and (type(b) is not int or b<0): raise ValueError('History ban count invalid')
    hero_id=row.get('source_hero_id')
    if not isinstance(hero_id,str) or not hero_id.isdigit(): raise ValueError('History source hero ID missing')
    return {k:row[k] for k in ('slug','role','source_hero_id','winRate','matches','wonGames')}|{'banGames':b}


def scoped_snapshot(bundle,origin='live collection'):
    """Keep real source dates. A cached import is historical, never a new observation."""
    p=bundle.get('scoped_statistics') or {};official=bundle.get('official') or {}
    if bundle.get('offline') or p.get('status')!='ok' or p.get('errors'): raise ValueError('Pred.gg cohort is missing, partial or offline')
    cohort=history_cohort(p)
    if official.get('status')!='verified' or official.get('live',{}).get('version')!=cohort['patch']: raise ValueError('History patch was not officially verified')
    roster=set(p.get('hero_wide') or {})
    if not roster or set(p.get('roles') or {})!=set(ROLES): raise ValueError('History role/roster coverage incomplete')
    records={};source_rows={}
    for role in ROLES:
        block=p['roles'][role]
        if block.get('status')!='ok': raise ValueError('History role failed: '+role)
        url=block.get('url');when=block.get('fetched_at');history_time(when)
        if url!=pred_stats_url(cohort,role): raise ValueError('History source URL does not match cohort')
        records[role]={'url':url,'fetched_at':when}
        seen=set()
        for row in block.get('rows',[]):
            clean=history_row(row,role);key=(clean['slug'],role)
            if clean['slug'] in seen: raise ValueError('History duplicate source row')
            seen.add(clean['slug']);source_rows[key]=clean
            expected={k:cohort[k] for k in ('versions','gameModes','ranks')}|{'roles':[role.upper()]}
            if row.get('source')!='Pred.gg' or row.get('url')!=url or row.get('fetched_at')!=when or any(sorted(row.get('filter',{}).get(k,[]))!=sorted(v) for k,v in expected.items()): raise ValueError('History row cohort differs from its source')
        if seen!=roster: raise ValueError('History role roster is incomplete: '+role)
    rows=[];seen=set()
    for row in p.get('rows',[]):
        clean=history_row(row);key=(clean['slug'],clean['role'])
        if key in seen or clean!=source_rows.get(key): raise ValueError('History supported row is duplicated or differs from source')
        seen.add(key);rows.append(clean)
    if not rows: raise ValueError('History has zero supported rows')
    snap={'schema':1,'cohort':cohort,'fetched_at':max((r['fetched_at'] for r in records.values()),key=history_time),
          'records':records,'rows':sorted(rows,key=lambda r:(r['role'],r['slug']))}
    snap['id']=hashlib.sha256(json.dumps(snap,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    snap['origin']={'kind':origin,'bundle_generated_at':bundle.get('generated_at'),'bundle_version':bundle.get('tool_version')}
    return snap


def validate_scoped_snapshot(s):
    if s.get('schema')!=1: raise ValueError('Unsupported history schema')
    cohort=history_cohort(s.get('cohort') or {});records=s.get('records') or {}
    if cohort!=s['cohort']: raise ValueError('History cohort is not canonical')
    if set(records)!=set(ROLES): raise ValueError('History source records incomplete')
    for role,record in records.items():
        history_time(record.get('fetched_at'))
        if record.get('url')!=pred_stats_url(cohort,role): raise ValueError('History source URL differs from cohort')
    if history_time(s.get('fetched_at'))!=max(history_time(r['fetched_at']) for r in records.values()): raise ValueError('History date differs from source dates')
    rows=s.get('rows');seen=set()
    if not isinstance(rows,list) or not rows: raise ValueError('History has no rows')
    for row in rows:
        clean=history_row(row);key=(clean['slug'],clean['role'])
        if key in seen or clean!=row: raise ValueError('History duplicate or unexpected row fields')
        seen.add(key)
    digest=hashlib.sha256(json.dumps({k:s[k] for k in ('schema','cohort','fetched_at','records','rows')},sort_keys=True,separators=(',',':')).encode()).hexdigest()
    if s.get('id')!=digest: raise ValueError('History snapshot integrity mismatch')
    return s


def scoped_history_compatible(old,new,same_patch=False):
    a,b=old['cohort'],new['cohort']
    keys=('source','bracket','bracket_label','rating','ranks','gameModes')+ (('patch','versions') if same_patch else ())
    return all(a[k]==b[k] for k in keys)


def diff_scoped_snapshots(old,new):
    validate_scoped_snapshot(old);validate_scoped_snapshot(new)
    if not scoped_history_compatible(old,new) or history_time(old['fetched_at'])>=history_time(new['fetched_at']): raise ValueError('History cohorts/dates cannot be compared')
    if old['cohort']['patch']==new['cohort']['patch'] and old['cohort']['versions']!=new['cohort']['versions']: raise ValueError('History patch identity changed')
    before={(r['slug'],r['role']):r for r in old['rows']};after={(r['slug'],r['role']):r for r in new['rows']}
    changes=[];added=[];gone=[]
    for key in sorted(set(before)|set(after)):
        a=before.get(key);b=after.get(key)
        # Zero games means no rate, not 0%. Overlapping cohorts are never subtracted into incremental match rates.
        if a and b and a['matches'] and b['matches']:
            if a['source_hero_id']!=b['source_hero_id']: raise ValueError('History hero ID changed for '+key[0])
            changes.append({'slug':key[0],'role':key[1],'before':a,'after':b,'wr_delta':b['winRate']-a['winRate'],
                            'minimum_sample':min(a['matches'],b['matches']), 'sample_decreased':b['matches']<a['matches']})
        elif b and b['matches']:added.append(b)
        elif a and a['matches']:gone.append(a)
    return {'from':{k:old[k] for k in ('cohort','fetched_at','records','origin')},'to':{k:new[k] for k in ('cohort','fetched_at','records','origin')},
            'changes':changes,'new':added,'gone':gone,
            'note':'Rate movements compare overlapping or changing source populations. They are not independent samples, causal patch effects, incremental-match win rates, or confidence intervals for a change. Newly available/unavailable rows can reflect eligibility or sample coverage.'}


def attach_scoped_history(bundle,import_saved=True):
    out={'source':'Pred.gg','status':'unavailable','errors':[],'vs_previous_run':None,'vs_previous_patch':None,'snapshots_on_disk':0,'imported':0}
    bundle['scoped_changes']=out
    try:current=scoped_snapshot(bundle)
    except (ValueError,TypeError,KeyError) as e:out['reason']=str(e);return out
    directory=SNAP_DIR/'pred';seen={}
    try:directory.mkdir(parents=True,exist_ok=True)
    except OSError as e:
        out['reason']='Could not create history directory: '+str(e)
        bundle.setdefault('errors',[]).append({'source':'Pred.gg local history','severity':'warning','detail':out['reason']})
        return out
    def report(name,error):out['errors'].append({'file':name,'detail':str(error)})
    def store(s):
        if s['id'] in seen:return False
        path=directory/('pred_'+s['id']+'.json')
        if path.exists():validate_scoped_snapshot(load_bundle(path))
        else:atomic_write(path,json.dumps(s,ensure_ascii=False,separators=(',',':')))
        seen[s['id']]=s;return True
    for path in sorted(directory.glob('pred_*.json')):
        try:s=validate_scoped_snapshot(load_bundle(path));seen[s['id']]=s
        except (OSError,ValueError,TypeError,KeyError) as e:report(path.name,e)
    # Existing public source records can seed history without refetching or changing their dates.
    if import_saved:
        paths=set(DATA_DIR.glob('bundle_patch*.json'))|set(DATA_DIR.glob('last_successful_*.json'))|{LATEST_BUNDLE}
        for path in sorted(paths):
            if not path.exists():continue
            try:
                old=load_bundle(path)
                if not old.get('scoped_statistics'):continue  # Legacy Statz-only bundles are a different source.
                s=scoped_snapshot(old,'retained source bundle')
                if s['id']!=current['id'] and store(s):out['imported']+=1
            except (OSError,ValueError,TypeError,KeyError) as e:report(path.name,e)
    try:store(current)
    except (OSError,ValueError,TypeError,KeyError) as e:report('current snapshot',e)
    older=[s for s in seen.values() if history_time(s['fetched_at'])<history_time(current['fetched_at']) and scoped_history_compatible(s,current)]
    older.sort(key=lambda s:history_time(s['fetched_at']))
    same=[s for s in older if scoped_history_compatible(s,current,True)]
    version=lambda patch:tuple(map(int,patch.split('.')))+(0,)*(3-len(patch.split('.')))
    patches=[s for s in older if version(s['cohort']['patch'])<version(current['cohort']['patch'])]
    for key,choices in [('vs_previous_run',same),('vs_previous_patch',patches)]:
        if choices:
            try:out[key]=diff_scoped_snapshots(choices[-1],current)
            except (ValueError,TypeError,KeyError) as e:report(key,e)
    out.update({'status':'partial' if out['errors'] else 'ok','current':{k:current[k] for k in ('cohort','fetched_at','records','origin')},
                'snapshots_on_disk':len(seen),'compatible_prior_collections':len(older)})
    if out['errors']:bundle.setdefault('errors',[]).append({'source':'Pred.gg local history','severity':'warning','detail':'Some history records could not be used: '+'; '.join(x['file']+': '+x['detail'] for x in out['errors'])})
    return out


# ============================================================================
# 9. BUNDLE + CACHE
# ============================================================================

def bundle_path(patch, bracket):
    return DATA_DIR / ("bundle_patch%s_%s.json" % (patch, bracket))


def save_bundle(bundle, path, also_latest=True):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    text = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    atomic_write(path, text)
    if also_latest:
        atomic_write(LATEST_BUNDLE, text)


def load_bundle(path):
    return json.loads(path.read_text(encoding="utf-8"))


def bundle_is_complete(b):
    """A cached bundle may be reused only if nothing in it is missing, blocked, offline or conflicting."""
    try:
        if b.get("schema") != 3:
            return False, "bundle schema needs an upgrade"
        if b["sources"].get("statz_tierlist",{}).get("status")!="ok":
            return False, "Statz tier list was not refreshed"
        src = b["sources"]["statz_hero_pages"]
        if src.get("status") != "ok" or src.get("offline"):
            return False, "hero pages were %s" % (src.get("status") or "incomplete")
        if b["sources"]["omeda_heroes"].get("status") != "ok":
            return False, "omeda.city kit data was missing"
        if b.get("failed_pages") or b.get("patch_conflicts"):
            return False, "%d hero page(s) were missing or conflicting" % (len(b.get("failed_pages") or []) + len(b.get("patch_conflicts") or []))
        if any(e.get("severity") == "error" for e in b.get("errors", [])):
            return False, "it recorded a source error"
        return True, "complete"
    except Exception as e:
        return False, "unreadable (%s)" % e


def build_bundle(tier, tier_fetch, page_results, omeda_heroes, omeda_items, omeda_meta, settings, bracket, pull_timing):
    errors = []
    warnings = []
    offline = bool(pull_timing.get("offline"))

    # ---- canonical statz hero list (all 54, incl. heroes with no tier-list data) ----
    statz_hero_list = []
    for r in page_results.values():
        if r.get("ok") and r["data"].get("heroes"):
            statz_hero_list = r["data"]["heroes"]
            break
    if not statz_hero_list:
        warnings.append({"source": "statz.gg hero pages", "detail": "no page carried the 'var heroes' list; hero roster limited to the tier list"})

    heroes = {}
    for h in statz_hero_list:
        try:
            heroes[h["name"]] = {
                "slug": h["name"], "display_name": h["display_name"],
                "image": statz_image_name(h["display_name"]),
                "statz_roles": [statz_role_normalize(r) for r in (h.get("roles") or [])],
                "tier_roles": [], "roles": {},
            }
        except Exception as e:
            warnings.append({"source": "statz.gg var heroes", "detail": "skipped entry %r: %s" % (h, e)})
    for r in tier["rows"]:
        h = heroes.setdefault(r["slug"], {"slug": r["slug"], "display_name": r["display_name"], "image": None,
                                          "statz_roles": [], "tier_roles": [], "roles": {}})
        if r["image"]:
            h["image"] = r["image"]          # harvested, handles 'Iggy-&-Scorch.webp', 'GRIM.exe.webp', 'Lt.-Belica.webp'
        if r["role"] not in h["tier_roles"]:
            h["tier_roles"].append(r["role"])
        if r["role"] not in h["statz_roles"]:
            h["statz_roles"].append(r["role"])

    # ---- omeda join (by slug; report every mismatch) ----
    om_by_slug = {h["slug"]: h for h in (omeda_heroes or [])}
    if omeda_heroes:
        missing_in_omeda = sorted(s for s in heroes if s not in om_by_slug)
        missing_in_statz = sorted(s for s in om_by_slug if s not in heroes)
        if missing_in_omeda:
            warnings.append({"source": "join statz<->omeda", "detail": "statz heroes with no omeda match (no kit data): %s" % ", ".join(missing_in_omeda)})
        if missing_in_statz:
            warnings.append({"source": "join statz<->omeda", "detail": "omeda heroes with no statz match: %s" % ", ".join(missing_in_statz)})
    for slug, h in heroes.items():
        o = om_by_slug.get(slug)
        if not o:
            h["omeda"] = None
            continue
        h["omeda"] = {"id": o["id"], "name": o.get("name"), "image": o.get("image"),
                      "roles": [x for x in (omeda_role_normalize(r) for r in o.get("roles") or []) if x],
                      "classes": o.get("classes") or []}
        h["classes"] = o.get("classes") or []
        h["abilities"] = [{
            "key": a.get("key"), "display_name": a.get("display_name"), "image": a.get("image"),
            "cooldown": a.get("cooldown"), "cost": a.get("cost"),
            "game_description": a.get("game_description"), "menu_description": a.get("menu_description"),
        } for a in (o.get("abilities") or []) if isinstance(a, dict)]

    # ---- per hero/role data from statz pages ----
    perks, items = {}, {}
    image_index = {"heroes": {}, "items": {}, "perks": {}}
    patch_conflicts = []
    bracket_labels = set()
    ranked_fields = set()
    failed_pages = []
    blocked = False
    for key, r in sorted(page_results.items()):
        slug, role = key.split("|")
        h = heroes.setdefault(slug, {"slug": slug, "display_name": slug, "image": None, "statz_roles": [role], "tier_roles": [], "roles": {}})
        if not r.get("ok"):
            h["roles"][role] = {"status": "failed", "error": r.get("error")}
            failed_pages.append({"slug": slug, "role": role, "error": r.get("error"), "url": statz_hero_url(slug, role, bracket)})
            blocked = blocked or bool(r.get("blocked")) or "blocked" in str(r.get("error") or "")
            continue
        d = r["data"]
        if d.get("patch") and d["patch"] != tier["patch"]:
            # Surface, never blend: a page from another patch is excluded like a failed page.
            patch_conflicts.append({"slug": slug, "role": role, "page_patch": d["patch"], "tier_list_patch": tier["patch"]})
            h["roles"][role] = {"status": "patch_conflict", "error": "page reports Patch %s but the tier list says Patch %s - excluded; run Refresh Data.bat later" % (d["patch"], tier["patch"])}
            continue
        try:
            ls = d["laneStats"]
            if d.get("bracket_label"):
                bracket_labels.add(d["bracket_label"])
            if ls.get("ranked"):
                ranked_fields.add(str(ls["ranked"]))
            hl = ls.get("heroLanes") or {}
            if "hero_wide" not in h:
                h["hero_wide_url"] = r.get("url") or statz_hero_url(slug, role, bracket)
                h["hero_wide_fetched_at"] = r.get("fetched_at") or pull_timing.get("fetched_at")
                h["hero_wide"] = {
                    "tier": hl.get("tier"), "winRate": hl.get("winRate"), "pickRate": hl.get("pickRate"),
                    "banRate": hl.get("banRate", ls.get("banRate")), "wonGames": _games(hl.get("wonGames")),
                    "playedGames": _games(hl.get("playedGames")), "banGames": hl.get("banGames", ls.get("banGames")),
                    "defaultLane": (str(hl.get("defaultLane") or "")).lower() or None,
                    "possibleLanes": [x for x in (omeda_role_normalize(l) for l in hl.get("possibleLanes") or []) if x],
                    "source": "statz.gg heroLanes on the %s/%s page" % (slug, role),
                }
                h["_teammates_raw"] = [t for t in (hl.get("teamMatesStats") or []) if isinstance(t, dict) and t.get("name")]
                h["general_strong_against"] = [{"slug": e["name"], "display_name": e.get("display_name"), "played": _games(e.get("playedGames")),
                                                "won": _games(e.get("wonGames")), "wr": e.get("winRate")}
                                               for e in (hl.get("generalStrongAgainstStats") or []) if isinstance(e, dict) and e.get("name")]
                h["general_counters"] = [{"slug": e["name"], "display_name": e.get("display_name"), "played": _games(e.get("playedGames")),
                                          "won": _games(e.get("wonGames")), "wr": e.get("winRate")}
                                         for e in (hl.get("generalCountersStats") or []) if isinstance(e, dict) and e.get("name")]
                h["lane_previews"] = hl.get("lane_previews") or []
            if d.get("abilities"):
                h["statz_abilities"] = {k: {"display_name": v.get("display_name"), "key": v.get("key"),
                                            "menu_description": v.get("menu_description"), "cooldown": v.get("cooldown"), "cost": v.get("cost")}
                                        for k, v in d["abilities"].items() if isinstance(v, dict)}
            h["roles"][role] = {
                "status": "ok", "tier": ls.get("tier"), "rank": ls.get("rank"), "winRate": ls.get("winRate"),
                "pickRate": ls.get("pickRate"), "banRate": ls.get("banRate"), "wonGames": _games(ls.get("wonGames")),
                "playedGames": _games(ls.get("playedGames")), "banGames": ls.get("banGames"), "ranked": ls.get("ranked"),
                "builds": [trim_build(b) for b in ls.get("builds_by_perk") or [] if isinstance(b, dict)],
                "matchups": aggregate_matchups(ls),
                "fetch_secs": r.get("secs"), "fetched_at": r.get("fetched_at") or pull_timing.get("fetched_at"), "patch": d["patch"], "url": r.get("url") or statz_hero_url(slug, role, bracket),
            }
            for k, v in (d.get("perks") or {}).items():
                if k not in perks and isinstance(v, dict):
                    perks[k] = {"display_name": v.get("display_name"), "slot": v.get("slot"), "hero": v.get("hero"),
                                "description": clean_text(v.get("description")), "image": statz_image_name(v.get("display_name") or k)}
            for k, v in (d.get("items") or {}).items():
                if k not in items and isinstance(v, dict):
                    items[k] = {"name": v.get("name"), "total_price": v.get("total_price"), "stats": v.get("stats") or {},
                                "effects": [{"name": e.get("name"), "active": e.get("active"), "cooldown": e.get("cooldown"),
                                             "condition": clean_text(e.get("condition")), "text": clean_text(e.get("menu_description"))}
                                            for e in (v.get("effects") or []) if isinstance(e, dict)],
                                "image": statz_image_name(v.get("name") or k)}
            for kind, names in (d.get("image_names") or {}).items():
                for fn in names:
                    image_index[kind][norm_key(fn[:-5])] = fn
        except Exception as e:
            # A shape change inside one page must mark that hero, never kill the run.
            msg = "page parsed but its data had an unexpected shape: %s: %s" % (type(e).__name__, e)
            h["roles"][role] = {"status": "failed", "error": msg}
            failed_pages.append({"slug": slug, "role": role, "error": msg, "url": statz_hero_url(slug, role, bracket)})

    for slug, h in heroes.items():
        if not h.get("image"):
            h["image"] = statz_image_name(h["display_name"])

    # ---- derived kit tags (omeda first; statz ability text as fallback) ----
    for slug, h in heroes.items():
        src = "omeda.city heroes.json"
        if not h.get("abilities") and h.get("statz_abilities"):
            src = "statz.gg ability text (omeda match missing)"
            h["abilities"] = [{"key": v.get("key"), "display_name": v.get("display_name"), "image": None, "cooldown": v.get("cooldown"),
                               "cost": v.get("cost"), "game_description": "", "menu_description": v.get("menu_description")}
                              for v in h["statz_abilities"].values()]
        if h.get("abilities"):
            try:
                tags, ev = derive_tags(h)
                h["tags"], h["tag_evidence"], h["tags_source"] = tags, ev, src
            except Exception as e:
                h["tags"], h["tag_evidence"], h["tags_source"] = None, {}, None
                warnings.append({"source": "kit tagging", "detail": "%s: tagging failed (%s); derived synergy unavailable for this hero" % (slug, e)})
        else:
            h["tags"], h["tag_evidence"], h["tags_source"] = None, {}, None
            warnings.append({"source": "kit tagging", "detail": "%s: no ability text from omeda or statz; derived synergy unavailable" % slug})
        for a in h.get("abilities") or []:
            a["text"] = clean_text(a.get("menu_description") or a.get("game_description"))
            a["game_text"] = clean_text(a.get("game_description"))
            # Raw semantic descriptions are retained for kit evidence and verified corrections.
        possible = set(h["statz_roles"]) | set((h.get("omeda") or {}).get("roles") or [])
        h["roles_order"] = [r for r in ROLES if r in possible]
        h["role_evidence"] = {r: ("statz.gg role sample" if r in h["tier_roles"] else "omeda.city suggested role; no statz role sample") for r in h["roles_order"]}
        for r in h["roles_order"]:
            h["roles"].setdefault(r, {"status": "unavailable", "error": "No statz hero/role page in this bracket's tier list."})

    # ---- measured pairs + the censoring statz applies to its teammate lists ----
    pairs, unresolved = compute_pairs(heroes)
    all_raw = [t for h in heroes.values() for t in (h.get("_teammates_raw") or [])]
    listed_wrs = [float(t["winRate"]) for t in all_raw if isinstance(t.get("winRate"), (int, float))]
    pairs_meta = {
        "entries": len(all_raw),
        "min_listed_wr": round(min(listed_wrs), 1) if listed_wrs else None,
        "max_list_len": max((len(h.get("_teammates_raw") or []) for h in heroes.values()), default=0),
        "one_sided": bool(listed_wrs) and min(listed_wrs) >= 50.0,
        "note": "Statz publishes selective teammate lists. An absent pair is unknown, not evidence of a bad pairing. Pair samples are hero-wide; their role and queue composition are not provided.",
    }
    for h in heroes.values():
        h["partners_listed"] = len(h.get("_teammates_raw") or [])
        # Keep raw observations to allow independent recalculation and audit.
    if unresolved:
        missing = sorted({u.split(" -> ")[1].split(" (")[0] for u in unresolved})
        warnings.append({"source": "synergy", "detail": "%d teammate entries involve heroes that have no statz hero page in this bracket (%s), so no baseline exists and those pairs are not ranked." % (len(unresolved), ", ".join(heroes[m]["display_name"] if m in heroes else m for m in missing))})

    # ---- how big is the hero-wide pool compared with the tier list? (statz does not say why they differ) ----
    tier_games = sum(_games(r.get("matches")) for r in tier["rows"])
    hw_games = sum((h.get("hero_wide") or {}).get("playedGames") or 0 for h in heroes.values())
    pool_ratio = round(hw_games / tier_games, 2) if tier_games else None
    pool_note = None
    if pool_ratio and pool_ratio > 1.1:
        pool_note = ("hero-wide figures (hero-wide win rate, pairs, hero-wide matchups, ban rate) come from a pool about %.1fx the "
                     "games on the %s tier list; statz does not state what the extra games are" % (pool_ratio, tier.get("bracket_label") or bracket))
        warnings.append({"source": "statz.gg hero pages", "detail": pool_note})

    # ---- errors and warnings ----
    ok_pages = sum(1 for r in page_results.values() if r.get("ok"))
    if ok_pages == 0:
        errors.append({"source": "statz.gg hero pages", "severity": "error", "detail": "0 of %d hero/role pages parsed. Statz build variants, pair observations and matchups are unavailable; independent Pred.gg panels have their own status." % len(page_results)})
    if blocked:
        errors.append({"source": "statz.gg hero pages", "severity": "error",
                       "detail": "statz.gg rate-limited or blocked the run; %d of %d hero/role pages are missing. Wait an hour, then double-click Refresh Data.bat." % (len(failed_pages), len(page_results))})
    elif failed_pages and len(failed_pages) > FAILED_PAGE_ERROR_SHARE * max(1, len(page_results)):
        errors.append({"source": "statz.gg hero pages", "severity": "error",
                       "detail": "%d of %d hero/role pages failed to load or parse (listed below and on the Data tab). Double-click Refresh Data.bat to try again." % (len(failed_pages), len(page_results))})
    for fp in failed_pages:
        errors.append({"source": "statz.gg hero page %s/%s" % (fp["slug"], fp["role"]), "severity": "warning", "detail": fp["error"]})
    if patch_conflicts:
        errors.append({"source": "statz.gg", "severity": "error", "detail": "%d hero page(s) report a different patch than the tier list (%s). Those pages were EXCLUDED, not blended; see the Data tab and run Refresh Data.bat later." % (len(patch_conflicts), tier["patch"])})
    if not omeda_heroes:
        errors.append({"source": "omeda.city heroes.json", "severity": "error", "detail": omeda_meta.get("heroes_error") or "unavailable"})
    if omeda_items is None and omeda_meta.get("items_error"):
        errors.append({"source": "omeda.city items.json", "severity": "warning", "detail": omeda_meta["items_error"]})
    for p in SETTINGS_PROBLEMS:
        warnings.append({"source": "settings.json", "detail": p})
    for w in warnings:
        errors.append({"source": w["source"], "severity": "warning", "detail": w["detail"]})

    omeda_items_index = {}
    for it in omeda_items or []:
        try:
            omeda_items_index[it["id"]] = {"display_name": it.get("display_name"), "slug": it.get("slug"), "image": it.get("image"),
                                           "slot_type": it.get("slot_type"), "total_price": it.get("total_price"), "rarity":it.get("rarity"), "build_paths":it.get("build_paths"), "requirements":it.get("requirements"), "stats":it.get("stats",{})}
        except Exception:
            continue

    hero_pages_status = "ok" if ok_pages and ok_pages == len(page_results) and not patch_conflicts else ("partial (%d missing)" % (len(failed_pages) + len(patch_conflicts)) if ok_pages else "failed")
    bundle = {
        "schema": 3, "tool_version": VERSION, "generated_at": iso(now_utc()), "offline": offline,
        "patch": tier["patch"], "patch_conflicts": patch_conflicts,
        "bracket": {"segment": bracket, "label": tier.get("bracket_label") or (sorted(bracket_labels)[0] if bracket_labels else None),
                    "statz_ranked_field": sorted(ranked_fields), "options": tier.get("bracket_options") or [],
                    "note": "statz.gg labels this bracket '%s'. The tool shows exactly what statz reports for that selection; whether it is ranked-queue-only is not stated by statz and is not claimed here." % (tier.get("bracket_label") or bracket)},
        "sources": {
            "statz_tierlist": {"url": statz_tierlist_url(bracket), "fetched_at": tier_fetch["fetched_at"], "secs": tier_fetch["secs"], "rows": len(tier["rows"]),
                               "status": "offline (read from disk)" if tier_fetch.get("offline") else "ok"},
            "statz_hero_pages": {"url_pattern": statz_hero_url("{hero}", "{role}", bracket), "fetched_at": None if offline else pull_timing["fetched_at"],
                                 "status": "offline (read from disk)" if offline else hero_pages_status,
                                 "total_secs": None if offline else pull_timing["secs"], "concurrency": settings["concurrency"], "stagger_secs": REQUEST_STAGGER,
                                 "ok": ok_pages, "failed": len(failed_pages), "conflicting": len(patch_conflicts), "requested": len(page_results),
                                 "mean_secs": None if offline else round(sum((r.get("secs") or 0) for r in page_results.values() if r.get("ok")) / max(1, ok_pages), 2),
                                 "offline": offline, "blocked": blocked},
            "omeda_heroes": {"url": OMEDA_BASE + "/heroes.json", "fetched_at": omeda_meta.get("fetched_at"), "secs": omeda_meta.get("heroes_secs"),
                             "count": len(omeda_heroes or []), "status": ("offline (read from disk)" if omeda_meta.get("offline") else "ok") if omeda_heroes else "failed", "error": omeda_meta.get("heroes_error")},
            "omeda_items": {"url": OMEDA_BASE + "/items.json", "fetched_at": omeda_meta.get("fetched_at"), "secs": omeda_meta.get("items_secs"),
                            "count": len(omeda_items or []), "status": ("offline (read from disk)" if omeda_meta.get("offline") else "ok") if omeda_items else "failed", "error": omeda_meta.get("items_error")},
        },
        "errors": errors,
        "roles_order": ROLES, "role_label": ROLE_LABEL, "tier_order": TIER_ORDER,
        "thresholds": {"min_pair_games": MIN_PAIR_GAMES, "thin_pair_games": THIN_PAIR_GAMES},
        "heroes": heroes, "tier_list": tier["rows"], "pairs": pairs, "pairs_meta": pairs_meta,
        "pool_ratio": pool_ratio, "pool_note": pool_note,
        "matchup_note": "statz lists at most 8 counters and 8 favourable opponents per build variant, chosen by win rate, so opponents near 50% are absent and 'Games' is only the games in those lists",
        "perks": perks, "items": items, "omeda_items": omeda_items_index, "image_index": image_index,
        "failed_pages": failed_pages, "settings": settings,
        "cache": {"used": False},
    }
    return bundle


# ============================================================================
# 10. RENDER
# ============================================================================

def render(bundle, out_path=None):
    out_path = out_path or OUT_HTML
    if not UI_TEMPLATE.exists():
        raise RuntimeError("ui.html is missing next to predecessor_meta.py - cannot render")
    tpl = UI_TEMPLATE.read_text(encoding="utf-8")
    if "__BUNDLE_JSON__" not in tpl:
        raise RuntimeError("ui.html has no __BUNDLE_JSON__ placeholder - cannot render")
    payload = json.dumps(bundle, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    out_path.write_text(tpl.replace("__BUNDLE_JSON__", payload, 1), encoding="utf-8")
    return out_path


def render_error_page(title, lines):
    body = "".join("<li>%s</li>" % htmllib.escape(str(l)) for l in lines)
    OUT_HTML.write_text(
        "<!doctype html><html><head><meta charset='utf-8'><title>Predecessor Meta - error</title>"
        "<style>body{background:#0f131e;color:#d2d3d5;font-family:Segoe UI,system-ui,sans-serif;padding:40px;max-width:900px}"
        "h1{color:#ff364f}li{margin:8px 0}code{background:#2f3c5f;padding:2px 6px;border-radius:4px}</style></head><body>"
        "<h1>%s</h1><ul>%s</ul><p>Nothing was rendered from stale or partial data. Fix the problem and run again "
        "(double-click <code>Predecessor Meta Tool.bat</code>).</p></body></html>" % (htmllib.escape(title), body),
        encoding="utf-8")
    return OUT_HTML


def open_in_browser(path):
    try:
        os.startfile(str(path))  # Windows
    except Exception as e:
        log("Could not open the browser automatically (%s). Open this file yourself: %s" % (e, path))



# ============================================================================
# 11. VALIDATION + OFFICIAL PATCH EVIDENCE
# ============================================================================

def checked_number(value, field, low=None, high=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('%s: missing or invalid number (%r)' % (field, value))
    if (low is not None and value < low) or (high is not None and value > high):
        raise ValueError('%s: out of range (%r)' % (field, value))
    return value


def validate_observation(obj, field):
    if not isinstance(obj, dict):
        raise ValueError(field + ': expected an observation object')
    n, w = _games(obj.get('playedGames')), _games(obj.get('wonGames'))
    wr = checked_number(obj.get('winRate'), field + '.winRate', 0, 100)
    if not n or w > n:
        raise ValueError(field + ': invalid wins/sample')
    if abs(w * 100 / n - wr) > 0.11:
        raise ValueError(field + ': source win rate disagrees with wins/sample')
    return n, w, wr


def validate_metrics(obj, field):
    if isinstance(obj, dict):
        observation = any(k in obj for k in ('playedGames', 'wonGames', 'winRate'))
        if observation:
            validate_observation(obj, field)
        for key in ('pickRate', 'banRate'):
            if key in obj:
                checked_number(obj[key], field + '.' + key, 0, 100)
        for key, value in obj.items():
            if key == 'banGames': _games(value)
            if isinstance(value, (list, dict)): validate_metrics(value, field + '.' + key)
    elif isinstance(obj, list):
        for i, value in enumerate(obj): validate_metrics(value, '%s[%d]' % (field, i))


def wilson(wins, games):
    n, w = _games(games), _games(wins)
    if n == 0 or w > n: raise ValueError('Wilson requires a valid observed sample')
    z, p = 1.959963984540054, w / n
    den = 1 + z * z / n
    center = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return [round(max(0, center - half) * 100, 2), round(min(1, center + half) * 100, 2)]


def atomic_write(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.' + secrets.token_hex(5) + '.tmp')
    try:
        with tmp.open('w', encoding='utf-8', newline='\n') as f:
            f.write(text); f.flush(); os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if tmp.exists(): tmp.unlink()


OFFICIAL_INDEX = 'https://www.predecessorgame.com/en-US/news/patch-notes'
OFFICIAL_ORIGIN = 'https://www.predecessorgame.com'


class OfficialReader(HTMLParser):
    """Official news HTML only. Statz ingestion remains in section 3."""
    def __init__(self):
        super().__init__(); self.skip = 0; self.active = None; self.parts = []; self.blocks = []; self.links = []; self.anchor = ''
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag in ('script', 'style'): self.skip += 1
        if self.skip: return
        if tag == 'a' and d.get('href'): self.links.append(d['href']); self.anchor = d['href']
        if tag == 'img': self.blocks.append(('image', d.get('src', '')))
        if tag in ('h1', 'h2', 'h3', 'h4', 'p', 'blockquote'):
            if tag.startswith('h') and tag != 'h1' and '/news/patch-notes/' in self.anchor: return
            self.active = tag; self.parts = []
        if tag == 'br' and self.active: self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag == 'a': self.anchor = ''
        if tag in ('script', 'style'): self.skip = max(0, self.skip - 1)
        if tag == self.active:
            self.blocks.append((tag, re.sub(r'[ \t]+', ' ', ''.join(self.parts)).strip()))
            self.active = None; self.parts = []
    def handle_data(self, data):
        if self.active and not self.skip: self.parts.append(data)


def patch_tuple(s):
    return tuple(int(n) for n in s.split('.'))


def official_article_fingerprint(blocks):
    canonical=[(t,v) for t,v in blocks if t!='image' and not re.search(r'\d+ (days?|hours?|minutes?) ago|©\s*Copyright',v,re.I)]
    return hashlib.sha256(json.dumps(canonical,ensure_ascii=False).encode()).hexdigest()


def verified_history_article(article,source):
    return bool(article.get('url')==source['url'] and article.get('version')==source['version'] and
                article.get('fetched_at') and article.get('fingerprint')==source['fingerprint'] and
                official_article_fingerprint(article['blocks'])==source['fingerprint'])


def official_parse(html, url):
    p = OfficialReader(); p.feed(html)
    title = next((v for t, v in p.blocks if t == 'h1'), '')
    version = re.search(r'\bv?(\d+\.\d+(?:\.\d+)?)\b', title, re.I)
    if not version: raise ValueError('Official patch article has no version heading: ' + url)
    text = '\n'.join(v for t, v in p.blocks if t != 'image')
    # Prefer explicit release wording; publication date is not a release date.
    released = None
    match = re.search(r'(?:launch(?:es|ing)?|releases?|available|live)[^\n]{0,70}?\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(20\d\d))?', text, re.I)
    if match:
        year = int(match.group(3) or now_utc().year)
        released = dt.datetime.strptime('%s %s %s' % (match.group(1), match.group(2), year), '%d %B %Y').date().isoformat()
    if not released:
        match = re.search(r'(?:launch(?:es|ing)?|releases?|available|live)[^\n]{0,70}?\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d\d))?', text, re.I)
        if match:
            released = dt.datetime.strptime('%s %s %s' % (match.group(2), match.group(1), match.group(3) or now_utc().year), '%d %B %Y').date().isoformat()
    today = now_utc().date().isoformat()
    status = 'announced' if released and released > today else ('live' if released else 'release date unverified')
    # Actual hotfix labels are dated paragraphs, not the related-news card headings.
    publication = re.search(r'>\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s*(20\d\d)\s*<',html,re.I)
    publication_year = int(publication.group(2)) if publication else now_utc().year
    hotfixes = []
    for tag,value in p.blocks:
        h = re.fullmatch(r'\s*(?:hotfix\s*)?v?(\d+\.\d+\.\d+)\s*[-–:]\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(20\d\d))?\s*',value,re.I)
        if h:
            try: date=dt.datetime.strptime('%s %s %s'%(h.group(2),h.group(3),h.group(4) or publication_year),'%d %B %Y').date().isoformat()
            except ValueError: date=None
            hotfixes.append({'heading':value,'version':h.group(1),'release_date':date,'status':'announced' if date and date>today else 'live' if date else 'release date unverified'})
        elif tag.startswith('h') and re.search(r'hotfix\s+v?\d+\.\d+\.\d+',value,re.I):
            hotfixes.append({'heading':value,'status':'release date unverified'})
    # Fingerprint actual article blocks; excludes nav, relative publication times and scripts.
    return {'version': version.group(1), 'release_date': released, 'status': status, 'title': title, 'url': url,
            'fetched_at': iso(now_utc()), 'fingerprint': official_article_fingerprint(p.blocks),
            'hotfixes': hotfixes, 'blocks': p.blocks}


STEAM_NEWS_URL = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=961200&count=40&maxlength=0&feeds=steam_community_announcements&format=json'


def official_patch_link(link):
    """Only harvested links on the official origin can become article requests."""
    url=urllib.parse.urljoin(OFFICIAL_ORIGIN,'/en-US'+link if link.startswith('/news/') else link)
    p=urllib.parse.urlsplit(url)
    if p.scheme!='https' or p.netloc!='www.predecessorgame.com' or not p.path.startswith('/en-US/news/patch-notes/') or p.query or p.fragment:
        return None
    m=re.search(r'(?:^|[_/-])v?(\d+)[._-](\d+)(?:[._-](\d+))?(?!\d)',p.path.rsplit('/',1)[-1],re.I)
    if not m:return None
    return '.'.join(v for v in m.groups() if v is not None),url


def parse_publisher_news(data,when):
    news=data.get('appnews',{})
    rows=news.get('newsitems')
    if type(news.get('appid'))is not int or news['appid']!=961200 or not isinstance(rows,list) or not 1<=len(rows)<=40:
        raise ValueError('Steam publisher feed: missing or mismatched game/news list')
    entries=[];seen=set()
    for row in rows:
        if row.get('appid')!=961200 or row.get('feedname')!='steam_community_announcements':
            raise ValueError('Steam publisher feed: wrong app or non-publisher feed')
        if not isinstance(row.get('title'),str) or not row['title'].strip() or not isinstance(row.get('contents'),str) or not row['contents'].strip():
            raise ValueError('Steam publisher feed: title or full contents missing')
        if type(row.get('date'))is not int or row['date']<0 or not str(row.get('gid','')).isdigit():
            raise ValueError('Steam publisher feed: invalid date or announcement id')
        if row['gid'] in seen:raise ValueError('Steam publisher feed: duplicate announcement id')
        seen.add(row['gid'])
        source=urllib.parse.urlsplit(row.get('url',''))
        if source.scheme!='https' or source.netloc not in ('steamcommunity.com','store.steampowered.com','steamstore-a.akamaihd.net') or source.username:
            raise ValueError('Steam publisher feed: unsupported announcement URL')
        title=row['title'];match=re.search(r'\b(?:hotfix|patch|update)(?:\s+notes)?\s*:?\s*v?(\d+\.\d+(?:\.\d+)?)\b',title,re.I)
        if not match:continue
        version=match.group(1);links=[]
        for raw in re.findall(r'\[url=([^\]]+)\]',row['contents'],re.I):
            found=official_patch_link(htmllib.unescape(raw.strip().strip('"\'')))
            if found:
                if found[0]!=version:raise ValueError('Steam publisher title and linked patch disagree: '+title)
                if found[1] not in links:links.append(found[1])
        text=htmllib.unescape(re.sub(r'\[(?:/?(?:p|h[1-6]|quote|list|\*))[^\]]*\]','\n',row['contents'],flags=re.I))
        text=re.sub(r'\[[^\]]*\]','',text);text=re.sub(r'\n{3,}','\n\n',text).strip()
        published=dt.datetime.fromtimestamp(row['date'],dt.timezone.utc)
        announced=published>now_utc() or bool(re.search(r'\b(preview|upcoming|tomorrow|next week|coming soon)\b',title,re.I))
        entries.append({'id':row['gid'],'title':title,'version':version,'url':row['url'],
            'published_at':published.isoformat(),'status':'announced' if announced else 'published',
            'text':text,'official_links':links,'source_contents':row['contents'],
            'fingerprint':hashlib.sha256((title+'\n'+row['contents']).encode()).hexdigest()})
    if not entries:raise ValueError('Steam publisher feed: no versioned update announcements found')
    entries.sort(key=lambda r:r['published_at'],reverse=True)
    return {'status':'ok','source':'Predecessor publisher announcements on Steam','url':STEAM_NEWS_URL,
        'fetched_at':when,'feed':'steam_community_announcements','appid':961200,'entries':entries,
        'note':'Publisher announcements supply harvested official links and a hotfix cross-check. Publication alone does not prove that a patch is live. Full official articles still establish the release date and mechanics.'}


def fetch_publisher_news():
    try:
        raw,_,seconds=http_get(STEAM_NEWS_URL)
        feed=parse_publisher_news(json.loads(raw),iso(now_utc()));feed['seconds']=seconds
        return feed
    except Exception as e:
        return {'status':'failed','source':'Steam publisher announcements','url':STEAM_NEWS_URL,
                'fetched_at':iso(now_utc()),'error':str(e),'entries':[]}


def previously_verified_patch():
    """A stale index must not silently move a known live game backwards."""
    versions=[]
    for path in [DATA_DIR/'latest_bundle.json',*DATA_DIR.glob('last_successful_*.json')]:
        try:
            o=load_bundle(path).get('official',{});live=o.get('live',{})
            if o.get('status')=='verified' and live.get('status')=='live' and re.fullmatch(r'\d+\.\d+(?:\.\d+)?',live.get('version','')) and official_article_fingerprint(live['blocks'])==live['fingerprint']:
                versions.append(live['version'])
        except (OSError,ValueError,KeyError,TypeError):pass
    return max(versions,key=patch_tuple) if versions else None


def fetch_official(force_history=False):
    publisher=fetch_publisher_news();index_record={'url':OFFICIAL_INDEX,'fetched_at':iso(now_utc())}
    candidates={}
    try:
        index,_,seconds=http_get(OFFICIAL_INDEX)
        p=OfficialReader();p.feed(index)
        for link in p.links:
            found=official_patch_link(link)
            if found:candidates[found[0]]=found[1]
        if not candidates:raise ValueError('Official patch index: no patch links parsed')
        index_record.update(status='ok',seconds=seconds)
    except SourceBlocked:
        # No further request to an official site that explicitly blocks/rate-limits us.
        raise
    except Exception as e:index_record.update(status='failed',error=str(e))
    index_versions=set(candidates)
    index_record['versions']=sorted(index_versions,key=patch_tuple,reverse=True)
    for entry in publisher['entries']:
        for url in entry['official_links']:candidates[entry['version']]=url
    if not candidates:
        raise ValueError('Official patch discovery failed: '+index_record.get('error','no index links')+'; Steam: '+publisher.get('error','no linked official articles'))
    articles = []
    # Keep announcements separate while checking the current and preceding article.
    for v in sorted(candidates, key=patch_tuple, reverse=True)[:4]:
        time.sleep(1)
        raw, _, _ = http_get(candidates[v], retries=1)
        a=official_parse(raw,candidates[v])
        if a['version']!=v:raise ValueError('Official article version disagrees with its harvested link: '+candidates[v])
        a['discovered_from']='Website index' if v in index_versions else 'Steam publisher announcement'
        articles.append(a)
        current=next((a for a in articles if a['status']=='live'),None)
        if current and any(patch_tuple(a['version'])<patch_tuple(current['version']) and a['status']!='announced' for a in articles):break
    live = next((a for a in articles if a['status'] == 'live'), None)
    if live is None: raise ValueError('Official patches found, but no released patch could be confirmed; inspect release wording')
    previous=previously_verified_patch()
    if previous and patch_tuple(live['version'])<patch_tuple(previous):
        raise ValueError('Official discovery regressed from previously verified '+previous+' to '+live['version']+'. A stale index or unverified rollback must be resolved before claiming a current patch.')
    announced={a['version'] for a in articles if a['status']=='announced'}
    unresolved=[r for r in publisher['entries'] if patch_tuple(r['version'])>patch_tuple(live['version']) and r['status']!='announced' and r['version'] not in announced]
    if unresolved:raise ValueError('Publisher reports a newer update whose live release/full notes are not verified: '+', '.join(r['title'] for r in unresolved))
    # Reviewed definitions depend on older launch/rework notes too. Keep these checks
    # separate from the current patch status; a failed dependency cannot become a current definition.
    packet_path=TOOL_DIR/'reviewed_guidance.json'
    packet=json.loads(packet_path.read_text(encoding='utf8')) if packet_path.exists() else {}
    if packet: validate_guidance_packet(packet,None)
    history={'articles':[],'errors':[],'cached_articles':0,
             'note':'Historical review sources keep their original verification dates. Opening checks the current patch and hotfix article live; Refresh Data also rechecks these older sources.'}
    already={a['url']:a for a in articles}
    for source in packet.get('definition_history_sources', []):
        url=source['url']
        if not url.startswith(OFFICIAL_ORIGIN+'/en-US/news/patch-notes/'): raise ValueError('Definition history requires official patch links')
        try:
            cache_path=DATA_DIR/'official_history'/(source['fingerprint']+'.json')
            saved=None
            if not force_history:
                try:
                    candidate=json.loads(cache_path.read_text(encoding='utf8'))
                    if verified_history_article(candidate,source):saved=candidate
                except (OSError,ValueError,KeyError,TypeError):pass
            if url in already: a=already[url]
            elif saved:
                a=saved;a['cache_hit']=True;history['cached_articles']+=1
            else:
                time.sleep(1);raw,_,_=http_get(url,retries=1);a=official_parse(raw,url);already[url]=a
                if verified_history_article(a,source):atomic_write(cache_path,json.dumps(a,ensure_ascii=False))
            history['articles'].append(a)
        except Exception as e:
            history['errors'].append({'source':'Official definition history: '+source['version'],'severity':'error','detail':str(e),'url':url})
            if isinstance(e,SourceBlocked): break
    history['status']='failed' if history['errors'] else 'verified'
    return {'status': 'verified', 'live': live, 'articles': articles, 'index_url': OFFICIAL_INDEX,
            'index_check':index_record,'publisher_news':publisher,
            'verification_path':'Steam publisher links and full official articles' if any(a['discovered_from']=='Steam publisher announcement' for a in articles) else 'Official index and full articles',
            'checked_at': iso(now_utc()), 'definition_history':history,
            'fingerprint': hashlib.sha256(''.join(a['fingerprint'] for a in articles).encode()).hexdigest()}


def attach_official_changes(bundle, official):
    """Extract factual change bullets, retain unknown mappings visibly; never infer new game values."""
    known = {}
    for slug, h in bundle.get('heroes', {}).items(): known[norm_key(h['display_name'])] = ('hero', slug, h['display_name'])
    for k, item in bundle.get('items', {}).items(): known[norm_key(item.get('name') or k)] = ('item', k, item.get('name') or k)
    for k, perk in bundle.get('perks', {}).items(): known[norm_key(perk.get('display_name') or k)] = ('perk', k, perk.get('display_name') or k)
    changes = []
    for article in official.get('articles', []):
        if article.get('status') != 'live': continue
        section, entity, field = '', None, ''
        for tag, text in article.get('blocks', []):
            if tag == 'h2': section, entity, field = text, None, ''
            if tag == 'image':
                fn = text.split('/')[-1].lower()
                if 'web_banner_' in fn:
                    token = norm_key(re.sub(r'_[a-f0-9]{8,}.*', '', fn).replace('web_banner_', '').replace('items_', ''))
                    aliases = {'grim':'grim-exe', 'neon':'n3on'}
                    entity = known.get(token)
                    if not entity:
                        matches = [(k,v) for k,v in known.items() if token.startswith(k) or (aliases.get(token) == v[1])]
                        entity = max(matches, key=lambda kv:len(kv[0]))[1] if matches else None
                    field = ''
            if tag in ('h3','h4'):
                field = text.rstrip(':')
                if 'eternal' in section.lower(): entity = known.get(norm_key(field))
                elif '[Augment]' in field: entity_field = known.get(norm_key(field.split('[')[0])); field = text.rstrip(':')
            if tag == 'p' and field == 'Major Blessing' and 'eternal' in section.lower():
                # Explicit article naming, not image-based inference. Unknown future names stay unmapped.
                for eternal in ('Weald', 'Knell', 'Satariel'):
                    if re.search(re.escape(eternal) + r'[’\']s (?:Major|ability)', text):
                        entity = known.get(norm_key(eternal))
            if tag not in ('p', 'blockquote') or '-' not in text: continue
            # Game balance bullets use a leading hyphen; prose is retained only in the source article.
            pieces = re.split(r'(?:^|(?<=[.!?:\n]))\s*-\s+|\n\s*-\s*', text)
            for change in pieces[1:]:
                change = change.strip()
                if not change: continue
                if not any(w in section.lower() for w in ('balance','system','hotfix')): continue
                dest = entity
                if '[Augment]' in field: dest = known.get(norm_key(field.split('[')[0])) or entity
                if 'eternal' in section.lower() and not dest:
                    dest = known.get(norm_key(field))
                changes.append({'patch': article['version'], 'kind': dest[0] if dest else 'unmapped', 'key': dest[1] if dest else None,
                                'name': dest[2] if dest else field or section, 'field': field, 'change': change,
                                'source': article['url'], 'fetched_at': article['fetched_at']})
    bundle['official_changes'] = changes
    bundle['official_hotfix_changes'] = []
    for article in official.get('articles', []):
        versions={h.get('version'):h for h in article.get('hotfixes', []) if h.get('status')=='live'}
        active=None; parent=None; field=''
        for tag,text in article.get('blocks', []):
            match=re.match(r'^v?(\d+\.\d+\.\d+)\s*[-–:]',text,re.I)
            if match: active=match.group(1) if match.group(1) in versions else None;parent=None;field='';continue
            if tag=='h2' and text.strip().lower()!='hotfixes': active=None
            if not active: continue
            if tag=='h4': parent=known.get(norm_key(text.rstrip(':')));field=''
            if tag!='blockquote': continue
            for line in text.splitlines():
                line=line.strip()
                if not line: continue
                if not line.startswith('-'):
                    field=line.rstrip(':');continue
                dest=known.get(norm_key(field.split('[')[0])) if '[Augment]' in field else parent
                bundle['official_hotfix_changes'].append({'patch':active,'kind':dest[0] if dest else 'unmapped','key':dest[1] if dest else None,
                    'name':dest[2] if dest else 'Hotfix '+active,'field':field,'change':line[1:].strip(),'source':article['url'],
                    'fetched_at':article['fetched_at'],'historical':True,'note':'Earlier hotfix; a later balance patch can supersede this change.'})
    return changes


def correction_scope_error(rule):
    """Presentation-only patch evidence cannot authorize a gameplay-field edit.

    This catches a known review failure, not every possible semantic mismatch.
    Mixed gameplay/presentation notes still require a field-by-field review.
    """
    changes=rule.get('changes',[])
    if rule.get('before')!=rule.get('after') and changes and all(
            isinstance(c,str) and re.search(r'\b(?:VFX|SFX)\b',c) for c in changes):
        return 'conflict: presentation-only evidence cannot change a gameplay field'
    return None


def apply_correction(root, rule):
    """Exact field preconditions. Original value retained, including on conflict."""
    obj = root
    result = {k: rule[k] for k in ('id','patch','source','path','before','after')}
    result['changes'] = rule.get('changes', [])
    result['supporting_sources'] = copy.deepcopy(rule.get('supporting_sources', []))
    try:
        for key in rule['path'][:-1]: obj = obj[key]
        key = rule['path'][-1]; current = obj[key]
        result['original'] = copy.deepcopy(current)
        scope_error=correction_scope_error(rule)
        if scope_error: result['status']=scope_error
        elif current == rule['after']: result['status'] = 'source already updated'
        elif current == rule['before']:
            obj[key] = copy.deepcopy(rule['after']); result['status'] = 'official correction applied'
        else: result['status'] = 'conflict: unexpected source value'
    except (KeyError, IndexError, TypeError): result['status'] = 'conflict: field unavailable'
    return result


ITEM_STAT_KEYS = {'physical_power':'Physical power','magical_power':'Magical power','physical_armor':'Physical armor',
    'magical_armor':'Magical armor','attack_speed':'Attack speed','critical_chance':'Critical chance','ability_haste':'Ability haste',
    'max_health':'Health','max_mana':'Mana','heal_shield_power':'Heal and shield power','heal_and_shield_power':'Heal and shield power',
    'tenacity':'Tenacity','physical_penetration':'Physical penetration','magical_penetration':'Magical penetration'}

def normalize_item_catalog(bundle):
    """Keep raw values, normalize keys before official corrections, retain upgrade metadata."""
    catalog={norm_key(v.get('display_name','')):v for v in bundle.get('omeda_items',{}).values()}
    for key,it in bundle.get('items',{}).items():
        raw=it.setdefault('source_stats',copy.deepcopy(it.get('stats',{})))
        stats=it.setdefault('stats',{})
        for snake,title in ITEM_STAT_KEYS.items():
            if title not in stats and snake in stats:
                value=stats[snake]
                if type(value) in (int,float):stats[title]=str(float(value))
                elif isinstance(value,str):stats[title]=value
            if title in stats:stats.pop(snake,None)
        meta=catalog.get(norm_key(it.get('name') or key),{})
        it['item_meta']={k:meta.get(k) for k in ('slot_type','rarity','build_paths','requirements')}
        it['completed_item']=bool(meta.get('slot_type')=='Passive' and meta.get('rarity')=='Epic')
        it['metadata_source']='https://omeda.city/items.json' if meta else None
        if 'Tenacity' in stats and not it.get('verified_stat_units',{}).get('Tenacity'):
            it['stat_notes']={'Tenacity': 'Unverified feed value/unit. Official 1.14 changed Tenacity to a rating; these feeds still disagree with that presentation. Kept as raw source data and excluded from automatic item selection.'}
            it['stat_note_source']='https://www.predecessorgame.com/en-US/news/patch-notes/Patch_notes_1.14'

def parse_community_builds(rows,bundle,patch,url,fetched_at):
    if not isinstance(rows,list) or not rows:raise ValueError('Community builds: zero rows or invalid JSON')
    heroes={h.get('omeda',{}).get('id'):slug for slug,h in bundle.get('heroes',{}).items() if h.get('omeda')}
    items={str(k):v for k,v in bundle.get('omeda_items',{}).items()}
    builds=[];issues=[]
    for row in rows:
        try:
            if not isinstance(row,dict):raise ValueError('Invalid build record')
            version=str(row.get('game_version',{}).get('name','')).lstrip('vV')
            if version!=patch:continue
            slug=heroes.get(row.get('hero_id'));role=omeda_role_normalize(row.get('role'))
            if not slug or not role:raise ValueError('Unjoined hero or role for build '+str(row.get('id')))
            names=[]
            for pos in range(1,7):
                item=items.get(str(row.get('item%d_id'%pos)))
                if not item or not item.get('display_name'):raise ValueError('Unjoined item in build '+str(row.get('id')))
                names.append(item['display_name'])
            link=re.search(r'https://pred\.gg/guides/[A-Za-z0-9_-]+',row.get('description',''))
            builds.append({'id':row['id'],'slug':slug,'role':role,'title':str(row.get('title','Untitled')),'author':str(row.get('author','Unknown')),
                'patch':version,'updated_at':row.get('updated_at'),'fetched_at':fetched_at,'items':names,
                'crest':items.get(str(row.get('crest_id')),{}).get('display_name'),
                'url':link.group(0) if link else 'https://omeda.city/builds/'+str(row['id']),
                'source_url':url,'note':'Community-authored alternative; its patch label and popularity are not proof of optimality. No match win rate is supplied.'})
        except (ValueError,KeyError,TypeError) as exc:issues.append(str(exc))
    return builds,issues

def attach_community_builds(bundle):
    url=OMEDA_BASE+'/builds.json?filter%5Bcurrent_version%5D=1&filter%5Border%5D=popular'
    stamp=iso(now_utc());patch=bundle.get('official',{}).get('live',{}).get('version')
    bundle['community_builds']=[]
    try:
        if bundle.get('official',{}).get('status')!='verified':raise ValueError('Current game patch unverified; community patch matching withheld')
        raw,_,secs=http_get(url,timeout=OMEDA_TIMEOUT,retries=0)
        builds,issues=parse_community_builds(json.loads(raw),bundle,patch,url,stamp)
        bundle['community_builds']=builds
        bundle['sources']['community_builds']={'url':url,'fetched_at':stamp,'secs':secs,'status':'partial' if issues else 'ok','count':len(builds),'scope':'First popular-build page only; current official patch labels, no statistical samples or exhaustive coverage.'}
        for issue in issues:bundle['errors'].append({'source':'Omeda community builds','severity':'warning','detail':issue})
        if not builds:bundle['errors'].append({'source':'Omeda community builds','severity':'warning','detail':'No usable builds labelled for the verified current patch; community alternatives are unavailable.'})
    except Exception as exc:
        bundle['sources']['community_builds']={'url':url,'fetched_at':stamp,'status':'failed','error':str(exc)}
        bundle['errors'].append({'source':'Omeda community builds','severity':'warning','detail':str(exc)})


def enrich_bundle(bundle, official=None):
    bundle['official'] = official or {'status': 'unverified', 'error': 'Official patch has not been checked this session.'}
    packet_path = TOOL_DIR / 'reviewed_guidance.json'
    packet = json.loads(packet_path.read_text(encoding='utf-8')) if packet_path.exists() else {}
    if packet: validate_guidance_packet(packet,bundle)
    bundle['guidance'] = copy.deepcopy(packet.get('guidance', {}))
    live = bundle['official'].get('live', {})
    reviewed = packet.get('patch')
    exact_articles = packet.get('article_fingerprints', {})
    article_changed = any(exact_articles.get(a['version']) != a['fingerprint'] for a in bundle['official'].get('articles', []) if a.get('status')!='announced')
    current = bool(reviewed and live.get('version') == reviewed and bundle['official'].get('status') == 'verified' and not article_changed)
    bundle['guidance'].update({'patch': reviewed, 'reviewed_at': packet.get('reviewed_at'), 'status': 'reviewed for current patch' if current else 'needs review',
                                'note': 'Written guidance is editorial judgment, not a statistical ranking. A data refresh does not author new strategic advice.'})
    discovery=bundle['official'].get('index_check',{});publisher=bundle['official'].get('publisher_news',{})
    if discovery.get('status')=='failed':
        bundle.setdefault('errors',[]).append({'source':'Official patch discovery','severity':'warning',
            'detail':'The website index was unavailable ('+discovery.get('error','unknown error')+'). Publisher links from Steam located the full official articles, which were checked independently. No saved article was substituted for the current live checks.'})
    if publisher.get('status')=='failed':
        bundle.setdefault('errors',[]).append({'source':'Steam publisher announcements','severity':'warning',
            'detail':'The additional publisher hotfix check is unavailable: '+publisher.get('error','unknown error')+'. The official website remains the patch source.'})
    if publisher:
        bundle.setdefault('sources',{})['steam_publisher_announcements']={k:publisher.get(k) for k in ('status','url','fetched_at','error')}|{'secs':publisher.get('seconds')}
    attach_official_changes(bundle, bundle['official'])
    bundle['corrections'] = []
    bundle['unverified_changes'] = packet.get('unverified_changes', []) if live.get('version') == reviewed else bundle.get('official_changes', [])
    normalize_item_catalog(bundle)
    if current:
        for rule in packet.get('corrections', []): bundle['corrections'].append(apply_correction(bundle, rule))
    conflicts = [c for c in bundle['corrections'] if c['status'].startswith('conflict')]
    if conflicts:
        affected = sorted(set(str(c['path'][1]).replace('-', ' ').title() for c in conflicts))
        bundle.setdefault('errors', []).append({'source':'Official correction review','severity':'warning',
            'detail':'Correction could not be verified for '+', '.join(affected)+'. The source field is missing or differs from the reviewed precondition. See Sources & accuracy for the original value and official change; no replacement was guessed.'})
    apply_mechanics_resolutions(bundle,packet,current)
    bundle['mechanics_boundaries']=copy.deepcopy(packet.get('mechanics_boundaries',[])) if current else []
    bundle['loadout_catalog']=copy.deepcopy(packet.get('loadout_catalog',{})) if current else {}
    if current:
        for entry in packet.get('reviewed_catalog',[]):
            key=re.sub(r'[^a-z0-9]+','-',entry['name'].lower()).strip('-')
            if not any(norm_key(v.get('display_name') or v.get('name') or k)==norm_key(entry['name']) for k,v in bundle.get('perks',{}).items()):
                bundle['perks'][key]={'name':entry['name'],'display_name':entry['name'],'slot':entry['slot'],
                    'description':clean_text(entry['description']),'source':entry['source'],'reviewed_patch':entry['patch'],'hero':entry['hero']}
    bundle['description_reviews'] = []
    if current:
        for review in packet.get('description_reviews', []):
            try:
                value = bundle
                for key in review['path']: value = value[key]
                if all(part in str(value) for part in review.get('contains', [])):
                    bundle['description_reviews'].append(copy.deepcopy(review))
            except (KeyError, IndexError, TypeError): pass
    attach_reviewed_definitions(bundle,packet,current)
    audit_definitions(bundle)
    for slug, h in bundle.get('heroes', {}).items():
        reviewed_roles = packet.get('planning_roles', {}).get(slug, []) + [
            plan['role'] for plan in packet.get('guidance', {}).get('builds', []) if plan['slug'] == slug]
        for r in reviewed_roles:
            if r in ROLES and r not in h.get('roles_order', []):
                h.setdefault('roles_order', []).append(r)
                h.setdefault('role_evidence', {})[r] = 'Reviewed patch guidance (%s); %s' % (reviewed, 'current' if current else 'needs review')
                h['roles'].setdefault(r, {'status':'unavailable','error':'Planning role supported by official patch notes; no Statz role sample in this bracket.'})
        for ability in h.get('abilities', []):
            ability['text'] = clean_text(ability.get('menu_description') or ability.get('text') or ability.get('game_description'))
            ability['game_text'] = clean_text(ability.get('game_description') or ability.get('game_text'))
        h['capabilities'], h['capability_evidence'] = derive_capabilities(h)
        if h.get('omeda', {}).get('image') if h.get('omeda') else False:
            h['image_url'] = urllib.parse.urljoin(OMEDA_BASE, h['omeda']['image'])
        elif h.get('image'):
            h['image_url'] = STATZ_BASE + '/images/predecessor/hero-image-data/' + urllib.parse.quote(h['image'])
    normalize_item_catalog(bundle)
    # Resolve actual harvested URLs. Unresolved art falls back to text; never guessed filenames.
    omeda_icons = {norm_key(v.get('display_name','')):urllib.parse.urljoin(OMEDA_BASE, v['image']) for v in bundle.get('omeda_items', {}).values() if v.get('image')}
    for kind, directory in [('items','item-images'), ('perks','perk-images')]:
        for key, value in bundle.get(kind, {}).items():
            name = value.get('display_name') or value.get('name') or key
            fn = bundle.get('image_index', {}).get(kind, {}).get(norm_key(name))
            value['image_url'] = (STATZ_BASE + '/images/predecessor/' + directory + '/' + urllib.parse.quote(fn)) if fn else (omeda_icons.get(norm_key(name)) if kind=='items' else None)
    return bundle


def attach_reviewed_definitions(bundle,packet,current):
    """Official editorial descriptions supplement the source catalog; never alter it or its statistics."""
    history=bundle['official'].get('definition_history',{})
    known={a['url']:a for a in history.get('articles',[])+bundle['official'].get('articles',[])}
    referenced_versions={source['patch'] for rule in packet.get('reviewed_definitions',[]) for source in rule['sources']}
    dependencies=[s for s in packet.get('definition_history_sources',[]) if s['version'] in referenced_versions]
    expected={s['version']:s['fingerprint'] for s in dependencies}|packet.get('article_fingerprints',{})
    referenced=[source for rule in packet.get('reviewed_definitions',[]) for source in rule['sources']]
    history_valid=all(known.get(s['url'],{}).get('fingerprint')==s['fingerprint'] for s in dependencies) and all(
        known.get(s['url'],{}).get('version')==s['patch'] and known.get(s['url'],{}).get('fingerprint')==expected.get(s['patch']) for s in referenced)
    active=bool(current and history_valid and not history.get('errors'))
    bundle['reviewed_definitions']={}
    catalog={norm_key(v.get('display_name') or v.get('name') or k):v for k,v in bundle.get('perks',{}).items()}
    for rule in packet.get('reviewed_definitions',[]):
        entry=copy.deepcopy(rule);source=catalog.get(norm_key(rule['name']));pre=rule['source_precondition']
        entry['source_value']=copy.deepcopy(source)
        if not active:entry['status']='needs review: patch or supporting sources are unverified'
        elif pre['state']=='missing' and source is None:entry['status']='official reviewed definition'
        elif source and any(source.get('slot')==variant['slot'] and source.get('description')==variant['description']
                            for variant in ([pre] if pre['state']=='exact' else [])+rule.get('source_alternatives',[])):
            entry['status']='official reviewed definition'
        elif source and source.get('slot')==rule['slot'] and clean_text(source.get('description'))==rule['description']:
            entry['status']='source already matches reviewed definition'
        else:entry['status']='conflict: source definition changed since review'
        entry['active']=entry['status'] in ('official reviewed definition','source already matches reviewed definition')
        entry['quality']='partial' if entry.get('uncertainties') else 'reviewed'
        bundle['reviewed_definitions'][rule['key']]=entry
    conflicts=[e for e in bundle['reviewed_definitions'].values() if e['status'].startswith('conflict')]
    partial=[e for e in bundle['reviewed_definitions'].values() if e['active'] and e['quality']=='partial']
    bundle['definition_review']={'status':'reviewed for current patch' if active else 'needs review',
        'patch':packet.get('patch'),'reviewed_at':packet.get('reviewed_at'),'scope':packet.get('definition_review_scope'),
        'active_count':sum(e['active'] for e in bundle['reviewed_definitions'].values()),'conflicts':len(conflicts),
        'partial_count':len(partial),'unresolved_fields':sum(len(e['uncertainties']) for e in partial)}
    bundle.setdefault('errors',[]).extend(copy.deepcopy(history.get('errors',[])))
    if current and dependencies and not history_valid and not history.get('errors'):
        bundle['errors'].append({'source':'Official definition review','severity':'warning','detail':'Supporting historical patch text is missing or changed. Supplementary definitions need review; no replacement is presented as current.'})
    if conflicts:bundle['errors'].append({'source':'Official definition review','severity':'warning','detail':'Source definitions changed for '+', '.join(e['name'] for e in conflicts)+'. Inspect both versions before treating them as reconciled.'})
    if partial:bundle['errors'].append({'source':'Official definition review','severity':'warning','detail':'Partly verified descriptions: '+', '.join(e['name'] for e in partial)+'. Conflicting fields remain explicitly unverified; inspect the blessing details.'})


def audit_definitions(bundle):
    """Referenced build definitions must exist and use the expected source slot."""
    catalog = {norm_key(v.get('display_name') or k):(k,v) for k,v in bundle.get('perks', {}).items()}
    issues = {}
    def check(name, slot, slug, role, url):
        if not name: return
        found = catalog.get(norm_key(name))
        problem = 'missing definition' if not found else ('incompatible slot' if found[1].get('slot') != slot else None)
        if not problem: return
        identity = (name,slot,problem)
        issue = issues.setdefault(identity, {'kind':'perk','key':found[0] if found else None,'name':name,'status':problem,
            'expected_slot':slot,'source_slot':found[1].get('slot') if found else None,'references':[]})
        ref={'hero':slug,'role':role,'source':url}
        if ref not in issue['references']: issue['references'].append(ref)
    for slug,h in bundle.get('heroes', {}).items():
        for role,stats in h.get('roles', {}).items():
            for build in stats.get('builds', []):
                check(build.get('perk'),'HERO_SPECIFIC_1',slug,role,stats.get('url'))
                check(build.get('eternal'),'ETERNAL_1',slug,role,stats.get('url'))
                for field,slot in [('common_perks_1','BLESSING_MINOR_1'),('common_perks_2','BLESSING_MINOR_2')]:
                    for perk in build.get(field, []): check(perk.get('name'),slot,slug,role,stats.get('url'))
    reviewed={norm_key(e['name']):e for e in bundle.get('reviewed_definitions',{}).values()}
    for issue in issues.values():
        entry=reviewed.get(norm_key(issue['name']),{})
        issue['reviewed_available']=bool(entry.get('active') and entry.get('slot')==issue['expected_slot'])
        issue['reviewed_complete']=bool(issue['reviewed_available'] and entry.get('quality')!='partial')
    bundle['definition_issues'] = list(issues.values())
    if issues:
        names = sorted(set(i['name'] for i in issues.values()))
        covered=sum(i['reviewed_available'] for i in issues.values())
        complete=sum(i['reviewed_complete'] for i in issues.values())
        bundle.setdefault('errors', []).append({'source':'Statz build definitions','severity':'info' if complete==len(issues) else 'warning',
            'detail':'Missing or incompatible Statz descriptions: '+', '.join(names)+'. '+str(complete)+' reviewed descriptions, '+str(covered-complete)+' partly verified descriptions, and '+str(len(issues)-covered)+' unavailable. Build samples remain unchanged. Inspect Sources & accuracy or the perk details.'})


def enemy_control_clauses(raw):
    """Keep effect clauses, excluding immunity, self effects, and ally-only repositioning."""
    result=[]
    for clause in sentences(clean_text(raw)):
        # Immunity or a self-slow can coexist with an enemy effect in the same
        # sentence. Remove only that local phrase, not the real enemy effect.
        clause=re.sub(r"\b(?:cannot|can't)\s+be\s+\w+",'',clause,flags=re.I)
        clause=re.sub(r'\bimmun\w*\s+to\s+[^,.;]+','',clause,flags=re.I)
        clause=re.sub(r'\bslow\w*\s+(?:him|her|it|your)self(?:\s+by\s+[\d./% ]+)?','',clause,flags=re.I)
        clause=re.sub(r'\b(?:pull\w*|push\w*|knock\w*)\s+(?:him|her|it|your)self[^,;\n]*','',clause,flags=re.I)
        if re.search(r'\b(?:nether|separate)\s+realm\b',clause,re.I):continue
        if ALLY_RX.search(clause) and not re.search(r'\b(enem\w*|opponent\w*)\b',clause,re.I): continue
        result.append(clause.lower())
    return '\n'.join(result)


def movement_evidence(raw):
    """Identify movement performed by the hero, not a cooldown reference or moving summon."""
    clauses=sentences(clean_text(raw))
    movement=[]
    for i,clause in enumerate(clauses):
        if re.search(r'\b(?:nether|separate)\s+realm\b',clause,re.I):continue
        if not re.search(r'\b(?:dash\w*|leap\w*|blink\w*|teleport\w*|lung\w*|rush\w* forwards?|charg\w* forwards?|pull\w* (?:him|her|it|your)self)\b',clause,re.I):continue
        if re.search(r'blink[- ]prox|blink cooldown|cooldown.{0,40}blink|dash range|cannot.{0,20}(?:dash|leap|blink)',clause,re.I):continue
        if re.search(r'\b(?:hair|clone|replica|missile|projectile|orb)\b.{0,25}\b(?:leap\w*|dash\w*|teleport\w*)\b',clause,re.I):continue
        following=clauses[i+1] if i+1<len(clauses) else ''
        if re.match(r'(?:she|he|you|enemies hit|each hit|if the target)\b',following,re.I):clause+=' '+following
        movement.append(clause)
    return movement


def allied_effect_clauses(raw):
    """A self buff elsewhere in an ability must not become an allied buff."""
    return [c for c in sentences(clean_text(raw)) if ALLY_RX.search(c)]


def restoration_evidence(raw):
    """Read restoration actions and recipients. Health/damage scaling is not healing.

    Ability compatibility with purchased lifesteal does not grant lifesteal.
    Eternal-category branches remain conditional when the loadout is unknown.
    """
    clauses=sentences(clean_text(raw));out={'healing':[],'ally_healing':[],
        'conditional_healing':[],'conditional_ally_healing':[],'lifesteal_compatible':[]}
    category=None
    for index,clause in enumerate(clauses):
        text=clause.lower()
        match=re.match(r'(harbingers|primarchs|dreadnoughts|sovereigns|divines|anomalies):',text)
        if match:category=match.group(1)
        compatible=bool(re.search(r'\b(?:benefit\w* from|appl\w*|can trigger)\s+(?:\w+\s+){0,2}lifesteal\b',text))
        if compatible:out['lifesteal_compatible'].append(clause)
        direct=bool(re.search(r'\bheal(?:s|ed)?\b|\bhealing\s+(?:for|himself|herself|itself|yourself)\b|\bhealing\s+(?!(?:is|received|done|power)\b)(?:\w+\s+){1,3}for\b|\brestor(?:e[sd]?|ing)\b.{0,160}\bhealth\b|\bregenerat(?:e[sd]?|ing)\b.{0,100}\bhealth\b',text))
        regen=bool(re.search(r'\b(?:gain\w*|grant\w*|provid\w*)\b.{0,200}\b(?:health regeneration|omnivamp|lifesteal)\b|\+\s*\d[^.\n]{0,40}\b(?:omnivamp|lifesteal)\b',text))
        shared=bool(re.search(r'\breceiv(?:e|es|ing)\b.{0,35}\b(?:same |this )?healing\b',text))
        modifier=bool(re.search(r'\bhealing(?: and shielding)? received\b|\breceiv\w*\b.{0,35}\b(?:more|increased) healing\b',text))
        if modifier and not regen and not re.search(r'\b(?:heal(?:s|ed)?|restor(?:e[sd]?|ing))\b',text):
            direct=False;shared=False
        # Anti-heal, received-healing modifiers and stat thresholds are not restoration.
        if re.search(r'\b(?:anti[- ]?heal|cannot heal|unable to heal|heal is increased|heal is reduced)\b',text) and not (regen or re.search(r'\b(?:heals|healed|restores|restoring)\b',text)):direct=False
        if not (direct or regen or shared):continue
        if compatible and not re.search(r'\b(?:heals|healed|restores|restoring|gains|grants)\b',text):continue
        allied=bool(ALLY_RX.search(clause))
        # Named aura modes inherit the recipients from their immediately preceding introduction.
        if re.match(r'healing(?: aura)?:',text):
            allied=allied or any(ALLY_RX.search(c) and not ENEMY_RX.search(c) for c in clauses[max(0,index-2):index])
        prefix='conditional_' if category else ''
        out[prefix+'healing'].append(clause)
        if allied:out[prefix+'ally_healing'].append(clause)
    return out


def derive_capabilities(hero):
    """Transparent semantic rules, not a trained model. Evidence always names the supporting ability."""
    evidence = {}
    def add(tag, a, why):
        evidence.setdefault(tag, []).append({'ability': a.get('display_name') or a.get('key'), 'key': a.get('key'), 'reason': why})
    classes_lower = [str(c).lower() for c in hero.get('classes', [])]
    for a in hero.get('abilities', []):
        raw = a.get('menu_description') or a.get('text') or a.get('game_description') or a.get('game_text') or ''
        plain = clean_text(raw).lower()
        tagged = raw+' '+(a.get('game_description') or '')
        cc = ' '.join(re.findall(r'<(?:CC_Text|StatusEffectText)[^>]*>(.*?)</(?:CC_Text|StatusEffectText)>', tagged, re.I|re.S)).lower()
        enemy_effects = enemy_control_clauses(raw)
        # Tagged controls are primary; verb phrases cover descriptions whose inline tag wraps the numeric value only.
        knock = r'knock(?:s|ed|ing)?\b(?:\s+\w+){0,4}\s+(?:up|back|into the air)'
        hard = r'\b(?:stun\w*|root\w*|'+knock+r'|pull\w*|push\w*|displac\w*|suppress\w*|restrain\w*|fear\w*|taunt\w*|mesmeri[sz]\w*|charm\w*|polymorph\w*|suspend\w*)\b'
        immobilize = bool(re.search(hard, enemy_effects) and (re.search(hard,cc) or re.search(r'(?:enem|target|opponent)',enemy_effects)))
        displacement = bool(re.search(r'\b(?:'+knock+r'|pull\w*|push\w*|displac\w*|drag\w*)\b', enemy_effects) and (re.search(r'knock|pull|push|displac|drag',cc) or re.search(r'enem|target',enemy_effects)))
        if immobilize: add('hard_cc', a, 'Can interrupt or immobilize an enemy.')
        if re.search(r'\b(?:slow\w*|silenc\w*|blind\w*|ground\w*)\b', enemy_effects) and (re.search(r'slow|silenc|blind|ground',cc) or re.search(r'enem|target',enemy_effects)): add('soft_cc', a, 'Restricts enemy movement, attacks, or ability use.')
        if displacement:
            add('displacement', a, 'Moves a target; positioning can separate a diver from a carry.')
            add('peel', a, 'Displacement can protect space for an ally when aimed away from them.')
            if re.search(r'knock\w*.{0,35}\bback|push\w*.{0,45}(?:away|back)|displac\w*.{0,45}away',enemy_effects):add('push_away',a,'Can move enemies away from the planned damage area.')
        if immobilize: add('peel', a, 'Holding a diver can buy an ally time to move or attack.')
        if re.search(r'\b(?:pull\w*|reposition\w*)\b.{0,50}\b(?:ally|allies|allied)\b',plain):
            add('ally_reposition',a,'Can move an ally to safety; target restrictions and range still apply.')
            add('peel',a,'Moving an ally can separate them from a threat.')
        motions=movement_evidence(raw)
        mobility = bool(motions)
        if mobility: add('mobility', a, 'Has a movement ability; use and direction determine engage or escape.')
        if any((re.search(r'enem|target',c,re.I) or re.search(r'on contact|on impact',c,re.I)) and re.search(r'deal\w*|damage|grab\w*|'+hard,c,re.I) for c in motions):add('initiation', a, 'Hero movement delivers a threat; damage alone does not hold the target.')
        if re.search(r'\b(?:cage|arena|coliseum|impassable|trap|vortex|pull\w*|tether\w*)\b|prevent\w*.{0,35}pass|chain\w*.{0,35}center|drag\w*.{0,40}center', enemy_effects) and re.search(r'enem|hero|target',enemy_effects):
            add('containment', a, 'Can constrain enemy positioning; inspect the ability’s boundary or pull conditions.')
        allied=allied_effect_clauses(raw)
        restoration=restoration_evidence(raw)
        for tag,clauses in restoration.items():
            if clauses:
                add(tag,a,('Conditional Eternal-category effect; inspect the chosen loadout. ' if tag.startswith('conditional_') else 'Requires a source of lifesteal; the ability does not grant it. ' if tag=='lifesteal_compatible' else 'Restoration action and recipient in the ability: ')+clauses[0])
        shield_action=r'\b(?:grant\w*|appl\w*|gain\w*|receiv\w*|provid\w*)\b.{0,150}\bshield\b|\bshield(?:s|ing)?\s+(?:an? |the |yourself|himself|herself)'
        ally_shield=any(re.search(shield_action,c,re.I) for c in allied)
        if ally_shield:add('ally_shield',a,'Can apply an actual shield to an ally; a shielding-received modifier alone is not a shield.')
        if any(not ALLY_RX.search(c) and re.search(shield_action,c,re.I) for c in sentences(clean_text(raw))):add('self_shield',a,'Can apply a shield to self; this does not establish an allied shield.')
        if restoration['ally_healing'] or ally_shield or any(re.search(r'\bprotect\w*|damage reduction',c,re.I) for c in allied):
            add('protection', a, 'Provides allied shielding, healing or damage protection.'); add('peel', a, 'Defensive effect supports an ally under pressure.')
        if any(re.search(r'attack speed|basic attack.{0,45}(?:bonus|additional)|bonus.{0,30}(?:power|damage)|increased (?:physical|magical) power',c,re.I) for c in allied):add('amplifier', a, 'An allied effect can increase damage output; buff range and conditions still apply.')
        if re.search(r'global|anywhere|any distance|any range|across the map|(?:infinite|unlimited) range', plain):add('global', a, 'Can connect with a distant fight; check range and target conditions.')
        if re.search(r'(?:target|opponent).{0,100}(?:realm|isolat)|realm.{0,80}(?:target|opponent)',plain):
            add('isolation',a,'Separates a target from the shared fight; allies may be unable to follow up while it lasts.')
        area = bool(re.search(r'nearby (?:enem|target)|all enem|radius|area|zone|vortex|cone|enemies (?:within|around)|enemies caught in the center|fanned arrows|salvos.{0,30}missiles', plain))
        damage = bool(re.search(r'\b(?:deal\w*|inflict\w*|take|receive)\b.{0,200}(?:physical|magical|magic|true) damage', plain))
        if area: add('zone', a, 'Affects space that multiple opponents may occupy.')
        if area and damage and str(a.get('key')).upper() == 'R':
            add('area_followup', a, 'Multi-target ultimate can follow a catch; its targeting shape and conditions still apply.')
            # Describe the delivery, not just the presence of area damage. An ally-targeted
            # rescue and a sniper line are not persistent zones to hold enemies inside.
            if re.search(r'target an? allied hero|soar to their location',plain): style='allied_arrival'
            elif re.search(r'sniper shot|(?:all enemies|enemies) in (?:its|the) path',plain): style='line'
            elif re.search(r'fanned arrows|salvos|cone',plain) and re.search(r'over \d|every \d|for \d',plain): style='aimed_barrage'
            elif re.search(r'over \d|every \d|for \d',plain) and re.search(r'caught within|towards its center|thornbush|singularity',plain): style='persistent_area'
            else: style='impact'
            evidence['area_followup'][-1]['followup_style']=style
        if (set(classes_lower) & {'ranger','executioner','sharpshooter','fighter','assassin'}) and str(a.get('key')).upper() != 'LMB' and re.search(r'attack speed|every (?:third|fourth)|on.hit|basic attacks? (?:gain|apply|trigger)', plain): add('sustained', a, 'Repeated attacks or hits provide continuing damage.')
        if str(a.get('key')).upper() != 'LMB' and damage and not re.search(r'per second|every \d|each second', plain): add('burst', a, 'A discrete damaging ability can follow a catch.')
        # Damage dealt is independent of power scaling: inspect the literal damage phrase, never icon counts.
        for pattern, tag in [(r'physical damage','physical'),(r'(?:magical|magic) damage','magical'),(r'true damage','true_damage')]:
            dealt=re.search(r'(?:deal\w*|inflict\w*|dealing).*?' + pattern, plain)
            received_by_enemy=re.search(r'\benem(?:y|ies)\b[^.!?\n]{0,120}\btake\s+\d[^.!?\n]{0,180}' + pattern,plain)
            if dealt or received_by_enemy and not re.search(r'\b(?:less|more|reduced|increased)\b',received_by_enemy.group()): add(tag, a, 'Description explicitly states ' + tag.replace('_',' ') + ' damage to a target.')
        if re.search(r'(?:gain|grants|increases|reduce incoming).{0,70}(?:armor|damage reduction|maximum health)|damage reduction|increased size', plain) and str(a.get('key')).upper() != 'LMB': add('durability', a, 'Has a durability mechanic; actual frontline strength depends on build and execution.')
    classes = classes_lower
    if 'tank' in classes or 'warden' in classes and 'durability' in evidence:
        label='Tank' if 'tank' in classes else 'Warden'
        evidence.setdefault('frontline', []).append({'ability':('Pred.gg' if hero.get('pred_source') else 'Omeda')+' class: '+label,'key':None,'reason':label+' class and available durability support a frontline option; build remains relevant.'})
    elif 'fighter' in classes and 'durability' in evidence:
        evidence['frontline'] = evidence['durability'][:1]
    return list(evidence), evidence

# ============================================================================
# 11b. PRED.GG PUBLIC PAGE INGESTION (explicit cohorts; no anonymous API calls)
# ============================================================================

PRED_BASE = 'https://pred.gg'


def pred_payloads(html):
    """Decode only the structured responses embedded for the public page's own UI."""
    result=[]
    for attrs,raw in re.findall(r'<script([^>]*)>(.*?)</script>',html,re.S):
        if 'data-sveltekit-fetched' not in attrs: continue
        if not re.search(r'type=["\']application/json["\']',attrs): continue
        outer=json.loads(raw)
        if outer.get('status')!=200: raise ValueError('Pred.gg embedded response returned '+str(outer.get('status')))
        data=json.loads(outer['body'])
        if data.get('errors'): raise ValueError('Pred.gg embedded query: '+str(data['errors'][0].get('message')))
        if isinstance(data.get('data'),dict): result.append(data['data'])
    if not result: raise ValueError('Pred.gg: no structured page responses found')
    return result


def pred_catalog(payloads):
    return next((d for d in payloads if 'NewestVersion' in d and 'versions' in d),None)


def pred_cohort(catalog, official_version, bracket):
    if not catalog: raise ValueError('Pred.gg: version/rank catalog missing')
    versions=[v for v in catalog['versions'] if isinstance(v.get('name'),str) and v['name'].lstrip('v')==official_version]
    if len(versions)!=1: raise ValueError('Pred.gg: exact official live patch is not available; no neighbouring patches substituted')
    version=versions[0]
    if str(catalog.get('NewestVersion',{}).get('id'))!=str(version['id']):
        raise ValueError('Pred.gg newest version differs from the verified official live patch; current-patch label withheld')
    # Rank IDs belong to the active rating system, not guessed enum positions.
    current=[r for r in catalog.get('ratings',[]) if r.get('endTime') is None and r.get('ranks')]
    rating=max(current,key=lambda x:x.get('startTime','')) if current else None
    if not rating: raise ValueError('Pred.gg: active rank system unavailable')
    tiers=['bronze','silver','gold','platinum','diamond','paragon']
    if bracket not in tiers: raise ValueError('Pred.gg: unsupported rank bracket')
    ranks=sorted({r['id'] for r in rating['ranks'] if str(r.get('tierName','')).lower() in tiers[tiers.index(bracket):]},key=int)
    if not ranks: raise ValueError('Pred.gg: selected rank IDs unavailable')
    return {'versions':[version['id']],'gameModes':['RANKED'],'ranks':ranks,'patch':official_version,
            'release_date':version['releaseDate'],'rating':rating['name'],'bracket':bracket,'bracket_label':bracket.title()+'+'}


def pred_stats_url(cohort,role=None):
    params={'versions':','.join(cohort['versions']),'gameMode':'RANKED','ranks':','.join(cohort['ranks'])}
    if role: params['role']=role.upper()
    return PRED_BASE+'/heroes?'+urllib.parse.urlencode(params)


def pred_parse_stats(payloads,cohort,role,heroes,url,when):
    data=next((d['heroes'] for d in payloads if isinstance(d.get('heroes'),list) and any('currentBalanceStatistic' in h for h in d['heroes'])),None)
    if not data: raise ValueError('Pred.gg: zero hero statistic rows')
    # Pred.gg and the older Omeda endpoint use different integer IDs. Join their
    # harvested canonical slugs, then independently check the display name.
    by_slug={norm_key(s):s for s in heroes}
    seen=set();rows=[]
    for h in data:
        slug=by_slug.get(norm_key(h.get('slug')))
        if not slug or norm_key(h.get('data',{}).get('displayName'))!=norm_key(heroes[slug].get('display_name')): raise ValueError('Pred.gg hero join failed: '+str(h.get('slug')))
        if slug in seen: raise ValueError('Pred.gg duplicate hero '+slug)
        seen.add(slug)
        stat=h.get('currentBalanceStatistic')
        if not isinstance(stat,dict): raise ValueError('Pred.gg missing statistic for '+slug)
        actual=stat.get('filter') or {}
        expected={k:cohort[k] for k in ('versions','gameModes','ranks')};expected['roles']=[role.upper()] if role else []
        if any(sorted(actual.get(k) or [])!=sorted(v) for k,v in expected.items()):
            raise ValueError('Pred.gg echoed a different patch/mode/rank/role cohort for '+slug)
        v=stat.get('result') or {};n=v.get('matchesPlayed');w=v.get('matchesWon');banned=v.get('matchesBanned')
        if type(n) is not int or type(w) is not int or n<0 or not 0<=w<=n: raise ValueError('Pred.gg invalid wins/games for '+slug)
        if banned is not None and (type(banned) is not int or banned<0): raise ValueError('Pred.gg invalid ban count')
        rows.append({'slug':slug,'role':role,'winRate':100*w/n if n else None,'matches':n,'wonGames':w,'banGames':banned,
                     'interval95':wilson(w,n) if n else None,'tier':None,'pickRate':None,'banRate':None,
                     'source':'Pred.gg','source_hero_id':h.get('id'),'url':url,'fetched_at':when,'filter':actual,
                     'rate_method':'100 × source wins / source games; no inferred match counts'})
    if seen!=set(heroes): raise ValueError('Pred.gg roster coverage mismatch: '+', '.join(sorted(set(heroes)-seen)))
    return rows


def attach_scoped_statistics(bundle,progress=lambda s:None,fetch=None,pages=None):
    """Fetch each public URL once, sequentially with spacing; any block stops this source."""
    t=time.perf_counter();records=[];cache={};blocked=False
    def get(url):
        nonlocal blocked
        if blocked: raise FetchError('Pred.gg collection stopped after source block')
        if url not in cache:
            if cache and fetch is None: time.sleep(.65)
            try:
                if pages:
                    record=pages.get(url,ttl=0);cache[url]=(record["payloads"],record["fetched_at"],record["seconds"])
                else:
                    raw,_,secs=(fetch or http_get)(url)
                    cache[url]=(pred_payloads(raw),iso(now_utc()),secs)
            except SourceBlocked: blocked=True;raise
        return cache[url]
    scoped={'source':'Pred.gg','status':'failed','roles':{},'hero_wide':{},'rows':[],'errors':[],
            'scope_note':'Source-declared patch, ranked mode, ranks and role are checked from each embedded response. This identifies the selected cohort, not completeness of all game-server matches. No statistical samples from other sites are pooled.'}
    bundle['scoped_statistics']=scoped
    try:
        if bundle.get('official',{}).get('status')!='verified': raise ValueError('Official live patch is unverified; current-patch statistics withheld')
        payloads,when,secs=get(PRED_BASE+'/heroes')
        catalog=pred_catalog(payloads);cohort=pred_cohort(catalog,bundle['official']['live']['version'],bundle['bracket']['segment'])
        scoped.update(cohort);records.append({'url':PRED_BASE+'/heroes','fetched_at':when,'secs':secs,'status':'ok'})
        for role in [None]+list(ROLES):
            label=role or 'all roles';progress('Checking exact-patch ranked statistics: '+label+'…')
            url=pred_stats_url(cohort,role)
            try:
                ps,when,secs=get(url);rows=pred_parse_stats(ps,cohort,role,bundle['heroes'],url,when)
                records.append({'url':url,'fetched_at':when,'secs':secs,'status':'ok','role':role})
                if role:
                    scoped['roles'][role]={'status':'ok','url':url,'fetched_at':when,'rows':rows}
                    scoped['rows'].extend(r for r in rows if role in bundle['heroes'][r['slug']].get('roles_order',[]))
                else:scoped['hero_wide']={r['slug']:r for r in rows}
            except Exception as e:
                scoped['roles'][role or 'all']={'status':'failed','url':url,'error':str(e)}
                scoped['errors'].append({'source':'Pred.gg '+label,'severity':'error','detail':str(e)})
                if blocked:break
        scoped['status']='partial' if scoped['errors'] else 'ok'
        if not scoped['rows']:scoped['status']='failed'
    except Exception as e:scoped['errors'].append({'source':'Pred.gg current-patch statistics','severity':'error','detail':str(e)})
    scoped['records']=records;scoped['seconds']=round(time.perf_counter()-t,2)
    bundle.setdefault('errors',[]).extend(scoped['errors'])
    bundle.setdefault('sources',{})['pred_scoped']={'url':PRED_BASE+'/heroes','status':scoped['status'],'fetched_at':records[-1]['fetched_at'] if records else None,'secs':scoped['seconds']}
    # The original Statz data are intact. Its selective, wider sample never inherits this cohort.
    bundle['sampling_policy']={'default_performance_source':'Pred.gg','pair_source':'Statz','pair_patch':bundle.get('patch'),
        'pair_scope':'Wider dataset; match window and mode not established. Exploratory pair comparisons only.',
        'default_recommendation_order':'kit','blend_sources':False}
    return scoped


def guard_pred_damage_description(ability):
    """Quarantine suspicious cooldown-as-damage text; never guess replacement damage."""
    raw=ability.get('menu_description') or '';text=clean_text(raw);cooldown=ability.get('cooldown') or []
    if len(cooldown)<2 or not all(type(x) in (int,float) for x in cooldown) or not any(a>b for a,b in zip(cooldown,cooldown[1:])):return None
    for match in re.finditer(r'\b(?:deals?|dealing)\s+((?:\d+(?:\.\d+)?/){1,}\d+(?:\.\d+)?)\b',text,re.I):
        if [float(x) for x in match.group(1).split('/')]==cooldown:
            ability['menu_description']=raw.replace(match.group(1),'[base damage unavailable: source repeats cooldown]')
            issue='The source damage progression duplicates this ability’s decreasing cooldown values. The damage value is unavailable pending a field review; original text is retained.'
            ability['description_issue']=issue
            return issue
    return None


def apply_mechanics_resolutions(bundle,packet,current):
    """Reviewed values with exact preconditions and retained evidence; no statistical writes."""
    bundle['mechanics_resolutions']=[]
    if not current:return
    history=bundle.get('official',{}).get('definition_history',{})
    checked={a['url']:a.get('fingerprint') for a in history.get('articles',[])+bundle['official'].get('articles',[])}
    for rule in packet.get('mechanics_resolutions',[]):
        out=copy.deepcopy(rule);obj=bundle
        try:
            for key in rule['path'][:-1]:obj=obj[key]
            key=rule['path'][-1];original=copy.deepcopy(obj[key]);out['original']=original
            if any(checked.get(s['url'])!=s['fingerprint'] for s in rule['official_dependencies']):out['status']='needs review: supporting official article changed'
            elif original==rule['after']:out['status']='source already matches reviewed value'
            elif original in rule['accepted_before']:
                obj[key]=copy.deepcopy(rule['after']);out['status']='reviewed source reconciliation applied'
            else:out['status']='conflict: unexpected source value'
            if out['status'] in ('reviewed source reconciliation applied','source already matches reviewed value'):
                if rule.get('unit')=='rating':
                    obj[key]=str(rule['after']);item=bundle['items'][rule['path'][1]]
                    item.setdefault('verified_stat_units',{})['Tenacity']={'unit':'rating','source':rule['sources'][0]['url'],'patch':packet['patch']}
                    item.get('stat_notes',{}).pop('Tenacity',None)
        except (KeyError,IndexError,TypeError):out['status']='conflict: field unavailable'
        bundle['mechanics_resolutions'].append(out)
        if out['status'].startswith(('conflict','needs review')):
            bundle.setdefault('errors',[]).append({'source':'Mechanics reconciliation','severity':'warning','detail':rule['label']+': '+out['status']})



# ============================================================================
# 11B. PRED.GG GAME DATA (public embedded JSON; isolated from rendering)
# ============================================================================

class PredPages:
    """One in-run fetch per public URL; bounded callers, spaced starts, dated cache."""
    def __init__(self, force=False, cache_dir=None, fetch=None):
        self.force=force; self.root=Path(cache_dir or DATA_DIR/'pred_pages'); self.fetch=fetch or http_get
        self.lock=threading.Lock(); self.blocked=threading.Event(); self.memory={}; self.records=[]; self.next_start=0
    def get(self,url,ttl=1800):
        parsed=urllib.parse.urlparse(url)
        if parsed.scheme!='https' or parsed.netloc!='pred.gg': raise ValueError('Unexpected Pred.gg URL')
        # Locks reserve a unique URL and start time. Futures prevent duplicate concurrent fetches.
        with self.lock:
            future=self.memory.get(url)
            if future is None: future=concurrent.futures.Future();self.memory[url]=future;owner=True
            else:owner=False
        if not owner:return future.result()
        try:
            if self.blocked.is_set():raise SourceBlocked('Pred.gg stopped after HTTP 403/429; no further requests')
            path=self.root/(hashlib.sha256(url.encode()).hexdigest()+'.json');record=None
            if not self.force and path.exists():
                try:
                    saved=json.loads(path.read_text(encoding='utf-8'))
                    age=(now_utc()-dt.datetime.fromisoformat(saved['fetched_at'].replace('Z','+00:00'))).total_seconds()
                    if saved.get('schema')==1 and saved.get('url')==url and 0<=age<ttl:record=dict(saved,cache_hit=True)
                except (ValueError,KeyError,TypeError):pass
            if record is None:
                with self.lock:
                    delay=max(0,self.next_start-time.monotonic());self.next_start=time.monotonic()+delay+.55
                if delay:time.sleep(delay)
                if self.blocked.is_set():raise SourceBlocked('Pred.gg collection stopped after source block')
                try:raw,_,secs=self.fetch(url)
                except SourceBlocked:self.blocked.set();raise
                try:ps=pred_payloads(raw)
                except ValueError as e:
                    if re.search(r'response returned (403|429)',str(e)):
                        self.blocked.set();raise SourceBlocked(str(e)) from e
                    raise
                # Omit auth payloads and site-wide repeated catalogs, retaining game data.
                if parsed.path=='/heroes':payloads=[p for p in ps if 'NewestVersion' in p or any('currentBalanceStatistic'in h for h in p.get('heroes',[]))]
                elif parsed.path in ('/items','/eternals'):
                    field='items' if parsed.path=='/items' else 'eternalCategories'
                    payloads=[p for p in ps if field in p and 'NewestVersion' not in p]
                else:payloads=[p for p in ps if 'hero' in p]
                links=sorted({urllib.parse.urljoin(PRED_BASE,htmllib.unescape(v)) for v in re.findall(r'href=["\']([^"\']+)',raw) if v.startswith(('/heroes','/items','/eternals'))})
                assets=sorted(set(re.findall(r'https://pred\.gg/assets/[a-zA-Z0-9_./-]+\.(?:webp|png)',raw)))
                record={'schema':1,'url':url,'fetched_at':iso(now_utc()),'seconds':secs,'payloads':payloads,'links':links,'assets':assets,'cache_hit':False}
                atomic_write(path,json.dumps(record,ensure_ascii=False,separators=(',',':')))
            with self.lock:self.records.append({k:v for k,v in record.items() if k not in ('payloads','assets','links')})
            future.set_result(record);return record
        except Exception as exc:future.set_exception(exc);raise


def pred_filter(actual,cohort,role):
    expected={k:cohort[k] for k in ('versions','gameModes','ranks')};expected['roles']=[role.upper()]
    if not isinstance(actual,dict) or any(sorted(actual.get(k) or [])!=sorted(v) for k,v in expected.items()):
        raise ValueError('Pred.gg echoed a different patch/mode/rank/role cohort')


def pred_identity(record,expected):
    h=next((p['hero'] for p in reversed(record['payloads']) if 'hero'in p),None)
    if not isinstance(h,dict) or str(h.get('id'))!=str(expected['id']):raise ValueError('Pred.gg wrong or absent hero identity')
    if norm_key((h.get('data') or {}).get('displayName'))!=norm_key(expected['data']['displayName']):raise ValueError('Pred.gg hero display-name mismatch')
    return h


def pred_markup(raw):
    """Normalize shorthand tags while preserving damage type independently of scaling icons."""
    def damage(m):
        text=m.group(2)
        if re.search(r'\bdamage\b',text,re.I) and not re.search(r'physical|magical|magic',text,re.I):
            text=re.sub(r'\bdamage\b',('physical' if m.group(1).lower()=='attackdamagetext' else 'magical')+' damage',text,flags=re.I)
        return '<'+m.group(1)+'>'+text+'</'+m.group(1)+'>'
    raw=re.sub(r'<(AttackDamageText|AbilityPowerText)>([^<]*)</(?:AttackDamageText|AbilityPowerText)?>',damage,raw or '',flags=re.I)
    raw=re.sub(r'<(CC_Text|StatusEffectText)>([^<]*)</>',r'<\1>\2</\1>',raw,flags=re.I)
    return raw


def pred_meta(record,cohort,role=None):
    return {'source':'Pred.gg','url':record['url'],'fetched_at':record['fetched_at'],'cache_hit':record['cache_hit'],
            'patch':cohort['patch'],'version_id':cohort['versions'][0],'bracket':cohort['bracket_label'] if role else None,
            'role':role,'mode':'RANKED' if role else None}


def pred_count(row,core=False,rate_required=True):
    suffix='BuildOrder' if core else '';n=row.get('matchesPlayed'+suffix);w=row.get('matchesWon'+suffix)
    if type(n)is not int or n<0 or (rate_required and type(w)is not int) or (w is not None and (type(w)is not int or not 0<=w<=n)):
        raise ValueError('Pred.gg invalid or missing wins/games')
    return {'played':n,'won':w,'wr':100*w/n if n and w is not None else None}


def pred_ref(obj):
    if not isinstance(obj,dict) or not isinstance(obj.get('data'),dict) or not obj['data'].get('displayName'):
        raise ValueError('Pred.gg missing item/perk definition in observation')
    return {'name':obj['data']['displayName'],'source_id':obj.get('id'),'slug':obj.get('slug') or obj['data'].get('item',{}).get('slug')}


def pred_observations(rows,core=False):
    if not isinstance(rows,list):raise ValueError('Pred.gg observation table missing')
    result=[]
    for r in rows:
        if not isinstance(r,dict):raise ValueError('Pred.gg malformed observation')
        ref=pred_ref(r.get('item') or r.get('perk')) if 'level' not in r else {'level':r['level']}
        if 'level'in r and (type(r['level'])is not int or not 1<=r['level']<=18):raise ValueError('Pred.gg invalid skill level')
        result.append(dict(ref,**pred_count(r,core,rate_required=not(core and 'level'in r))))
    return result


def pred_role_data(record,hero,cohort,role,kind,heroes):
    h=pred_identity(record,hero);out={'status':'ok',**pred_meta(record,cohort,role)}
    if kind=='overview':
        obj=h.get('coreBuild');pred_filter((obj or {}).get('filter'),cohort,role)
        if not isinstance(obj.get('results'),list):raise ValueError('Pred.gg core-build results absent')
        out['cores']=[]
        for r in obj['results']:
            core={'items':[pred_ref(r.get('core'+str(i)+'Item')) for i in (1,2,3)],**pred_count(r,True),'choices':{}}
            for k in ('startItem1','startItem2','fourthItems','fifthItems','sixthItems','crests','heroPerks','commonPerks1','commonPerks2','eternals','minorBlessing1','minorBlessing2','primaryAbilities','secondaryAbilities','ultimateAbilities','alternateAbilities'):
                core['choices'][k]=pred_observations(r.get(k),True)
            out['cores'].append(core)
        out['note']='Observed three-item order. Each additional choice has its own conditional sample; these are not measured six-item or full-loadout win rates.'
    elif kind=='items':
        obj=h.get('simpleBuild');pred_filter((obj or {}).get('filter'),cohort,role);out['tables']={}
        out['cohort_filter']=copy.deepcopy(obj['filter'])
        for k in ('heroAugment','common1Augment','common2Augment','eternals','minorBlessing1','minorBlessing2','crest','firstTier3','secondTier3','thirdTier3','fourthTier3','fifthTier3','sixthTier3','abilityBasic','abilitySecondary','abilityPrimary','abilityUltimate','abilityAlternate'):
            out['tables'][k]=pred_observations(obj.get(k))
        out['note']='Position and loadout observations overlap. No samples are summed. Later purchases are conditional on a match lasting long enough; their win rates do not measure item strength.'
    elif kind=='counters':
        pred_filter((h.get('counters') or {}).get('filter'),cohort,role);out['tables']={}
        join={norm_key(s):s for s in heroes}
        for k in ('counters','antiCounters','laneCounters'):
            table=h.get(k)
            if not isinstance(table,dict) or not isinstance(table.get('results'),list):raise ValueError('Pred.gg matchup table absent')
            # Only this table echoes the cohort. Other tables stay inspectable, unscoped.
            scoped=isinstance(table.get('filter'),dict)
            if scoped:pred_filter(table['filter'],cohort,role)
            rows=[]
            for r in table['results']:
                opponent=r.get('matchupHero') or {};slug=join.get(norm_key(opponent.get('slug')));n=r.get('matchesPlayed');wr=r.get('winrate');lr=r.get('loserate')
                if not slug or norm_key((opponent.get('data') or {}).get('displayName'))!=norm_key(heroes[slug]['display_name']):raise ValueError('Pred.gg opponent join failed')
                if type(n)is not int or n<0 or type(wr)not in (int,float) or not math.isfinite(wr) or not 0<=wr<=1 or type(lr)not in(int,float) or abs(wr+lr-1)>1e-5:raise ValueError('Pred.gg invalid matchup rate/sample')
                rows.append({'slug':slug,'played':n,'wr':wr*100 if n else None,'enemy_role':None})
            out['tables'][k]={'rows':rows,'cohort_verified':scoped,'opponent_role_verified':False}
        out['note']='The primary table echoes allied role, patch and rank filters. Opponent roles are not reported. Alternate tables have no filter echo and are inspection-only. Duplicate samples are never added.'
    return out


def attach_pred_game_data(bundle,progress=lambda s:None,pages=None,force=False):
    """Complete game catalog + each planning role; definitions patch-cached, observations 30 minutes."""
    pages=pages or PredPages(force=force);t=time.perf_counter()
    out={'source':'Pred.gg','status':'failed','heroes':{},'items':{},'perks':{},'role_data':{},'errors':[],'records':[],
         'cache_policy':'Definitions: selected patch, rechecked after 24 hours. Role observations: 30 minutes. Refresh Data bypasses both. Original fetch times are retained.'}
    bundle['pred_game_data']=out
    def error(label,e):out['errors'].append({'source':'Pred.gg '+label,'severity':'error','detail':str(e)})
    try:
        if bundle.get('official',{}).get('status')!='verified':raise ValueError('Official live patch unverified; Pred.gg game-data update withheld')
        boot=pages.get(PRED_BASE+'/heroes',ttl=0);cat=pred_catalog(boot['payloads']);cohort=pred_cohort(cat,bundle['official']['live']['version'],bundle['bracket']['segment']);out['cohort']=cohort
        roster={};by_slug={norm_key(s):s for s in bundle['heroes']}
        for h in cat['heroes']:
            s=by_slug.get(norm_key(h.get('slug')))
            if not s or norm_key(h['data']['displayName'])!=norm_key(bundle['heroes'][s]['display_name']):raise ValueError('Pred.gg catalog hero join failed')
            roster[s]=h
        if set(roster)!=set(bundle['heroes']):raise ValueError('Pred.gg roster coverage mismatch')
        # Every route starts from a link harvested from a public page, never a display-name slug.
        roots={urllib.parse.urlparse(u).path:u for u in boot['links']}
        query=urllib.parse.urlencode({'versions':','.join(cohort['versions']),'gameMode':'RANKED','ranks':','.join(cohort['ranks'])})
        assets=set(boot['assets']);overview_pages={}
        def batch(jobs,label,process):
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
                futures={ex.submit(pages.get,url,ttl):(ident,url) for ident,url,ttl in jobs}
                for i,f in enumerate(concurrent.futures.as_completed(futures),1):
                    ident,url=futures[f]
                    try:rec=f.result();assets.update(rec['assets']);process(ident,rec)
                    except Exception as e:error(label+' '+str(ident),e)
                    if i%5==0 or i==len(jobs):progress('Pred.gg '+label+': '+str(i)+' / '+str(len(jobs)))
        jobs=[]
        for s,h in roster.items():
            path='/heroes/'+h['slug']
            if path not in roots:raise ValueError('Pred.gg hero route missing from source links: '+path)
            # First overview also gives the actual per-hero navigation routes.
            role=bundle['heroes'][s]['roles_order'][0];jobs.append(((s,role),PRED_BASE+path+'?'+query+'&role='+role.upper(),1800))
        def overview(ident,rec):
            s,role=ident;overview_pages[s]=rec
            out['role_data'].setdefault(s,{})[role]={'overview':pred_role_data(rec,roster[s],cohort,role,'overview',bundle['heroes'])}
        batch(jobs,'hero overview',overview)
        jobs=[]
        for path,kind in [('/items','items'),('/eternals','eternals')]:
            jobs.append(((kind,None,None),PRED_BASE+path+'?version='+cohort['versions'][0],86400))
        for s,rec in overview_pages.items():
            h=roster[s];paths={urllib.parse.urlparse(u).path for u in rec['links']};base='/heroes/'+h['slug']
            for suffix,kind in [('/hero','hero'),('','overview'),('/counters','counters'),('/items','items')]:
                path=base+suffix
                if path not in paths:error(s+' '+kind,ValueError('Source navigation route missing'));continue
                roles=[None] if kind=='hero' else bundle['heroes'][s]['roles_order']
                for role in roles:
                    if kind=='overview' and role in out['role_data'].get(s,{}):continue
                    jobs.append(((kind,s,role),PRED_BASE+path+'?'+query+('&role='+role.upper() if role else ''),86400 if kind=='hero' else 1800))
        def detail(ident,rec):
            kind,s,role=ident
            if s is None:
                field='items' if kind=='items' else 'eternalCategories';rows=next((p[field] for p in reversed(rec['payloads']) if field in p),None)
                if not isinstance(rows,list) or not rows:raise ValueError('Empty Pred.gg '+field+' catalog')
                out[kind+'_catalog']={'rows':rows,**pred_meta(rec,cohort)}
            elif kind=='hero':
                h=pred_identity(rec,roster[s]);d=h['data'];abilities=d.get('abilities');perks=d.get('perks')
                if not isinstance(abilities,list) or not abilities or not isinstance(perks,list) or not perks:raise ValueError('Pred.gg kit or augment definitions absent')
                keys=set()
                for a in abilities:
                    if not a.get('key') or a['key'] in keys or not isinstance(a.get('menuDescription'),str) or not a['menuDescription'].strip():raise ValueError('Pred.gg ability identity/description invalid')
                    keys.add(a['key'])
                    for field in ('cost','cooldown'):
                        if not isinstance(a.get(field),list) or any(type(v)not in(int,float) or not math.isfinite(v) or v<0 for v in a[field]):raise ValueError('Pred.gg ability '+field+' invalid')
                out['heroes'][s]={'data':d,'roster_data':roster[s]['data'],**pred_meta(rec,cohort),'patch_binding':'Public hero page selected with versions='+cohort['versions'][0]+'; kit has no independent version echo.'}
            else:out['role_data'].setdefault(s,{}).setdefault(role,{})[kind]=pred_role_data(rec,roster[s],cohort,role,kind,bundle['heroes'])
        batch(jobs,'kits, builds and matchups',detail)
        out['assets']=sorted(assets)
        # Apply validated mechanics transactionally: an unexpected schema cannot leave half an overlay.
        staged=copy.deepcopy(bundle)
        apply_pred_game_data(staged)
        bundle.clear();bundle.update(staged);out=bundle['pred_game_data']
        out['status']='partial' if out['errors'] else 'ok'
    except Exception as e:error('game data',e)
    out['records']=copy.deepcopy(pages.records);out['seconds']=round(time.perf_counter()-t,2)
    out['coverage']={'hero_kits':len(out['heroes']),'expected_heroes':len(bundle['heroes']),'item_definitions':len(out['items']),'perks':len(out['perks']),
        'expected_roles':sum(len(h.get('roles_order',[])) for h in bundle['heroes'].values()),
        **{k:sum(k in r for roles in out['role_data'].values() for r in roles.values()) for k in ('overview','items','counters')}}
    # Distinguish catalog size from observed role-item table coverage.
    out['coverage']['catalog_items']=len(out['items'])
    bundle.setdefault('errors',[]).extend(out['errors']);bundle.setdefault('sources',{})['pred_game_data']={'status':out['status'],'url':PRED_BASE,'secs':out['seconds'],'fetched_at':max((r['fetched_at'] for r in out['records']),default=None)}
    return out


def apply_pred_game_data(bundle):
    """Update effective mechanics; protected reviewed fields win, and original values remain inspectable."""
    out=bundle['pred_game_data'];cohort=out['cohort'];version=cohort['versions'][0];audits=[]
    protected={}
    for r in bundle.get('corrections',[])+bundle.get('mechanics_resolutions',[]):
        if r.get('status') in ('official correction applied','source already current','source already matches reviewed value','reviewed source reconciliation applied','source already updated'):
            protected[tuple(r['path'])]=r
    # Any reviewed correction that was already current still protects its exact resulting value.
    for r in bundle.get('corrections',[]):
        if not str(r.get('status','')).startswith(('conflict','needs review')):protected[tuple(r['path'])]=r
    assets=out.get('assets',[])
    def image_for(d):return next((u for k in ('icon','smallIcon') for u in assets if d.get(k) and '/'+d[k]+'_' in u),None)
    def preserve(path,old,new):
        rule=protected.get(tuple(path))
        if rule and old!=new:
            audits.append({'path':path,'pred_value':new,'effective_value':old,'reason':'Verified official/reviewed field retained','source':rule.get('source') or (rule.get('sources') or [{}])[0].get('url')});return old
        return new
    itemcat=out.get('items_catalog',{})
    existing={norm_key(v.get('display_name') or v.get('name') or k):k for k,v in bundle['items'].items()}
    inactive=[]
    for row in itemcat.get('rows',[]):
        d=row.get('data')
        if d is None:
            inactive.append(row.get('slug'));continue
        if d.get('version',{}).get('id')!=version:raise ValueError('Pred.gg item definition version mismatch')
        if not d.get('displayName') or not isinstance(d.get('stats'),list) or not isinstance(d.get('effects'),list) or type(d.get('totalPrice'))not in(int,float) or d['totalPrice']<0:raise ValueError('Pred.gg malformed item definition')
        name=d['displayName'];key=existing.get(norm_key(name)) or row.get('slug')
        if not key:raise ValueError('Pred.gg item without source slug')
        old=copy.deepcopy(bundle['items'].get(key,{}));new=copy.deepcopy(old)
        stats={}
        for stat in d['stats']:
            val=stat.get('value')
            if type(val)not in(int,float) or not math.isfinite(val):raise ValueError('Pred.gg invalid item statistic')
            label=stat['stat'].replace('_',' ').capitalize();value=str(float(val))+('%' if stat.get('showPercent') else '')
            stats[label]=preserve(['items',key,'stats',label],old.get('stats',{}).get(label),value)
        effects=[];oldfx={norm_key(e.get('name')):i for i,e in enumerate(old.get('effects',[])) if e.get('name')}
        for e in d['effects']:
            if not e.get('name') and re.search(r'\{[^}]+\}',e.get('text') or ''):continue
            fx={'name':e.get('name') or '', 'active':e.get('active'),'cooldown':e.get('cooldown'),'condition':clean_text(pred_markup(e.get('condition'))),'text':clean_text(pred_markup(e.get('text')))}
            oi=oldfx.get(norm_key(fx['name']))
            if oi is not None:
                for field in fx:fx[field]=preserve(['items',key,'effects',oi,field],old['effects'][oi].get(field),fx[field])
            effects.append(fx)
        new.update({'name':name,'stats':stats,'effects':effects,'total_price':preserve(['items',key,'total_price'],old.get('total_price'),d['totalPrice']),
          'source':'Pred.gg · official fields take priority','pred_source':{k:v for k,v in itemcat.items() if k!='rows'},'pred_raw':d,'previous_source':old,
          'image_url':image_for(d) or old.get('image_url'),'available_current_patch':True})
        if not old:new['completed_item']=False # Catalog rarity alone does not establish standard-mode purchase eligibility.
        bundle['items'][key]=new;out['items'][key]={'name':name,'rarity':d.get('rarity'),'class':d.get('class'),'price':d['totalPrice']}
    out['inactive_item_slugs']=inactive
    for k,v in bundle['items'].items():
        if k in inactive:v['available_current_patch']=False;v['completed_item']=False
    def perk(d,meta,hero=None,eternal=None):
        if not d.get('displayName') or not isinstance(d.get('description'),str) or not d['description'].strip() or not d.get('slot'):raise ValueError('Pred.gg perk definition missing')
        name=d['displayName'];key=next((k for k,v in bundle['perks'].items() if norm_key(v.get('display_name') or v.get('name') or k)==norm_key(name)),None) or re.sub('[^a-z0-9]+','-',name.lower()).strip('-')
        old=copy.deepcopy(bundle['perks'].get(key,{}));description=preserve(['perks',key,'description'],old.get('description'),clean_text(pred_markup(d['description'])))
        # Active official supplemental definitions are authoritative, including partial-field boundaries.
        review=next((r for r in bundle.get('reviewed_definitions',{}).values() if r.get('active') and norm_key(r['name'])==norm_key(name)),None)
        if review:description=review['description']
        new={**old,'name':name,'display_name':name,'description':description,'slot':d['slot'],'source':'Pred.gg · official review takes priority',
             'pred_source':meta,'pred_raw':d,'previous_source':old,'image_url':image_for(d) or old.get('image_url'),'hero':hero,'eternal':eternal}
        bundle['perks'][key]=new;out['perks'][key]={'name':name,'slot':d['slot'],'hero':hero,'eternal':eternal}
    eternalcat=out.get('eternals_catalog',{});tree={}
    for c in eternalcat.get('rows',[]):
        d=c.get('data')
        if not isinstance(d,dict) or d.get('version',{}).get('id')!=version:raise ValueError('Pred.gg Eternal category version missing/mismatched')
        for e in d.get('perks',[]):
            meta={k:v for k,v in eternalcat.items() if k!='rows'};perk(e,meta,eternal=e['displayName']);slots={}
            for blessing in e.get('minorBlessings',[]):
                perk(blessing,meta,eternal=e['displayName']);slots.setdefault(blessing['slot'],[]).append(blessing['displayName'])
            tree[e['displayName']]=slots
    if tree:bundle['loadout_catalog']={'patch':cohort['patch'],'source':eternalcat['url'],'reviewed_at':eternalcat['fetched_at'],'eternals':tree}
    keys={'BASIC':'LMB','ALTERNATE':'RMB','PRIMARY':'Q','SECONDARY':'E','ULTIMATE':'R','PASSIVE':'P'}
    for s,entry in out['heroes'].items():
        h=bundle['heroes'][s];d=entry['data'];h['previous_abilities']=copy.deepcopy(h.get('abilities',[]));h['pred_source']={k:v for k,v in entry.items() if k!='data'}
        # Match by key, retain order: official audit paths refer to original ability indexes.
        bykey={keys.get(a['key'],a['key']):a for a in d['abilities']};abilities=[]
        for i,old in enumerate(h.get('abilities',[])):
            a=bykey.pop('P' if old['key'].lower()=='passive' else old['key'],None)
            if a is None:raise ValueError('Pred.gg ability-key join failed: '+s+' '+old['key'])
            new=copy.deepcopy(old)
            for field,value in [('display_name',a['displayName']),('menu_description',pred_markup(a['menuDescription'])),('cooldown',a['cooldown']),('cost',a['cost'])]:
                new[field]=preserve(['heroes',s,'abilities',i,field],old.get(field),value)
            issue=guard_pred_damage_description(new)
            if issue:bundle.setdefault('errors',[]).append({'source':'Pred.gg kit validation','severity':'warning','detail':s+' '+a['displayName']+': '+issue,'url':h['pred_source'].get('url')})
            new.update({'text':clean_text(new['menu_description']),'pred_raw':a,'pred_source':h['pred_source'],'image_url':image_for(a),
                        'game_description':new['menu_description'],'game_text':clean_text(new['menu_description'])})
            abilities.append(new)
        if bykey:raise ValueError('Pred.gg new ability keys require mapping: '+s)
        h['previous_classes']=h.get('classes',[]);h['classes']=entry.get('roster_data',{}).get('classes') or h.get('classes',[])
        h['pred_image_url']=image_for(entry.get('roster_data',{}))
        h['abilities']=abilities;h['pred_attributes']=d.get('attributes',[]);h['pred_main_attributes']=d.get('mainAttributes')
        for p in d['perks']:perk(p,h['pred_source'],hero=s)
        h['capabilities'],h['capability_evidence']=derive_capabilities(h)
    apply_pred_source_corrections(bundle)
    out['field_protections']=audits
    out['counts_note']='Catalog definitions and observations are separate. Current patch selection does not make every source mechanic officially verified.'


# ============================================================================
# 12. COLLECTION (independent of rendering and HTTP interface)
# ============================================================================

def apply_pred_source_corrections(bundle):
    """Resolve unavailable earlier fields against explicitly reviewed Pred.gg encodings."""
    if bundle.get('official',{}).get('status')!='verified' or bundle.get('guidance',{}).get('status')!='reviewed for current patch':return
    packet=json.loads((TOOL_DIR/'reviewed_guidance.json').read_text(encoding='utf8'))
    rules={r['id']:r for r in packet['corrections']+packet['mechanics_resolutions']}
    alternatives={r['id']:r for r in packet.get('pred_source_preconditions',[])}
    history=bundle['official'].get('definition_history',{})
    checked={a['url']:a.get('fingerprint') for a in history.get('articles',[])+bundle['official'].get('articles',[])}
    for audit in bundle['corrections']+bundle['mechanics_resolutions']:
        if not audit['status'].startswith('conflict'):continue
        rule=rules[audit['id']];path=copy.deepcopy(rule['path'])
        if correction_scope_error(rule):continue
        if any(checked.get(a['url'])!=a['fingerprint'] for a in rule.get('official_dependencies',[])):continue
        if path[0] not in ('items','perks'):continue
        matches=[k for k in bundle[path[0]] if norm_key(k)==norm_key(path[1])]
        if len(matches)!=1:continue
        path[1]=matches[0];entry=bundle[path[0]][path[1]];source=entry.get('pred_source',{})
        if not source:continue
        try:
            parent=bundle
            for key in path[:-1]:parent=parent[key]
            value=parent[path[-1]]
        except (KeyError,IndexError,TypeError):continue
        accepted=rule.get('accepted_before',[rule.get('before')])
        alternative=alternatives.get(rule['id'])
        if alternative and alternative['patch']==packet['patch'] and alternative['source']==source.get('url'):
            accepted=accepted+[alternative['before']]
        if value!=rule['after'] and value not in accepted:continue
        prior=copy.deepcopy(audit)
        parent[path[-1]]=copy.deepcopy(rule['after'])
        audit.update(path=path,original=copy.deepcopy(value),prior_source_check=prior,
            status='source already updated' if value==rule['after'] else 'official correction applied' if 'source' in rule else 'reviewed source reconciliation applied',
            pred_source_check={'url':source['url'],'fetched_at':source['fetched_at'],
                'note':'Earlier source field was unavailable or conflicting; this exact Pred.gg value matches the reviewed field precondition.'})
        if rule.get('unit')=='rating':
            entry.setdefault('verified_stat_units',{})['Tenacity']={'unit':'rating','source':rule['sources'][0]['url'],'patch':packet['patch']}
            entry.get('stat_notes',{}).pop('Tenacity',None)
    for key,label in (('corrections','Official correction review'),('mechanics_resolutions','Mechanics reconciliation')):
        if not any(c['status'].startswith('conflict') for c in bundle[key]):
            bundle['errors']=[e for e in bundle['errors'] if e['source']!=label]


def source_records_before_review(bundle):
    """Unwind an audited bundle to its source fields; never change observed numbers/dates."""
    b=copy.deepcopy(bundle)
    for h in b.get('heroes',{}).values():
        if 'previous_abilities' in h:h['abilities']=copy.deepcopy(h['previous_abilities'])
        if 'previous_classes' in h:h['classes']=copy.deepcopy(h['previous_classes'])
    for kind in ('items','perks'):
        for key,value in list(b.get(kind,{}).items()):
            if 'previous_source' in value:
                if value['previous_source']:b[kind][key]=copy.deepcopy(value['previous_source'])
                else:del b[kind][key]
    for rule in bundle.get('corrections',[])+bundle.get('mechanics_resolutions',[]):
        rule=rule.get('prior_source_check',rule)
        if 'original' not in rule:continue  # An unavailable field has nothing to restore.
        parent=b
        for key in rule['path'][:-1]:parent=parent[key]
        parent[rule['path'][-1]]=copy.deepcopy(rule['original'])
    return b


def retained_statz_bundle(bracket):
    """Only a successful, same-bracket Statz collection can supply retained observations."""
    candidates=[]
    for path in (DATA_DIR/('last_successful_'+bracket+'.json'),LATEST_BUNDLE):
        try:
            b=load_bundle(path);sources=b.get('sources',{})
            if b.get('schema')!=3 or b.get('bracket',{}).get('segment')!=bracket or not b.get('patch'):continue
            if not b.get('tier_list') or b.get('failed_pages') or b.get('patch_conflicts'):continue
            if any(sources.get(k,{}).get('status')!='ok' or not sources[k].get('fetched_at') for k in ('statz_tierlist','statz_hero_pages')):continue
            age=timestamp_age(sources['statz_tierlist']['fetched_at'])
            if age is not None:candidates.append((age,b))
        except (OSError,ValueError,TypeError,KeyError):continue
    for _,candidate in sorted(candidates,key=lambda x:x[0]):
        try:return source_records_before_review(candidate)
        except (KeyError,IndexError,TypeError,ValueError) as e:log('Retained Statz audit unavailable: '+str(e))
    return None


def attach_retained_statz(bundle,old,error,attempt_at):
    """Copy only Statz's partition, with its baselines and original fetch times intact."""
    bundle['errors']=[e for e in bundle['errors'] if not e['source'].startswith('statz.gg')]
    state='retained' if old else 'failed'
    for kind in ('statz_tierlist','statz_hero_pages'):
        source=copy.deepcopy(old['sources'][kind]) if old else bundle['sources'][kind]
        if not old:source['fetched_at']=None
        source.update(status=state,error=error,attempted_at=attempt_at,
            note='Previous successful Statz collection; original observations and fetch times retained.' if old else 'No successful Statz collection available. No Statz observations were inferred.')
        bundle['sources'][kind]=source
    bundle['errors'].append({'source':'statz.gg tier list','severity':'error','detail':error+('. Showing dated Statz observations from '+old['sources']['statz_tierlist']['fetched_at']+'.' if old else '. Statz observations unavailable.')+' Official and Pred.gg checks continue independently.'})
    if not old:return
    for field in ('patch','bracket','tier_list','pairs','pairs_meta','pool_ratio','pool_note','matchup_note','image_index'):
        bundle[field]=copy.deepcopy(old[field])
    fields=('statz_roles','tier_roles','roles','hero_wide','hero_wide_url','hero_wide_fetched_at',
        '_teammates_raw','general_strong_against','general_counters','lane_previews','statz_abilities','partners_listed','image')
    for slug,h in old['heroes'].items():
        target=bundle['heroes'].setdefault(slug,{'slug':slug,'display_name':h['display_name'],'roles':{},'roles_order':[]})
        for key in fields:
            if key in h:target[key]=copy.deepcopy(h[key])
        target['roles_order']=[r for r in ROLES if r in set(target.get('roles_order',[]))|set(h.get('statz_roles',[]))]
    # Retain only Statz description records. Fresh Omeda identity, kit and item metadata
    # keep their own values. Official corrections are reapplied against raw fields.
    for kind in ('items','perks'):
        for key,value in old[kind].items():
            if not value.get('source') or 'statz' in str(value.get('source')).lower():
                bundle[kind][key]=copy.deepcopy(value)
    bundle['retained_sources']={'statz':{'patch':old['patch'],'bracket':old['bracket']['segment'],
        'tier_fetched_at':old['sources']['statz_tierlist']['fetched_at'],
        'hero_pages_fetched_at':old['sources']['statz_hero_pages']['fetched_at'],'attempted_at':attempt_at}}


def bundle_has_current_primary(b):
    """Useful primary updates are persisted separately; this does not certify completeness."""
    official=b.get('official',{});scoped=b.get('scoped_statistics',{});game=b.get('pred_game_data',{})
    return bool(b.get('schema')==3 and official.get('status')=='verified' and
        scoped.get('status')=='ok' and game.get('status')=='ok' and
        scoped.get('patch')==official.get('live',{}).get('version')==game.get('cohort',{}).get('patch') and
        scoped.get('bracket')==b.get('bracket',{}).get('segment') and
        b.get('sources',{}).get('omeda_heroes',{}).get('status')=='ok')


def collect_bundle(settings, progress=lambda s: None, fixture_dir=None):
    started = time.perf_counter(); bracket = settings['bracket']; ABORT.clear()
    tier_error=None; retained=None; tier_attempt=iso(now_utc())
    progress('Loading Statz tier list and Omeda kits; official verification follows…')
    def get_tier():
        if fixture_dir:
            raw = (Path(fixture_dir) / 'tierlist.html').read_text(encoding='utf-8'); sec = 0
        else: raw, _, sec = http_get(statz_tierlist_url(bracket))
        parsed = statz_parse_tierlist(raw)
        if parsed.get('bracket_label', '').lower().rstrip('+') != bracket:
            raise ValueError('Statz tier list: rank bracket did not match requested ' + bracket)
        return parsed, {'fetched_at':iso(now_utc()), 'secs':sec, 'offline':bool(fixture_dir)}
    omeda_meta = {'fetched_at':iso(now_utc())}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        ft = ex.submit(get_tier)
        fh = ex.submit(omeda_fetch_heroes) if not fixture_dir else None
        fi = ex.submit(omeda_fetch_items) if not fixture_dir else None
        # Tier rows determine the only allowed hero-page URLs.
        try: tier, tier_meta = ft.result()
        except Exception as e:
            tier_error=type(e).__name__+': '+str(e)
            retained=retained_statz_bundle(bracket) if not fixture_dir else None
            tier={'rows':copy.deepcopy(retained['tier_list']) if retained else [],
                'patch':retained['patch'] if retained else None,
                'bracket_label':retained['bracket']['label'] if retained else None}
            tier_meta={'fetched_at':None,'secs':None}
            progress('Statz tier list unavailable; continuing official, Omeda and Pred.gg checks…')
        targets = [(r['slug'],r['role'],r['build_path']) for r in tier['rows']] if not tier_error else []
        progress('Loading %d Statz hero/role pages; other panels stay usable…' % len(targets))
        pullstart = time.perf_counter()
        pages = statz_pull_hero_pages(targets, bracket, settings['concurrency'], Path(fixture_dir) if fixture_dir else None) if targets else {}
        pull = {'fetched_at':iso(now_utc()), 'secs':round(time.perf_counter()-pullstart,2), 'offline':bool(fixture_dir)}
        if fixture_dir:
            kits=json.loads((Path(fixture_dir)/'omeda_heroes.json').read_text(encoding='utf-8'))
            omitems=json.loads((Path(fixture_dir)/'omeda_items.json').read_text(encoding='utf-8'))
            official={'status':'unverified','error':'Fixture validation; no live patch check.'}; omeda_meta['offline']=True
        else:
            try: kits, omeda_meta['heroes_secs'] = fh.result()
            except Exception as e: kits=[]; omeda_meta['heroes_error']=str(e)
            try: omitems, omeda_meta['items_secs'] = fi.result()
            except Exception as e: omitems=None; omeda_meta['items_error']=str(e)
            progress('Verifying official patch notes and supporting history…')
            try: official=fetch_official(force_history=settings.get('force_history_refresh',False))
            except Exception as e: official={'status':'failed','error':str(e),'checked_at':iso(now_utc()),'index_url':OFFICIAL_INDEX}
    progress('Validating samples, applying reviewed official corrections and generating bundle…')
    bundle=build_bundle(tier,tier_meta,pages,kits,omitems,omeda_meta,settings,bracket,pull)
    for item in omitems or []:
        slug=item.get('slug')
        if slug and slug not in bundle['items']:
            bundle['items'][slug]={'name':item.get('display_name'), 'total_price':item.get('total_price'),
                'stats':item.get('stats') or {}, 'effects':[{'name':e.get('name'),'active':e.get('active'),
                'cooldown':e.get('cooldown'),'condition':clean_text(e.get('condition')),'text':clean_text(e.get('menu_description'))} for e in item.get('effects',[])],
                'source':'omeda.city/items.json', 'image_url':urllib.parse.urljoin(OMEDA_BASE,item['image']) if item.get('image') else None}
    # Keep the complete Omeda roster even if all Statz detail pages fail.
    for o in kits:
        if o['slug'] not in bundle['heroes']:
            roles=[r for r in (omeda_role_normalize(x) for x in o.get('roles',[])) if r]
            bundle['heroes'][o['slug']]={'slug':o['slug'],'display_name':o['display_name'],'omeda':{'id':o['id'],'image':o.get('image'),'roles':roles},
                'roles_order':roles,'roles':{r:{'status':'unavailable','error':'No Statz sample in this bracket.'} for r in roles},
                'abilities':copy.deepcopy(o.get('abilities',[])),'classes':o.get('classes',[]),'statz_roles':[], 'tier_roles':[]}
    if tier_error:attach_retained_statz(bundle,retained,tier_error,tier_attempt)
    enrich_bundle(bundle,official)
    if not fixture_dir:
        progress('Checking current-patch community build alternatives…')
        attach_community_builds(bundle)
        pred_pages=PredPages(force=settings.get("force_history_refresh",False))
        attach_scoped_statistics(bundle,progress,pages=pred_pages)
        attach_pred_game_data(bundle,progress,pages=pred_pages)
    if official.get('status')!='verified': bundle['errors'].append({'source':'Official Predecessor patch notes','severity':'error','detail':official.get('error','Unverified')})
    bundle['timings']={'cold_refresh_secs':round(time.perf_counter()-started,2),'hero_pages_secs':pull['secs']}
    if not fixture_dir:
        if not tier_error:
            _, snap=write_snapshot(tier,bracket,now_utc()); bundle['changes']=compute_changes(snap,bracket)
        else:bundle['changes']={'status':'unavailable','reason':'No new Statz tier collection; no Statz snapshot was written.'}
        attach_scoped_history(bundle)
        bundle['timings']['cold_refresh_secs']=round(time.perf_counter()-started,2)
    else: bundle['changes']={}; bundle['offline']=True
    bundle['generated_at']=iso(now_utc())
    return bundle


def json_script(value):
    return json.dumps(value, ensure_ascii=False, separators=(',',':')).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')


def render_html(bundle, config=None):
    return (UI_TEMPLATE.read_text(encoding='utf-8').replace('__BUNDLE_JSON__',json_script(bundle),1)
            .replace('__APP_CONFIG__',json_script(config or {'mode':'export'}),1)
            .replace('__UI_JS__',(TOOL_DIR/'ui.js').read_text(encoding='utf-8'),1)
            .replace('__ENGINE_JS__',(TOOL_DIR/'engine.js').read_text(encoding='utf-8'),1))


def render(bundle, out_path=None):
    path=out_path or OUT_HTML; atomic_write(path,render_html(bundle)); return path


def review_saved_sources(bundle):
    """Apply this release's review to retained source records, without a fresh-data claim.

    No files are written, observations are untouched and all fetch dates survive.
    Only complete bundles with the raw-source audit trail support this replay.
    """
    if bundle.get('tool_version')==VERSION or not bundle.get('pred_game_data') or not (bundle_is_complete(bundle)[0] or bundle_has_current_primary(bundle)):
        return bundle
    b=source_records_before_review(bundle)
    enrich_bundle(b,b['official'])
    apply_pred_game_data(b)
    b['tool_version']=VERSION
    b['saved_source_review']={'from_version':bundle.get('tool_version'),'review_version':VERSION,
        'applied_at':iso(now_utc()),'data_generated_at':bundle['generated_at'],
        'note':'Current local review applied to retained source records. No source was fetched or reverified by this step.'}
    return b


def read_cached(bracket=None):
    choices=[DATA_DIR/('last_successful_'+bracket+'.json'),DATA_DIR/('last_primary_'+bracket+'.json')] if bracket else []
    choices.append(LATEST_BUNDLE)
    # Newest useful collection wins. Full success and partial primary remain separate files.
    def collection_age(path):
        try:
            b=load_bundle(path)
            if path.name.startswith('last_primary_') and not bundle_has_current_primary(b):return float('inf')
            age=timestamp_age(b.get('generated_at'))
            return age if age is not None else float('inf')
        except (OSError,ValueError,TypeError):return float('inf')
    for path in sorted(choices,key=collection_age):
        if path.exists():
            try:
                raw=load_bundle(path)
                if path.name.startswith('last_primary_') and not bundle_has_current_primary(raw):continue
                b=review_saved_sources(raw)
                if not bracket or b.get('bracket',{}).get('segment')==bracket:
                    b['session_notice']='Saved data from '+b.get('generated_at','an unknown time')+'. A live refresh is required for this opening.'
                    b['cache']={'used':True,'file':path.name}
                    if str(b.get('guidance',{}).get('status','')).startswith('reviewed'):
                        b['guidance']['status']='reviewed for saved patch; live check pending'
                    if b.get('schema')!=3:
                        b['legacy']=True; b['pairs']=[]
                        for h in b.get('heroes',{}).values():
                            h['capabilities'],h['capability_evidence']=derive_capabilities(h)
                    return b
            except Exception as e: log('Cache unavailable: '+str(e))
    return None


# ============================================================================
# 13. LOOPBACK APPLICATION (no arbitrary files, commands or URLs exposed)
# ============================================================================

AUTO_REFRESH_SECONDS = 3600
AUTO_RETRY_SECONDS = 900
AUTO_BLOCK_RETRY_SECONDS = 3600


def timestamp_age(value, at=None):
    """Unknown or implausibly future dates never qualify as fresh."""
    try:
        parsed=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
        if parsed.tzinfo is None:return None
        seconds=((at or now_utc())-parsed).total_seconds()
        return max(0,seconds) if seconds>=-300 else None
    except (AttributeError,TypeError,ValueError):return None


def freshness_state(bundle,last_attempt=None,busy=False,no_fetch=False,at=None,retry_blocked=False):
    at=at or now_utc();b=bundle or {};scoped=b.get('scoped_statistics') or {};official=b.get('official') or {}
    observations=[r.get('fetched_at') for r in scoped.get('records',[]) if r.get('status')=='ok']
    dates=[b.get('generated_at'),official.get('checked_at')]+observations
    ages=[timestamp_age(v,at) for v in dates]
    oldest=max((a for a in ages if a is not None),default=None)
    unknown=not bundle or any(a is None for a in ages) or not observations
    patch_matches=bool(official.get('status')=='verified' and scoped.get('status')=='ok' and scoped.get('patch')==official.get('live',{}).get('version'))
    source_failed=any(e.get('severity')=='error' for e in b.get('errors',[]))
    stale=unknown or not patch_matches or source_failed or bool(b.get('cache',{}).get('used')) or oldest>=AUTO_REFRESH_SECONDS
    blocked=retry_blocked or any(re.search(r'403|429|blocked|rate.limit',str(e.get('detail','')),re.I) for e in b.get('errors',[]) if e.get('severity')=='error')
    retry_seconds=AUTO_BLOCK_RETRY_SECONDS if blocked else AUTO_RETRY_SECONDS
    elapsed=timestamp_age(last_attempt,at);retry_wait=bool(stale and elapsed is not None and elapsed<retry_seconds)
    return {'state':'disabled' if no_fetch else 'refreshing' if busy else 'retry_wait' if retry_wait else 'due' if stale else 'fresh',
        'due':bool(stale and not retry_wait and not busy and not no_fetch),'oldest_primary_age_seconds':oldest,'patch_matches':patch_matches,
        'auto_interval_seconds':AUTO_REFRESH_SECONDS,'retry_seconds_remaining':max(0,retry_seconds-elapsed) if retry_wait else 0,
        'note':'Refresh on open (duplicate opens within one minute reuse the completed live pull); while visible, recheck primary data at least hourly. After a failed or interrupted attempt, automatic retries wait 15 minutes (one hour after a source block), including after restarting the app. Individual detail caches keep their own fetch dates.'}


def read_refresh_checkpoint():
    """Small local recovery record, separate from every source bundle and snapshot."""
    path=DATA_DIR/'refresh_state.json'
    try:
        if path.stat().st_size>128000:raise ValueError('Recovery record exceeds its size limit')
        record=load_bundle(path)
    except FileNotFoundError:return None
    if not isinstance(record,dict) or set(record)!={'schema','bracket','started_at','finished_at','outcome','errors'}:
        raise ValueError('Recovery record has an invalid shape')
    if type(record['schema']) is not int or record['schema']!=1 or record['bracket'] not in BRACKETS or record['outcome'] not in ('running','complete','partial','failed'):
        raise ValueError('Recovery record has an unsupported identity or outcome')
    if timestamp_age(record['started_at']) is None:raise ValueError('Recovery start time is unavailable or invalid')
    finished=record['finished_at']
    if record['outcome']=='running':
        if finished is not None:raise ValueError('An unfinished refresh cannot have a completion time')
    elif timestamp_age(finished) is None or dt.datetime.fromisoformat(finished.replace('Z','+00:00'))<dt.datetime.fromisoformat(record['started_at'].replace('Z','+00:00')):
        raise ValueError('Recovery completion time is invalid')
    errors=record['errors']
    if not isinstance(errors,list) or len(errors)>50 or any(not isinstance(e,dict) or set(e)!={'source','severity','detail'} or e['severity'] not in ('warning','error') or any(not isinstance(e[k],str) or not e[k] for k in ('source','detail')) for e in errors):
        raise ValueError('Recovery errors have an invalid shape')
    return record


def write_refresh_checkpoint(bracket,started,outcome,errors=()):
    records=[{'source':str(e.get('source') or 'Refresh'),'severity':e['severity'],'detail':str(e.get('detail') or 'Source result unavailable')} for e in errors if e.get('severity')=='error'][:50]
    record={'schema':1,'bracket':bracket,'started_at':started,'finished_at':None if outcome=='running' else iso(now_utc()),'outcome':outcome,'errors':records}
    atomic_write(DATA_DIR/'refresh_state.json',json.dumps(record,ensure_ascii=False,indent=2))
    return record


class AppState:
    def __init__(self,settings,no_fetch=False):
        self.settings=settings; self.bundle=read_cached(settings['bracket']); self.lock=threading.Lock(); self.refresh_lock=threading.Lock()
        self.token=secrets.token_urlsafe(32); self.instance_id=secrets.token_hex(12); self.last_attempt_at=None; self.last_completed_at=None; self.revision=0; self.last_ping=time.monotonic(); self.no_fetch=no_fetch; self.retry_blocked=False
        self.status={'busy':False,'message':'Opening saved data. Live verification pending.','errors':[],'revision':0,'bracket':settings['bracket']}
        self.saved={}
        try: self.saved=load_bundle(DATA_DIR/'planner_state.json')
        except (OSError,ValueError): pass
        self.restore_refresh_checkpoint()
    def restore_refresh_checkpoint(self):
        try:
            record=read_refresh_checkpoint()
            if not record or record['outcome']=='complete':return
            self.last_attempt_at=record['finished_at'] or record['started_at']
            errors=copy.deepcopy(record['errors'])
            detail=('The previous refresh was interrupted' if record['outcome']=='running' else 'The previous refresh did not fully succeed')+' ('+self.last_attempt_at+', '+record['bracket']+'). Saved source dates are unchanged.'
            errors.insert(0,{'source':'Refresh recovery','severity':'error','detail':detail})
        except (OSError,ValueError,TypeError) as exc:
            self.last_attempt_at=iso(now_utc())
            errors=[{'source':'Refresh recovery','severity':'error','detail':'Could not read data/refresh_state.json: '+str(exc)+'. Automatic collection is paused for 15 minutes; Refresh Data is an explicit retry.'}]
        self.retry_blocked=any(re.search(r'403|429|blocked|rate.limit',e['detail'],re.I) for e in errors)
        self.status.update({'errors':errors,'message':errors[0]['detail']})
        if self.bundle:
            self.bundle=copy.deepcopy(self.bundle)
            self.bundle.setdefault('errors',[]).extend(errors)
            self.bundle['cache']={'used':True,'reason':'Previous refresh did not finish successfully'}
            if str(self.bundle.get('guidance',{}).get('status','')).startswith('reviewed'):
                self.bundle['guidance']['status']='reviewed for saved patch; live verification failed'
    def status_snapshot(self):
        with self.lock:
            return dict(self.status,tool_version=VERSION,instance_id=self.instance_id,freshness=freshness_state(self.bundle,self.last_attempt_at,self.status['busy'],self.no_fetch,retry_blocked=self.retry_blocked))
    def save_planner(self,value):
        # Multiple app windows may submit changes. Keep the disk replacement and
        # in-memory snapshot in one critical section; failure preserves both.
        with self.lock:
            atomic_write(DATA_DIR/'planner_state.json',json.dumps(value))
            self.saved=copy.deepcopy(value)
    def ensure_fresh(self):
        state=self.status_snapshot()['freshness']
        if not state['due']:return {'started':False,'freshness':state}
        started=self.refresh()
        return {'started':started,'freshness':self.status_snapshot()['freshness']}
    def wake(self):
        # Browser reloads and duplicate launches share one recent successful pull.
        # Ordinary opens also honor source-failure backoff; explicit Refresh stays separate.
        with self.lock:
            state=freshness_state(self.bundle,self.last_attempt_at,self.status['busy'],self.no_fetch,retry_blocked=self.retry_blocked)
            completed_age=timestamp_age(self.last_completed_at)
        if state['state'] in ('disabled','refreshing','retry_wait'):
            return {'started':False,'freshness':state,'reason':'Reused running instance; automatic refresh policy applies'}
        if state['state']=='fresh' and completed_age is not None and completed_age<60:
            return {'started':False,'freshness':state,'reason':'Reused live collection completed within the last minute'}
        started=self.refresh()
        return {'started':started,'freshness':self.status_snapshot()['freshness']}
    def update(self,message):
        with self.lock: self.status['message']=message
        log(message)
    def refresh_failed(self,exc,started,bracket):
        # Even a full disk must leave visible diagnostics and release the worker.
        errors=[{'source':'Refresh','severity':'error','detail':str(exc)}]
        try:write_refresh_checkpoint(bracket,started,'failed',errors)
        except (OSError,ValueError) as disk:
            errors.append({'source':'Refresh recovery','severity':'error','detail':'Could not save retry state: '+str(disk)})
        try:atomic_write(DATA_DIR/'last_failed_attempt.json',json.dumps({'at':iso(now_utc()),'bracket':bracket,'error':str(exc)},indent=2))
        except (OSError,ValueError) as disk:
            errors.append({'source':'Refresh diagnostics','severity':'error','detail':'Could not save failure details: '+str(disk)})
        with self.lock:
            self.last_attempt_at=iso(now_utc())
            self.retry_blocked=any(re.search(r'403|429|blocked|rate.limit',e['detail'],re.I) for e in errors)
            if self.bundle:
                self.bundle=copy.deepcopy(self.bundle)
                self.bundle['cache']={'used':True,'reason':'Latest live refresh failed'}
                self.bundle['errors']=[e for e in self.bundle.get('errors',[]) if e.get('source') not in ('Refresh','Refresh recovery','Refresh diagnostics')]+errors
                if str(self.bundle.get('guidance',{}).get('status','')).startswith('reviewed'):
                    self.bundle['guidance']['status']='reviewed for saved patch; live verification failed'
            self.revision+=1
            self.status.update({'busy':False,'revision':self.revision,'errors':errors,'message':'Refresh failed: '+str(exc)+'. Showing dated data; live verification did not finish.'})
        log('REFRESH FAILED: '+str(exc))
    def refresh(self,bracket=None,force_history=False):
        if not self.refresh_lock.acquire(blocking=False): return False
        started=iso(now_utc());next_settings=dict(self.settings)
        if bracket:next_settings['bracket']=bracket
        try:
            if next_settings['bracket'] not in BRACKETS:raise ValueError('Unsupported bracket')
            write_refresh_checkpoint(next_settings['bracket'],started,'running')
            if bracket and bracket!=self.settings['bracket']:
                atomic_write(SETTINGS_FILE,json.dumps(next_settings,indent=2))
            with self.lock:
                self.settings=next_settings;self.last_attempt_at=started;self.retry_blocked=False
                self.status.update({'busy':True,'message':'Starting live refresh…','errors':[],'bracket':self.settings['bracket']})
        except Exception as exc:
            self.refresh_failed(exc,started,next_settings['bracket']);self.refresh_lock.release();return False
        def work():
            try:
                b=collect_bundle(dict(self.settings,force_history_refresh=force_history),self.update)
                # Partial results are visible as a separate attempt; never overwrite last success.
                complete, reason=bundle_is_complete(b)
                b['refresh_result']='complete' if complete else 'partial: '+reason
                b['cache']={'used':False}
                if complete:
                    save_bundle(b,bundle_path(b['patch'],b['bracket']['segment']))
                    save_bundle(b,DATA_DIR/('last_successful_'+b['bracket']['segment']+'.json'),False)
                else:
                    save_bundle(b,DATA_DIR/('last_attempt_'+b['bracket']['segment']+'.json'),False)
                    if bundle_has_current_primary(b):save_bundle(b,DATA_DIR/('last_primary_'+b['bracket']['segment']+'.json'))
                display=b
                # Preserve the last complete, explicitly dated review when the
                # official source disconnects. The failed attempt stays separate.
                if not complete and b.get('official',{}).get('status')!='verified':
                    previous=read_cached(self.settings['bracket'])
                    if previous and previous.get('tool_version')==VERSION and (bundle_is_complete(previous)[0] or bundle_has_current_primary(previous)):
                        display=previous
                        display['cache']={'used':True,'reason':'Official verification failed; showing the last successful bundle.'}
                        display['session_notice']='Official verification failed. Showing saved data from '+display.get('generated_at','an unknown time')+'. See the failed source below.'
                        if str(display.get('guidance',{}).get('status','')).startswith('reviewed'):
                            display['guidance']['status']='reviewed for saved patch; live verification failed'
                        display.setdefault('errors',[]).extend(copy.deepcopy(b.get('errors',[])))
                        display['latest_attempt']={'generated_at':b['generated_at'],'result':b['refresh_result']}
                render(display)
                checkpoint=write_refresh_checkpoint(b['bracket']['segment'],started,'complete' if complete else 'partial',b.get('errors',[]))
                with self.lock:
                    self.bundle=display; self.revision+=1
                    if complete:self.last_completed_at=iso(now_utc())
                    self.last_attempt_at=checkpoint['finished_at']
                    self.retry_blocked=any(re.search(r'403|429|blocked|rate.limit',e['detail'],re.I) for e in checkpoint['errors'])
                    self.status.update({'revision':self.revision,'errors':b.get('errors',[]), 'last_refresh':b['generated_at'],
                        'message':('Live refresh complete' if complete else 'Official verification failed — showing dated saved data' if display is not b else 'Refresh has missing or unverified data — see source alerts')+' · %.1fs'%b['timings']['cold_refresh_secs']})
            except Exception as e:
                self.refresh_failed(e,started,self.settings['bracket'])
            finally:
                with self.lock: self.status['busy']=False
                self.refresh_lock.release()
        try:threading.Thread(target=work,daemon=True).start()
        except Exception as exc:
            self.refresh_failed(exc,started,self.settings['bracket']);self.refresh_lock.release();return False
        return True


APP_ID='predecessor-meta-2'


def make_handler(app):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,fmt,*args): pass
        def valid_host(self): return self.headers.get('Host') == '127.0.0.1:%d'%self.server.server_port
        def send(self,code,value,kind='application/json; charset=utf-8',extra=None):
            body=(json.dumps(value,ensure_ascii=False) if kind.startswith('application/json') else value).encode('utf-8')
            self.send_response(code); self.send_header('Content-Type',kind); self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            for key,val in (extra or {}).items(): self.send_header(key,val)
            self.end_headers()
            try: self.wfile.write(body)
            except (BrokenPipeError,ConnectionResetError): pass
        def do_GET(self):
            if not self.valid_host(): return self.send(403,{'error':'Invalid local host'})
            path=urllib.parse.urlsplit(self.path).path
            if path=='/':
                app.last_ping=time.monotonic()
                return self.send(200,render_html(app.bundle,{'mode':'local','token':app.token,'revision':app.revision,'saved':app.saved,'tool_version':VERSION,'instance_id':app.instance_id}),'text/html; charset=utf-8')
            if path=='/api/identity': return self.send(200,{'app':APP_ID,'root':hashlib.sha256(str(TOOL_DIR).encode()).hexdigest()})
            if path=='/api/status':
                app.last_ping=time.monotonic()
                return self.send(200,app.status_snapshot())
            if path=='/api/bundle': return self.send(200,app.bundle)
            if path=='/api/comparison':
                requested=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('bracket',[''])[0]
                if requested not in BRACKETS: return self.send(400,{'error':'Choose a supported bracket'})
                candidate=read_cached(requested)
                return self.send(200,{'bracket':requested,'bundle':{'generated_at':candidate['generated_at'],'patch':candidate['patch'],'tier_list':candidate['tier_list']} if candidate else None})
            if path=='/export':
                if not app.bundle: return self.send(409,{'error':'No bundle yet'})
                return self.send(200,render_html(app.bundle),'text/html; charset=utf-8',{'Content-Disposition':'attachment; filename="Predecessor Meta.html"'})
            return self.send(404,{'error':'Not found'})
        def do_POST(self):
            origin='http://127.0.0.1:%d'%self.server.server_port
            if not self.valid_host() or self.headers.get('Origin')!=origin or not secrets.compare_digest(self.headers.get('X-Session-Token',''),app.token):
                return self.send(403,{'error':'Same-origin session authorization required'})
            if self.headers.get('Content-Type','').split(';')[0]!='application/json': return self.send(415,{'error':'JSON required'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if length<0 or length>1500000: raise ValueError('Request too large')
                value=json.loads(self.rfile.read(length).decode('utf-8'))
                if not isinstance(value,dict): raise ValueError('JSON object required')
                path=urllib.parse.urlsplit(self.path).path
                if path=='/api/ensure-fresh':
                    result=app.ensure_fresh();return self.send(202 if result['started'] else 200,result)
                if path=='/api/wake':
                    if value.get('bracket',app.settings['bracket'])!=app.settings['bracket']:raise ValueError('Use the rank-bracket setting to change cohorts')
                    result=app.wake();return self.send(202 if result['started'] else 200,result)
                if path in ('/api/refresh','/api/settings'):
                    bracket=value.get('bracket',app.settings['bracket'])
                    if bracket not in BRACKETS: raise ValueError('Unsupported bracket')
                    started=app.refresh(bracket,force_history=path=='/api/refresh')
                    status=app.status_snapshot()
                    return self.send(202 if started else 409 if status['busy'] else 503,{'message':'Refresh requested' if started else 'Refresh already running'} if started or status['busy'] else {'error':status['message']})
                if path=='/api/state':
                    # Opaque UI state, never executed or treated as trusted data.
                    if len(json.dumps(value))>50000: raise ValueError('Planner state too large')
                    try:app.save_planner(value)
                    except OSError as exc:return self.send(500,{'error':'Planner could not be saved to disk: '+str(exc)})
                    return self.send(200,{'saved':True})
                if path=='/api/import-guidance':
                    validate_guidance_packet(value,app.bundle)
                    if app.status['busy']: return self.send(409,{'error':'Wait for the current refresh before importing a reviewed update'})
                    atomic_write(TOOL_DIR/'reviewed_guidance.json',json.dumps(value,ensure_ascii=False,indent=2))
                    app.refresh(); return self.send(202,{'message':'Reviewed update imported; refreshing sources'})
                if path=='/api/quit':
                    self.send(200,{'message':'App stopped. This tab can be closed.'})
                    threading.Thread(target=self.server.shutdown,daemon=True).start(); return
                self.send(404,{'error':'Not found'})
            except (ValueError,KeyError,TypeError) as e: self.send(400,{'error':str(e)})
    return Handler


def validate_guidance_packet(packet,bundle):
    if not isinstance(packet,dict): raise ValueError('Reviewed guidance must be an object')
    if not isinstance(packet.get('guidance'),dict) or not re.fullmatch(r'\d+\.\d+(?:\.\d+)?',str(packet.get('patch',''))): raise ValueError('Invalid reviewed guidance packet')
    if not packet.get('reviewed_at') or not isinstance(packet.get('article_fingerprints'),dict): raise ValueError('Review date and official article fingerprints are required')
    strategy=packet['guidance'].get('strategic_review')
    if strategy is not None:
        if not isinstance(strategy,dict) or set(strategy)!={'patch','reviewed_at','method','heroes','counter_picks','build_adaptations'} or strategy['patch']!=packet['patch'] or any(not isinstance(strategy[k],str) or not strategy[k].strip() for k in ('reviewed_at','method')):raise ValueError('Invalid strategic review')
        plans={(r['slug'],r['role']):r for r in packet['guidance'].get('builds',[])}
        def ability_texts(slug,texts):
            return isinstance(texts,dict) and bool(texts) and all(k in ('LMB','RMB','Q','E','R','Passive') and isinstance(t,str) and t.strip() for k,t in texts.items()) and (not bundle or slug in bundle.get('heroes',{}))
        if not isinstance(strategy['heroes'],dict) or set(strategy['heroes'])!={s for s,r in plans}:raise ValueError('Strategic review must cover every planned hero')
        for slug,r in strategy['heroes'].items():
            if not isinstance(r,dict) or set(r)!={'pick_when','counterplay','source_abilities','source','source_fetched_at'} or not ability_texts(slug,r['source_abilities']) or any(not isinstance(r[k],str) or not r[k].strip() for k in ('pick_when','counterplay','source','source_fetched_at')) or not r['source'].startswith('https://pred.gg/heroes/'+slug+'/hero'):raise ValueError('Counterplay needs exact named ability evidence and dates')
        seen=set()
        if not isinstance(strategy['counter_picks'],list):raise ValueError('Counter picks must be a list')
        for r in strategy['counter_picks']:
            if not isinstance(r,dict) or set(r)!={'target','slug','role','reason','limit','source_abilities'}:raise ValueError('Counter picks allow qualitative judgments only')
            identity=(r['target'],r['slug'],r['role'])
            if identity in seen or r['target']==r['slug'] or r['target'] not in strategy['heroes'] or (r['slug'],r['role']) not in plans or any(not isinstance(r[k],str) or not r[k].strip() for k in ('reason','limit')) or not isinstance(r['source_abilities'],dict) or set(r['source_abilities'])!={r['slug'],r['target']} or any(not ability_texts(s,ts) for s,ts in r['source_abilities'].items()):raise ValueError('Counter pick requires two real heroes, a valid role and supporting texts')
            seen.add(identity)
        if not isinstance(strategy['build_adaptations'],list):raise ValueError('Build adaptations must be a list')
        for r in strategy['build_adaptations']:
            if not isinstance(r,dict) or set(r)!={'slug','role','when','replace','item','reason','item_key','item_effects'} or any(not isinstance(r[k],str) or not r[k].strip() for k in ('slug','role','when','replace','item','reason','item_key')):raise ValueError('Build adaptation needs a stated tradeoff')
            plan=plans.get((r['slug'],r['role']))
            if not plan or r['replace'] not in plan['core']+plan['finish'] or r['replace']==r['item'] or not isinstance(r['item_effects'],list) or not r['item_effects']:raise ValueError('Build adaptation must replace a planned purchase with an evidenced item')
            # Missing metadata is a source-availability issue, not an invalid authored packet.
            # The renderer withholds the adaptation until the real item and exact effects return.
            if bundle and bundle.get('items',{}).get(r['item_key'],{}).get('completed_item') is False:raise ValueError('Build adaptation must use a completed item')
        for c in packet['guidance'].get('compositions',[]):
            picks=c.get('picks',[])
            if len(picks) not in (2,3,5) or len({r['slug'] for r in picks})!=len(picks) or len({r['role'] for r in picks})!=len(picks) or any((r['slug'],r['role']) not in plans for r in picks) or any(not isinstance(c.get(k),str) or not c[k].strip() for k in ('name','plan','weakness')):raise ValueError('Reviewed compositions require unique eligible heroes and roles plus a plan and weakness')
    sequence=packet['guidance'].get('sequence_review')
    if sequence is not None:
        if not isinstance(sequence,dict) or set(sequence)!={'patch','reviewed_at','abilities','method'} or sequence['patch']!=packet['patch'] or not isinstance(sequence['abilities'],list) or not sequence['abilities'] or not sequence['reviewed_at'] or not sequence['method']:raise ValueError('Invalid sequence review')
        seen=set()
        for r in sequence['abilities']:
            if not isinstance(r,dict) or set(r)!={'slug','key','setup','readiness','control_window','followup','note','ability_text','source','source_fetched_at'}:raise ValueError('Sequence reviews allow named ability conditions only')
            if any(not isinstance(r[k],str) or not r[k] for k in r):raise ValueError('Sequence reviews require exact text and dated source evidence')
            identity=(r['slug'],r['key'])
            if identity in seen or r['key'] not in ('LMB','RMB','Q','E','R','Passive') or bundle and not any(a.get('key')==r['key'] for a in bundle.get('heroes',{}).get(r['slug'],{}).get('abilities',[])):raise ValueError('Unknown or duplicate sequence-review ability')
            if r['setup'] not in ('hold','displace','boundary','none') or r['readiness'] not in ('direct','prepared','delayed','stacked','conditional') or r['control_window'] not in ('brief','ordinary','boundary','unspecified') or r['followup'] not in ('impact','delayed','sustained','none') or not r['source'].startswith('https://pred.gg/heroes/'):raise ValueError('Unsupported sequence-review condition or source')
            seen.add(identity)
    pred_preconditions=packet.get('pred_source_preconditions',[])
    if not isinstance(pred_preconditions,list):raise ValueError('Pred.gg alternate preconditions must be a list')
    definitions={r['id']:r for r in packet.get('corrections',[])+packet.get('mechanics_resolutions',[])}
    seen_preconditions=set()
    for r in pred_preconditions:
        if not isinstance(r,dict) or set(r)!={'id','patch','before','source','source_fetched_at','reviewed_at'}:raise ValueError('Invalid Pred.gg alternate precondition')
        if r['id'] in seen_preconditions or r['id'] not in definitions or definitions[r['id']]['path'][0] not in ('items','perks'):raise ValueError('Pred.gg alternate precondition must reference one reviewed catalog field')
        if r['patch']!=packet['patch'] or not isinstance(r['before'],str) or not r['before'] or not isinstance(r['source'],str) or not r['source'].startswith('https://pred.gg/') or not r['source_fetched_at'] or not r['reviewed_at']:raise ValueError('Pred.gg alternate precondition requires dated exact source evidence')
        seen_preconditions.add(r['id'])
    capability_reviews=packet['guidance'].get('capability_reviews',[])
    if not isinstance(capability_reviews,list):raise ValueError('Capability reviews must be a list')
    seen_capability_reviews=set()
    for r in capability_reviews:
        if not isinstance(r,dict) or set(r)-{'context_only'}!={'slug','augment','ability_key','ability_text','augment_description','patch','remove','add','reason'} or 'context_only' in r and r['context_only'] is not True:raise ValueError('Capability review has unsupported fields')
        if r['patch']!=packet['patch'] or any(not isinstance(r[k],str) or not r[k] for k in ('slug','augment','ability_key','ability_text','augment_description','reason')):raise ValueError('Capability review requires patch and exact evidence')
        if r['ability_key'] not in ('LMB','RMB','Q','E','R','Passive') or bundle and (r['slug'] not in bundle.get('heroes',{}) or not any(a.get('key')==r['ability_key'] for a in bundle['heroes'][r['slug']].get('abilities',[]))):raise ValueError('Unknown capability-review hero or ability')
        for field in ('remove','add'):
            if not isinstance(r[field],list) or any(not isinstance(t,str) for t in r[field]) or len(set(r[field]))!=len(r[field]) or any(t not in ('hard_cc','peel','containment','initiation','soft_cc','protection','amplifier','global','healing','ally_healing','self_shield') for t in r[field]):raise ValueError('Unsupported capability-review tag')
        if set(r['remove'])&set(r['add']) or bool(r['remove']+r['add'])==bool(r.get('context_only')):raise ValueError('Capability review needs distinct changes or explicit context-only review')
        identity=(r['slug'],r['augment'],r['ability_key'])
        if identity in seen_capability_reviews:raise ValueError('Duplicate capability review')
        seen_capability_reviews.add(identity)
    augment_review=packet['guidance'].get('augment_review')
    if augment_review is not None:
        if not isinstance(augment_review,dict) or set(augment_review)!={'patch','reviewed_at','selected_augments','method'} or augment_review['patch']!=packet['patch'] or any(not isinstance(augment_review[k],str) or not augment_review[k] for k in ('reviewed_at','method')) or type(augment_review['selected_augments']) is not int or augment_review['selected_augments']!=len(capability_reviews):raise ValueError('Invalid augment-review coverage')
        expected={(p.get('slug'),p.get('augment')) for p in packet['guidance'].get('builds',[]) if isinstance(p,dict)}
        if expected!={(r['slug'],r['augment']) for r in capability_reviews}:raise ValueError('Augment reviews must cover every selected default')
    damage=packet['guidance'].get('damage_review')
    if damage is not None:
        if not isinstance(damage,dict) or set(damage)!={'patch','reviewed_at','method','profiles'} or damage['patch']!=packet['patch'] or not isinstance(damage['reviewed_at'],str) or not damage['reviewed_at'] or not isinstance(damage['method'],str) or not damage['method'] or not isinstance(damage['profiles'],dict):raise ValueError('Damage review needs a patch, date, method and profiles')
        for slug,r in damage['profiles'].items():
            if bundle and slug not in bundle.get('heroes',{}):raise ValueError('Unknown damage-review hero')
            if not isinstance(r,dict) or set(r)!={'primary','ability_keys','reason','source_abilities','source'}:raise ValueError('Damage review cannot contain rates or unsupported fields')
            if not isinstance(r['primary'],list) or not r['primary'] or len(set(r['primary']))!=len(r['primary']) or any(t not in ('physical','magical') for t in r['primary']):raise ValueError('Invalid primary damage pattern')
            if not isinstance(r['ability_keys'],list) or not r['ability_keys'] or any(k not in ('LMB','RMB','Q','E','R','Passive') for k in r['ability_keys']):raise ValueError('Damage review requires supporting ability keys')
            if not isinstance(r['source_abilities'],dict) or set(r['source_abilities'])!=set(r['ability_keys']) or any(not isinstance(t,str) or not t for t in r['source_abilities'].values()):raise ValueError('Damage review requires exact ability-text preconditions')
            if not isinstance(r['reason'],str) or not r['reason'] or not isinstance(r['source'],str) or not r['source'].startswith('https://pred.gg/heroes/'+slug+'/hero'):raise ValueError('Damage review requires reasoning and the exact hero source')
    meta=packet['guidance'].get('meta_review')
    if meta is not None:
        if not isinstance(meta,dict) or meta.get('patch')!=packet['patch'] or meta.get('bracket') not in ('bronze','silver','gold','platinum','diamond','paragon') or not meta.get('bracket_label') or meta.get('mode')!='RANKED':raise ValueError('Meta review requires an exact patch and ranked bracket')
        if not meta.get('reviewed_at') or not meta.get('author') or not meta.get('method') or set(meta.get('tier_definitions',{}))!={'S','A','B','C'}:raise ValueError('Meta review requires its author, date, method and grade definitions')
        entries=meta.get('entries');seen=set();plans={(x.get('slug'),x.get('role')) for x in packet['guidance'].get('builds',[])}
        if not isinstance(entries,list) or not entries:raise ValueError('Meta review has no entries')
        for row in entries:
            identity=(row.get('slug'),row.get('role'))
            if identity in seen or identity not in plans or row.get('tier') not in ('S','A','B','C'):raise ValueError('Unknown or duplicate meta review hero/role/grade')
            seen.add(identity)
            if any(not isinstance(row.get(k),str) or not row[k].strip() for k in ('why','watch')) or not isinstance(row.get('ability_keys'),list) or not row['ability_keys']:raise ValueError('Meta review requires reasoning, conditions and named ability evidence')
            if bundle and (identity[0] not in bundle.get('heroes',{}) or any(k not in [a['key'] for a in bundle['heroes'][identity[0]]['abilities']] for k in row['ability_keys'])):raise ValueError('Meta review ability evidence does not match hero')
            e=row.get('evidence',{});n=_games(e.get('matches'));w=_games(e.get('wonGames'));rate=e.get('winRate')
            if n<100 or w>n or type(rate) not in (int,float) or not math.isfinite(rate) or abs(rate-100*w/n)>0.05:raise ValueError('Meta review needs a valid observed reference sample of at least 100 games')
            if not str(e.get('url','')).startswith('https://pred.gg/') or not e.get('fetched_at'):raise ValueError('Meta review reference sample requires its source and fetch date')
            if set(row)-{'slug','role','tier','why','watch','ability_keys','evidence'}:raise ValueError('Unknown meta review entry fields')
    official_prefix=OFFICIAL_ORIGIN+'/en-US/news/patch-notes/'
    def official_url(value):
        if not isinstance(value,str) or not value.startswith(official_prefix): return False
        parsed=urllib.parse.urlsplit(value)
        return not parsed.query and not parsed.fragment and not parsed.username and len(parsed.path)>len('/en-US/news/patch-notes/')
    history=packet.get('definition_history_sources',[])
    if not isinstance(history,list): raise ValueError('Definition history must be a list')
    known_urls=set();history_versions=set()
    for source in history:
        if not isinstance(source,dict) or set(source)!={'version','url','fingerprint'} or not official_url(source.get('url')):
            raise ValueError('Definition history requires an official patch URL, version and fingerprint')
        if not re.fullmatch(r'\d+\.\d+(?:\.\d+)?',str(source['version'])) or not re.fullmatch(r'[a-f0-9]{64}',str(source['fingerprint'])):
            raise ValueError('Invalid definition history version or fingerprint')
        if source['url'] in known_urls or source['version'] in history_versions: raise ValueError('Duplicate definition history source')
        known_urls.add(source['url']);history_versions.add(source['version'])
    definitions=packet.get('reviewed_definitions',[])
    if not isinstance(definitions,list): raise ValueError('Reviewed definitions must be a list')
    definition_keys=set()
    for definition in definitions:
        required={'key','name','eternal','slot','description','source_precondition','sources'}
        if not isinstance(definition,dict) or not required.issubset(definition) or set(definition)-required-{'review_note','source_alternatives','uncertainties'}:
            raise ValueError('Reviewed definitions allow descriptive fields only')
        if any(not isinstance(definition[k],str) or not definition[k].strip() for k in ('key','name','eternal','description')):
            raise ValueError('A reviewed definition needs a name, key, Eternal and description')
        if definition['key'] in definition_keys or definition['slot'] not in ('BLESSING_MINOR_1','BLESSING_MINOR_2'):
            raise ValueError('Duplicate reviewed definition or invalid blessing slot')
        definition_keys.add(definition['key'])
        if 'review_note' in definition and not isinstance(definition['review_note'],str): raise ValueError('Review note must be text')
        if 'uncertainties' in definition:
            uncertainties=definition['uncertainties']
            if not isinstance(uncertainties,list) or not uncertainties or any(
                not isinstance(u,dict) or set(u)!={'field','detail'} or
                any(not isinstance(u[k],str) or not u[k].strip() for k in ('field','detail')) for u in uncertainties):
                raise ValueError('Unresolved description fields require nonempty field and detail text')
        pre=definition['source_precondition']
        if not isinstance(pre,dict) or pre.get('state') not in ('missing','exact'):
            raise ValueError('Reviewed definition requires an explicit source precondition')
        if pre['state']=='missing' and set(pre)!={'state'}: raise ValueError('Missing-source precondition has unexpected fields')
        if pre['state']=='exact' and (set(pre)!={'state','slot','description'} or any(not isinstance(pre[k],str) or not pre[k] for k in ('slot','description'))):
            raise ValueError('Exact-source precondition requires a slot and description')
        variants=definition.get('source_alternatives',[])
        if not isinstance(variants,list) or any(not isinstance(v,dict) or set(v)!={'slot','description'} or any(not isinstance(v[k],str) or not v[k] for k in ('slot','description')) for v in variants):
            raise ValueError('Alternative source preconditions require exact slots and descriptions')
        sources=definition['sources']
        if not isinstance(sources,list) or not sources: raise ValueError('Reviewed definition requires official sources')
        for source in sources:
            if not isinstance(source,dict) or set(source)!={'patch','url'} or not official_url(source.get('url')):
                raise ValueError('Reviewed definition requires official patch sources')
            if source['patch'] not in packet['article_fingerprints'] and source['patch'] not in history_versions:
                raise ValueError('Reviewed definition source must have a checked article fingerprint')
            if source['patch'] in history_versions and not any(s['version']==source['patch'] and s['url']==source['url'] for s in history):
                raise ValueError('Reviewed definition history URL does not match its patch')
    for r in packet.get('corrections',[]):
        path=r.get('path',[])
        allowed = (len(path)==5 and path[0]=='heroes' and path[2]=='abilities' and isinstance(path[3],int) and path[4] in ('menu_description','game_description','cooldown','cost')) or (len(path)==3 and path[0]=='perks' and path[2]=='description') or (path and path[0]=='items' and ((len(path)==3 and path[2]=='total_price') or (len(path)==4 and path[2]=='stats') or (len(path)==5 and path[2]=='effects' and isinstance(path[3],int) and path[4] in ('text','condition','cooldown'))))
        if not allowed or any(k in path for k in ('winRate','pickRate','banRate','playedGames','wonGames','hero_wide','roles','_teammates_raw')):
            raise ValueError('Guidance corrections may change descriptions/mechanics only; statistical fields are protected')
        if not str(r.get('source','')).startswith(OFFICIAL_ORIGIN+'/en-US/news/patch-notes/'): raise ValueError('Correction requires an official patch source')
        for key in ('id','patch','before','after'):
            if key not in r: raise ValueError('Correction missing '+key)
        for source in r.get('supporting_sources', []):
            if not isinstance(source,dict) or not str(source.get('url','')).startswith(OFFICIAL_ORIGIN+'/en-US/news/patch-notes/'):
                raise ValueError('Supporting corrections require an official patch source')
    for review in packet.get('description_reviews', []):
        path=review.get('path', [])
        if not (len(path)==5 and path[0]=='heroes' and path[2]=='abilities' and type(path[3]) is int and path[3]>=0 and path[4] in ('menu_description','game_description')):
            raise ValueError('Description reviews must identify an ability description')
        if not review.get('reason') or not str(review.get('source','')).startswith(OFFICIAL_ORIGIN+'/en-US/news/patch-notes/'):
            raise ValueError('Description review requires a reason and official source')
        if not isinstance(review.get('contains'),list) or not review['contains'] or any(not isinstance(s,str) or not s for s in review['contains']):
            raise ValueError('Description review requires exact nonempty source-value checks')
    for slug,roles in packet.get('planning_roles',{}).items():
        if bundle and slug not in bundle.get('heroes',{}): raise ValueError('Unknown planning hero')
        if not isinstance(roles,list) or any(r not in ROLES for r in roles): raise ValueError('Unknown planning role')
    build_keys=set()
    resolutions=packet.get('mechanics_resolutions',[])
    if not isinstance(resolutions,list):raise ValueError('Mechanics resolutions must be a list')
    known_dependencies={x['url']:x['fingerprint'] for x in history}
    # Main articles use their verified version URL, and history may use different casing.
    for version,fingerprint in packet['article_fingerprints'].items():
        for suffix in ('Patch_Notes_','Patch_notes_'):
            known_dependencies[official_prefix+suffix+version]=fingerprint
    ids=set()
    for rule in resolutions:
        path=rule.get('path',[])
        allowed=(len(path)==5 and path[0]=='heroes' and path[2]=='abilities' and type(path[3]) is int and path[3]>=0 and path[4]=='menu_description') or (len(path)==4 and path[0]=='items' and path[2:] == ['stats','Tenacity'])
        if not allowed:raise ValueError('Mechanics resolutions cannot change statistical fields')
        if rule.get('id') in ids or not rule.get('id') or rule.get('patch')!=packet['patch']:raise ValueError('Invalid mechanics review identity or patch')
        ids.add(rule['id'])
        if not isinstance(rule.get('after'),str) or not rule['after'] or not isinstance(rule.get('accepted_before'),list) or not rule['accepted_before'] or any(not isinstance(x,str) for x in rule['accepted_before']):raise ValueError('Mechanics review needs exact string preconditions')
        if not rule.get('official_dependencies') or any(known_dependencies.get(x.get('url'))!=x.get('fingerprint') for x in rule['official_dependencies']):raise ValueError('Mechanics review needs verified official dependencies')
        if not rule.get('sources') or any(not re.match(r'^https://(?:www\.predecessorgame\.com|pred\.gg)/',x.get('url','')) for x in rule['sources']):raise ValueError('Unsupported mechanics source')
        if path[0]=='items' and (rule.get('unit')!='rating' or not re.fullmatch(r'\d+(?:\.\d+)?',rule['after'])):raise ValueError('Tenacity must use an explicit nonnegative rating')
    for entry in packet.get('reviewed_catalog',[]):
        if entry.get('patch')!=packet['patch'] or not ((entry.get('slot')=='HERO_SPECIFIC_1' and isinstance(entry.get('hero'),str) and entry['hero'] and (bundle is None or entry['hero'] in bundle.get('heroes',{}))) or (entry.get('slot')=='ETERNAL_1' and entry.get('hero') is None)) or not entry.get('name') or not entry.get('description') or not re.match(r'^https://pred\.gg/(?:heroes/|eternals$)',entry.get('source','')):raise ValueError('Invalid reviewed catalog definition')
    for build in packet.get('guidance',{}).get('builds',[]):
        if not isinstance(build,dict):raise ValueError('Reviewed build must be an object')
        key=(build.get('slug'),build.get('role'))
        if key in build_keys or key[1] not in ROLES or bundle and key[0] not in bundle.get('heroes',{}):raise ValueError('Unknown or duplicate reviewed build role')
        build_keys.add(key)
        if build.get('patch')!=packet.get('patch'):raise ValueError('Reviewed build patch differs from guidance')
        for field in ('core','finish','blessings','skill_priority'):
            if not isinstance(build.get(field),list) or any(not isinstance(x,str) or not x.strip() for x in build[field]):raise ValueError('Reviewed build has invalid '+field)
        if len(build['core'])!=3 or len(build['finish'])!=3 or len(set(build['core']+build['finish']))!=6 or len(build['blessings'])!=2:raise ValueError('Reviewed build requires six unique items and two blessings')
        if 'item_notes' in build:
            notes=build['item_notes'];sequence=build['core']+build['finish']
            if not isinstance(notes,list) or len(notes)!=6:raise ValueError('Item reasoning needs six entries in purchase order')
            for name,note in zip(sequence,notes):
                if not isinstance(note,dict) or note.get('item')!=name or not isinstance(note.get('reason'),str) or not note['reason'].strip():raise ValueError('Item reasoning must match its purchase and include a reason')
                if not isinstance(note.get('ability_keys'),list) or not note['ability_keys'] or any(k not in ('LMB','RMB','Q','E','R','Passive') for k in note['ability_keys']):raise ValueError('Item reasoning needs valid supporting ability keys')
        trees=packet.get('loadout_catalog',{}).get('eternals')
        if trees is not None:
            tree=trees.get(build.get('eternal'))
            if not tree or any(n not in tree.get('BLESSING_MINOR_'+str(i+1),[]) for i,n in enumerate(build['blessings'])):raise ValueError('Blessing does not belong to the selected Eternal and slot')
        for field in ('title','why','caution','author','reviewed_at','crest','augment','eternal'):
            if not isinstance(build.get(field),str) or not build[field].strip():raise ValueError('Reviewed build missing '+field)
        if build.get('damage') not in ('physical','magical','mixed','none') or build.get('style') not in ('tank','bruiser','assassin','attack','mage','enchanter','burst_carry','ability_carry'):raise ValueError('Invalid reviewed playstyle')
        if not build.get('sources') or any(not isinstance(x,dict) or not re.match(r'^https://(?:www\.predecessorgame\.com|omeda\.city|pred\.gg)/',x.get('url','')) for x in build['sources']):raise ValueError('Reviewed builds require named supporting sources')


def serve(settings,no_open=False,port=4188,no_fetch=False):
    import webbrowser
    import msvcrt
    DATA_DIR.mkdir(exist_ok=True)
    identity=hashlib.sha256(str(TOOL_DIR).encode()).hexdigest()
    lockfile=(DATA_DIR/'app.lock').open('a+b'); lockfile.seek(0); lockfile.write(b'0');lockfile.flush();lockfile.seek(0)
    try: msvcrt.locking(lockfile.fileno(),msvcrt.LK_NBLCK,1)
    except OSError:
        # A launch may arrive while the first instance is still binding. Bounded wait, no duplicate process.
        for _ in range(20):
            try:
                instance=load_bundle(DATA_DIR/'instance.json'); url=instance['url']
                if not re.fullmatch(r'http://127\.0\.0\.1:\d+',url): raise ValueError('Invalid instance address')
                with urllib.request.urlopen(url+'/api/identity',timeout=1) as r: found=json.load(r)
                if found!={'app':APP_ID,'root':identity}: raise ValueError('Port belongs to another app')
                req=urllib.request.Request(url+('/api/refresh' if settings.get('force_history_refresh') else '/api/wake'),data=b'{}',headers={'Content-Type':'application/json','Origin':url,'X-Session-Token':instance['token']})
                try: urllib.request.urlopen(req,timeout=2).close()
                except urllib.error.HTTPError as e:
                    if e.code!=409: raise
                if not no_open: webbrowser.open(url)
                log('Reused running instance at '+url); return 0
            except (OSError,ValueError,KeyError): time.sleep(.15)
        raise RuntimeError('Another instance holds the app lock but did not respond. Close its terminal or wait before relaunching.')
    app=AppState(settings,no_fetch)
    try: server=ThreadingHTTPServer(('127.0.0.1',port),make_handler(app))
    except OSError: server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(app))
    server.daemon_threads=True
    url='http://127.0.0.1:%d'%server.server_port
    atomic_write(DATA_DIR/'instance.json',json.dumps({'url':url,'token':app.token,'pid':os.getpid()}))
    log('OPEN '+url)
    if not no_fetch:
        if settings.get('force_history_refresh'):app.refresh(force_history=True)
        else:app.wake()
    else: app.update('Developer mode: automatic fetch disabled; displayed data is saved, not verified this session.')
    if not no_open: webbrowser.open(url)
    def idle():
        while not getattr(server,'stopped',False):
            time.sleep(5)
            if time.monotonic()-app.last_ping>180 and not app.status['busy']: server.shutdown(); break
    threading.Thread(target=idle,daemon=True).start()
    try: server.serve_forever(poll_interval=.2)
    finally:
        server.stopped=True; server.server_close()
        try: (DATA_DIR/'instance.json').unlink()
        except FileNotFoundError: pass
        lockfile.seek(0); msvcrt.locking(lockfile.fileno(),msvcrt.LK_UNLCK,1); lockfile.close()
    return 0


def main():
    parser=argparse.ArgumentParser(description='Predecessor Meta — local planning app')
    parser.add_argument('--refresh',action='store_true',help='Force a fresh collection, including cached Pred.gg detail pages')
    parser.add_argument('--bracket',choices=BRACKETS)
    parser.add_argument('--no-open',action='store_true')
    parser.add_argument('--launch',action='store_true',help='Start the app without a persistent console window')
    parser.add_argument('--once',action='store_true',help='Fetch, write bundle and export, then exit')
    parser.add_argument('--render-only',action='store_true')
    parser.add_argument('--no-fetch',action='store_true',help='Developer offline UI verification')
    parser.add_argument('--port',type=int,default=4188)
    parser.add_argument('--data-dir',type=Path,help='Isolated test data directory')
    args=parser.parse_args()
    global DATA_DIR,SNAP_DIR,LATEST_BUNDLE,SETTINGS_FILE,OUT_HTML
    if args.data_dir:
        DATA_DIR=args.data_dir.resolve(); SNAP_DIR=DATA_DIR/'snapshots'; LATEST_BUNDLE=DATA_DIR/'latest_bundle.json'; SETTINGS_FILE=DATA_DIR/'settings.json'; OUT_HTML=DATA_DIR/'Predecessor Meta.html'
    settings=load_settings()
    if args.refresh:settings['force_history_refresh']=True
    if args.bracket: settings['bracket']=args.bracket
    if args.launch:
        import subprocess
        DATA_DIR.mkdir(parents=True,exist_ok=True)
        childargs=[a for a in sys.argv[1:] if a!='--launch']
        with (DATA_DIR/'startup.log').open('a',encoding='utf-8') as out:
            child=subprocess.Popen([sys.executable,'-X','utf8',str(Path(__file__).resolve()),*childargs],cwd=TOOL_DIR,
                stdout=out,stderr=out,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        for _ in range(60):
            if child.poll() is not None:
                if child.returncode==0:return 0
                raise RuntimeError('The app could not start. Details are in data/startup.log.')
            try:
                instance=load_bundle(DATA_DIR/'instance.json')
                with urllib.request.urlopen(instance['url']+'/api/identity',timeout=.3) as response:
                    if json.load(response).get('app')==APP_ID:return 0
            except (OSError,ValueError,KeyError): pass
            time.sleep(.1)
        raise RuntimeError('Startup did not respond within six seconds. See data/startup.log.')
    if args.render_only:
        b=read_cached(settings['bracket'])
        if not b: raise ValueError('No saved bundle available to export')
        path=render(b); log('Exported '+str(path)); return 0
    if args.once:
        b=collect_bundle(settings,log); complete,reason=bundle_is_complete(b)
        save_bundle(b,DATA_DIR/('last_successful_'+settings['bracket']+'.json') if complete else DATA_DIR/'last_attempt.json',complete)
        if not complete and bundle_has_current_primary(b):save_bundle(b,DATA_DIR/('last_primary_'+settings['bracket']+'.json'))
        render(b); log(json.dumps({'complete':complete,'reason':reason,'timings':b['timings'],'heroes':len(b['heroes']),'rows':len(b['tier_list']),'pairs':len(b['pairs'])})); return 0 if complete else 2
    return serve(settings,args.no_open,args.port,args.no_fetch)


if __name__=='__main__':
    try: sys.exit(main())
    except Exception as e:
        log('ERROR: '+str(e)); traceback.print_exc(); sys.exit(1)
