import contextlib
import io
import json
import re
from html.parser import HTMLParser
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from patch_importer import parse_article, latest_url, main, ImportFailure, classification

FIXTURE=Path(__file__).parent/'fixtures'/'patch_importer'/'PatchNotes_1.18.html'
URL='https://www.predecessorgame.com/news/patch-notes/PatchNotes_1.18'


class ParserTests(unittest.TestCase):
    def test_prose_only_system_changes_are_not_dropped(self):
        rows=parse_article(FIXTURE.read_bytes())['rows']
        text=' '.join(r['New_Value'] for r in rows)
        self.assertIn('Daily Deals are leaving the Store',text)
        self.assertIn('only 100 players can be Paragon',text)
        self.assertIn('have 5 matches to complete',text)
        self.assertFalse(any(r['Target']=='Daybreak' for r in rows))

    def test_required_system_paragraphs_are_verbatim(self):
        rows=parse_article(FIXTURE.read_bytes())['rows']
        paragraphs=(
            'With V1.18, Daily Deals are leaving the Store, as The Void takes their place. The Featured tab now shows four featured items instead.',
            "All players will start the new split in Placements and have 5 matches to complete to get placed (10 if you're new to Ranked or haven't played in a while).",
            'Paragon should be the ultimate achievement: the rank people recognise the moment they see it in the lobby. From V1.18, only 100 players can be Paragon at any one time.',
            'V1.18 adds a brand new tier towards the top of the ladder: Master, sitting between Diamond I and Paragon.',
            'The Void is a brand new personal sale, made just for you. When it opens, you\u2019ll reveal 5 skins picked from the Heroes you play, each with its own discount of up to 70% off.',
            'A range of our variants this update include brand new, coloured VFX to match - a popular request among many players in the community! These special variants are available for Quantum Zarus, Quantum Twinblast, Quantum Scarlett and Nullfire Quantum Lt. Belica. Variants featuring VFX recolours carry a 200 premium over standard variants.',
            'You now lose at least 25% less VP when a teammate goes AFK.',
            "To keep the top of the ladder competitive, Master and Paragon now have VP decay. To be the best of the best, you'll have to fight for your spot. We know you have lives outside of Predecessor, so decay won't drop your VP the moment you stop playing.",
        )
        for paragraph in paragraphs:
            with self.subTest(paragraph=paragraph):
                matches=[r for r in rows if r['New_Value']==paragraph]
                self.assertEqual(len(matches),1)
                self.assertEqual(matches[0]['Old_Value'],'Not stated')
                self.assertEqual(matches[0]['Change_Type'],'Adjustment')

    def test_reset_heading_does_not_hide_future_changes(self):
        raw=b'<h1>V9.9 Patch Notes</h1><p>Nov 3, 2026</p><h2>Ranked News</h2><h3>Rank Split Reset</h3><p>Placements now require 7 matches.</p><blockquote>- Health increased from 10 to 20.</blockquote>'
        result=parse_article(raw)
        self.assertTrue(any(r['New_Value']=='Placements now require 7 matches.' for r in result['rows']))
        self.assertTrue(any(r['Old_Value']=='10' and r['New_Value']=='20' for r in result['rows']))

    def test_withheld_prose_and_reward_lists_have_visible_reasons(self):
        result=parse_article(FIXTURE.read_bytes())
        teasers=[x for x in result['ignored'] if 'Daybreak' in x.get('text','')]
        rewards=[x for x in result['ignored'] if ': Royal Wukong' in x.get('text','')]
        self.assertEqual(len(teasers),2)
        self.assertTrue(all('teaser' in x['reason'] for x in teasers))
        self.assertEqual(len(rewards),5)
        self.assertTrue(all('cosmetic rank reward' in x['reason'] for x in rewards))
        self.assertFalse(any(': Royal Wukong' in r['New_Value'] for r in result['rows']))
        self.assertFalse(any(x['reason']=='narrative context, not a structured change' for x in result['ignored']))

    def test_no_non_change_prose_rows(self):
        rows=parse_article(FIXTURE.read_bytes())['rows']
        self.assertFalse(any(r['Target']=='Daybreak' for r in rows))
        self.assertFalse(any(r['New_Value'].rstrip().endswith(':') or r['New_Value'].endswith(': (Bugfix)') for r in rows))
        self.assertFalse(any(r['Ability_or_Stat'].endswith('- Relevant Ability') for r in rows))
        self.assertFalse(any(r['Ability_or_Stat'].endswith('- Type') for r in rows))
        self.assertFalse(any(r['Target']=='Rank Split Reset' for r in rows))
        result=parse_article(FIXTURE.read_bytes())
        self.assertTrue(any('Daybreak' in x.get('text','') for x in result['ignored']))
        self.assertTrue(any('Relevant Ability:' in x.get('text','') for x in result['ignored']))

    def test_optional_sections_absent_is_not_partial(self):
        raw=b'<h1>V9.9 Patch Notes</h1><p>Nov 3, 2026</p><h2>Systems</h2><h3>Towers</h3><blockquote>- Health increased from 10 to 20.</blockquote><h2>Bug Fixes</h2><blockquote>- Fixed a crash.</blockquote>'
        result=parse_article(raw)
        missing={x.get('section') for x in result['unparsed'] if x['reason']=='expected section missing'}
        self.assertFalse({'New Hero','New Items'} & missing)
        self.assertEqual(result['absent_optional_sections'],['New Hero','New Items'])

    def test_checked_in_literal_audit_matches_fresh_audit(self):
        import runpy
        audit=runpy.run_path(str(Path(__file__).with_name('audit_patch_reference.py')))['audit']
        checked=json.loads((Path(__file__).parents[1]/'docs'/'PATCH-IMPORTER-LITERAL-AUDIT.json').read_text(encoding='utf-8'))
        self.assertEqual(audit(),checked)

    def test_classification_table_and_unknown(self):
        for stat in ('Health','Damage','Movement Speed'):
            self.assertEqual(classification(stat,'increased'),'Buff')
            self.assertEqual(classification(stat,'decreased'),'Nerf')
        for stat in ('Cooldown','Price','Cost','Melee Basic Attack Damage Taken Modifier'):
            self.assertEqual(classification(stat,'increased'),'Nerf')
            self.assertEqual(classification(stat,'decreased'),'Buff')
        self.assertEqual(classification('Unfamiliar stat','increased'),'Adjustment')

    def test_overclocked_and_attribution_summary(self):
        result=parse_article(FIXTURE.read_bytes())
        rows=[r for r in result['rows'] if r['Category']=='Map/Mode']
        self.assertEqual(len(rows),64)
        self.assertTrue(all(r['Target'].startswith('Overclocked: ') for r in rows))
        self.assertTrue(any(x['target']=='Iggy & Scorch' and x['method']=='banner filename' for x in result['target_sources']))
        # No editorial Rework label is inferred from a descriptive paragraph.
        self.assertFalse(any(r['Change_Type']=='Rework' for r in result['rows']))

    def test_cli_url_with_fake_fetcher(self):
        with tempfile.TemporaryDirectory() as temp, patch('patch_importer.OfficialFetcher') as factory:
            factory.return_value.fetch.return_value=FIXTURE.read_bytes()
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(['--url',URL,'--output-dir',temp]),2)
            factory.return_value.fetch.assert_called_once_with(URL,'page')

    def test_source_fixture_not_editorial_csv(self):
        result=parse_article(FIXTURE.read_bytes())
        self.assertEqual((result['version'],result['date']),('1.18','Nov 3, 2026'))
        self.assertEqual(len(result['rows']),286)
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

    def test_values_occur_in_independent_visible_text(self):
        class Text(HTMLParser):
            def __init__(self):
                super().__init__(); self.parts=[]; self.skip=0
            def handle_starttag(self,tag,attrs):
                if tag in ('script','style'): self.skip+=1
                elif tag=='br': self.parts.append(' ')
            def handle_endtag(self,tag):
                if tag in ('script','style'): self.skip-=1
                elif tag in ('p','blockquote','li','div'): self.parts.append(' ')
            def handle_data(self,data):
                if not self.skip: self.parts.append(data)
        text=Text(); text.feed(FIXTURE.read_text(encoding='utf8'))
        visible=re.sub(r'\s+',' ',''.join(text.parts))
        for row in parse_article(FIXTURE.read_bytes())['rows']:
            for key in ('Old_Value','New_Value'):
                value=row[key].removesuffix(' (Bugfix)')
                if value=='Not stated' or value.startswith('None (New'): continue
                self.assertIn(re.sub(r'\s+',' ',value),visible)

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
        self.assertEqual(len(result['rows']),286)
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
