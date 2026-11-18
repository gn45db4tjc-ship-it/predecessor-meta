"""Validate a public data branch; import no code, settings, credentials or drafts."""
import hashlib
import json
from pathlib import Path

import static_publish as p


def dated_statz(bundle, key):
    """True when the bundle's own Statz source carries a readable fetch date (an observation, not only a stop)."""
    stamp=((bundle.get('sources') or {}).get(key) or {}).get('fetched_at')
    try:
        return bool(stamp) and bool(p.utc_time(stamp))
    except (TypeError, ValueError):
        return False


def keeps_statz_sample(published, bundle):
    """The upload's frozen Statz sample is from the published sample's patch and is no smaller: as many tier rows
    and as many hero pages. A first discontinuation may move a Statz date back within that patch, never further."""
    def pages(b):
        ok=(((b.get('sources') or {}).get('statz_hero_pages') or {}).get('coverage') or {}).get('ok')
        return ok if type(ok) is int else None
    if not bundle.get('patch') or bundle.get('patch')!=published.get('patch'):
        return False
    if len(bundle.get('tier_list') or [])<len(published.get('tier_list') or []):
        return False
    return pages(published) is None or (pages(bundle) is not None and pages(bundle)>=pages(published))


def refusing_sources(older, published, bundle):
    """The older sources that still refuse an upload which first marks Statz discontinued, decided per source:
    a Statz source is exempt only while its published copy is not discontinued, the upload carries its own dated
    observation, and its frozen sample keeps the published sample's patch, tier rows and hero pages."""
    keeps=keeps_statz_sample(published,bundle)
    return [key for key in older if not (key in ('statz_tierlist','statz_hero_pages')
            and ((published.get('sources') or {}).get(key) or {}).get('status')!='discontinued'
            and dated_statz(bundle,key) and keeps)]


def same_content(published, bundle):
    """True only when the published bundle is this receipt's own collection, not merely one with an equal
    generated_at: two different collections can share a timestamp (VERIFY-3 R2). The comparison covers what a
    collection observed (bracket, collector, every source record, tier rows), which a publication's review replay
    never changes (review_saved_sources rewrites guidance, corrections and notices, so a whole-bundle digest of a
    replayed copy would never match its receipt)."""
    def digest(b):
        observed={'bracket':(b.get('bracket') or {}).get('segment'),'generated_at':b.get('generated_at'),
                  'collector':b.get('collector'),'sources':b.get('sources'),'tier_list':b.get('tier_list')}
        return hashlib.sha256(json.dumps(observed, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf8')).hexdigest()
    return digest(published)==digest(bundle)


def import_feed(feed, state_folder):
    feed=Path(feed);state_folder=Path(state_folder)
    receipt_path=feed/'collector.json'
    if receipt_path.is_symlink() or not receipt_path.is_file() or receipt_path.stat().st_size>1_000_000:
        raise ValueError('Local collector receipt is missing or invalid')
    receipt=json.loads(receipt_path.read_text(encoding='utf8'))
    if receipt.get('schema')!=1 or not isinstance(receipt.get('bundles'),dict):
        raise ValueError('Local collector receipt schema changed')
    p.utc_time(receipt['checked_at'])
    state=p.read_json(state_folder/'publication.json',{'schema':1,'attempts':{}})
    previous=state.get('local_collector',{}).get('checked_at')
    if previous and p.utc_time(previous)>p.utc_time(receipt['checked_at']):
        return {'status':'older receipt ignored'}
    results={};attempts={};same_bundle=set()
    for bracket in p.CONFIG['brackets']:
        source=(receipt.get('attempts') or {}).get(bracket,{})
        attempts[bracket]={k:source.get(k) for k in ('status','at','seconds')}
        attempts[bracket]['errors']=[{k:e.get(k) for k in ('source','severity','detail')}
                                    for e in source.get('errors',[])]
        row=receipt['bundles'].get(bracket)
        if row is None:
            results[bracket]='no successful local bundle'
            continue
        try:
            filename=bracket+'.json'
            if row.get('file')!=filename:
                raise ValueError('Unexpected bundle path')
            path=feed/filename
            if path.is_symlink() or not path.is_file() or path.stat().st_size>64_000_000:
                raise ValueError('Bundle missing, linked, or larger than permitted')
            raw=path.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=row.get('sha256'):
                raise ValueError('Local bundle checksum mismatch')
            bundle=p.validate_publication_bundle(json.loads(raw),bracket)
            if bundle['generated_at']!=row.get('generated_at'):
                raise ValueError('Local bundle date differs from receipt')
            if (bundle.get('collector') or {}).get('host')=='cloud':
                raise ValueError('A Windows feed cannot carry a bundle that claims cloud collection')
            old=p.load_publication(state_folder,bracket)
            older=p.older_sources(old,bundle) if old else []
            if older and p.base.bundle_statz_discontinued(bundle):
                # PRED-M8 (#232): when Statz stops a bracket (Paragon+ after 1.18), the upload that first marks it
                # discontinued carries the collector's last Statz date, which can be older than a Statz sample
                # published before the stop (Paragon+: 4 Nov 11:30Z against 5 Nov 02:52Z). That upload records the
                # newer fact that the source ended, so its older Statz date alone never refuses it; once published as
                # discontinued, the rule applies again. Every other source keeps the rule, and so does a
                # discontinuation that carries no dated Statz observation of its own (or no tier rows where some are
                # published): accepting it would erase the published sample, so it is refused (VERIFY-3 R1).
                older=refusing_sources(older,old,bundle)
            if old and p.utc_time(old['generated_at'])==p.utc_time(bundle['generated_at']) and same_content(old,bundle):
                same_bundle.add(bracket)
            if old and p.utc_time(old['generated_at'])>=p.utc_time(bundle['generated_at']):
                results[bracket]='retained newer or identical bundle'
            elif older:
                # A newer assembly date never makes an older source fresh: published source dates only move forward.
                results[bracket]='retained published bundle: imported '+', '.join(older)+' older than published'
            else:
                p.retain_publication(bundle,state_folder)
                results[bracket]='imported'
                same_bundle.add(bracket)
        except Exception as error:
            results[bracket]='failed'
            attempts[bracket].update(status='failed')
            attempts[bracket]['errors'].append({'source':'Local collector '+bracket,'severity':'error','detail':str(error)})
    # A daily cloud attempt must not be reset by importing the same older Windows
    # receipt on each three-hour patch check. Bundles and attempt clocks each
    # advance monotonically; a newer assembly never makes an old source fresh.
    # Only an upload that was imported (or that failed validation, which the owner must see) speaks for a bracket;
    # a refused or absent upload never replaces the cloud's attempt or moves its collection clock.
    imported=[b for b,r in results.items() if r=='imported']
    incoming_at=receipt.get('last_full_attempt_at')
    existing_at=state.get('last_full_attempt_at')
    newer_attempt=bool(imported and incoming_at and (not existing_at or p.utc_time(incoming_at)>p.utc_time(existing_at)))
    # Only an imported or failed upload replaces a different, older attempt. The receipt's own attempt also replaces
    # an equal-time attempt once its bundle is the published one: the same receipt read earlier without its bundle
    # (publish.yml skipped master.json until #225) must not keep that failure after the bundle arrives (#228).
    for bracket,attempt in attempts.items():
        result=results.get(bracket)
        current=state.setdefault('attempts',{}).get(bracket,{})
        stamp=attempt.get('at');current_stamp=current.get('at')
        same_time=False
        if bracket in same_bundle and stamp and current_stamp:
            try:
                same_time=p.utc_time(stamp)==p.utc_time(current_stamp)
            except (TypeError, ValueError):
                same_time=False   # an unreadable attempt time never matches and never stops the other brackets
        if result in ('imported','failed'):
            replace=not current or (stamp and (not current_stamp or p.utc_time(stamp)>p.utc_time(current_stamp)))
        else:
            replace=False
        if replace or same_time:
            state['attempts'][bracket]=attempt
    if newer_attempt:
        state['last_full_attempt_at']=incoming_at
        state['last_full_seconds']=receipt.get('last_full_seconds')
    state['local_collector']={'checked_at':receipt['checked_at'],'status':'connected','results':results}
    p.write_json(state_folder/'publication.json',state)
    return state['local_collector']


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('feed',type=Path)
    parser.add_argument('--state-dir',type=Path,default=p.ROOT/'.cloud-state')
    args=parser.parse_args()
    print(json.dumps(import_feed(args.feed,args.state_dir)))
