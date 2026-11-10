"""Official patch notes to source-faithful CSV. No reference CSV is used at runtime."""
import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from patch_import_io import ImportFailure, OfficialFetcher, ORIGIN, official_url, write_import

EXPECTED = {'New Hero', 'New Items', 'Gameplay Balance', 'Systems', 'Hero Balance', 'Items Balance', 'Bug Fixes'}
SYSTEM_PROSE = {'Ranked News', 'Variant VFX', 'Hero Voice Comms', 'The Void & Daily Deals Changes'}
EXCLUDED = {'Store News': 'Cosmetic store bundles, not gameplay changes',
            'Triple Battlepass XP Weekend': 'Time-limited promotion, not patch mechanics'}


class ArticleReader(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.active = None
        self.parts = []
        self.blocks = []
        self.links = []
        self.anchor_depth = 0
        self.visible = []
        self.body_started = False
        self.div_depth = 0
        self.article_depth = None
        self.article_seen = False
        self.article_closed = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'div':
            self.div_depth += 1
            if 'cms-news-rich-text' in attrs.get('class', '').split():
                self.article_depth = self.div_depth
                self.article_seen = True
        if tag in ('script', 'style'):
            self.skip += 1
        if self.skip:
            return
        if self.article_closed:
            return
        if tag == 'a':
            self.anchor_depth += 1
            if attrs.get('href'):
                self.links.append(attrs['href'])
        if tag == 'img' and not self.active:
            self.blocks.append(('image', attrs.get('src', '')))
        if tag == 'h2' and not self.anchor_depth:
            self.body_started = True
        if tag in ('h1', 'h2', 'h3', 'h4', 'p', 'blockquote', 'li', 'table') and not self.active:
            # Related-article card headings are not this article's sections.
            if tag.startswith('h') and self.anchor_depth:
                return
            self.active = tag
            self.parts = []
        if tag == 'br' and self.active:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag == 'div':
            if self.article_depth == self.div_depth:
                self.article_closed = True
            self.div_depth -= 1
        if tag in ('script', 'style'):
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if self.article_closed:
            return
        if tag == 'a':
            self.anchor_depth = max(0, self.anchor_depth - 1)
        if tag == self.active:
            text = re.sub(r'[ \t\r]+', ' ', ''.join(self.parts)).strip()
            if text:
                self.blocks.append((tag, text))
            self.active = None
            self.parts = []

    def handle_data(self, text):
        if not self.skip and not self.article_closed:
            self.visible.append(text)
            if self.active:
                self.parts.append(text)
            elif self.body_started and not self.anchor_depth and text.strip():
                self.blocks.append(('unhandled', text.strip()))


def latest_url(html):
    p = ArticleReader()
    p.feed(html)
    candidates = []
    for link in p.links:
        url = urljoin(ORIGIN, link)
        try:
            official_url(url, page=True)
        except ImportFailure:
            continue
        m = re.fullmatch(r'/news/patch-notes/PatchNotes_(\d+\.\d+(?:\.\d+)?)', urlsplit(url).path, re.I)
        if m:
            candidates.append((tuple(map(int, m[1].split('.'))), url))
    if not candidates:
        raise ImportFailure('No canonical versioned patch-notes links in listing')
    # Highest published patch version, not the order of cards or a floating timestamp.
    return max(candidates)[1]


def banner_name(url):
    m = re.search(r'/Web_Banner_(?:Items_)?(.+?)_[a-f0-9]{8,}', url, re.I)
    if not m:
        return None
    name = re.sub(r'_(?:\d+|New)$', '', m[1])
    name = name.replace('_and_', ' & ').replace('_', ' ')
    # Official asset-label spelling, shared with the existing source reader.
    return {'Grim': 'GRIM.exe', 'Storm Breaker': 'Stormbreaker'}.get(name, name)


def classification(stat, direction):
    """Only fixed, unambiguous stat/direction pairs. Everything else is Adjustment."""
    stat = stat.lower()
    positive = {'health', 'health regen', 'mana', 'attack speed', 'physical power growth',
                'physical penetration', 'physical armor', 'magical armor', 'ability haste',
                'base mana regen', 'omnivamp', 'bonus physical power scaling', 'magical power scaling',
                'shield', 'shield magical power scaling', 'damage', 'damage magical power scaling',
                'movement speed', 'slow', 'stun duration', 'minimum stun duration'}
    negative = {'cooldown', 'price', 'cost', 'time between shots', 'melee basic attack damage taken modifier'}
    if stat not in positive | negative:
        return 'Adjustment'
    improves = (direction == 'increased') == (stat in positive)
    return 'Buff' if improves else 'Nerf'


def parse_article(raw):
    try:
        html = raw.decode('utf-8-sig')
    except UnicodeError as exc:
        raise ImportFailure('Article is not UTF-8') from exc
    p = ArticleReader()
    p.feed(html)
    if p.active is not None or (p.article_seen and not p.article_closed):
        raise ImportFailure('Incomplete article HTML')
    title = next((text for tag, text in p.blocks if tag == 'h1'), '')
    version = re.search(r'\b[Vv]?(\d+\.\d+(?:\.\d+)?)\b', title)
    if not version or 'patch notes' not in title.lower():
        raise ImportFailure('Missing patch-notes title/version')
    # Publication date displayed before the body, never the current date.
    visible = ' '.join(p.visible)
    date = re.search(r'\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) \d{1,2}, 20\d\d\b', visible)
    if not date:
        raise ImportFailure('Missing displayed publication date')
    rows, uncertain, unparsed, ignored, evidence = [], [], [], [], []
    section = sub = field = target = ''
    category = None
    seen = set()
    is_new = False
    for block_no, (tag, text) in enumerate(p.blocks):
        if tag == 'h2':
            section, sub, field, target = text, '', '', ''
            is_new = text.startswith('New Hero:') or text == 'New Items'
            canonical = 'New Hero' if text.startswith('New Hero:') else text
            seen.add(canonical)
            if text.startswith('New Hero:'):
                category, target = 'Hero', text.split(':', 1)[1].strip()
            elif text in ('New Items', 'Items Balance'):
                category = 'Item'
            elif text == 'Hero Balance':
                category = 'Hero'
            elif text == 'Overclocked Mode':
                category = 'Map/Mode'
            elif text in SYSTEM_PROSE | {'Systems', 'Gameplay Balance', 'Bug Fixes'}:
                category = 'System'
            else:
                category = None
                if text in EXCLUDED:
                    ignored.append({'section': text, 'reason': EXCLUDED[text]})
                else:
                    unparsed.append({'block': block_no, 'section': text, 'reason': 'unknown section', 'text': text})
            continue
        if not section:
            continue
        if category is None:
            if section not in EXCLUDED and tag in ('p', 'blockquote'):
                unparsed.append({'block': block_no, 'section': section, 'reason': 'unknown section content', 'text': text})
            continue
        if tag == 'image':
            if section in ('Hero Balance', 'Items Balance'):
                target = banner_name(text) or ''
                field = ''
            elif section == 'New Items':
                target = ''
            continue
        if tag == 'h3':
            sub = text.rstrip(':')
            field = ''
            if section == 'Systems':
                target = sub
            continue
        if tag == 'h4':
            field = text.rstrip(':')
            if section == 'Overclocked Mode':
                target = field
            continue
        if section == 'New Items' and tag == 'p':
            m = re.search(r'we have [“\"]([^”\"]+)[”\"]', text)
            if m:
                target = m[1]
        if tag in ('unhandled', 'table'):
            unparsed.append({'block': block_no, 'section': section, 'reason': 'unhandled HTML content', 'text': text})
            continue
        if tag not in ('blockquote', 'p', 'li'):
            continue
        if tag == 'p' and section not in SYSTEM_PROSE and not (section.startswith('New Hero:') and sub in ('Abilities', 'Augments')):
            # Narrative is retained visibly as context, not guessed into structured values.
            if not text.startswith(('Until next time', 'Rei &', '©')):
                ignored.append({'section': section, 'reason': 'narrative context, not a structured change', 'text': text})
            continue
        if section in ('Hero Balance', 'Items Balance', 'New Items') and not target:
            unparsed.append({'block': block_no, 'section': section, 'reason': 'target unidentified', 'text': text})
            continue
        lines = [line.strip().removeprefix('- ').strip() for line in text.splitlines() if line.strip()]
        inherited_bugfix = False
        for line in lines:
            bugfix = section == 'Bug Fixes' or '[Bugfix]' in line or inherited_bugfix
            if '[Bugfix]' in line and line.endswith(':'):
                inherited_bugfix = True
            dest = target or sub or section
            if section == 'Overclocked Mode':
                dest = 'Overclocked: ' + (target or sub or 'Mode')
            # Anonymous eternal artwork does not authorize guessing which Eternal owns a blessing.
            if section == 'Gameplay Balance':
                dest = sub + (': ' + field if field else '')
                unparsed.append({'block': block_no, 'section': section, 'reason': 'Eternal owner not safely identified from anonymous artwork; section label retained', 'text': line})
            label = field or sub or 'Change'
            old, new, kind = 'Not stated', line, 'Adjustment'
            m = re.fullmatch(r'(.+?) (increased|decreased) from (.+?) to (.+?)\.', line)
            if m and not bugfix and not is_new:
                stat, direction, old, new = m.groups()
                label = (field + ' - ' if field and section != 'Overclocked Mode' else '') + stat
                kind = classification(stat, direction)
            elif is_new:
                old = 'None (New Hero)' if category == 'Hero' else 'None (New Item)'
                kind = 'New'
                m = re.fullmatch(r'([^:]+):\s*(.+)', line)
                if m:
                    label = (field + ' - ' if field else '') + m[1]
                    new = m[2]
            if bugfix:
                kind = 'Adjustment'
                new = line + ' (Bugfix)'
            row = dict(Category=category, Target=dest, Ability_or_Stat=label,
                       Old_Value=old, New_Value=new, Change_Type=kind, Source='Patch Notes')
            rows.append(row)
            evidence.append({'row': len(rows), 'block': block_no, 'section': section, 'source_text': line})
            if kind == 'Adjustment' and not bugfix:
                uncertain.append({'row': len(rows), 'target': dest, 'reason': 'direction or old value not mechanically established', 'source_text': line})
    missing = sorted(EXPECTED - seen)
    unparsed.extend({'section': name, 'reason': 'expected section missing'} for name in missing)
    if not rows:
        raise ImportFailure('No structured changes parsed; empty/broken page')
    return {'version': version[1], 'date': date[0], 'rows': rows, 'uncertain': uncertain,
            'unparsed': unparsed, 'ignored': ignored, 'evidence': evidence}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    source = ap.add_mutually_exclusive_group(required=True)
    source.add_argument('--url')
    source.add_argument('--latest', action='store_true')
    source.add_argument('--fixture', type=Path, help='Offline saved official HTML; no network')
    ap.add_argument('--source-url', help='Canonical URL required with --fixture')
    ap.add_argument('--output-dir', type=Path, default=Path('data/patches'))
    args = ap.parse_args(argv)
    try:
        if args.fixture:
            if not args.source_url:
                raise ImportFailure('--fixture requires --source-url')
            url = official_url(args.source_url, page=True)
            raw = args.fixture.read_bytes()
        else:
            if args.source_url:
                raise ImportFailure('--source-url is only for offline fixtures')
            fetcher = OfficialFetcher()
            url = args.url
            if args.latest:
                listing = fetcher.fetch(ORIGIN + '/news/patch-notes', 'listing').decode('utf-8-sig')
                url = latest_url(listing)
            url = official_url(url, page=True)
            raw = fetcher.fetch(url, 'page')
        parsed = parse_article(raw)
        url_version = re.search(r'PatchNotes_(\d+\.\d+(?:\.\d+)?)$', url, re.I)
        if url_version and url_version[1] != parsed['version']:
            raise ImportFailure('URL/title version mismatch')
        summary = write_import(args.output_dir, parsed['version'], parsed['date'], url, raw, parsed['rows'])
        from collections import Counter
        summary.update({'counts': dict(Counter(r['Category'] for r in parsed['rows'])), 'date': parsed['date'], 'uncertain': parsed['uncertain'], 'unparsed': parsed['unparsed'],
                        'ignored': parsed['ignored'], 'evidence': parsed['evidence']})
        print(json.dumps(summary, ensure_ascii=True, indent=2))
        # Partial extraction is visible to scripts as well as humans.
        return 2 if parsed['unparsed'] else 0
    except (ImportFailure, OSError, UnicodeError) as exc:
        print(json.dumps({'status': 'error', 'error': str(exc)}, ensure_ascii=True), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
