"""Maintainer-only exporter: explicit source directory, never needed by public reproduction.
Only the final immutable snapshot and successful evidence are selected; no secrets/logs.
"""
import argparse,json,pathlib,hashlib,gzip,struct
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--out',default='.');a=p.parse_args();S=pathlib.Path(a.source);D=pathlib.Path(a.out)
for folder in ['bundles','deployments/bsc-testnet','snapshots/initial','expected']:(D/folder).mkdir(parents=True,exist_ok=True)
def rawhash(b):return hashlib.sha256(b).hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
def digest(v):return rawhash(canonical(v))
def read(p):return json.loads(p.read_text())
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,separators=(',',':'))+'\n')
B=S/'deployments/bsc-testnet/t2-full-001/custody';ready=read(B/'ready.json')['payload'];snap=read(S/ready['snapshot']['file']);assert digest(snap)==ready['snapshot']['digest']=='a3e09d8b64310618ffe1f5ca10cb56b6a1495ebbf45bb3c441bb75502872e34e'
cp=read(B/'chain-rebuild/checkpoint/index.json')['metadata'];assert cp['step']==0 and not cp['active'];assert snap['slotNext']==10419 and snap['pageNext']==51567
files=[S/ready['snapshot']['file']]+[B/'snapshot'/c['file'] for kind in ['slots','pages'] for c in snap[kind]]
parts=[];buf=bytearray();entries=[]
def flush():
 global buf,entries
 if not entries:return
 data=gzip.compress(bytes(buf),compresslevel=6,mtime=0);name=f'snapshot-{len(parts):03d}.bin.gz';assert len(data)<=32*1024*1024
 target=D/'bundles'/name;assert not target.exists();target.write_bytes(data);parts.append(dict(file=name,bytes=len(data),rawBytes=len(buf),sha256=rawhash(data),files=entries));buf=bytearray();entries=[]
for f in files:
 raw=f.read_bytes()
 if len(buf)+len(raw)+4>16*1024*1024:flush()
 if f.name.startswith(('pages-','slots-')):assert digest(json.loads(raw))==f.stem.rsplit('-',1)[1]
 entries.append(dict(name=f.name,bytes=len(raw),sha256=rawhash(raw)));buf+=struct.pack('<I',len(raw))+raw
flush()
manifest=dict(schema='droso-snapshot-bundle-v1',dataset='male-cns:v1.0',sourceCommit='21bebb771f9687fb978a3e51b8c5f980d442f6e5',sourceSnapshotDigest=ready['snapshot']['digest'],block=ready['block'],snapshotFile=pathlib.Path(ready['snapshot']['file']).name,parts=parts,rawBytes=sum(x['rawBytes'] for x in parts),compressedBytes=sum(x['bytes'] for x in parts),transformation='Byte-exact selected final snapshot manifest/chunks, length-prefixed files in independent gzip parts. No execution plan duplicated.')
write(D/'bundles/export-manifest.json',manifest)
rebuild=read(B/'rebuild-report.json')['payload'];run=read(B/'local-run/run.json')['payload'];expected=[dict(step=x['step'],bodyStateSha256=x['bodyStateSha256'],spikes=x['spikes']) for x in run['steps']];assert [x['spikes'] for x in expected]==[77465,32695]
write(D/'expected/steps.json',{'serialization':'UTF8(decimal bodyId + ":" + signed decimal voltage + ":" + decimal spike + "\\n"), in packed execution index order; no header. Original bodyId = ids[packedToOriginal[n]].','steps':expected})
for f in ['ready.json','rebuild-report.json']:
 write(D/'deployments/bsc-testnet'/f,read(B/f))
write(D/'deployments/bsc-testnet/local-acceptance-signed.json',read(B/'local-run/run.json'))
d=read(B/'deployment.json')['payload'];acc=read(B/'acceptance.json')['payload'];
summary={'schema':'droso-derived-deployment-summary-v1','derivedNotOriginalSignature':True,'sourceRecordSha256':rawhash((B/'acceptance.json').read_bytes()),'candidate':d['candidate'],'binding':d['binding'],'addresses':{k:d['context'][k] for k in ['factory','cpu','transistors','brain','data']},'historicalReady':ready['state'],'finalObserved':acc['current'],'counts':{'slots':10419,'pages':51567,'neurons':166700,'records':25582938},'acceptanceStatus':acc['status'],'publicNeuralSteps':0,'parameterApproval':False,'measurements':{'snapshotMs':ready['elapsedMs'],'snapshotRpc':ready['rpc'],'rebuildMs':rebuild['result']['elapsedMs'],'localMs':run['totalMs'],'localPeakRssBytes':run['peakRssBytes']},'costs':{k:v for k,v in acc['costs'].items() if k!='archive'}}
write(D/'deployments/bsc-testnet/deployment.json',summary)
locator=read(S/'artifacts/malecns/20260917-t2/preflight.json');report=read(S/locator['planFile']);lock=report['dependencyLock'];write(D/'deployments/bsc-testnet/protocol-lock.json',lock)
for f in (S/'.runtime/t2/t2-full-001').rglob('checkpoint-b3a07a68cfb401554a5e478577369dc0431b4897a1509df9be131da9720ca3ab.json'):
 fp=read(f)['context']['adapter']['fingerprint'];write(D/'deployments/bsc-testnet/custody-fingerprint.json',{k:fp[k] for k in ['cpuHash','transistorHash','brainHash','configDigest']})
write(D/'deployments/bsc-testnet/page-config.json',report['identity']['pageConfig'])
release={'schema':'droso-release-v1','exportDigest':digest(manifest),'snapshotDigest':ready['snapshot']['digest'],'binding':snap['binding'],'modelBinding':d['binding'],'initial':{'step':0,'active':False,'ready':True},'executionDigest':rebuild['result']['executionDigest'],'checkpointDigest':rebuild['result']['checkpointDigest'],'stateDigest':read(B/'chain-rebuild/reconstruction.json')['stateDigest'],'expectedDigest':digest(read(D/'expected/steps.json')),'publisher':'0x4F9eD825a28Ed593ec293B824BFc0363e1CE880b','plan':d['plan']}
write(D/'snapshots/initial/release.json',release)
print(json.dumps({'parts':len(parts),'rawBytes':manifest['rawBytes'],'compressedBytes':manifest['compressedBytes'],'exportDigest':release['exportDigest']}))
