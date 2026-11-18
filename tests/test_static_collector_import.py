"""PRED-M7 (#224): the publish workflow must import every bracket the collector writes.

publish.yml copies an explicit list of files from the data-updates branch. When #219 added
Master+, BRACKETS gained 'master' but that list did not, so a collected master.json could
never publish. This test fails whenever the list and the bracket settings drift apart.
"""
import json
import re
import unittest
from pathlib import Path

import predecessor_meta

ROOT = Path(__file__).resolve().parents[1]


def imported_files():
    workflow = (ROOT / '.github' / 'workflows' / 'publish.yml').read_text(encoding='utf-8')
    step = workflow.index('name: Read the Windows collector data branch')
    loops = re.findall(r'^\s*for file in ([^;\n]+); do$', workflow[step:], re.M)
    if not loops:
        raise AssertionError('The data-branch import loop was not found in publish.yml')
    return loops[0].split()


class CollectorImportList(unittest.TestCase):
    def test_import_list_matches_brackets_exactly(self):
        files = imported_files()
        self.assertEqual(len(files), len(set(files)), 'No file is listed twice')
        self.assertIn('collector.json', files, 'The receipt must be imported')
        bundles = {name[:-len('.json')] for name in files if name != 'collector.json'}
        self.assertTrue(all(name.endswith('.json') for name in files))
        self.assertEqual(bundles, set(predecessor_meta.BRACKETS),
                         'publish.yml must import exactly one <bracket>.json per bracket in BRACKETS')

    def test_hosting_brackets_match_app_brackets(self):
        hosting = json.loads((ROOT / 'free_hosting.json').read_text(encoding='utf-8'))['brackets']
        self.assertEqual(len(hosting), len(set(hosting)))
        self.assertEqual(set(hosting), set(predecessor_meta.BRACKETS),
                         'The collector writes free_hosting.json brackets; the app accepts BRACKETS')

    def test_master_is_imported(self):
        self.assertIn('master.json', imported_files())


if __name__ == '__main__':
    unittest.main()
