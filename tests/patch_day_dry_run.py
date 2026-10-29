"""Run a pretend new patch through enrichment and the engine, to see what patch day will do (29 Oct 2026, 1.18).

    python -B tests/fetch_live_bundles.py qa/live-bundles
    python -B tests/patch_day_dry_run.py qa/live-bundles/gold.json 1.18

Read-only on the input. It parses a synthetic official article that says the new patch is live, enriches a copy of
the bundle with it (the reviewed packet in this checkout), then asks the engine what the site and the recheck queue
would show. The statistics in the copy stay on the old patch, as they would be before the first new-patch pull, so
role statistics and calculated tiers read as unavailable. Nothing here is published, and it is not a test.
"""
import copy
import datetime as dt
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import predecessor_meta as m  # noqa: E402

ENGINE = r"""
const Meta=require(process.argv[1]),b=JSON.parse(require('fs').readFileSync(process.argv[2])),e=Meta.create(b);
const q=e.recheckQueue(),count={};for(const i of q)count[i.kind]=(count[i.kind]||0)+1;
const grades=(b.guidance.meta_review?.entries||[]),active=grades.filter(x=>e.metaReview(x.slug,x.role)?.active).length;
const plans=(b.guidance.builds||[]),live=plans.filter(p=>e.buildReview(p.slug,p.role)?.active).length;
const tiers=grades.filter(x=>e.calculatedTier(x.slug,x.role)?.tier).length;
console.log(JSON.stringify({queue:count,patch_change:q.filter(i=>i.kind==='patch-change').map(i=>i.reason),
  reviewed_grades_active:active+'/'+grades.length,reviewed_plans_active:live+'/'+plans.length,calculated_tiers:tiers,
  statistics:e.performancePolicy().label,strategy_review_due:e.strategyReviewDue()},null,1));
"""


def dry_run(path, version, release=dt.date(2026, 11, 4)):
    bundle = json.loads(Path(path).read_text(encoding='utf-8'))
    now = dt.datetime.combine(release, dt.time(18), dt.timezone.utc)
    url = 'https://www.predecessorgame.com/en-US/news/patch-notes/Patch_Notes_' + version
    html = ('<html><body><h1>V%s: Patch Notes</h1><div class="cms-news-rich-text"><p>Update %s is live on %s.</p>'
            '<h2>Hero Balance</h2><h4>Gideon</h4><blockquote><div>Black Hole [Ultimate]<br/>- Damage: 500 &#8594; 480</div>'
            '</blockquote></div></body></html>') % (version, version, release.strftime('%d') + 'th ' + release.strftime('%B %Y'))
    with patch.object(m, 'now_utc', return_value=now):
        article = m.official_parse(html, url)
        assert (article['version'], article['status']) == (version, 'live'), article
        official = copy.deepcopy(bundle['official'])
        article.update(discovered_from='Website index', fetched_at=now.isoformat())
        official.update(live=article, articles=[article, official['live']], kept_articles=[], publisher_news={'status': 'ok', 'entries': []})
        before = {'patch': bundle['official']['live']['version'], 'guidance': bundle['guidance'].get('status')}
        m.enrich_bundle(bundle, official)
    after = {'patch': version, 'guidance': bundle['guidance']['status'], 'packet_patch': bundle['guidance'].get('patch'),
             'supplement_active': (bundle.get('patch_support') or {}).get('active')}
    with tempfile.TemporaryDirectory() as temp:
        out = Path(temp) / 'bundle.json'
        out.write_text(json.dumps(bundle), encoding='utf-8')
        engine = json.loads(subprocess.run(['node', '-e', ENGINE, str(ROOT / 'engine.js'), str(out)], check=True,
                                           capture_output=True, text=True).stdout)
    return {'before': before, 'after': after, 'engine': engine}


if __name__ == '__main__':
    print(json.dumps(dry_run(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else '1.18'), indent=1))
