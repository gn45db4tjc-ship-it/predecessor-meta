import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from patch_importer import parse_article, latest_url, main, ImportFailure

FIXTURE=Path(__file__).parent/'fixtures'/'patch_importer'/'PatchNotes_1.18.html'
URL='https://www.predecessorgame.com/news/patch-notes/PatchNotes_1.18'


class ParserTests(unittest.TestCase):
    def test_source_fixture_not_editorial_csv(self):
        result=parse_article(FIXTURE.read_bytes())
        self.assertEqual((result['version'],result['date']),('1.18','Nov 3, 2026'))
        self.assertEqual(len(result['rows']),302)
        self.assertEqual(len(result['unparsed']),21)
        self.assertTrue(all('Eternal owner' in item['reason'] for item in result['unparsed']))
        rows=result['rows']
        health=next(r for r in rows if r['Target']=='Kaelen' and r['Ability_or_Stat']=='Health')
        self.assertEqual(health['Old_Value'],'None (New Hero)')
        self.assertEqual(health['New_Value'],'695 (+131 per Level)')
        self.assertEqual(health['Change_Type'],'New')
        cooldown=next(r for r in rows if r['Target']=='Kaelen' and r['Ability_or_Stat']=='Razorstorm [Primary] - CD')
        self.assertEqual(cooldown['New_Value'],'13/11.75/10.5/9.25/8')
        control=next(r for r in rows if 'continue to spin even while Stunned' in r['New_Value'])
        self.assertNotIn('Hard CC immune',control['New_Value'])
        self.assertEqual(control['New_Value'],'This ability cannot be interrupted by Hard Crowd Control Effects, meaning Kaelen will continue to spin even while Stunned.')
        self.assertTrue(all(r['Source']=='Patch Notes' for r in rows))
        self.assertTrue(all(r['New_Value'].endswith('(Bugfix)') for r in rows if '[Bugfix]' in r['New_Value']))
        self.assertTrue(any('Not stated'==r['Old_Value'] for r in rows))

    def test_every_value_has_visible_source_evidence(self):
        result=parse_article(FIXTURE.read_bytes())
        for row,evidence in zip(result['rows'],result['evidence']):
            source=evidence['source_text']
            self.assertIn(row['New_Value'].removesuffix(' (Bugfix)'),source)
            if row['Old_Value'] not in ('Not stated','None (New Hero)','None (New Item)'):
                self.assertIn(row['Old_Value'],source)

    def test_changed_source_changes_result_not_lookup(self):
        raw=FIXTURE.read_bytes().replace(b'695 (+131 per Level)',b'696 (+131 per Level)')
        result=parse_article(raw)
        health=next(r for r in result['rows'] if r['Target']=='Kaelen' and r['Ability_or_Stat']=='Health')
        self.assertEqual(health['New_Value'],'696 (+131 per Level)')

    def test_unknown_and_missing_sections_reported(self):
        raw=b'<h1>V2.0 Patch Notes</h1><p>Nov 3, 2026</p><h2>Systems</h2><h3>Towers</h3><blockquote>- Health increased from 10 to 20.</blockquote><h2>Alien Balance</h2><blockquote>- New unknown thing.</blockquote>'
        result=parse_article(raw)
        self.assertTrue(any(x['reason']=='unknown section' for x in result['unparsed']))
        self.assertTrue(any(x.get('text')=='- New unknown thing.' for x in result['unparsed']))
        self.assertTrue(any(x['reason']=='expected section missing' for x in result['unparsed']))

    def test_broken_empty_and_non_utf8_fail(self):
        for raw in (b'',b'<html>Error</html>',b'\xff',b'<h1>V2.0 Patch Notes</h1><p>Nov 3, 2026</p>'):
            with self.assertRaises(ImportFailure):parse_article(raw)

    def test_latest_uses_official_semantic_version_not_link_order(self):
        html='<a href="/news/patch-notes/PatchNotes_1.9">old</a><a href="https://evil.test/news/patch-notes/PatchNotes_99.0">evil</a><a href="/news/patch-notes/PatchNotes_1.18">new</a>'
        self.assertEqual(latest_url(html),URL)
        with self.assertRaises(ImportFailure):latest_url('<a href="/news/other">x</a>')

    def test_cli_offline_and_idempotent(self):
        with tempfile.TemporaryDirectory() as temp, patch('urllib.request.OpenerDirector.open',side_effect=AssertionError('network forbidden')):
            args=['--fixture',str(FIXTURE),'--source-url',URL,'--output-dir',temp]
            out=io.StringIO()
            with contextlib.redirect_stdout(out):self.assertEqual(main(args),2)
            first=json.loads(out.getvalue());self.assertEqual(first['status'],'created')
            out=io.StringIO()
            with contextlib.redirect_stdout(out):self.assertEqual(main(args),2)
            self.assertEqual(json.loads(out.getvalue())['status'],'unchanged')
            self.assertEqual(json.loads(out.getvalue())['counts'],first['counts'])

    def test_list_change_is_not_lost(self):
        raw=FIXTURE.read_bytes()
        text=b'- Melee Basic Attack Damage Taken Modifier increased from 1.7x to 2x.'
        old=b'<blockquote class="quote-border p-px bg-pg-dark-gray"><div class="quote-border-inner p-4">'+text+b'</div></blockquote>'
        self.assertIn(old,raw)
        result=parse_article(raw.replace(old,b'<ul><li>'+text+b'</li></ul>',1))
        self.assertEqual(len(result['rows']),302)
        self.assertTrue(any(r['Target']=='Iggy & Scorch' and r['New_Value']=='2x' for r in result['rows']))

    def test_truncated_official_article_fails(self):
        raw=FIXTURE.read_bytes()
        point=raw.index(b'<blockquote',raw.index(b'<h2 id="bug-fixes"'))+80
        with self.assertRaises(ImportFailure):parse_article(raw[:point])

    def test_unhandled_div_text_is_reported(self):
        raw=FIXTURE.read_bytes().replace(b'<h2 id="bug-fixes"',b'<div>Unexpected gameplay addition</div><h2 id="bug-fixes"',1)
        result=parse_article(raw)
        self.assertTrue(any(x.get('text')=='Unexpected gameplay addition' for x in result['unparsed']))

    def test_cli_failure_nonzero_and_no_output_files(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp);(p/'bad.html').write_text('not a patch')
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(main(['--fixture',str(p/'bad.html'),'--source-url',URL,'--output-dir',str(p/'out')]),1)
            self.assertFalse((p/'out').exists())

if __name__=='__main__':unittest.main()
