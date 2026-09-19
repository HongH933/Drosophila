import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {atomic,digest,readJSON} from '../src/integrity.ts';
import {sourceIdentity} from '../src/source-identity.ts';
import {integer,outputPath,acquireLock,checkedCheckpoint,checkedSegmentResult,TOTAL_SLOTS,TOTAL_PAGES} from '../src/chain-progress.ts';
const arg=(s:string)=>{const i=process.argv.indexOf(s);return i<0?undefined:process.argv[i+1];};
async function main(){
 const dir=outputPath(arg('--out')??'results/full-history'),file=dir+'/run.json';const unlock=acquireLock(dir+'/run.lock');
 const stop=()=>{fs.writeFileSync(dir+'/STOP','USER_STOP\n');};process.on('SIGINT',stop);process.on('SIGTERM',stop);
 try{
  const source=sourceIdentity(),release=readJSON('snapshots/initial/release.json');
  const config={totalRpc:integer(Number(arg('--max-rpc')??300000),300000,'TOTAL_RPC',128),totalMs:integer(Number(arg('--max-ms')??21600000),21600000,'TOTAL_TIME',1000),segmentRpc:integer(Number(arg('--segment-rpc')??30000),30000,'SEGMENT_RPC',128),segmentMs:integer(Number(arg('--segment-ms')??600000),600000,'SEGMENT_TIME',1000),concurrency:integer(Number(arg('--concurrency')??8),16,'CONCURRENCY',1)};
  const slots=Array.from({length:TOTAL_SLOTS},(_,i)=>i),pages=Array.from({length:TOTAL_PAGES},(_,i)=>i);
  const binding=digest({export:release.exportDigest,block:release.binding.block,mode:'full',slots,pages,source:source.digest});
  const identity=digest({binding,config});let state:any={schema:'droso-full-history-run-v1',status:'PARTIAL',mode:'full',identity,binding,sourceDigest:source.digest,exportDigest:release.exportDigest,block:release.binding.block,config,startedAt:new Date().toISOString(),slots:0,pages:0,rpcTotal:0,retries:0,failures:0,elapsedMs:0,segments:[],checkpoint:null,pending:null};
  const save=()=>{const {localDigest,...body}=state;state={...body,updatedAt:new Date().toISOString()};atomic(file,{...state,localDigest:digest(state)});};
  if(fs.existsSync(file)){const p=readJSON(file),{localDigest,...body}=p;assert.equal(digest(body),localDigest,'RUN_DIGEST');assert.equal(p.identity,identity,'RUN_IDENTITY');integer(p.rpcTotal,config.totalRpc,'TOTAL_RPC');assert.notEqual(p.status,'FAILED','FAILED_REQUIRES_REVIEW');state=body;}
  const consume=(pending:any,recovered=false)=>{
   let p:any;if(fs.existsSync(pending.out))p=readJSON(pending.out);else if(fs.existsSync(pending.out+'.checkpoint.json'))p=readJSON(pending.out+'.checkpoint.json');
   if(!p||!p.binding){state.status=p?.status??'UNAVAILABLE';state.reason=p?.reason??'INTERRUPTED_BEFORE_CHECKPOINT';state.rpcTotal+=pending.reservedRpc;state.pending=null;state.failures++;save();return false;}
   checkedSegmentResult(p,pending.start,binding,source.digest,pending.reservedRpc);
   assert.equal(p.previousDigest,pending.previousDigest,'CHECKPOINT_CHAIN');
   if(state.checkpoint){const prior=checkedCheckpoint(state.checkpoint,binding,source.digest);assert.equal(prior.localDigest,pending.previousDigest,'PREFIX_CHANGED');}
   const charge=recovered?pending.reservedRpc:p.rpcThisInvocation;
   state.rpcTotal+=charge;state.retries+=p.retries??0;state.elapsedMs+=recovered?Math.max(0,Date.now()-Date.parse(pending.startedAt)):p.elapsedMs;
   state.slots=p.slots;state.pages=p.pages;state.status=p.status;state.reason=p.reason;state.checkpoint=pending.out+'.checkpoint.json';
   state.segments.push({index:pending.index,report:pending.out,checkpointDigest:p.localDigest,previousDigest:p.previousDigest,status:p.status,slots:p.slots,pages:p.pages,rpcReported:p.rpcThisInvocation,rpcCharged:charge,recoveredConservativeCharge:recovered,elapsedMs:p.elapsedMs,retries:p.retries??0});state.pending=null;
   if(!['PARTIAL','PASS_FULL'].includes(p.status))state.failures++;save();return ['PARTIAL','PASS_FULL'].includes(p.status);
  };
  if(state.pending&&!consume(state.pending,true))return;
  if(state.status==='PASS_FULL'){assert.equal(state.slots,TOTAL_SLOTS);assert.equal(state.pages,TOTAL_PAGES);console.log(JSON.stringify({status:state.status,report:file,rpc:state.rpcTotal}));return;}
  if(state.status==='UNAVAILABLE'){console.log(JSON.stringify({status:'UNAVAILABLE',reason:'Review RPC and use --retry-unavailable to retry once, without changing limits.'}));if(!process.argv.includes('--retry-unavailable'))return;state.status='PARTIAL';}
  save();
  while(state.status==='PARTIAL'){
   assert.equal(sourceIdentity().digest,source.digest,'SOURCE_CHANGED');
   if(fs.existsSync('results/STOP')||fs.existsSync(dir+'/STOP')){state.reason='USER_STOP';save();break;}
   const remainingRpc=config.totalRpc-state.rpcTotal,remainingMs=config.totalMs-state.elapsedMs;
   if(remainingRpc<128||remainingMs<1000){state.reason='TOTAL_BUDGET';save();break;}
   const n=state.segments.length,out=dir+'/segment-'+String(n).padStart(3,'0')+'.json';assert.ok(!fs.existsSync(out),'SEGMENT_EXISTS');
   const pending={index:n,out,reservedRpc:Math.min(config.segmentRpc,remainingRpc),reservedMs:Math.min(config.segmentMs,remainingMs),startedAt:new Date().toISOString(),start:{slots:state.slots,pages:state.pages},previousDigest:state.checkpoint?readJSON(state.checkpoint).localDigest:null};
   state.pending=pending;save();const args=['scripts/verify-chain.ts','--mode','full','--out',out,'--max-rpc',String(pending.reservedRpc),'--max-ms',String(pending.reservedMs),'--concurrency',String(config.concurrency),'--stop-file',dir+'/STOP'];if(state.checkpoint)args.push('--resume',state.checkpoint);
   const code=await new Promise<number|null>((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env});child.once('error',reject);child.once('exit',resolve);});
   if(!consume(pending,code===null))break;
   if(state.status==='PARTIAL'&&state.slots===pending.start.slots&&state.pages===pending.start.pages){state.reason=state.reason==='USER_STOP'?'USER_STOP':'NO_PROGRESS';save();break;}
   console.log(JSON.stringify({event:'full-segment',status:state.status,slots:state.slots,pages:state.pages,rpc:state.rpcTotal,elapsedMs:state.elapsedMs}));
  }
  console.log(JSON.stringify({status:state.status,report:file,slots:state.slots,pages:state.pages,rpc:state.rpcTotal,reason:state.reason}));
 }finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);unlock();}
}
main().catch(()=>{console.error('FULL_RUN_STOPPED: lock, identity, budget, or checkpoint validation failed; preserve results and review.');process.exitCode=1;});
