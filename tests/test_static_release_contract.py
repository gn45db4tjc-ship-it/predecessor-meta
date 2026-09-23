"""A release must invalidate its shell without invalidating saved data."""
import json
from pathlib import Path
import re
import unittest
import predecessor_meta as app

ROOT = Path(__file__).resolve().parents[1]

class ReleaseContract(unittest.TestCase):
    def test_app_shell_and_source_package_versions_agree(self):
        manifest = json.loads((ROOT / 'SOURCE-MANIFEST.json').read_text(encoding='utf8'))
        worker = (ROOT / 'sw.js').read_text(encoding='utf8')
        self.assertEqual(manifest['version'], app.VERSION)
        self.assertEqual(re.search(r"const SHELL_CACHE = '([^']+)'", worker)[1],
                         'predecessor-meta-shell-v' + app.VERSION.replace('.', '-'))
        self.assertIn("const DATA_CACHE = 'predecessor-meta-data-v1'", worker)
        self.assertEqual((ROOT / 'README.md').read_text(encoding='utf8').splitlines()[0],
                         '# Predecessor Meta - ' + app.VERSION)
        self.assertTrue((ROOT / ('RELEASE-' + app.VERSION + '.md')).is_file())

    def test_release_branch_verifies_without_being_a_publication_trigger(self):
        verify = (ROOT / '.github/workflows/verify.yml').read_text(encoding='utf8')
        publish = (ROOT / '.github/workflows/publish.yml').read_text(encoding='utf8')
        self.assertIn("branches: ['release/**']", verify)
        self.assertIn('branches: [main]', publish)
        self.assertNotIn('release/**', publish)
