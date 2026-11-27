"""Validate a public data branch; import no code, settings, credentials or drafts."""
import hashlib
import json
from pathlib import Path

import static_publish as p


def readable_time(stamp):
    """An attempt or collection time as a UTC datetime, or None when it is missing or unreadable: not text, not an
    ISO time, or out of range (VERIFY-6: a number, an object or an extreme offset raised before)."""
    if not stamp:
        return None
    try:
        return p.utc_time(stamp)
    except Exception:
        return None


def dated_statz(bundle, key):
    """True when the bundle's own Statz source carries a readable fetch date (an observation, not only a stop)."""
    return readable_time(((bundle.get('sources') or {}).get(key) or {}).get('fetched_at')) is not None


def keeps_statz_sample(published, bundle):
    """The upload's frozen Statz sample is from the published sample's patch and is no smaller: as many tier rows
    and as many hero pages. A first discontinuation may move a Statz date back within that patch, never further.
    When either hero-page count is unknown the sample cannot be shown to be no smaller, so it is not kept."""
    def pages(b):
        # The derived coverage count when publication stamped one, else the source record's own count.
        record=(b.get('sources') or {}).get('statz_hero_pages') or {}
        for ok in ((record.get('coverage') or {}).get('ok'),record.get('ok')):
            if type(ok) is int:
                return ok
        return None
    if not bundle.get('patch') or bundle.get('patch')!=published.get('patch'):
        return False
    if len(bundle.get('tier_list') or [])<len(published.get('tier_list') or []):
        return False
    return pages(published) is not None and pages(bundle) is not None and pages(bundle)>=pages(published)


def refusing_sources(older, published, bundle):
    """The older sources that still refuse an upload which first marks Statz discontinued, decided per source:
    a Statz source is exempt only while its published copy is not discontinued, the upload carries its own dated
    observation, and its frozen sample keeps the published sample's patch, tier rows and hero pages."""
    keeps=keeps_statz_sample(published,bundle)
    return [key for key in older if not (key in ('statz_tierlist','statz_hero_pages')
            and ((published.get('sources') or {}).get(key) or {}).get('status')!='discontinued'
            and dated_statz(bundle,key) and keeps)]


def first_discontinuation_refusals(older, published, bundle):
    """The sources that refuse an upload marking Statz discontinued. The older ones are decided by refusing_sources.
    A Statz source with the same date as its published, not yet discontinued copy is checked by the same bound,
    so a first discontinuation never erases published Statz rows by keeping their date (VERIFY-8, R1)."""
    candidates=list(older)
    for key in ('statz_tierlist','statz_hero_pages'):
        theirs=((published.get('sources') or {}).get(key) or {})
        mine=((bundle.get('sources') or {}).get(key) or {})
        same=readable_time(mine.get('fetched_at')) is not None and readable_time(mine.get('fetched_at'))==readable_time(theirs.get('fetched_at'))
        if key not in candidates and same and theirs.get('status')!='discontinued':
            candidates.append(key)
    return refusing_sources(candidates,published,bundle)


def own_import(record, published, row):
    """True only when the published bundle is the one this importer stored from this very receipt file.

    Before it stores a bundle, import_feed records it (static_publish.import_record_path): the receipt's sha256 of the
    file, its generated_at and collector, and the sha256 of the content it is about to store. The published bundle is
    the receipt's own only when the record names this receipt file and the published content is a recorded content.
    A review replay at publication adds its copy's content before storing it (static_publish.store_review_replay), so
    a replayed copy still counts. A bundle stored any other way with other content, or with no record, never counts,
    whatever fields it shares (VERIFY-3 R2, VERIFY-6, VERIFY-8). A record that could not be written leaves the
    bundle unstored (VERIFY-9)."""
    if not isinstance(record,dict) or not published or not row.get('sha256') or not isinstance(record.get('contents'),list):
        return False
    return (record.get('sha256')==row.get('sha256') and record.get('generated_at')==published.get('generated_at')
            and record.get('collector')==published.get('collector') and p.bundle_digest(published) in record['contents'])


def receipt_problem(receipt):
    """Why a parsed collector.json cannot be imported, or None. The whole receipt is checked before anything is read
    from it, so a wrong-shaped field (bundles as a list, an attempt that is not an object) is one rejection with its
    reason, never an exception halfway through the brackets (audit #239 F3)."""
    if not isinstance(receipt,dict) or receipt.get('schema')!=1 or not isinstance(receipt.get('bundles'),dict):
        return 'Local collector receipt schema changed'
    if not readable_time(receipt.get('checked_at')):
        # A receipt without a readable check time is invalid, refused like a changed schema.
        return 'Local collector receipt time is unreadable'
    if not all(isinstance(row,dict) for row in receipt['bundles'].values()):
        return 'Local collector receipt has a bundle row that is not an object'
    attempts=receipt.get('attempts',{})
    if attempts is None: attempts={}
    if not isinstance(attempts,dict) or not all(isinstance(a,dict) for a in attempts.values()):
        return 'Local collector receipt attempts are not objects'
    for attempt in attempts.values():
        errors=attempt.get('errors',[])
        if not isinstance(errors,list) or not all(isinstance(e,dict) for e in errors):
            return 'Local collector receipt attempt errors are not a list of objects'
    return None


def reject_receipt(state_folder,reason):
    """Record a refused receipt beside the last valid one and change nothing else: no bundle, attempt, clock or
    previous collector check moves, and the cloud publisher runs as if no receipt had come. The reason reaches the
    manifest (local_receipt_rejected) so the owner sees it."""
    state=p.load_state(state_folder,{'schema':1,'attempts':{}})
    state['local_receipt_rejected']={'at':p.base.iso(p.base.now_utc()),'reason':str(reason)[:300]}
    p.write_json(state_folder/'publication.json',state)
    return {'status':'rejected','reason':state['local_receipt_rejected']['reason']}


def import_feed(feed, state_folder):
    """Import a Windows feed. A receipt that cannot be trusted is refused as a whole (reject_receipt) and returns
    status "rejected" instead of raising, so publish.yml's cloud path still runs (audit #239 F3)."""
    feed=Path(feed);state_folder=Path(state_folder)
    receipt_path=feed/'collector.json'
    if receipt_path.is_symlink() or not receipt_path.is_file() or receipt_path.stat().st_size>1_000_000:
        return reject_receipt(state_folder,'Local collector receipt is missing or invalid')
    try:
        receipt=json.loads(receipt_path.read_text(encoding='utf8'))
    except (OSError,ValueError) as error:
        return reject_receipt(state_folder,'Local collector receipt is not readable JSON: '+str(error)[:200])
    problem=receipt_problem(receipt)
    if problem:
        return reject_receipt(state_folder,problem)
    checked=readable_time(receipt.get('checked_at'))
    state=p.load_state(state_folder,{'schema':1,'attempts':{}})
    previous=state.get('local_collector')
    previous=readable_time(previous.get('checked_at')) if isinstance(previous,dict) else None
    # An unreadable saved check time never blocks a valid receipt (VERIFY-8).
    if previous and previous>checked:
        return {'status':'older receipt ignored'}
    results={};attempts={};same_bundle=set()
    for bracket in p.CONFIG['brackets']:
        source=(receipt.get('attempts') or {}).get(bracket) or {}
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
            if old and p.base.bundle_statz_discontinued(bundle):
                # PRED-M8 (#232): when Statz stops a bracket (Paragon+ after 1.18), the upload that first marks it
                # discontinued carries the collector's last Statz date, which can be older than a Statz sample
                # published before the stop (Paragon+: 4 Nov 11:30Z against 5 Nov 02:52Z). That upload records the
                # newer fact that the source ended, so its older Statz date alone never refuses it; once published as
                # discontinued, the rule applies again. Every other source keeps the rule, and so does a
                # discontinuation that carries no dated Statz observation of its own (or no tier rows where some are
                # published): accepting it would erase the published sample, so it is refused (VERIFY-3 R1). The same
                # bound holds when the Statz date is unchanged (VERIFY-8).
                older=first_discontinuation_refusals(older,old,bundle)
            if old and p.utc_time(old['generated_at'])==p.utc_time(bundle['generated_at']) and own_import(
                    p.read_import_record(state_folder,bracket),old,row):
                same_bundle.add(bracket)
            if old and p.utc_time(old['generated_at'])>=p.utc_time(bundle['generated_at']):
                results[bracket]='retained newer or identical bundle'
            elif older:
                # A newer assembly date never makes an older source fresh: published source dates only move forward.
                results[bracket]='retained published bundle: imported '+', '.join(older)+' older than published'
            else:
                # The record is written before the bundle is stored: if it cannot be written, nothing is stored and
                # the bracket fails as a whole, so a stored bundle never lacks its record (VERIFY-9).
                p.write_import_record(state_folder,bracket,{'sha256':row.get('sha256'),
                    'generated_at':bundle['generated_at'],'collector':bundle.get('collector'),
                    'contents':[p.bundle_digest(p.stored_form(bundle))]})
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
    # An unreadable time never advances the clock, and an unreadable stored time never blocks a readable newer one.
    incoming_time,existing_time=readable_time(incoming_at),readable_time(existing_at)
    newer_clock=bool(incoming_time and (not existing_time or incoming_time>existing_time))
    accepted=False
    # Only an imported or failed upload replaces a different, older attempt. The receipt's own attempt also replaces
    # an equal-time attempt once its bundle is the published one: the same receipt read earlier without its bundle
    # (publish.yml skipped master.json until #225) must not keep that failure after the bundle arrives (#228).
    for bracket,attempt in attempts.items():
        result=results.get(bracket)
        current=state.setdefault('attempts',{}).get(bracket,{})
        stamp=attempt.get('at');current_stamp=current.get('at')
        # An unreadable attempt time never matches, never counts as newer, and never stops the other brackets.
        stamp_time,current_time=readable_time(stamp),readable_time(current_stamp)
        same_time=bool(bracket in same_bundle and stamp_time and current_time and stamp_time==current_time)
        if result in ('imported','failed'):
            replace=not current or bool(stamp_time and (not current_time or stamp_time>current_time))
        else:
            replace=False
        if replace or same_time:
            state['attempts'][bracket]=attempt
            accepted=accepted or result=='imported' or same_time
    # The receipt's collection clock moves forward when one of its own bundles speaks for a bracket: imported now, or
    # its same-time attempt accepted beside the bundle it imported earlier (Muse on a5c076a, VERIFY-6 F5).
    if newer_clock and (imported or accepted):
        state['last_full_attempt_at']=incoming_at
        state['last_full_seconds']=receipt.get('last_full_seconds')
    state['local_collector']={'checked_at':receipt['checked_at'],'status':'connected','results':results}
    state.pop('local_receipt_rejected',None)
    p.write_json(state_folder/'publication.json',state)
    return state['local_collector']


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('feed',type=Path)
    parser.add_argument('--state-dir',type=Path,default=p.ROOT/'.cloud-state')
    args=parser.parse_args()
    result=import_feed(args.feed,args.state_dir)
    if result.get('status')=='rejected':
        # A GitHub warning annotation, so a refused Windows receipt is visible on the run (the cloud path continues).
        print('::warning::Windows collector receipt rejected; the cloud publisher continues: '+result['reason'])
    print(json.dumps(result))
