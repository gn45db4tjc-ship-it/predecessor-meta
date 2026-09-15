import unittest
from pathlib import Path
import predecessor_meta as app

class CompanionRendering(unittest.TestCase):
    def test_all_exports_inline_companion(self):
        for mode in ('local','export','static'):
            with self.subTest(mode=mode):
                html=app.render_html(None,{'mode':mode,'tool_version':app.VERSION})
                self.assertIn('function coachHTML',html)
                self.assertIn('function guidedHome',html)
                self.assertIn('function adaptBuild',html)
                self.assertIn('#coach-dock',html)
                self.assertNotIn('__MOBILE_CSS__',html)
                self.assertIn('viewport-fit=cover',html)

    def test_startup_includes_companion_before_first_render(self):
        html=app.render_html(None)
        self.assertLess(html.index('function renderCompanion'),html.index('// START CLIENT'))

    def test_pwa_shortcuts_are_in_scope(self):
        import json
        data=json.loads((Path(app.__file__).parent/'app.webmanifest').read_text(encoding='utf8'))
        self.assertEqual([r['url'] for r in data['shortcuts']],['./#view=meta','./#view=builds','./#view=planner','./#view=live'])

if __name__=='__main__':unittest.main()
