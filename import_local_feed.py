"""Validate a public data branch; import no code, settings, credentials or drafts."""
import hashlib
import json
from pathlib import Path

import static_publish as p


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
    results={};attempts={}
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
            bundle=p.validate_public_bundle(json.loads(raw),bracket)
            if bundle['generated_at']!=row.get('generated_at'):
                raise ValueError('Local bundle date differs from receipt')
            old=p.load_success(state_folder,bracket)
            if old and p.utc_time(old['generated_at'])>=p.utc_time(bundle['generated_at']):
                results[bracket]='retained newer or identical bundle'
            else:
                p.retain_success(bundle,state_folder)
                results[bracket]='imported'
        except Exception as error:
            results[bracket]='failed'
            attempts[bracket].update(status='failed')
            attempts[bracket]['errors'].append({'source':'Local collector '+bracket,'severity':'error','detail':str(error)})
    state['attempts']=attempts
    state['last_full_attempt_at']=receipt.get('last_full_attempt_at')
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
