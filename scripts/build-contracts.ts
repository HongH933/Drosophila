import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readJSON} from '../src/integrity.ts';
const solc=createRequire(import.meta.url)('solc'),input=readJSON('build/compiler-input.json');assert.equal(solc.version(),readJSON('build/build-info.json').compiler);
for(const [name,s]of Object.entries(input.sources) as any[])assert.equal(fs.readFileSync('contracts/'+name,'utf8'),s.content);
const output=JSON.parse(solc.compile(JSON.stringify(input)));assert.equal((output.errors??[]).filter((x:any)=>x.severity==='error').length,0);
for(const name of ['BrainAssemblyMicroPages','StaticMicroData','MicroDataPage']){const c=Object.values(output.contracts).map((v:any)=>v[name]).find(Boolean) as any,old=readJSON('build/'+name+'.json');assert.equal('0x'+c.evm.bytecode.object,old.bytecode);assert.equal('0x'+c.evm.deployedBytecode.object,old.runtime);assert.deepEqual(c.evm.deployedBytecode.immutableReferences,old.immutableReferences);assert.ok(old.runtime.length/2-1<=24576);}
console.log('PASS exact compiler input / creation code / runtime templates / immutable references');
