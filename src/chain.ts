import assert from 'node:assert/strict';
import {encodeFunctionData,decodeFunctionResult,parseAbi,keccak256} from 'viem';
import {ba,ca,da} from './abi.ts';import {readJSON,digest} from './integrity.ts';
export type Rpc=(m:string,p?:any[])=>Promise<any>;
export class Unavailable extends Error {rpcCode?:number;reason:string;constructor(code?:number,reason='HISTORICAL_RPC_UNAVAILABLE'){super(reason);this.rpcCode=code;this.reason=reason;}}
export class RpcBudget extends Error {constructor(){super('RPC_BUDGET');}}
export function httpRpc(url:string,maxRequests=300000){
 const u=new URL(url);assert.ok(['http:','https:'].includes(u.protocol));let calls=0,retries=0;
 const request:Rpc=async(method,params=[])=>{
  assert.ok(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_call'].includes(method),'READ_ONLY_METHOD');
  for(let attempt=0;;attempt++){
   if(calls>=maxRequests)throw new RpcBudget();calls++;
   let response:any,status=0;
   try{const r=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:calls,method,params}),signal:AbortSignal.timeout(20000)});status=r.status;if(r.ok)response=await r.json();else if(status!==429)throw new Unavailable();}catch{throw new Unavailable();}
   const limited=status===429||response?.error?.code===-32005;
   if(limited&&attempt<2&&retries<8){retries++;await new Promise(r=>setTimeout(r,1000*2**attempt));continue;}
   if(limited)throw new Unavailable(response?.error?.code,'RATE_LIMIT_RETRY_EXHAUSTED');
   if(response?.error||!response||!('result' in response))throw new Unavailable(response?.error?.code);
   return response.result;
  }
 };
 return {request,count:()=>calls,retries:()=>retries};
}
export async function anchor(rpc:Rpc,b:{number:string;hash:string}){assert.equal(await rpc('eth_chainId'),'0x61','WRONG_CHAIN');const h=await rpc('eth_getBlockByNumber',[b.number,false]);if(!h)throw new Unavailable();assert.equal(h.hash,b.hash,'WRONG_BLOCK_HASH');}
const extra=parseAbi(['function circuitBeacon() view returns(address)','function transistorBeacon() view returns(address)','function implementation() view returns(address)']);
export const call=(rpc:Rpc,tag:any,a:string,abi:any,fn:string,args:any[]=[])=>rpc('eth_call',[{to:a,data:encodeFunctionData({abi,functionName:fn,args}),gas:'0xfed260'},tag]);
export async function identity(rpc:Rpc,tag:any){const lock=readJSON('deployments/bsc-testnet/protocol-lock.json'),dep=readJSON('deployments/bsc-testnet/deployment.json'),fp=readJSON('deployments/bsc-testnet/custody-fingerprint.json'),a=dep.addresses;
 for(const v of Object.values(lock.codes) as any[])assert.equal(keccak256(await rpc('eth_getCode',[v.address,tag])),v.hash,'PROTOCOL_CODE');
 const get=async(address:string,abi:any,fn:string,args:any[]=[])=>decodeFunctionResult({abi,functionName:fn,data:await call(rpc,tag,address,abi,fn,args)});
 for(const kind of ['circuit','transistor']){assert.equal(String(await get(a.factory,extra,kind+'Beacon')).toLowerCase(),lock.addresses[kind+'Beacon'].toLowerCase());assert.equal(String(await get(lock.addresses[kind+'Beacon'],extra,'implementation')).toLowerCase(),lock.addresses[kind+'Implementation'].toLowerCase());}
 const word=await rpc('eth_getStorageAt',[a.factory,'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',tag]);assert.equal('0x'+word.slice(-40).toLowerCase(),lock.addresses.factoryImplementation.toLowerCase(),'FACTORY_IMPLEMENTATION');
 for(const [key,hash] of [['cpu',fp.cpuHash],['transistors',fp.transistorHash],['brain',fp.brainHash]])assert.equal(keccak256(await rpc('eth_getCode',[a[key],tag])),hash,'INSTANCE_CODE');
 for(const [address,name] of [[a.brain,'BrainAssemblyMicroPages'],[a.data,'StaticMicroData']]){const b=readJSON('build/'+name+'.json'),raw=Buffer.from((await rpc('eth_getCode',[address,tag])).slice(2),'hex');assert.equal(raw.length,b.runtime.length/2-1,'RUNTIME_SIZE');for(const ranges of Object.values(b.immutableReferences) as any[])for(const r of ranges)raw.fill(0,r.start,r.start+r.length);assert.equal('0x'+raw.toString('hex'),b.runtime,'RUNTIME_TEMPLATE');}
 assert.equal(String(await get(a.brain,ba,'staticData')).toLowerCase(),a.data.toLowerCase());assert.equal(String(await get(a.brain,ba,'collection')).toLowerCase(),a.cpu.toLowerCase());assert.equal(await get(a.brain,ba,'implementationValid'),true);
 const pc=await get(a.data,da,'config') as any[];assert.equal(digest(pc.map(x=>typeof x==='bigint'?Number(x):x)),digest(Object.values(readJSON('deployments/bsc-testnet/page-config.json'))),'PAGE_CONFIG');assert.equal(Number(await get(a.data,da,'registered')),51567);
 return a;
}
export async function verifySlot(rpc:Rpc,tag:any,a:any,row:any){const slot=BigInt(row.slot),token=BigInt(row.tokenId);const fields:any={holding:[a.brain,ba,'holding',[slot]],owner:[a.cpu,ca,'ownerOf',[token]],occupied:[a.brain,ba,'occupiedToken',[token]],netlist:[a.cpu,ca,'netlist',[token]],circuitInfo:[a.cpu,ca,'circuitInfo',[token]]};for(const name of ['slotSpec','loadedEdges','loadedBlocks','committedState','pendingState','currentWork'])fields[name]=[a.brain,ba,name,[slot]];
 for(const [key,[addr,abi,fn,args]]of Object.entries(fields) as any[]){const raw=await call(rpc,tag,addr,abi,fn,args);assert.equal(raw.toLowerCase(),row.encoded[key].toLowerCase(),'SLOT_'+row.slot+'_'+key);}}
export async function verifyPage(rpc:Rpc,tag:any,a:any,row:any){const raw=await call(rpc,tag,a.data,da,'pages',[BigInt(row.index)]),v=decodeFunctionResult({abi:da,functionName:'pages',data:raw}) as any[];assert.equal(v[0].toLowerCase(),row.pointer.toLowerCase(),'PAGE_POINTER');assert.equal(Number(v[1]),row.code.length/2-2,'PAGE_LENGTH');assert.equal(v[2],keccak256(row.code),'PAGE_CODE_HASH');assert.equal(await rpc('eth_getCode',[row.pointer,tag]),row.code,'PAGE_BYTES');}
export function sampleIndices(total:number,count:number,seed:string){assert.ok(total>0&&count>=2);const set=new Set([0,total-1]);let i=0;while(set.size<Math.min(count,total)){set.add(parseInt(digest(seed+':'+i++).slice(0,8),16)%total);}return [...set].sort((a,b)=>a-b);}

export async function historicalTag(rpc:Rpc,b:{number:string;hash:string},address:string){const tag={blockHash:b.hash,requireCanonical:true};try{const code=await rpc('eth_getCode',[address,tag]);assert.ok(typeof code==='string'&&code.startsWith('0x'));return tag;}catch(e){if(e instanceof Unavailable&&e.rpcCode===-32602){await anchor(rpc,b);return b.number;}throw e;}}
