import csv
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from patch_import_io import OfficialFetcher, ImportFailure, FIELDS, write_import

URL = 'https://www.predecessorgame.com/news/patch-notes/PatchNotes_1.18'
FIXTURE = Path(__file__).parent / 'fixtures' / 'patch_importer'


def response(url, body, status=200):
    r = Mock()
    r.__enter__ = Mock(return_value=r)
    r.__exit__ = Mock(return_value=False)
    r.status = status
    r.geturl.return_value = url
    r.read.return_value = body
    return r


class IOTests(unittest.TestCase):
    def test_fixture_hashes_and_reference_normalization(self):
        hashes = {'PatchNotes_1.18.html':'ec44ca7c898a505bddca1bc4b9a1a9562b88d1ee8143c47f0cd46f18d255e499',
                  'robots.txt':'d5f35244f130bb2e0ca6c36bd27b6e3d5359f626bd1c589b6ed799a5c23012f7',
                  'reference-original.csv':'d4857fab0539081aa0a1467de11e2210f8708a5414f748504bcb4d307e9f6b4b'}
        for name, digest in hashes.items():
            self.assertEqual(hashlib.sha256((FIXTURE/name).read_bytes()).hexdigest(),digest)
        with (FIXTURE/'reference-original.csv').open(encoding='utf-8-sig',newline='') as f:
            original=list(csv.DictReader(f))
        with (FIXTURE/'reference-normalized.csv').open(encoding='utf-8-sig',newline='') as f:
            normalized=list(csv.DictReader(f))
        self.assertEqual(len(original),235)
        self.assertEqual(sum(r['Old_Value'].startswith('None (New') for r in original),31)
        for a,b in zip(original,normalized):
            if a['Old_Value'].startswith('None (New'): a['Change_Type']='New'
            self.assertEqual(a,b)

    def test_budget_headers_timeout_and_robots(self):
        opener=Mock()
        opener.open.side_effect=[response('https://www.predecessorgame.com/robots.txt',b'User-agent: *\nDisallow:\n'),response(URL,b'page')]
        fetcher=OfficialFetcher(opener)
        self.assertEqual(fetcher.fetch(URL,'page'),b'page')
        with self.assertRaises(ImportFailure):fetcher.fetch(URL,'page')
        self.assertEqual(opener.open.call_count,2)
        for call in opener.open.call_args_list:
            self.assertEqual(call.kwargs,{'timeout':30})
            self.assertEqual(call.args[0].get_header('User-agent'),'PatchNotesImporter/1.0')

    def test_denied_robots_never_requests_page(self):
        opener=Mock()
        opener.open.return_value=response('https://www.predecessorgame.com/robots.txt',b'User-agent: *\nDisallow: /news/')
        with self.assertRaises(ImportFailure):OfficialFetcher(opener).fetch(URL,'page')
        self.assertEqual(opener.open.call_count,1)

    def test_robots_failure_never_requests_page(self):
        for payload in (b'<html>error</html>',b'',b'\xff'):
            opener=Mock();opener.open.return_value=response('https://www.predecessorgame.com/robots.txt',payload)
            with self.assertRaises(ImportFailure):OfficialFetcher(opener).fetch(URL,'page')
            self.assertEqual(opener.open.call_count,1)

    def test_untrusted_urls_do_not_fetch(self):
        for url in ('http://www.predecessorgame.com/news/patch-notes/a','https://evil.test/a',URL+'?token=x',URL+'#x','https://www.predecessorgame.com:443/news/patch-notes/a'):
            opener=Mock()
            with self.assertRaises(ImportFailure):OfficialFetcher(opener).fetch(url,'page')
            opener.open.assert_not_called()

    def test_output_noop_diff_and_tamper_refusal(self):
        row=dict(zip(FIELDS,['Hero','Example','Damage','10','11','Buff','Patch Notes']))
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)
            result=write_import(p,'1.18','Nov 3, 2026',URL,b'a',[row]);self.assertEqual(result['status'],'created')
            before=[(f.name,f.read_bytes(),f.stat().st_mtime_ns) for f in p.iterdir()]
            self.assertEqual(write_import(p,'1.18','Nov 3, 2026',URL,b'a',[row])['status'],'unchanged')
            self.assertEqual(before,[(f.name,f.read_bytes(),f.stat().st_mtime_ns) for f in p.iterdir()])
            changed={**row,'New_Value':'12'}
            result=write_import(p,'1.18','Nov 3, 2026',URL,b'b',[changed])
            self.assertEqual(result['added'],[changed]);self.assertEqual(result['removed'],[row])
            (p/'1.18.csv').write_text('tampered')
            with self.assertRaises(ImportFailure):write_import(p,'1.18','Nov 3, 2026',URL,b'b',[changed])

    def test_invalid_output_refused_without_writes(self):
        with tempfile.TemporaryDirectory() as temp:
            for version,rows in (('../escape',[]),('1.18',[]),('1.18',[{}])):
                with self.assertRaises(ImportFailure):write_import(temp,version,'Nov 3, 2026',URL,b'a',rows)
            self.assertEqual(list(Path(temp).iterdir()),[])

if __name__ == '__main__':unittest.main()
