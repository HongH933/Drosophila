import fs from 'node:fs';
import {decodeFunctionResult,encodeFunctionData,keccak256,parseAbi} from 'viem';
import type {Abi,Hex} from 'viem';
import {readJSON,digest} from './integrity.ts';

export type Rpc=(method:string,params:unknown[])=>Promise<any>;
export const MAINNET_READ_METHODS=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_call','eth_getTransactionReceipt']);
export class StatusError extends Error {
 partial?:unknown;
 constructor(code:string){super(code);this.name='StatusError';}
}
function requireState(ok:unknown,code:string):asserts ok {if(!ok)throw new StatusError(code);}
const equal=(a:unknown,b:unknown)=>String(a).toLowerCase()===String(b).toLowerCase();
const addr=(a:unknown):Hex=>{requireState(typeof a==='string'&&/^0x[0-9a-fA-F]{40}$/.test(a),'INVALID_ADDRESS');return a as Hex;};
const getterAbi=parseAbi(['function implementation() view returns (address)','function owner() view returns (address)','function pendingOwner() view returns (address)']);
export function mainnetRpcURL():string|undefined {
 if(process.env.BSC_MAINNET_RPC_URL?.trim())return process.env.BSC_MAINNET_RPC_URL.trim();
 if(!fs.existsSync('.env'))return;
 // Read just this public endpoint configuration; never export the rest of .env.
 const line=fs.readFileSync('.env','utf8').split(/\r?\n/).find(x=>/^BSC_MAINNET_RPC_URL\s*=/.test(x));
 return line?.slice(line.indexOf('=')+1).trim().replace(/^(['"])(.*)\1$/,'$2')||undefined;
}
export function readonlyRpc(url:string,fetcher:typeof fetch=fetch):Rpc {
 let calls=0;const start=Date.now();
 const parsed=new URL(url);requireState(['https:','http:'].includes(parsed.protocol),'INVALID_RPC_SCHEME');
 return async(method,params)=>{
  requireState(MAINNET_READ_METHODS.has(method),'WRITE_METHOD_FORBIDDEN');
  requireState(++calls<=128&&Date.now()-start<180000,'RPC_BUDGET');
  let response:any;
  try {const r=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:calls,method,params}),signal:AbortSignal.timeout(15000)});requireState(r.ok,'RPC_HTTP_UNAVAILABLE');response=await r.json();}
  catch {throw new StatusError('RPC_UNAVAILABLE');}
  requireState(response?.id===calls&&!response.error&&Object.hasOwn(response,'result'),'RPC_RESPONSE_UNAVAILABLE');
  return response.result;
 };
}
export function mainnetEvidence(){return {addressBook:readJSON('deployments/bsc-mainnet/addresses.json'),lock:readJSON('deployments/bsc-mainnet/protocol-lock.json'),receipts:readJSON('deployments/bsc-mainnet/receipts-index.json')};}

export async function observeMainnet(raw:Rpc,evidence=mainnetEvidence(),verifyReceipts=false){
 let rpcCount=0;
 const rpc:Rpc=async(m,p)=>{requireState(MAINNET_READ_METHODS.has(m),'WRITE_METHOD_FORBIDDEN');requireState(++rpcCount<=128,'RPC_BUDGET');return raw(m,p);};
 requireState(BigInt(await rpc('eth_chainId',[]))===56n,'WRONG_CHAIN_EXPECTED_56');
 const block=await rpc('eth_getBlockByNumber',['latest',false]);
 requireState(block&&/^0x[0-9a-f]+$/i.test(block.number)&&/^0x[0-9a-f]{64}$/i.test(block.hash),'INVALID_PINNED_BLOCK');
 const at=block.number;
 const {addressBook,lock,receipts}=evidence,expected=addressBook.addresses;
 requireState(addressBook.chainId===56&&lock.chainId===56&&receipts.chainId===56,'EVIDENCE_NETWORK_MISMATCH');
 const assembly=readJSON('abi/mainnet/BrainAssemblyMicroPagesUpgradeable.json') as Abi;
 const dataAbi=readJSON('abi/mainnet/StaticMicroData.json') as Abi;
 const cpuAbi=readJSON('abi/mainnet/Circuits.json') as Abi;
 const factoryAbi=readJSON('abi/mainnet/CircuitFactory.json') as Abi;
 const call=async(to:string,abi:Abi,name:string,args:unknown[]=[])=>{
  const fn=abi.find((x:any)=>x.type==='function'&&x.name===name) as any;
  requireState(fn&&['view','pure'].includes(fn.stateMutability),'NON_VIEW_CALL_FORBIDDEN');
  const data=encodeFunctionData({abi,functionName:name,args} as any);
  return decodeFunctionResult({abi,functionName:name,data:await rpc('eth_call',[{to:addr(to),data},at])} as any) as any;
 };
 const changes:{field:string;expected:unknown;actual:unknown}[]=[];
 const compare=(field:string,wanted:unknown,actual:unknown)=>{if(!equal(wanted,actual))changes.push({field,expected:wanted,actual});};
 const codes:Record<string,any>={};
 try {
 const code=async(role:string,address:string,hash?:string)=>{
  const bytes=await rpc('eth_getCode',[addr(address),at]);requireState(typeof bytes==='string'&&/^0x([0-9a-f]{2})+$/i.test(bytes),'MISSING_OR_INVALID_CODE');
  const actual=keccak256(bytes as Hex);codes[role]={address,hash:actual,bytes:(bytes.length-2)/2};if(hash)compare(role+'.codeHash',hash,actual);
 };
 // Read the EIP-1967 slot on the public proxy, not protocol beacon()/implementation().
 await code('assemblyProxy',expected.assemblyProxy,lock.expectedCodeHashes.assemblyProxy);
 const word=await rpc('eth_getStorageAt',[expected.assemblyProxy,lock.proxyBeaconSlot,at]);
 requireState(typeof word==='string'&&/^0x0{24}[0-9a-f]{40}$/i.test(word),'INVALID_BEACON_SLOT');
 const projectBeacon=addr('0x'+word.slice(-40));compare('projectBeacon',expected.projectBeacon,projectBeacon);
 await code('projectBeacon',projectBeacon,lock.expectedCodeHashes.projectBeacon);
 const projectImplementation=addr(await call(projectBeacon,getterAbi,'implementation'));
 const owner=addr(await call(projectBeacon,getterAbi,'owner')),pendingOwner=addr(await call(projectBeacon,getterAbi,'pendingOwner'));
 compare('assemblyImplementation',expected.assemblyImplementation,projectImplementation);
 compare('projectBeaconOwner',expected.projectBeaconOwner,owner);compare('projectPendingOwner',lock.expectedProjectPendingOwner,pendingOwner);
 await code('assemblyImplementation',projectImplementation,lock.expectedCodeHashes.assemblyImplementation);
 await code('initializer',expected.initializer,lock.expectedCodeHashes.initializer);
 // All live assembly storage queries are made to the proxy.
 const state:Record<string,any>={};
 for(const name of ['collection','staticData','builder','factory','beacon','implementation','IMPLEMENTATION_VERSION','config','configuredCount','configuredRecords','presentCount','ready','isSealed','active','completedSteps','implementationValid','custodyFault','assemblyVersion','completeDataSlots','chunkCount','loadedFrames'])state[name]=await call(expected.assemblyProxy,assembly,name);
 compare('proxy.collection',expected.processor,state.collection);compare('proxy.staticData',expected.staticData,state.staticData);compare('proxy.builder',expected.deployer,state.builder);
 for(const [name,role] of [['factory','protocolFactory'],['beacon','protocolCircuitBeacon'],['implementation','protocolCircuitImplementation']])compare('proxy.protocolPin.'+name,expected[role],state[name]);
 const processor=addr(state.collection),staticData=addr(state.staticData);
 await code('processor',processor,lock.expectedCodeHashes.processor);
 const protocolFactory=addr(await call(processor,cpuAbi,'factory'));compare('protocolFactory',expected.protocolFactory,protocolFactory);
 await code('protocolFactory',protocolFactory,lock.expectedCodeHashes.protocolFactory);
 requireState(await call(protocolFactory,factoryAbi,'isCPU',[processor]),'PROCESSOR_NOT_RECOGNIZED');
 const protocolBeacon=addr(await call(protocolFactory,factoryAbi,'circuitBeacon'));compare('protocolCircuitBeacon',expected.protocolCircuitBeacon,protocolBeacon);
 await code('protocolCircuitBeacon',protocolBeacon,lock.expectedCodeHashes.protocolCircuitBeacon);
 const protocolImplementation=addr(await call(protocolBeacon,getterAbi,'implementation'));compare('protocolCircuitImplementation',expected.protocolCircuitImplementation,protocolImplementation);
 await code('protocolCircuitImplementation',protocolImplementation,lock.expectedCodeHashes.protocolCircuitImplementation);
 const transistors=addr(await call(processor,cpuAbi,'transistors'));await code('transistors',transistors);
 if(expected.transistors)compare('transistors',expected.transistors,transistors);
 await code('staticData',staticData,lock.expectedCodeHashes.staticData);
 const data:Record<string,any>={};for(const name of ['builder','registered','pageCount','complete','config','commitment'])data[name]=await call(staticData,dataAbi,name);
 compare('staticData.builder',expected.deployer,data.builder);
 const verifiedReceipts=[];
 if(verifyReceipts)for(const t of receipts.transactions){
  const r=await rpc('eth_getTransactionReceipt',[t.txHash]);
  requireState(r&&equal(r.transactionHash,t.txHash)&&BigInt(r.status)===1n&&equal(r.contractAddress,t.address)&&r.to===null&&equal(r.from,expected.deployer)&&equal(r.blockHash,t.blockHash)&&BigInt(r.blockNumber)===BigInt(t.blockNumber),'DEPLOYMENT_RECEIPT_MISMATCH');
  const header=await rpc('eth_getBlockByNumber',[r.blockNumber,false]);requireState(header&&equal(header.hash,r.blockHash),'DEPLOYMENT_BLOCK_CHANGED');
  requireState(BigInt(r.gasUsed)===BigInt(t.gasUsed)&&BigInt(r.effectiveGasPrice)===BigInt(t.effectiveGasPrice)&&BigInt(r.gasUsed)*BigInt(r.effectiveGasPrice)===BigInt(t.costWei),'DEPLOYMENT_FEE_MISMATCH');
  verifiedReceipts.push({txHash:t.txHash,role:t.role,blockNumber:r.blockNumber,blockHash:r.blockHash,costWei:t.costWei,status:'VERIFIED_CANONICAL_RECEIPT'});
 }
 const end=await rpc('eth_getBlockByNumber',[at,false]);requireState(end&&equal(end.hash,block.hash),'PINNED_BLOCK_CHANGED');
 requireState(BigInt(await rpc('eth_chainId',[]))===56n,'RPC_NETWORK_CHANGED');
 return {schema:'droso-mainnet-observation-v1',status:changes.length?'OBSERVED_WITH_CHANGES':'OBSERVED',observedAt:new Date().toISOString(),chainId:56,block:{number:at,hash:block.hash},rpcCount,publicTransactions:0,evidenceDigest:digest(evidence),changes,code:codes,
  project:{assemblyProxy:expected.assemblyProxy,projectBeacon,owner,pendingOwner,assemblyImplementation:projectImplementation},
  protocol:{processor,protocolFactory,protocolCircuitBeacon:protocolBeacon,protocolCircuitImplementation:protocolImplementation,transistors,transistorsEvidence:'Processor.transistors() and nonempty code at this pinned block; interface observation, not a full permission audit'},
  assemblyState:state,data:{address:staticData,...data},deploymentRecords:verifyReceipts?{status:'VERIFIED_RECEIPTS',transactions:verifiedReceipts}:{status:'NOT_RECHECKED',source:'deployments/bsc-mainnet/receipts-index.json'},
  mainnetFullAssembly:state.ready?'READY_OBSERVED_NOT_FULL_AUDIT':'NOT_READY',fullBrainAcceptance:'NOT_PERFORMED',trust:'RPC observation pinned to one block number and rechecked hash; no consensus proof or finality guarantee. Local expected records are not modified.'};
 } catch(e) {
  const error=e instanceof StatusError?e:new StatusError('READ_OR_DECODE_FAILED');
  error.partial={block:{number:at,hash:block.hash},rpcCount,changes,code:codes,complete:false,canonicalEndCheck:'NOT_CONFIRMED',evidenceDigest:digest(evidence)};
  throw error;
 }
}
