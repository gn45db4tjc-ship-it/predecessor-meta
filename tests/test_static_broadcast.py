"""The Broadcast look (2.49.0): self-hosted fonts reach every surface, and only the allow-listed font files are served."""
import re
import unittest
from pathlib import Path

import predecessor_meta as app

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / 'assets' / 'fonts'


class SelfHostedFonts(unittest.TestCase):
    def test_every_allow_listed_font_ships_as_woff2_with_its_licence(self):
        for name in app.UI_FONTS:
            self.assertTrue((FONTS / name).read_bytes().startswith(b'wOF2'), name)
        for licence in ('OFL-Barlow.txt', 'OFL-SairaCondensed.txt'):
            self.assertIn('SIL Open Font License', (FONTS / licence).read_text(encoding='utf-8'), licence)

    def test_the_stylesheet_asks_only_for_allow_listed_fonts(self):
        css = (ROOT / 'broadcast.css').read_text(encoding='utf-8')
        asked = set(re.findall(r'url\(assets/fonts/([\w.-]+)\)', css))
        self.assertEqual(asked, set(app.UI_FONTS))
        self.assertNotRegex(css, r'fonts\.(googleapis|gstatic)\.com')

    def test_the_font_route_serves_only_those_files(self):
        for name in app.UI_FONTS:
            self.assertTrue(app.ui_font('/assets/fonts/' + name).startswith(b'wOF2'), name)
        for refused in ('/assets/fonts/../predecessor_meta.py', '/assets/fonts/OFL-Barlow.txt', '/assets/fonts/', '/assets/fonts/barlow-400.woff',
                        '/assets/fonts/%2e%2e/predecessor_meta.py', '/assets/app-icon-192.png', '/fonts/barlow-400.woff2'):
            self.assertIsNone(app.ui_font(refused), refused)

    def test_both_servers_route_fonts_and_allow_them_in_their_policy(self):
        for name in ('predecessor_meta.py', 'shared_server.py'):
            source = (ROOT / name).read_text(encoding='utf-8')
            self.assertIn("font-src 'self'", source, name)
            self.assertRegex(source, r"ui_font\(path\)", name)
            self.assertIn("'font/woff2'", source, name)

    def test_the_page_carries_the_look_last_and_the_hosted_page_preloads_three_faces(self):
        static = app.render_html(None, {'mode': 'static', 'tool_version': app.VERSION})
        local = app.render_html(None, {'mode': 'local', 'token': 't', 'revision': 0, 'tool_version': app.VERSION})
        for page in (static, local):
            self.assertNotIn('__BROADCAST_CSS__', page)
            self.assertIn('@font-face{font-family:"Saira Condensed"', page)
            style = page[page.index('<style>'):page.index('</style>')]
            self.assertTrue(style.rstrip().endswith((ROOT / 'broadcast.css').read_text(encoding='utf-8').rstrip()), 'broadcast.css is the last stylesheet')
        # 2.52.0: the regular and bold text faces and the display face (QT3).
        self.assertEqual(static.count('rel="preload"'), 3)
        self.assertIn('barlow-700.woff2" as="font"', static)
        self.assertNotIn('rel="preload"', local)

    def test_the_offline_shell_keeps_the_fonts(self):
        sw = (ROOT / 'sw.js').read_text(encoding='utf-8')
        names = re.search(r"const FONTS = \[([^\]]*)\]", sw).group(1)
        self.assertEqual({n + '.woff2' for n in re.findall(r"'([\w-]+)'", names)}, set(app.UI_FONTS))
        self.assertIn('...FONTS]', sw)


if __name__ == '__main__':
    unittest.main()
