"""An Omeda item list with nothing usable is a failure, not a fresh "ok" (Codex audit #239 F10; PRED-M11)."""
import json
import unittest
from unittest import mock

import predecessor_meta as m


def reply(value):
    return mock.patch.object(m, 'http_get', return_value=(json.dumps(value), 200, 0.1))


class OmedaItems(unittest.TestCase):
    def test_a_list_of_empty_rows_fails(self):
        for value in ([{}], [{'id': 1}], [{'id': 1, 'slug': '', 'display_name': 'x'}], ['item'], [None]):
            with self.subTest(value=value), reply(value), self.assertRaises(m.OmedaParseError):
                m.omeda_fetch_items()

    def test_unusable_rows_are_dropped_and_usable_ones_kept(self):
        good = {'id': 7, 'slug': 'tainted-scepter', 'display_name': 'Tainted Scepter'}
        with reply([{}, good, 'x']):
            items, _ = m.omeda_fetch_items()
        self.assertEqual(items, [good])

    def test_ids_that_cannot_key_the_item_index_are_unusable(self):
        # Codex verify of PR #241 (item e): these ids passed, were dropped from the index, and left a fresh "ok".
        for bad in ([1], {'a': 1}, True, 1.5, '', '  '):
            row = {'id': bad, 'slug': 'tainted-scepter', 'display_name': 'Tainted Scepter'}
            with self.subTest(id=bad), reply([row]), self.assertRaises(m.OmedaParseError):
                m.omeda_fetch_items()
        for good in (7, 'item-7'):
            row = {'id': good, 'slug': 'tainted-scepter', 'display_name': 'Tainted Scepter'}
            with self.subTest(id=good), reply([row]):
                self.assertEqual(m.omeda_fetch_items()[0], [row])

    def test_an_empty_or_non_list_reply_still_fails(self):
        for value in ([], {}, 'x'):
            with self.subTest(value=value), reply(value), self.assertRaises(m.OmedaParseError):
                m.omeda_fetch_items()


if __name__ == '__main__':
    unittest.main()
