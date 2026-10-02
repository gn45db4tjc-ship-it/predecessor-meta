"""Freshness Phase 1 (2.42.0): Omeda community builds labelled for a verified live hotfix count as current-patch builds.

On 2 Oct 2026 Omeda labelled all 20 popular builds "v1.17.1" (Hotfix 1.17.1, dated live in the official 1.17 article),
and the parser required exactly "1.17", so every rank said "community alternatives are unavailable"."""
import unittest
import predecessor_meta as m


def bundle(hotfix_status='live'):
    return {'official': {'status': 'verified', 'live': {'version': '1.17', 'hotfixes': [
                {'heading': 'Hotfix v1.17.1', 'release_date': '2026-09-24', 'status': hotfix_status, 'version': '1.17.1'}]}},
            'heroes': {'kira': {'omeda': {'id': 7}}},
            'omeda_items': {str(i): {'display_name': 'Item %d' % i} for i in range(1, 8)}}


def row(version, build_id=1):
    r = {'id': build_id, 'hero_id': 7, 'role': 'carry', 'title': 'Test', 'author': 'Someone', 'updated_at': '2026-10-01T00:00:00Z',
         'game_version': {'name': version}, 'crest_id': 7, 'description': ''}
    r.update({'item%d_id' % i: i for i in range(1, 7)})
    return r


class CommunityBuildLabels(unittest.TestCase):
    def parse(self, rows, b):
        return m.parse_community_builds(rows, b, '1.17', 'https://omeda.city/builds.json', '2026-10-02T00:00:00Z')

    def test_verified_live_hotfix_label_counts_as_current(self):
        builds, issues = self.parse([row('v1.17.1')], bundle())
        self.assertEqual(issues, [])
        self.assertEqual(len(builds), 1)
        self.assertEqual(builds[0]['patch'], '1.17.1')  # the label stays as Omeda gave it; the UI shows "labelled v1.17.1"

    def test_exact_patch_label_still_counts(self):
        builds, _ = self.parse([row('v1.17')], bundle())
        self.assertEqual(len(builds), 1)

    def test_unverified_or_other_patch_labels_are_not_current(self):
        for version in ('v1.17.2', 'v1.16.4', 'v1.18', 'v1.171'):
            builds, _ = self.parse([row(version)], bundle())
            self.assertEqual(builds, [], version)
        # a hotfix the official article only announces (not live) does not count
        builds, _ = self.parse([row('v1.17.1')], bundle(hotfix_status='announced'))
        self.assertEqual(builds, [])


if __name__ == '__main__':
    unittest.main()
