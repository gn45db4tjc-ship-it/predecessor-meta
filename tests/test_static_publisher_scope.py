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
