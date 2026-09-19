import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readJSON,canonicalSHA256,fileHash,sha256,atomic} from '../src/integrity.ts';
const solc=createRequire(import.meta.url)('solc');
const input=readJSON('build/mainnet/compiler-input.json'),manifest=readJSON('build/mainnet/manifest.json');
assert.equal(solc.version(),manifest.compiler);
assert.equal(canonicalSHA256(input),manifest.inputCanonicalSha256);
assert.deepEqual(input.settings,manifest.settings);
for(const [name,s] of Object.entries(input.sources) as any[]){
 assert.equal(fs.readFileSync('contracts/mainnet/'+name,'utf8'),s.content);
 assert.equal(fileHash('contracts/mainnet/'+name),manifest.sourceSha256[name]);
}
const result=JSON.parse(solc.compile(JSON.stringify(input)));
assert.deepEqual((result.errors??[]).filter((x:any)=>x.severity==='error'),[]);
const rows=[];
for(const row of manifest.inventory){
 const c=Object.values(result.contracts).map((v:any)=>v[row.name]).find(Boolean) as any;
 const actual={abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,runtime:'0x'+c.evm.deployedBytecode.object,immutableReferences:c.evm.deployedBytecode.immutableReferences,storageLayout:c.storageLayout};
 assert.deepEqual(actual,readJSON('build/mainnet/'+row.name+'.json'));
 assert.deepEqual(actual.abi,readJSON('abi/mainnet/'+row.name+'.json'));
 assert.equal((actual.runtime.length-2)/2,row.runtimeBytes);
 assert.ok(row.runtimeBytes<=24576);
 assert.equal(sha256(Buffer.from(actual.runtime.slice(2),'hex')),row.runtimeSha256);
 rows.push({name:row.name,runtimeBytes:row.runtimeBytes,status:'EXACT_MATCH'});
}
const report={schema:'droso-mainnet-recompile-v1',status:'PASS_EXACT_RECOMPILE',compiler:solc.version(),inputCanonicalSha256:manifest.inputCanonicalSha256,comparisons:['source bytes','ABI','creation bytecode','runtime template','immutable references','storage layout'],contracts:rows,publicTransactions:0};
atomic('results/mainnet-recompile.json',report);console.log(JSON.stringify(report));
