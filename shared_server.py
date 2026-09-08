"""Browser-only shared service. Public game data; drafts stay in each browser.

Default: loopback preview. Non-loopback hosting requires an explicit HTTPS origin
behind a reverse proxy. No owner settings, files, shutdown or import API is served.
"""
import argparse,copy,gzip,hashlib,importlib.util,json,os,queue,re,secrets,threading,time
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit,parse_qs
import predecessor_meta as base

ROOT=Path(__file__).resolve().parent
PUBLIC_FIELDS=set(('schema tool_version generated_at offline patch patch_conflicts bracket sources errors roles_order role_label tier_order thresholds heroes tier_list pairs pairs_meta pool_ratio pool_note matchup_note perks items omeda_items image_index failed_pages cache official guidance official_changes official_hotfix_changes corrections unverified_changes mechanics_resolutions mechanics_boundaries loadout_catalog description_reviews reviewed_definitions definition_review definition_issues community_builds scoped_statistics sampling_policy pred_game_data timings changes scoped_changes refresh_result saved_source_review session_notice latest_attempt legacy').split())

def public_bundle(bundle):
    return {k:v for k,v in bundle.items() if k in PUBLIC_FIELDS} if bundle else None

class DataDirectoryLock:
    """OS-held lock: crash-safe and portable, never a stale PID sentinel."""
    def __init__(self,folder):
        folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
        self.handle=(folder/'shared.lock').open('a+b')
        try:
            if not os.fstat(self.handle.fileno()).st_size:self.handle.write(b'0');self.handle.flush()
            self.handle.seek(0)
            if os.name=='nt':
                import msvcrt;msvcrt.locking(self.handle.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl;fcntl.flock(self.handle.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            self.handle.close();raise RuntimeError('Another shared service already owns this data folder') from None
    def close(self):self.handle.close()
    def __enter__(self):return self
    def __exit__(self,*args):self.close()

def seed_bundle(path,folder):
    b=base.load_bundle(Path(path));bracket=b.get('bracket',{}).get('segment')
    if bracket not in base.BRACKETS or b.get('schema')!=3 or not isinstance(b.get('heroes'),dict):
        raise ValueError('Seed must be a generated, labelled app bundle')
    target=folder/bracket/('last_successful_'+bracket+'.json')
    if target.exists():return False
    if not base.bundle_is_complete(b)[0]:raise ValueError('Seed must be a complete source bundle')
    base.atomic_write(target,json.dumps(public_bundle(b),ensure_ascii=False));return True

class SharedManager:
    def __init__(self,folder,no_fetch=False,app_factory=None):
        self.folder=Path(folder).resolve();self.folder.mkdir(parents=True,exist_ok=True)
        self.no_fetch=no_fetch;self.factory=app_factory or self.create_app
        self.apps={};self.encoded={};self.lock=threading.RLock();self.jobs=queue.Queue()
        self.queued=set();self.active=None;self.closed=False;self.pause_until=0;self.pause_errors=[]
        self.instance=secrets.token_hex(12);self.csrf=secrets.token_urlsafe(32)
        try:
            state=json.loads((self.folder/'source_pause.json').read_text(encoding='utf8'))
            if set(state)!={'until','errors'} or type(state['until']) not in (float,int) or not 0<=state['until']<=time.time()+3605 or not isinstance(state['errors'],list):raise ValueError('Invalid shared retry state')
            if any(not isinstance(e,dict) or not all(isinstance(e.get(k),str) for k in ('source','severity','detail')) for e in state['errors']):raise ValueError('Invalid shared error record')
            self.pause_until=state['until'];self.pause_errors=state['errors']
        except FileNotFoundError:pass
        except (OSError,ValueError,TypeError) as exc:
            self.pause_until=time.time()+900;self.pause_errors=[{'source':'Shared refresh recovery','severity':'error','detail':'Shared retry state could not be read: '+str(exc)}]
        self.worker=threading.Thread(target=self.run,daemon=True);self.worker.start()
    def create_app(self,bracket):
        # Separate module state prevents one visitor's rank selection from
        # changing another cohort's paths, settings or current bundle.
        spec=importlib.util.spec_from_file_location('shared_meta_'+bracket,ROOT/'predecessor_meta.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        folder=self.folder/bracket;folder.mkdir(parents=True,exist_ok=True)
        module.DATA_DIR=folder;module.SNAP_DIR=folder/'snapshots';module.LATEST_BUNDLE=folder/'latest_bundle.json'
        module.SETTINGS_FILE=folder/'settings.json';module.OUT_HTML=folder/'snapshot.html'
        return module.AppState(dict(module.DEFAULT_SETTINGS,bracket=bracket,open_browser=False),self.no_fetch)
    def app(self,bracket):
        if bracket not in base.BRACKETS:raise ValueError('Unsupported rank bracket')
        with self.lock:
            if bracket not in self.apps:self.apps[bracket]=self.factory(bracket)
            return self.apps[bracket]
    def request(self,bracket,automatic=False):
        app=self.app(bracket)
        with self.lock:
            status=app.status_snapshot();state=status['freshness']
            if self.no_fetch or self.pause_until>time.time() or state['state'] in ('disabled','retry_wait'):
                return {'started':False,'message':'Source retry policy applies; saved dates are unchanged.'}
            if bracket in self.queued or self.active==bracket:return {'started':False,'message':'This cohort already has a refresh request.'}
            if automatic and not state['due']:return {'started':False,'message':'Current collection is recent.'}
            if state['state']=='fresh' and base.timestamp_age(app.last_completed_at) is not None and base.timestamp_age(app.last_completed_at)<60:
                return {'started':False,'message':'Reusing the recently completed collection.'}
            self.queued.add(bracket);self.jobs.put(bracket)
            return {'started':True,'message':'Shared source check queued.'}
    def checkpoint(self,until,errors):
        base.atomic_write(self.folder/'source_pause.json',json.dumps({'until':until,'errors':errors},ensure_ascii=False))
    def pause(self,errors):
        blocked=any(re.search(r'403|429|blocked|rate.limit',e.get('detail',''),re.I) for e in errors)
        with self.lock:
            self.pause_until=time.time()+(3600 if blocked else 900);self.pause_errors=copy.deepcopy(errors)
            try:self.checkpoint(self.pause_until,self.pause_errors)
            except OSError as exc:self.pause_errors.append({'source':'Shared refresh recovery','severity':'error','detail':'Could not save shared retry pause: '+str(exc)})
    def run(self):
        while True:
            bracket=self.jobs.get()
            if bracket is None:return
            with self.lock:
                self.queued.discard(bracket)
                if self.closed:return
                if self.pause_until>time.time():continue
                self.active=bracket;app=self.app(bracket)
            try:
                # A single shared worker starts collections. AppState preserves
                # its own checkpoint/backoff; no request can force a full pull.
                self.checkpoint(time.time()+900,[{'source':'Shared refresh recovery','severity':'error','detail':'A previous shared collection was interrupted. Source dates are unchanged; automatic requests are paused.'}])
                if app.wake()['started']:
                    with app.refresh_lock:pass
                status=app.status_snapshot();errors=[e for e in status.get('errors',[]) if e.get('severity')=='error']
                if errors:self.pause(errors)
                else:self.checkpoint(0,[])
            except Exception as exc:
                self.pause([{'source':'Shared collector','severity':'error','detail':str(exc)}])
            finally:
                with self.lock:self.active=None;self.encoded.pop(bracket,None)
    def status(self,bracket):
        app=self.app(bracket);status=app.status_snapshot()
        with self.lock:
            status['revision']=bracket+':'+str(app.revision)
            status['instance_id']=self.instance;status['shared']=True
            status['busy']=status['busy'] or bracket in self.queued or self.active==bracket
            if bracket in self.queued and self.active!=bracket:status['message']='Waiting for the shared collector. Saved '+bracket+' data remains available.'
            if self.pause_until>time.time() and not status['busy']:
                status['freshness']=dict(status['freshness'],state='disabled' if self.no_fetch else 'retry_wait',due=False,retry_seconds_remaining=self.pause_until-time.time())
                status['errors']=[*status.get('errors',[]),*self.pause_errors]
                status['message']='Shared source retry pause. Showing each source’s original fetch date.'
            return status
    def bundle(self,bracket):return public_bundle(self.app(bracket).bundle)
    def wire_bundle(self,bracket):
        app=self.app(bracket)
        with self.lock:
            key=app.revision
            if bracket not in self.encoded or self.encoded[bracket][0]!=key:
                raw=json.dumps(public_bundle(app.bundle),ensure_ascii=False).encode('utf8')
                self.encoded[bracket]=(key,raw,gzip.compress(raw,compresslevel=5,mtime=0),hashlib.sha256(raw).hexdigest())
            return self.encoded[bracket][1:]
    def close(self):
        with self.lock:self.closed=True
        self.jobs.put(None)

def make_handler(manager,origin):
    host=urlsplit(origin).netloc
    class Handler(BaseHTTPRequestHandler):
        def setup(self):super().setup();self.connection.settimeout(15)
        def log_message(self,*args):pass
        def send(self,code,value,kind='application/json; charset=utf-8',encoded=False,etag=None):
            raw=value if isinstance(value,bytes) else (json.dumps(value,ensure_ascii=False) if kind.startswith('application/json') else value).encode('utf8')
            compress='gzip' in self.headers.get('Accept-Encoding','')
            if not encoded and compress:raw=gzip.compress(raw,compresslevel=5,mtime=0)
            self.send_response(code);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(raw)))
            self.send_header('Cache-Control','no-store');self.send_header('Vary','Accept-Encoding')
            if compress:self.send_header('Content-Encoding','gzip')
            if etag:self.send_header('ETag','"'+etag+'"')
            self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            self.end_headers()
            try:self.wfile.write(raw)
            except (OSError,TimeoutError):pass
        def valid_host(self):return self.headers.get('Host','').lower()==host.lower()
        def bracket(self):
            values=parse_qs(urlsplit(self.path).query).get('bracket',['gold'])
            if len(values)!=1 or values[0] not in base.BRACKETS:raise ValueError('Choose a supported rank bracket')
            return values[0]
        def do_GET(self):
            if not self.valid_host():return self.send(403,{'error':'Invalid shared host'})
            path=urlsplit(self.path).path
            try:
                if path=='/health':return self.send(200,{'app':'predecessor-shared','version':base.VERSION})
                if path=='/':return self.send(200,base.render_html(None,{'mode':'shared','token':manager.csrf,'revision':0,'instance_id':manager.instance,'tool_version':base.VERSION}),'text/html; charset=utf-8')
                if path=='/api/status':return self.send(200,manager.status(self.bracket()))
                if path=='/api/bundle':
                    raw,zipped,etag=manager.wire_bundle(self.bracket())
                    return self.send(200,zipped if 'gzip' in self.headers.get('Accept-Encoding','') else raw,encoded=True,etag=etag)
                if path=='/api/comparison':
                    bracket=self.bracket();b=manager.bundle(bracket)
                    return self.send(200,{'bracket':bracket,'bundle':{'generated_at':b['generated_at'],'patch':b['patch'],'tier_list':b['tier_list']} if b else None})
                if path=='/export':
                    b=manager.bundle(self.bracket())
                    if not b:return self.send(409,{'error':'No source bundle is available yet'})
                    return self.send(200,base.render_html(b),'text/html; charset=utf-8')
                return self.send(404,{'error':'Not found'})
            except (ValueError,OSError) as exc:return self.send(400,{'error':str(exc)})
        def do_POST(self):
            if not self.valid_host() or self.headers.get('Origin')!=origin or not secrets.compare_digest(self.headers.get('X-Session-Token',''),manager.csrf):
                return self.send(403,{'error':'Same-origin shared session required'})
            if urlsplit(self.path).path not in ('/api/wake','/api/ensure-fresh','/api/refresh','/api/settings'):
                return self.send(404,{'error':'This shared app does not expose owner controls or save visitor drafts on the server'})
            if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.send(415,{'error':'JSON required'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=1024:raise ValueError('Request size is invalid')
                value=json.loads(self.rfile.read(length))
                if not isinstance(value,dict) or set(value)-{'bracket'}:raise ValueError('Only a rank bracket may be requested')
                bracket=value.get('bracket','gold')
                result=manager.request(bracket,automatic=urlsplit(self.path).path=='/api/ensure-fresh')
                return self.send(202 if result['started'] else 200,result)
            except (ValueError,TypeError,TimeoutError) as exc:return self.send(400,{'error':str(exc)})
    return Handler

class SharedServer(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,*args,**kwargs):self.capacity=threading.BoundedSemaphore(24);super().__init__(*args,**kwargs)
    def process_request(self,request,address):
        if not self.capacity.acquire(False):request.close();return
        try:super().process_request(request,address)
        except Exception:self.capacity.release();raise
    def process_request_thread(self,request,address):
        try:super().process_request_thread(request,address)
        finally:self.capacity.release()

def main(argv=None):
    parser=argparse.ArgumentParser(description='Predecessor shared browser service')
    parser.add_argument('--data-dir',type=Path,default=ROOT/'shared-data')
    parser.add_argument('--host',default='127.0.0.1');parser.add_argument('--port',type=int,default=int(os.getenv('PORT','4190')))
    parser.add_argument('--origin',default=os.getenv('PUBLIC_ORIGIN'));parser.add_argument('--no-fetch',action='store_true');parser.add_argument('--no-open',action='store_true');parser.add_argument('--seed',type=Path)
    args=parser.parse_args(argv)
    if args.origin:
        parsed=urlsplit(args.origin)
        if parsed.scheme not in ('http','https') or not parsed.netloc or parsed.path not in ('','/') or parsed.query or parsed.fragment or parsed.username:parser.error('Origin must be an HTTP(S) origin without a path or credentials')
        args.origin=args.origin.rstrip('/')
    if args.host not in ('127.0.0.1','localhost') and (not args.origin or urlsplit(args.origin).scheme!='https'):
        parser.error('Non-loopback hosting needs an explicit HTTPS origin and a TLS reverse proxy')
    # Held for the process lifetime, including background collector shutdown.
    try:directory_lock=DataDirectoryLock(args.data_dir.resolve())
    except RuntimeError as exc:parser.error(str(exc))
    if args.seed:seed_bundle(args.seed,args.data_dir.resolve())
    manager=SharedManager(args.data_dir,args.no_fetch)
    server=SharedServer((args.host,args.port),BaseHTTPRequestHandler)
    origin=args.origin or 'http://127.0.0.1:'+str(server.server_port);server.RequestHandlerClass=make_handler(manager,origin)
    print('OPEN '+origin,flush=True)
    if not args.no_open and args.host in ('127.0.0.1','localhost'):
        import webbrowser;webbrowser.open(origin)
    try:server.serve_forever(poll_interval=.2)
    except KeyboardInterrupt:pass
    finally:manager.close();server.server_close()
if __name__=='__main__':main()
