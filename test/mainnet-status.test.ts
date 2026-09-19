import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {encodeFunctionResult,keccak256,toFunctionSelector} from 'viem';
import {observeMainnet,mainnetEvidence,readonlyRpc,MAINNET_READ_METHODS} from '../src/mainnet-status.ts';
import {readJSON} from '../src/integrity.ts';
const header={number:'0x8000000',hash:'0x'+'11'.repeat(32)};
function fixture(options:{chain?:string;reorg?:boolean;changed?:boolean;receiptBad?:boolean}={}){
 const evidence=structuredClone(mainnetEvidence()),a=evidence.addressBook.addresses;
 for(const key of Object.keys(evidence.lock.expectedCodeHashes))evidence.lock.expectedCodeHashes[key]=keccak256('0x6000');
 const seen:{method:string;params:any[]}[]=[],selectors=new Map<string,{abi:any;name:string}>();
 for(const file of ['BrainAssemblyMicroPagesUpgradeable','StaticMicroData','Circuits','CircuitFactory','ProjectUpgradeableBeacon']){
  const abi=readJSON('abi/mainnet/'+file+'.json');for(const f of abi.filter((x:any)=>x.type==='function'&&x.stateMutability==='view')){
   selectors.set(file+":"+toFunctionSelector(f),{abi:[f],name:f.name});
  }
 }
 const byProxy:any={collection:a.processor,staticData:a.staticData,builder:a.deployer,factory:a.protocolFactory,beacon:a.protocolCircuitBeacon,implementation:a.protocolCircuitImplementation,IMPLEMENTATION_VERSION:'0x'+'55'.repeat(32),config:[10419,166700,0,2,794,64,...Array(3).fill('0x'+'66'.repeat(32))],configuredCount:0,configuredRecords:0n,presentCount:0,ready:false,isSealed:false,active:false,completedSteps:0,implementationValid:true,custodyFault:false,assemblyVersion:0n,completeDataSlots:0,chunkCount:0,loadedFrames:0};
 const changed='0x'+'a1'.repeat(20),transistors=a.transistors;
 const rpc=async(method:string,params:any[])=>{
  seen.push({method,params});
  if(method==='eth_chainId')return options.chain??'0x38';
  if(method==='eth_getBlockByNumber'){
   if(params[0]==='latest')return header;
   if(params[0]===header.number)return {...header,hash:options.reorg?'0x'+'22'.repeat(32):header.hash};
   const t=evidence.receipts.transactions.find((x:any)=>x.blockNumber===params[0]);return {number:t.blockNumber,hash:t.blockHash};
  }
  if(method==='eth_getTransactionReceipt'){
   const t=evidence.receipts.transactions.find((x:any)=>x.txHash===params[0]);return {...t,transactionHash:t.txHash,contractAddress:t.address,from:a.deployer,to:null,status:options.receiptBad?'0x0':'0x1'};
  }
  if(method==='eth_getStorageAt'){assert.equal(params[0],a.assemblyProxy);assert.equal(params[1],evidence.lock.proxyBeaconSlot);assert.equal(params[2],header.number);return '0x'+'0'.repeat(24)+a.projectBeacon.slice(2);}
  if(method==='eth_getCode'){assert.equal(params[1],header.number);return '0x6000';}
  assert.equal(method,'eth_call');assert.equal(params[1],header.number);
  const to=params[0].to.toLowerCase();
  const file=to===a.assemblyProxy.toLowerCase()?'BrainAssemblyMicroPagesUpgradeable':to===a.staticData.toLowerCase()?'StaticMicroData':to===a.processor.toLowerCase()?'Circuits':to===a.protocolFactory.toLowerCase()?'CircuitFactory':'ProjectUpgradeableBeacon';
  const {abi,name}=selectors.get(file+':'+params[0].data.slice(0,10))!;let result;
  if(to===a.assemblyProxy.toLowerCase())result=byProxy[name];
  else if(to===a.projectBeacon.toLowerCase())result={implementation:options.changed?changed:a.assemblyImplementation,owner:a.projectBeaconOwner,pendingOwner:'0x'+'0'.repeat(40)}[name];
  else if(to===a.processor.toLowerCase())result={factory:a.protocolFactory,transistors}[name];
  else if(to===a.protocolFactory.toLowerCase())result={circuitBeacon:a.protocolCircuitBeacon,isCPU:true}[name];
  else if(to===a.protocolCircuitBeacon.toLowerCase())result=a.protocolCircuitImplementation;
  else if(to===a.staticData.toLowerCase())result={builder:a.deployer,registered:0n,pageCount:51567n,complete:false,config:[4096,204663504n,6502144n,'0x'+'33'.repeat(32),'0x'+'44'.repeat(32)],commitment:'0x'+'77'.repeat(32)}[name];
  else assert.fail('unexpected call address '+to);
  assert.notEqual(result,undefined,name);return encodeFunctionResult({abi,functionName:name,result});
 };
 return {rpc,evidence,seen};
}
test('mainnet pinned proxy state: not-ready is a successful observation; two beacons are distinct',async()=>{
 const f=fixture(),r=await observeMainnet(f.rpc,f.evidence,true);
 assert.equal(r.status,'OBSERVED');assert.equal(r.mainnetFullAssembly,'NOT_READY');assert.equal(r.assemblyState.ready,false);
 assert.equal(r.project.assemblyImplementation.toLowerCase(),f.evidence.addressBook.addresses.assemblyImplementation.toLowerCase());
 assert.equal(r.protocol.protocolCircuitImplementation.toLowerCase(),f.evidence.addressBook.addresses.protocolCircuitImplementation.toLowerCase());
 assert.notEqual(r.project.projectBeacon,r.protocol.protocolCircuitBeacon);
 assert.equal(r.deploymentRecords.transactions?.length,5);assert.equal(r.publicTransactions,0);
 assert.ok(f.seen.every(x=>MAINNET_READ_METHODS.has(x.method)));
});
test('wrong chain stops before any state read and never falls back to 97',async()=>{
 const f=fixture({chain:'0x61'});await assert.rejects(observeMainnet(f.rpc,f.evidence),/WRONG_CHAIN/);assert.equal(f.seen.length,1);
});
test('pinned block change invalidates the observation',async()=>{
 const f=fixture({reorg:true});await assert.rejects(observeMainnet(f.rpc,f.evidence),/PINNED_BLOCK_CHANGED/);
});
test('project implementation change is reported without mutating deployment expectations',async()=>{
 const f=fixture({changed:true}),before=JSON.stringify(f.evidence);const r=await observeMainnet(f.rpc,f.evidence);
 assert.equal(r.status,'OBSERVED_WITH_CHANGES');assert.ok(r.changes.some(x=>x.field==='assemblyImplementation'));assert.equal(JSON.stringify(f.evidence),before);
});
test('wrong code is reported separately from ready',async()=>{
 const f=fixture();f.evidence.lock.expectedCodeHashes.processor='0x'+'ff'.repeat(32);const r=await observeMainnet(f.rpc,f.evidence);
 assert.ok(r.changes.some(x=>x.field==='processor.codeHash'));assert.equal(r.assemblyState.ready,false);
});
test('unsuccessful historical receipt cannot verify deployment',async()=>{
 const f=fixture({receiptBad:true});await assert.rejects(observeMainnet(f.rpc,f.evidence,true),/DEPLOYMENT_RECEIPT_MISMATCH/);
});
test('transport whitelist rejects sends before network; endpoint errors are redacted',async()=>{
 let n=0;const rpc=readonlyRpc('https://example.invalid/private-token',async()=>{n++;throw Error('secret private-token');});
 await assert.rejects(rpc('eth_sendRawTransaction',['secret']),/WRITE_METHOD_FORBIDDEN/);assert.equal(n,0);
 await assert.rejects(rpc('eth_chainId',[]),e=>e instanceof Error&&e.message==='RPC_UNAVAILABLE');
});
test('transport has bounded requests and does not retry',async()=>{
 let n=0;const rpc=readonlyRpc('https://example.invalid',async(_url,init)=>{n++;const q=JSON.parse(String(init?.body));return new Response(JSON.stringify({id:q.id,result:'0x38'}));});
 for(let i=0;i<128;i++)await rpc('eth_chainId',[]);
 await assert.rejects(rpc('eth_chainId',[]),/RPC_BUDGET/);assert.equal(n,128);
});
test('new command rejects signing/broadcast flags',()=>{
 const p=spawnSync(process.execPath,['scripts/status-mainnet.ts','--broadcast'],{encoding:'utf8'});assert.equal(p.status,1);assert.match(p.stderr,/read-only/);
});
test('mainnet module has no wallet/parent imports; original commands stay separate',()=>{
 const source=fs.readFileSync('src/mainnet-status.ts','utf8')+fs.readFileSync('scripts/status-mainnet.ts','utf8');
 assert.doesNotMatch(source,/createWalletClient|privateKeyToAccount|signTransaction|sendRawTransaction|\.\.\/\.\.\//);
 const p=readJSON('package.json');assert.equal(p.scripts['status:chain'],'node scripts/verify-chain.ts --status');assert.equal(p.scripts.reproduce,'node --max-old-space-size=1536 scripts/reproduce.ts');
});

test('changed pointer remains visible if new implementation cannot be decoded',async()=>{
 const f=fixture({changed:true});
 const broken=async(m:string,p:any[])=>{if(m==='eth_call'&&p[0].to===f.evidence.addressBook.addresses.assemblyProxy)throw Error('upstream secret');return f.rpc(m,p);};
 await assert.rejects(observeMainnet(broken,f.evidence),(e:any)=>e.message==='READ_OR_DECODE_FAILED'&&e.partial.complete===false&&e.partial.changes.some((c:any)=>c.field==='assemblyImplementation'));
});

test('unconfigured mainnet in a clean directory is NOT_RUN even with testnet configured',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'droso-mainnet-'));
 try {
  const env:NodeJS.ProcessEnv={...process.env,BSC_TESTNET_RPC_URL:'https://example.invalid/testnet'};delete env.BSC_MAINNET_RPC_URL;
  const p=spawnSync(process.execPath,[path.resolve('scripts/status-mainnet.ts')],{cwd:dir,env,encoding:'utf8'});
  assert.equal(p.status,0);const report=JSON.parse(p.stdout);assert.equal(report.status,'NOT_RUN');assert.equal(report.publicTransactions,0);assert.equal(report.chainId,56);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
