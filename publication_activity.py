"""Write a tiny public activity record. No samples, drafts, tokens or owner settings."""
import json
from pathlib import Path


def record(root):
    root = Path(root)
    state = json.loads((root / '.cloud-state' / 'publication.json').read_text(encoding='utf8'))
    value = {'last_full_attempt_at': state['last_full_attempt_at'],
             'patch_check_status': state.get('patch_check', {}).get('status'),
             'brackets': {k: v.get('status') for k, v in state.get('attempts', {}).items()}}
    (root / 'publication-activity.json').write_text(json.dumps(value, indent=2)+'\n', encoding='utf8')
    return value


if __name__ == '__main__': record(Path.cwd())
