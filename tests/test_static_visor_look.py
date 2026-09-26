"""Visor colours in the local Windows app: strict validation, silent fallback, WCAG AA on the derived tokens,
semantic colours untouched, and the hosted build unaffected (it never reads files or carries the Visor code)."""
import datetime as dt
import json
import os
import re
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

import predecessor_meta as app

ROOT = Path(__file__).resolve().parents[1]
MISSING = object()

# Accent and tint pairs Will's Visor can produce, plus the extremes: a near-white accent, a dark one, amber, red and
# violet, the app's own blue, pure black, and a tint lighter than the contract allows.
PALETTES = {
    'ice': ('#E1EBFA', '#0B1220'),
    'dark navy': ('#1B2A6B', '#070A14'),
    'dark violet': ('#2A0F4F', '#0C0716'),
    'amber': ('#F0A020', '#1A1206'),
    'red': ('#E0303A', '#1A0708'),
    'violet': ('#8A4DFF', '#120A24'),
    'app blue': ('#A9C5FF', '#131E34'),
    'black': ('#000000', '#000000'),
    'white': ('#FFFFFF', '#101010'),
    'green on a too-light tint': ('#2ECC71', '#9AA0B0'),
}
# Foregrounds whose meaning or reviewed contrast must never change: text, evidence, status, gold, focus and selection.
SEMANTIC_FOREGROUNDS = ('--text', '--text-2', '--muted', '--green', '--blue', '--red', '--amber', '--gold', '--gold-text',
                        '--official', '--enemy-text', '--indicator', '--focus')


def sample(**changes):
    look = {'schema': 1, 'updated': '2026-09-26T12:00:00Z', 'style': 'orbit', 'palette': 'ember', 'glass': 'medium',
            'calm': False, 'accent': '#F0A020', 'text': '#F4F1EA', 'muted': '#B8B0A0', 'warn': '#FF6A3D', 'tint': '#1A1206'}
    look.update(changes)
    return {k: v for k, v in look.items() if v is not MISSING}


def dark_root():
    html = (ROOT / 'ui.html').read_text(encoding='utf-8')
    block = re.search(r'\n:root\{(.*?)\n\}', html, re.S).group(1)
    return dict(re.findall(r'(--[a-z][\w-]*):([^;]+);', block))


def grounds(tokens):
    wash = app.VISOR_WASH.fullmatch(tokens['--hero-wash']).groups()[:2]
    return [tokens[n] for n in app.VISOR_BACKGROUNDS] + [tokens['--brand-tint']] + list(wash)


class VisorFileCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'look.json'
        app._visor_cache.clear()
        self.addCleanup(app._visor_cache.clear)

    def write(self, value, raw=False, clear=True):
        data = value if raw else json.dumps(value)
        self.path.write_bytes(data if isinstance(data, bytes) else data.encode('utf-8'))
        if clear: app._visor_cache.clear()

    def read(self, **kw):
        return app.read_visor_look(self.path, **kw)


class Validation(VisorFileCase):
    def test_valid_look_is_available_with_only_known_fields(self):
        self.write(sample(extra='</style><script>alert(1)</script>', accent2='#123456'))
        state = self.read()
        self.assertTrue(state['available'])
        self.assertEqual(state['look'], {'style': 'orbit', 'palette': 'ember', 'glass': 'medium', 'calm': False,
                                         'updated': '2026-09-26T12:00:00Z'})
        self.assertEqual(list(state['tokens']), list(app.VISOR_TOKENS))
        body = json.dumps(state)
        self.assertNotIn('script', body)
        self.assertNotIn('accent2', body)
        for name, value in state['tokens'].items():
            pattern = app.VISOR_WASH if name == '--hero-wash' else re.compile(r'#[0-9a-f]{6}')
            self.assertRegex(value, pattern.pattern, name)

    def test_every_enum_and_timestamp_form_in_the_contract_is_accepted(self):
        for style in app.VISOR_STYLES:
            for glass in app.VISOR_GLASS:
                for calm in (True, False):
                    self.write(sample(style=style, glass=glass, calm=calm, palette='custom'))
                    self.assertTrue(self.read()['available'], (style, glass, calm))
        for updated in ('2026-09-26T12:00:00Z', '2026-09-26T12:00:00.123Z', '2026-09-26T12:00:00.1234567Z', '2026-09-26T12:00:00+00:00'):
            self.write(sample(updated=updated))
            self.assertTrue(self.read()['available'], updated)

    def test_utf8_byte_order_mark_is_tolerated(self):
        self.write(b'\xef\xbb\xbf' + json.dumps(sample()).encode('utf-8'), raw=True)
        self.assertTrue(self.read()['available'])

    def test_malformed_looks_fall_back_to_the_normal_look(self):
        bad = {
            'not json': b'{"schema": 1,', 'array': b'[]', 'string': b'"look"', 'empty': b'', 'utf-16': json.dumps(sample()).encode('utf-16'),
            'schema 2': sample(schema=2), 'schema text': sample(schema='1'), 'schema bool': sample(schema=True), 'schema float': sample(schema=1.0),
            'style case': sample(style='Orbit'), 'style unknown': sample(style='aurora'), 'glass unknown': sample(glass='frosted'),
            'calm text': sample(calm='true'), 'calm number': sample(calm=1),
            'palette empty': sample(palette=''), 'palette space': sample(palette='deep sea'), 'palette markup': sample(palette='<b>x</b>'),
            'palette long': sample(palette='p' * 41), 'palette number': sample(palette=7),
            'short hex': sample(accent='#FFF'), 'named colour': sample(accent='red'), 'bad hex digit': sample(tint='#GG0000'),
            'long hex': sample(text='#1234567'), 'padded hex': sample(muted=' #123456'), 'rgb()': sample(warn='rgb(1,2,3)'),
            'hex without #': sample(accent='F0A020'), 'css injection': sample(accent='#123456;--green:#000'),
            'updated space': sample(updated='2026-09-26 12:00:00Z'), 'updated offset': sample(updated='2026-09-26T12:00:00+01:00'),
            'updated local': sample(updated='2026-09-26T12:00:00'), 'updated impossible': sample(updated='2026-13-40T25:00:00Z'),
            'updated number': sample(updated=1790000000), 'updated non-ASCII digits': sample(updated='٢٠٢٦-09-26T12:00:00Z'),
        }
        for field in ('schema', 'updated', 'style', 'palette', 'glass', 'calm') + app.VISOR_COLOURS:
            bad['missing ' + field] = sample(**{field: MISSING})
        for label, value in bad.items():
            with self.subTest(label):
                self.write(value, raw=isinstance(value, bytes))
                self.assertEqual(self.read(), {'available': False, 'reason': 'invalid'})

    def test_oversized_and_deeply_nested_files_are_rejected(self):
        self.write(sample(padding='x' * app.VISOR_LOOK_MAX_BYTES))
        self.assertEqual(self.read()['reason'], 'invalid')
        self.write(b'[' * 8000 + b']' * 8000, raw=True)
        self.assertEqual(self.read()['reason'], 'invalid')


class Fallback(VisorFileCase):
    def test_missing_file_and_missing_folder(self):
        self.assertEqual(self.read(), {'available': False, 'reason': 'missing'})
        self.assertEqual(app.read_visor_look(Path(self.tmp.name) / 'no-folder' / 'look.json')['reason'], 'missing')

    def test_default_path_is_the_visors_file_and_the_override_is_explicit(self):
        with mock.patch.dict(os.environ, {'LOCALAPPDATA': self.tmp.name}, clear=False):
            os.environ.pop(app.VISOR_LOOK_ENV, None)
            self.assertEqual(app.visor_look_path(), Path(self.tmp.name) / 'VisorHost' / 'look.json')
            os.environ[app.VISOR_LOOK_ENV] = str(self.path)
            self.assertEqual(app.visor_look_path(), self.path)
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(app.visor_look_path())
            self.assertEqual(app.read_visor_look(), {'available': False, 'reason': 'missing'})

    def test_a_folder_in_place_of_the_file_is_unreadable(self):
        self.path.mkdir()
        self.assertFalse(self.read()['available'])

    def test_future_timestamp_is_stale_and_an_unchanged_old_theme_is_not(self):
        now = dt.datetime(2026, 9, 26, 12, 0, tzinfo=dt.timezone.utc)
        self.write(sample(updated='2026-09-26T13:00:00Z'))
        self.assertEqual(self.read(now=now), {'available': False, 'reason': 'stale'})
        self.assertTrue(self.read(now=now + dt.timedelta(hours=1))['available'])
        self.write(sample(updated='2025-01-01T00:00:00Z'))
        self.assertTrue(self.read(now=now)['available'])

    def test_a_changed_file_is_read_again(self):
        self.write(sample(accent='#F0A020'))
        first = self.read()['tokens']['--brand']
        # No cache reset: the file's new size and time alone must cause a fresh read.
        self.write(sample(accent='#8A4DFF', palette='violet-long-name'), clear=False)
        self.assertNotEqual(self.read()['tokens']['--brand'], first)
        self.write(b'{broken', raw=True, clear=False)
        self.assertEqual(self.read()['reason'], 'invalid')

    @unittest.skipUnless(os.name == 'nt', 'Windows file-sharing rules')
    def test_reading_does_not_block_a_replace_file_writer(self):
        # ReplaceFileW is what .NET's File.Replace uses. (A MoveFileEx rename over the file fails while any handle is
        # open, shared or not, so such a writer retries; the app's read lasts microseconds.)
        import ctypes
        from ctypes import wintypes
        kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel32.ReplaceFileW.argtypes = (wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD, wintypes.LPVOID, wintypes.LPVOID)
        replacement = Path(self.tmp.name) / 'next.json'

        def replace(accent):
            replacement.write_text(json.dumps(sample(accent=accent)), encoding='utf-8')
            return bool(kernel32.ReplaceFileW(str(self.path), str(replacement), None, 0, None, None))

        self.write(sample())
        with open(self.path, 'rb'):   # the defect this guards against: a plain open makes the replace fail
            self.assertFalse(replace('#8A4DFF'))
        with app._visor_open_shared(self.path) as handle:
            self.assertTrue(replace('#8A4DFF'))
            self.assertIn(b'#F0A020', handle.read())
        self.assertEqual(json.loads(self.path.read_text(encoding='utf-8'))['accent'], '#8A4DFF')
        self.assertEqual(self.read()['tokens']['--brand'], app.derive_visor_tokens({'accent': '#8a4dff', 'tint': '#1a1206'})['--brand'])

    def test_a_briefly_locked_file_keeps_the_last_good_look_instead_of_flickering(self):
        self.write(sample())
        good = self.read()
        with mock.patch.object(Path, 'stat', side_effect=PermissionError('sharing violation')):
            self.assertEqual(self.read(), good)
        app._visor_cache.clear()
        with mock.patch.object(Path, 'stat', side_effect=PermissionError('sharing violation')):
            self.assertEqual(self.read(), {'available': False, 'reason': 'unreadable'})


class Contrast(unittest.TestCase):
    def test_defaults_mirror_the_dark_tokens_in_ui_html(self):
        root = dark_root()
        for name, value in app.VISOR_DARK_DEFAULTS.items():
            self.assertEqual(root[name], value, name)

    def test_only_brand_and_surface_tokens_are_ever_derived(self):
        semantic = re.compile(r'--(text|muted|on-strong|green|blue|red|amber|gold|official|observed|calculated|reviewed|'
                              r'enemy|tier|indicator|focus|accent|glow|icon-plate|backdrop|shadow|card-shadow)')
        self.assertEqual([t for t in app.VISOR_TOKENS if semantic.match(t)], [])
        client = (ROOT / 'visor_look.js').read_text(encoding='utf-8')
        listed = re.search(r"const TOKENS=\[([^\]]*)\]", client).group(1)
        self.assertEqual(tuple(re.findall(r"'([^']+)'", listed)), app.VISOR_TOKENS)

    def test_wcag_aa_holds_on_every_derived_surface(self):
        root = dark_root()
        rows = []
        for label, (accent, tint) in PALETTES.items():
            with self.subTest(label):
                t = app.derive_visor_tokens({'accent': accent.lower(), 'tint': tint.lower()})
                g = grounds(t)
                text_min = min(app.contrast_ratio(t['--brand-text'], x) for x in g)
                self.assertGreaterEqual(text_min, 4.5, 'brand text')
                for name in ('--brand', '--brand-hover', '--brand-line'):
                    self.assertGreaterEqual(min(app.contrast_ratio(t[name], x) for x in g), 3.0, name)
                for name in ('--brand', '--brand-hover'):
                    self.assertGreaterEqual(app.contrast_ratio(t['--brand-ink'], t[name]), 4.5, 'ink on ' + name)
                # Surfaces keep the app's luminance (or go darker), so no semantic colour loses contrast anywhere.
                for surface in app.VISOR_BACKGROUNDS:
                    self.assertLessEqual(app.relative_luminance(t[surface]), app.relative_luminance(root[surface]) + 1e-12, surface)
                    for fg in SEMANTIC_FOREGROUNDS:
                        before, after = app.contrast_ratio(root[fg], root[surface]), app.contrast_ratio(root[fg], t[surface])
                        self.assertGreaterEqual(after, before - 1e-9, fg + ' on ' + surface)
                        self.assertGreaterEqual(after, 3.0 if fg in ('--indicator', '--focus', '--gold') else 4.5, fg + ' on ' + surface)
                for fg in ('--text', '--text-2'):
                    self.assertGreaterEqual(app.contrast_ratio(root[fg], t['--brand-tint']), app.contrast_ratio(root[fg], root['--brand-tint']) - 1e-9, fg)
                # Borders keep at least their default separation from every surface.
                for line in app.VISOR_LINES:
                    self.assertGreaterEqual(app.relative_luminance(t[line]), app.relative_luminance(root[line]) - 1e-12, line)
                    for surface in app.VISOR_BACKGROUNDS:
                        self.assertGreaterEqual(app.contrast_ratio(t[line], t[surface]), app.contrast_ratio(root[line], root[surface]) - 1e-9)
                rows.append((label, accent, t['--brand'], round(text_min, 2)))
        self.assertEqual(len(rows), len(PALETTES))

    def test_the_accent_is_kept_when_it_passes_and_only_lightened_when_it_does_not(self):
        ice = app.derive_visor_tokens({'accent': '#e1ebfa', 'tint': '#0b1220'})
        self.assertEqual((ice['--brand'], ice['--brand-text']), ('#e1ebfa', '#e1ebfa'))
        amber = app.derive_visor_tokens({'accent': '#f0a020', 'tint': '#1a1206'})
        self.assertEqual(amber['--brand'], '#f0a020')
        for accent in ('#1b2a6b', '#2a0f4f', '#e0303a', '#000000'):
            t = app.derive_visor_tokens({'accent': accent, 'tint': '#101010'})
            self.assertGreater(app.oklch(t['--brand-text'])[0], app.oklch(accent)[0], accent)

    def test_derived_colours_follow_the_visors_hues(self):
        for accent, tint in (('#e0303a', '#1a0708'), ('#8a4dff', '#120a24'), ('#f0a020', '#1a1206'), ('#2ecc71', '#06140c')):
            t = app.derive_visor_tokens({'accent': accent, 'tint': tint})
            hue = lambda v: app.oklch(v)[2]
            gap = lambda a, b: min(abs(a - b), 360 - abs(a - b))
            self.assertLess(gap(hue(t['--brand']), hue(accent)), 12, accent)
            self.assertLess(gap(hue(t['--surface']), hue(tint)), 20, tint)

    def test_contrast_helpers_match_wcag_reference_values(self):
        self.assertAlmostEqual(app.contrast_ratio('#000000', '#ffffff'), 21.0, places=6)
        self.assertAlmostEqual(app.contrast_ratio('#777777', '#ffffff'), 4.48, places=2)
        self.assertEqual(app.oklch_hex(*app.oklch('#8a4dff')), '#8a4dff')


class HostedBuildUnaffected(VisorFileCase):
    MARKERS = ('VisorLook', '/api/look', 'visor-look', 'predecessor-visor-colours', '__LOCAL_HEAD__')

    def render_all(self):
        with mock.patch.dict(os.environ, {app.VISOR_LOOK_ENV: str(self.path)}):
            return {mode: app.render_html(None, {'mode': mode, 'tool_version': app.VERSION}) for mode in ('static', 'export', 'shared', 'local')}

    def test_only_local_pages_carry_the_visor_and_others_are_identical_whatever_the_file_says(self):
        outputs = []
        for state in ('valid', 'missing', 'malformed'):
            if state == 'valid': self.write(sample())
            elif state == 'malformed': self.write(b'{nope', raw=True)
            else: self.path.unlink(missing_ok=True)
            pages = self.render_all()
            for mode in ('static', 'export', 'shared'):
                for marker in self.MARKERS:
                    self.assertNotIn(marker, pages[mode], mode + ' ' + marker)
            self.assertIn('VisorLook.start(', pages['local'])
            self.assertNotIn('__LOCAL_HEAD__', pages['local'])
            self.assertEqual('#f0a020' in pages['local'], state == 'valid')
            outputs.append({mode: pages[mode] for mode in ('static', 'export', 'shared')})
        self.assertEqual(outputs[0], outputs[1])
        self.assertEqual(outputs[0], outputs[2])

    def test_the_placeholder_adds_no_bytes_to_the_hosted_page(self):
        template = (ROOT / 'ui.html').read_text(encoding='utf-8')
        self.assertEqual(template.count('__LOCAL_HEAD__'), 1)
        plain = Path(self.tmp.name) / 'ui.html'
        plain.write_text(template.replace('__LOCAL_HEAD__', '', 1), encoding='utf-8', newline='')
        config = {'mode': 'static', 'tool_version': app.VERSION, 'manifest': 'manifest.json'}
        real = app.render_html(None, config)
        with mock.patch.object(app, 'UI_TEMPLATE', plain):
            self.assertEqual(app.render_html(None, config), real)

    def test_files_shipped_to_the_hosted_site_never_mention_the_visor(self):
        shipped = ('ui.js', 'mobile.js', 'mobile.css', 'companion_simple.js', 'companion_simple.css', 'companion_state.js',
                   'recommendation_view.js', 'skill_guide.js', 'engine.js', 'rank_view.js', 'projection_client.js',
                   'static_client.js', 'sw.js', 'app.webmanifest', 'static_publish.py')
        for name in shipped:
            self.assertNotRegex((ROOT / name).read_text(encoding='utf-8'), re.compile('visor', re.I), name)

    def test_the_inline_script_cannot_close_its_own_element(self):
        self.assertNotIn('</script', (ROOT / 'visor_look.js').read_text(encoding='utf-8').lower())
        self.write(sample(palette='x' * 40))
        with mock.patch.dict(os.environ, {app.VISOR_LOOK_ENV: str(self.path)}):
            head = app.visor_look_head()
        self.assertEqual(head.lower().count('</script>'), 1)

    def test_look_values_cannot_hijack_the_pages_other_placeholders(self):
        for placeholder in ('__BUNDLE_JSON__', '__APP_CONFIG__', '__UI_JS__', '__MOBILE_CSS__', '__ENGINE_JS__', '__LOCAL_HEAD__'):
            with self.subTest(placeholder):
                self.write(sample(palette='x' + placeholder))
                with mock.patch.dict(os.environ, {app.VISOR_LOOK_ENV: str(self.path)}):
                    page = app.render_html({'marker': 'bundle-ok'}, {'mode': 'local', 'tool_version': app.VERSION})
                self.assertIn('const INITIAL_BUNDLE={"marker":"bundle-ok"};', page)
                self.assertIn('"palette":"x' + placeholder + '"', page)
                self.assertNotIn('function renderCompanion', page[:page.index('const INITIAL_BUNDLE=')])
                self.assertEqual(page.count('VisorLook.start('), 1)

    def test_a_missing_script_file_keeps_the_local_page_working(self):
        with mock.patch.object(app, 'TOOL_DIR', Path(self.tmp.name)):
            self.assertEqual(app.visor_look_head(), '')


class LoopbackEndpoint(VisorFileCase):
    def test_api_look_serves_validated_tokens_on_the_loopback_host_only(self):
        server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.make_handler(object()))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        port = server.server_port

        def get(host='127.0.0.1:%d' % port):
            request = urllib.request.Request('http://127.0.0.1:%d/api/look' % port, headers={'Host': host})
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, response.headers, json.loads(response.read())

        with mock.patch.dict(os.environ, {app.VISOR_LOOK_ENV: str(self.path)}):
            self.assertEqual(get()[2], {'available': False, 'reason': 'missing'})
            self.write(sample())
            status, headers, body = get()
            self.assertEqual(status, 200)
            self.assertTrue(body['available'])
            self.assertEqual(headers['Cache-Control'], 'no-store')
            self.assertIn("connect-src 'self'", headers['Content-Security-Policy'])
            with self.assertRaises(urllib.error.HTTPError) as caught:
                get('localhost:%d' % port)
            self.assertEqual(caught.exception.code, 403)


if __name__ == '__main__':
    unittest.main()
