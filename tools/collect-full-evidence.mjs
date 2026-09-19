// Report exporter only. It never changes the running reader, its inputs or its checkpoints.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {readJSON,digest,atomic,fileHash} from '../src/integrity.ts';
import {sourceIdentity} from '../src/source-identity.ts';
import {writeInventory} from '../src/public-files.ts';
const dir='results/full-history',out='evidence/full-history-current';
const check=p=>{const {localDigest,...body}=p;assert.equal(digest(body),localDigest);return p;};
async function collect(){
 let run=check(readJSON(dir+'/run.json'));
 if(process.argv.includes('--wait')){
  const deadline=Date.parse(run.startedAt)+6.25*3600000;
  while(fs.existsSync(dir+'/run.lock')){assert.ok(Date.now()<deadline,'EXPORT_WAIT_BUDGET');await new Promise(r=>setTimeout(r,10000));}
  run=check(readJSON(dir+'/run.json'));
 }
 assert.equal(run.sourceDigest,sourceIdentity().digest,'SOURCE_CHANGED');
 fs.mkdirSync(out,{recursive:true});let previous=null;
 for(const s of run.segments){const p=check(readJSON(s.report));assert.equal(p.sourceDigest,run.sourceDigest);assert.equal(p.binding,run.binding);assert.equal(p.previousDigest,previous);assert.equal(p.localDigest,s.checkpointDigest);previous=p.localDigest;fs.copyFileSync(s.report,out+'/segment-'+String(s.index).padStart(3,'0')+'.json');}
 let progress=run;
 if(run.pending&&fs.existsSync(run.pending.out+'.checkpoint.json')){const p=check(readJSON(run.pending.out+'.checkpoint.json'));assert.equal(p.sourceDigest,run.sourceDigest);assert.equal(p.binding,run.binding);progress={...run,slots:p.slots,pages:p.pages,rpcTotal:run.rpcTotal+p.rpcThisInvocation,elapsedMs:run.elapsedMs+p.elapsedMs};atomic(out+'/initial-progress-checkpoint.json',p);}
 atomic(out+'/run.json',run);
 const running=fs.existsSync(dir+'/run.lock');
 if(!running&&run.status==='PASS_FULL'){assert.equal(run.slots,10419);assert.equal(run.pages,51567);}
 let current='NOT_RUN',currentRpc=0;
 if(!running&&run.status==='PASS_FULL'&&process.argv.includes('--current')){
  assert.ok(run.rpcTotal+128<=run.config.totalRpc,'FINAL_RPC_RESERVE');
  const report=dir+'/current-after-full.json';
  if(!fs.existsSync(report))spawnSync(process.execPath,['scripts/verify-chain.ts','--status','--out',report,'--max-rpc','128'],{stdio:'inherit',env:process.env});
  if(fs.existsSync(report)){const p=readJSON(report);current=p.status;currentRpc=p.rpc??p.rpcThisInvocation??0;fs.copyFileSync(report,out+'/current-state.json');}
 }
 const summary={schema:'droso-new-full-history-evidence-v1',status:running?'PARTIAL':run.status,execution:running?'RUNNING_BOUNDED_SUPERVISOR':'STOPPED',at:new Date().toISOString(),block:run.block,sourceDigest:run.sourceDigest,slots:progress.slots,totalSlots:10419,pages:progress.pages,totalPages:51567,rpcCharged:progress.rpcTotal,elapsedActiveMs:progress.elapsedMs,elapsedWallMs:Date.now()-Date.parse(run.startedAt),segments:run.segments.length,retries:run.retries,failures:run.failures,currentState:current,currentRpc,rpcIncludingCurrent:progress.rpcTotal+currentRpc,collectorSha256:fileHash('tools/collect-full-evidence.mjs'),publicTransactions:0,trust:'Actual RPC comparisons and local checkpoint chain; not independent BSC consensus proof.'};
 atomic(out+'/summary.json',summary);
 const text=`\n<!-- FULL_READER_STATUS_START -->\n## 新公开工具 full 历史核对状态\n\n状态 **${summary.status}**；执行器 ${summary.execution}。记录时间 ${summary.at}。\n\n实际覆盖 **${summary.slots}/10419 槽、${summary.pages}/51567 页**；累计请求扣账 ${summary.rpcCharged}，活动耗时 ${(summary.elapsedActiveMs/1000).toFixed(1)} 秒，完成分段 ${summary.segments}。重试 ${summary.retries}，失败 ${summary.failures}。未结束段计入当前已保存的请求数；崩溃恢复可能保守扣预留量，详情见分段报告。\n\n[新full报告](../evidence/full-history-current/summary.json) · [监督器检查点链](../evidence/full-history-current/run.json)。当前状态查询单列为 ${current}，不替代历史结果。Linux仍为BLOCKED_NO_AVAILABLE_LINUX_RUNTIME，远程CI仍为WORKFLOW_PREPARED_NOT_RUN。\n<!-- FULL_READER_STATUS_END -->\n`;
 const doc='docs/ACCEPTANCE.md',old=fs.readFileSync(doc,'utf8');fs.writeFileSync(doc,old.replace(/\n<!-- FULL_READER_STATUS_START -->[\s\S]*?<!-- FULL_READER_STATUS_END -->\n?/,'')+text);
 writeInventory();console.log(JSON.stringify(summary));
}
collect().catch(()=>{console.error('EVIDENCE_EXPORT_STOPPED: preserve reports and inspect local state; no success claim published.');process.exitCode=1;});
