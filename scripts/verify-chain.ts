import fs from 'node:fs';
import assert from 'node:assert/strict';
import {decodeFunctionResult} from 'viem';
import {snapshot} from '../src/initial.ts';
import {httpRpc,anchor,historicalTag,identity,call,verifySlot,verifyPage,sampleIndices,Unavailable,RpcBudget} from '../src/chain.ts';
import {readJSON,atomic,digest} from '../src/integrity.ts';
import {ba,ca} from '../src/abi.ts';
import {sourceIdentity} from '../src/source-identity.ts';
import {integer,outputPath,acquireLock,checkedCheckpoint,TOTAL_SLOTS,TOTAL_PAGES} from '../src/chain-progress.ts';
const arg=(s:string)=>{const i=process.argv.indexOf(s);return i<0?undefined:process.argv[i+1];};
async function main(){
 const out=outputPath(arg('--out')??'results/chain-'+Date.now()+'.json');assert.ok(out.endsWith('.json'));
 assert.ok(!fs.existsSync(out),'FRESH_OUTPUT_REQUIRED');const unlock=acquireLock(out+'.lock');
 try{await run(out);}finally{unlock();}
}
async function run(out:string){
 const status=process.argv.includes('--status'),mode=arg('--mode')??'sample';assert.ok(['full','sample'].includes(mode));
 const maxRpc=integer(Number(arg('--max-rpc')??30000),300000,'RPC_LIMIT',128),maxMs=integer(Number(arg('--max-ms')??600000),600000,'TIME_LIMIT',1000);
 const concurrency=integer(Number(arg('--concurrency')??8),16,'CONCURRENCY',1);
 const source=sourceIdentity(),started=Date.now();let url=process.env.BSC_TESTNET_RPC_URL;
 if(!url&&fs.existsSync('.env')){const m=/^BSC_TESTNET_RPC_URL\s*=\s*["']?([^\r\n"']+)/m.exec(fs.readFileSync('.env','utf8'));url=m?.[1].trim();}
 if(!url){const r={status:'NOT_RUN',reason:'RPC_NOT_CONFIGURED',mode:status?'current-status':mode,sourceDigest:source.digest};atomic(out,r);console.log(JSON.stringify(r));return;}
 const transport=httpRpc(url,maxRpc),rpc=transport.request;
 let progress:any={mode,slots:0,pages:0,sourceDigest:source.digest},previousDigest:string|null=null;
 const save=(state:string,reason?:string)=>{const {localDigest,...body}=progress;const r={...body,status:state,reason:reason??null,previousDigest,rpcThisInvocation:transport.count(),retries:transport.retries(),elapsedMs:Date.now()-started,at:new Date().toISOString(),limits:{maxRpc,maxMs,concurrency}};const signed={...r,localDigest:digest(r)};atomic(out+'.checkpoint.json',signed);atomic(out,signed);return signed;};
 try{
  if(status){
   assert.equal(await rpc('eth_chainId'),'0x61','WRONG_CHAIN');const b=await rpc('eth_getBlockByNumber',['latest',false]);if(!b)throw new Unavailable();
   const a=readJSON('deployments/bsc-testnet/deployment.json').addresses,values:any={};const tag=await historicalTag(rpc,b,a.brain);
   for(const fn of ['ready','presentCount','assemblyVersion','completedSteps','active','isSealed','custodyFault','implementationValid'])values[fn]=decodeFunctionResult({abi:ba,functionName:fn,data:await call(rpc,tag,a.brain,ba,fn)});
   values.assemblyNFTBalance=decodeFunctionResult({abi:ca,functionName:'balanceOf',data:await call(rpc,tag,a.cpu,ca,'balanceOf',[a.brain])});
   await anchor(rpc,b);const r={status:'CURRENT_STATE_OBSERVED',block:{number:b.number,hash:b.hash,timestamp:b.timestamp},at:new Date().toISOString(),sourceDigest:source.digest,values,rpc:transport.count(),historicalSnapshotInvalidated:false};atomic(out,r);console.log(JSON.stringify(r,(_,x)=>typeof x==='bigint'?x.toString():x));return;
  }
  const {release,snap}=await snapshot(),b=release.binding.block;
  const seed='droso-history-v1',slots=mode==='full'?Array.from({length:TOTAL_SLOTS},(_,i)=>i):sampleIndices(TOTAL_SLOTS,32,seed),pages=mode==='full'?Array.from({length:TOTAL_PAGES},(_,i)=>i):sampleIndices(TOTAL_PAGES,32,seed);
  const binding=digest({export:release.exportDigest,block:b,mode,slots,pages,source:source.digest});
  progress={...progress,binding,block:b,exportDigest:release.exportDigest,totalSlots:slots.length,totalPages:pages.length,sampling:mode==='sample'?{seed,slots,pages}:null,trust:'RPC plus publisher snapshot; no independent BSC consensus or state-proof validation. Resume trusts locally retained checkpoint.'};
  const resume=arg('--resume');if(resume){outputPath(resume);const prior=checkedCheckpoint(resume,binding,source.digest);previousDigest=prior.localDigest;progress={...progress,slots:prior.slots,pages:prior.pages};}
  // Recheck source and real historical dependencies on every invocation before accepting resumed progress.
  await anchor(rpc,b);const tag=await historicalTag(rpc,b,release.binding.brain),a=await identity(rpc,tag);progress.blockSelector=tag;
  for(const [key,expected]of Object.entries(snap.manifest.globals)){const [fn,index]=key.split('/');assert.equal(await call(rpc,tag,a.brain,ba,fn,index===undefined?[]:[BigInt(index)]),expected,'GLOBAL_'+key);}
  save('PARTIAL','IDENTITY_VERIFIED');
  for(const [kind,indices,verify]of [['slots',slots,verifySlot],['pages',pages,verifyPage]] as const){
   for(let i=progress[kind];i<indices.length;i+=concurrency){
    const width=Math.min(concurrency,indices.length-i),required=width*(kind==='slots'?11:2)+12;
    if(fs.existsSync('results/STOP')||(arg('--stop-file')&&fs.existsSync(outputPath(arg('--stop-file')!)))){save('PARTIAL','USER_STOP');return;}
    if(Date.now()-started>=maxMs||transport.count()+required>maxRpc){save('PARTIAL','SEGMENT_BUDGET');return;}
    await anchor(rpc,b);const settled=await Promise.allSettled(indices.slice(i,i+width).map(index=>verify(rpc,tag,a,snap.get(kind,index))));
    for(const r of settled)if(r.status==='rejected')throw r.reason;
    await anchor(rpc,b);progress[kind]=i+width;save('PARTIAL','PROGRESS');
    console.log(JSON.stringify({mode,slots:progress.slots,pages:progress.pages,rpc:transport.count(),elapsedMs:Date.now()-started}));
   }
  }
  await anchor(rpc,b);save(mode==='full'?'PASS_FULL':'PASS_SAMPLE');console.log(JSON.stringify({status:mode==='full'?'PASS_FULL':'PASS_SAMPLE',report:out,rpc:transport.count()}));
 }catch(e){
  const state=e instanceof RpcBudget?'PARTIAL':e instanceof Unavailable?'UNAVAILABLE':'FAILED';
  save(state,e instanceof RpcBudget?'SEGMENT_BUDGET':e instanceof Unavailable?e.reason:'IDENTITY_OR_DATA_CHECK_FAILED');
  console.log(JSON.stringify({status:state,slots:progress.slots,pages:progress.pages,report:out}));process.exitCode=state==='PARTIAL'?0:state==='UNAVAILABLE'?2:1;
 }
}
main().catch(()=>{console.error('CHAIN_CHECK_FAILED');process.exitCode=1;});
