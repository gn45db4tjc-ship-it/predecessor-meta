"""Regression contract for the production cross-branch cache rollback.

Local-only source monotonicity checks are insufficient when two ref-scoped caches
alternate publication. Every arrival must dispatch the canonical main workflow.
Actual event/ref/cache behavior is verified with a GitHub runner receipt.
"""
import unittest
from pathlib import Path

class CanonicalPublisherScope(unittest.TestCase):
    def test_data_arrival_dispatches_main_instead_of_inheriting_data_branch_scope(self):
        text=(Path(__file__).resolve().parents[1]/'.github/workflows/data-arrived.yml').read_text()
        self.assertIn('gh workflow run publish.yml --repo "$GITHUB_REPOSITORY" --ref main',text)
        self.assertIn('actions: write',text)
        self.assertNotIn('uses:',text,'A reusable workflow would inherit data-updates cache scope again')
        self.assertNotIn('pages: write',text,'Dispatcher itself must not deploy')
        self.assertNotIn('id-token: write',text)

    def test_release_refresh_marker_reaches_collector_environment(self):
        lines=(Path(__file__).resolve().parents[1]/'.github/workflows/publish.yml').read_text().splitlines()
        start=next(i for i,line in enumerate(lines) if line.strip()=='env:' and 'MANUAL_REFRESH:' in lines[i+1])
        parent_indent=len(lines[start])-len(lines[start].lstrip())
        environment={}
        for line in lines[start+1:]:
            if line.strip() and len(line)-len(line.lstrip()) <= parent_indent:
                break
            if ':' in line:
                key,value=line.strip().split(':',1)
                environment[key]=value.strip()
        self.assertIn('COLLECTION_RELEASE',environment,'The release marker must be nested under the collection step env, or fresh release collection never starts')
        self.assertIn('MANUAL_REFRESH',environment)
        self.assertIn('DIAGNOSE_PRED',environment)
        self.assertTrue(environment['COLLECTION_RELEASE'].strip("'\""))
