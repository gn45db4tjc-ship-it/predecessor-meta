"""The design system is documented: every token and shared component the stylesheets define is in docs/DESIGN-SYSTEM.md."""
import re, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def stylesheets():
    html = (ROOT / 'ui.html').read_text(encoding='utf-8')
    inline = '\n'.join(re.findall(r'<style[^>]*>(.*?)</style>', html, re.S))
    return inline + '\n' + (ROOT / 'mobile.css').read_text(encoding='utf-8') + '\n' + (ROOT / 'companion_simple.css').read_text(encoding='utf-8')


class DesignSystemDocumentationTests(unittest.TestCase):
    def setUp(self):
        self.doc_path = ROOT / 'docs' / 'DESIGN-SYSTEM.md'
        self.assertTrue(self.doc_path.is_file(), 'docs/DESIGN-SYSTEM.md is missing')
        self.doc = self.doc_path.read_text(encoding='utf-8')
        self.css = stylesheets()

    def test_every_token_is_documented(self):
        tokens = sorted(set(re.findall(r'(--[a-z][\w-]*)\s*:', self.css)))
        missing = [t for t in tokens if '`' + t + '`' not in self.doc]
        self.assertEqual(missing, [], 'Undocumented tokens: ' + ', '.join(missing))

    def test_documented_tokens_exist(self):
        defined = set(re.findall(r'(--[a-z][\w-]*)\s*:', self.css))
        stale = sorted(t for t in set(re.findall(r'`(--[a-z][\w-]*)`', self.doc)) if t not in defined)
        self.assertEqual(stale, [], 'Documented tokens that no longer exist: ' + ', '.join(stale))

    def test_shared_components_are_documented(self):
        for component in ('chip', 'tab-strip', 'item-button', 'primary', 'quiet', 'text-button', 'panel', 'note', 'tier', 'build-strip'):
            self.assertIn('`.' + component + '`', self.doc, component)
            self.assertRegex(self.css, r'\.' + re.escape(component) + r'\b', component + ' is documented but has no style')


if __name__ == '__main__':
    unittest.main()
