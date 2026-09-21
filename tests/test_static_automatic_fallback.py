import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import local_updater as u

class AutomaticFallback(unittest.TestCase):
    def test_git_trust_is_scoped_to_the_configured_data_checkout(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with patch.object(u,'PRIVATE',root),patch.object(u.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout='ok',stderr='')) as run:
                self.assertEqual(u.git(['status'],root/'data-repo'),'ok')
                command=run.call_args.args[0]
                self.assertIn('safe.directory='+str((root/'data-repo').resolve()),command)
                self.assertNotIn('--global',command)
                with self.assertRaises(ValueError):u.git(['status'],root/'unrelated')
                self.assertEqual(run.call_count,1)

    def test_cli_can_use_existing_credentials_without_copying_them(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous=u.PRIVATE
            try:
                with patch('sys.argv',['updater','--publisher-dir',tmp,'--stop']):u.main()
                self.assertTrue((Path(tmp)/'stop').is_file())
            finally:u.PRIVATE=previous
