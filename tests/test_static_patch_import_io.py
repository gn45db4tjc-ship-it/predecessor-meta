import csv
import hashlib
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from patch_import_io import OfficialFetcher, ImportFailure, FIELDS, write_import, NoRedirect, MAX_BYTES

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

    def test_crawl_delay_is_honoured(self):
        # Muse F4 regression: real elapsed time, but all HTTP is fake.
        opener=Mock()
        opener.open.side_effect=[response('https://www.predecessorgame.com/robots.txt',b'User-agent: *\nDisallow:\nCrawl-delay: 1\n'),response(URL,b'page')]
        start=time.monotonic()
        self.assertEqual(OfficialFetcher(opener).fetch(URL,'page'),b'page')
        self.assertGreaterEqual(time.monotonic()-start,1)

    def test_delay_between_robots_listing_and_page(self):
        now=[0.0]; starts=[]; sleeps=[]
        def sleep(seconds):
            sleeps.append(seconds); now[0]+=seconds
        def open_response(request, **kwargs):
            starts.append(now[0])
            # Include simulated request duration: spacing is from completion.
            now[0]+=2
            body=(b'User-agent: *\nCrawl-delay: 9\n\nUser-agent: PatchNotesImporter\nCrawl-delay: 5\nDisallow:\n'
                  if request.full_url.endswith('robots.txt') else b'content')
            return response(request.full_url,body)
        opener=Mock();opener.open.side_effect=open_response
        with patch('patch_import_io.time.monotonic',side_effect=lambda:now[0]), patch('patch_import_io.time.sleep',side_effect=sleep):
            fetcher=OfficialFetcher(opener)
            fetcher.fetch('https://www.predecessorgame.com/news','listing')
            now[0]+=1
            fetcher.fetch(URL,'page')
        self.assertEqual(starts,[0,7,14])
        self.assertEqual(sleeps,[5,4])

    def test_no_delay_without_directive(self):
        opener=Mock()
        opener.open.side_effect=[response('https://www.predecessorgame.com/robots.txt',b'User-agent: *\nDisallow:\n'),response(URL,b'page')]
        with patch('patch_import_io.time.sleep') as sleep:
            OfficialFetcher(opener).fetch(URL,'page')
        sleep.assert_not_called()

    def test_excessive_crawl_delay_fails_before_sleep_or_page_request(self):
        now=[0.0]
        opener=Mock()
        opener.open.return_value=response('https://www.predecessorgame.com/robots.txt',b'User-agent: *\nDisallow:\nCrawl-delay: 61\n')
        with patch('patch_import_io.time.monotonic',side_effect=lambda:now[0]), patch('patch_import_io.time.sleep',side_effect=lambda seconds:now.__setitem__(0,now[0]+seconds)) as sleep:
            with self.assertRaisesRegex(ImportFailure,'crawl-delay exceeds 60 seconds'):
                OfficialFetcher(opener).fetch(URL,'page')
        self.assertEqual(opener.open.call_count,1)
        sleep.assert_not_called()

    def test_sixty_second_crawl_delay_is_honoured(self):
        now=[0.0]
        opener=Mock()
        opener.open.side_effect=[response('https://www.predecessorgame.com/robots.txt',b'User-agent: *\nDisallow:\nCrawl-delay: 60\n'),response(URL,b'page')]
        with patch('patch_import_io.time.monotonic',side_effect=lambda:now[0]), patch('patch_import_io.time.sleep',side_effect=lambda seconds:now.__setitem__(0,now[0]+seconds)) as sleep:
            self.assertEqual(OfficialFetcher(opener).fetch(URL,'page'),b'page')
        sleep.assert_called_once_with(60)
        self.assertEqual(opener.open.call_count,2)

    def test_redirect_handler_refuses_all_redirect_destinations(self):
        from urllib.request import Request
        for code in (301,302,303,307,308):
            for destination in (URL,'https://evil.test/page'):
                with self.subTest(code=code,destination=destination):
                    with self.assertRaisesRegex(ImportFailure,'Redirect refused'):
                        NoRedirect().redirect_request(Request(URL),None,code,'redirect',{},destination)
        fetcher=OfficialFetcher()
        self.assertTrue(any(isinstance(handler,NoRedirect) for handler in fetcher.opener.handlers))

    def test_status_destination_and_size_fail_closed(self):
        robots='https://www.predecessorgame.com/robots.txt'
        for stage in ('robots','page'):
            target=robots if stage=='robots' else URL
            failures=[response(target,b'error',status) for status in (204,301,404,500)]
            failures += [response('https://evil.test/page',b'content'),response(target,b'x'*(MAX_BYTES+1))]
            for bad in failures:
                with self.subTest(stage=stage,status=bad.status,destination=bad.geturl()):
                    opener=Mock()
                    opener.open.side_effect=([response(robots,b'User-agent: *\nDisallow:\n')] if stage=='page' else [])+[bad]
                    fetcher=OfficialFetcher(opener)
                    with self.assertRaises(ImportFailure):fetcher.fetch(URL,'page')
                    calls=opener.open.call_count
                    with self.assertRaises(ImportFailure):fetcher.fetch(URL,'page')
                    self.assertEqual(opener.open.call_count,calls)
                    if bad.status==200 and bad.geturl()==target:
                        bad.read.assert_called_once_with(MAX_BYTES+1)
                    else:bad.read.assert_not_called()

    def test_transport_errors_do_not_retry(self):
        from urllib.error import HTTPError, URLError
        for error in (HTTPError(URL,503,'unavailable',{},None),URLError('offline'),TimeoutError('timeout')):
            opener=Mock()
            opener.open.side_effect=[response('https://www.predecessorgame.com/robots.txt',b'User-agent: *\nDisallow:\n'),error]
            fetcher=OfficialFetcher(opener)
            with self.assertRaisesRegex(ImportFailure,'Official source request failed'):
                fetcher.fetch(URL,'page')
            with self.assertRaisesRegex(ImportFailure,'budget exhausted'):
                fetcher.fetch(URL,'page')
            self.assertEqual(opener.open.call_count,2)

    def test_size_limit_boundary_accepted(self):
        opener=Mock();body=b'x'*MAX_BYTES
        page=response(URL,body)
        opener.open.side_effect=[response('https://www.predecessorgame.com/robots.txt',b'User-agent: *\nDisallow:\n'),page]
        self.assertEqual(OfficialFetcher(opener).fetch(URL,'page'),body)
        page.read.assert_called_once_with(MAX_BYTES+1)

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

    def test_same_source_updates_changed_rows_then_noops_identical_output(self):
        old=dict(zip(FIELDS,['Hero','Example','Damage','10','11','Buff','Patch Notes']))
        added=dict(zip(FIELDS,['Hero','Example','Health','500','550','Buff','Patch Notes']))
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)
            first=write_import(p,'1.18','Nov 3, 2026',URL,b'same-html',[old])
            self.assertEqual(first['status'],'created')

            before_metadata_checks={path.name:(path.read_bytes(),path.stat().st_mtime_ns) for path in (p/'1.18.csv',p/'index.json')}
            for bad_url,bad_date in ((URL.replace('1.18','1.19'),'Nov 3, 2026'),(URL,'Nov 4, 2026')):
                with self.subTest(url=bad_url,date=bad_date):
                    with self.assertRaisesRegex(ImportFailure,'metadata changed without source bytes'):
                        write_import(p,'1.18',bad_date,bad_url,b'same-html',[old])
            self.assertEqual(before_metadata_checks,{path.name:(path.read_bytes(),path.stat().st_mtime_ns) for path in (p/'1.18.csv',p/'index.json')})

            updated=write_import(p,'1.18','Nov 3, 2026',URL,b'same-html',[old,added])
            self.assertEqual(updated['status'],'updated')
            self.assertEqual(updated['row_count'],2)
            self.assertEqual(updated['counts'],{'Hero':2})
            self.assertEqual(updated['added'],[added])
            self.assertEqual(updated['removed'],[])
            csv_path=p/'1.18.csv'
            index_path=p/'index.json'
            with csv_path.open(encoding='utf-8',newline='') as f:
                self.assertEqual(list(csv.DictReader(f)),[old,added])
            index=json.loads(index_path.read_text(encoding='utf-8'))
            self.assertEqual(index['1.18']['row_count'],2)
            self.assertEqual(index['1.18']['csv_sha256'],hashlib.sha256(csv_path.read_bytes()).hexdigest())

            before={path.name:(path.read_bytes(),path.stat().st_mtime_ns) for path in (csv_path,index_path)}
            unchanged=write_import(p,'1.18','Nov 3, 2026',URL,b'same-html',[old,added])
            self.assertEqual(unchanged['status'],'unchanged')
            self.assertEqual(unchanged['row_count'],2)
            self.assertEqual(before,{path.name:(path.read_bytes(),path.stat().st_mtime_ns) for path in (csv_path,index_path)})

    def test_invalid_output_refused_without_writes(self):
        with tempfile.TemporaryDirectory() as temp:
            for version,rows in (('../escape',[]),('1.18',[]),('1.18',[{}])):
                with self.assertRaises(ImportFailure):write_import(temp,version,'Nov 3, 2026',URL,b'a',rows)
            self.assertEqual(list(Path(temp).iterdir()),[])

if __name__ == '__main__':unittest.main()
