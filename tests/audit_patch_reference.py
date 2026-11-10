"""Offline reference audit. Counts literal absences, not factual errors."""
import csv
import json
import re
import sys
from pathlib import Path
from collections import Counter
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from patch_importer import parse_article
from patch_import_io import FIELDS
from html.parser import HTMLParser
from pathlib import Path


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def audit():
    root = Path(__file__).parent / 'fixtures' / 'patch_importer'
    parser = VisibleText()
    parser.feed((root / 'PatchNotes_1.18.html').read_text(encoding='utf-8'))
    text = re.sub(r'\s+', ' ', ' '.join(parser.parts))
    with (root / 'reference-original.csv').open(encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    absent = []
    for number, row in enumerate(rows, 1):
        for field in ('Old_Value', 'New_Value'):
            value = re.sub(r'\s+', ' ', row[field]).removesuffix(' (Bugfix)')
            if not value.startswith('None (New') and value not in text:
                absent.append({'row': number, 'target': row['Target'], 'field': field, 'value': value})
    normalized = [{**r, 'Change_Type': 'New' if r['Old_Value'].startswith('None (New') else r['Change_Type']} for r in rows]
    parsed = parse_article((root / 'PatchNotes_1.18.html').read_bytes())
    expected = Counter(tuple(r[k] for k in FIELDS) for r in normalized)
    actual = Counter(tuple(r[k] for k in FIELDS) for r in parsed['rows'])
    missing = [dict(zip(FIELDS, r)) for r in (expected-actual).elements()]
    added = [dict(zip(FIELDS, r)) for r in (actual-expected).elements()]
    return {'exact_matching_rows': sum((expected & actual).values()), 'reference_rows_not_exactly_emitted': missing, 'source_rows_not_in_reference': added, 'source_row_count': len(parsed['rows']), 'rows': len(rows), 'literal_absent_cells': len(absent),
            'affected_rows': len({r['row'] for r in absent}),
            'caution': 'Not an error count: aggregation, paraphrase and punctuation can produce absences.',
            'absences': absent}


if __name__ == '__main__':
    print(json.dumps(audit(), indent=2, ensure_ascii=True))
