import fs from 'node:fs';import assert from 'node:assert/strict';import path from 'node:path';
import {readJSON} from '../src/integrity.ts';
const text=fs.readFileSync('README.md','utf8'),mainDoc=fs.readFileSync('docs/MAINNET_DEPLOYMENT.md','utf8'),p=readJSON('package.json');
for(const [file,body] of [['README.md',text],['docs/MAINNET_DEPLOYMENT.md',mainDoc]]){
 for(const m of body.matchAll(/\]\(([^)]+)\)/g)){const link=m[1];if(!link.startsWith('https://')&&!link.startsWith('#'))assert.ok(fs.existsSync(path.resolve(path.dirname(file),link.split('#')[0])),'MISSING_LINK_'+link);}
 for(const m of body.matchAll(/npm run ([\w:-]+)/g))assert.ok(p.scripts[m[1]],'MISSING_SCRIPT_'+m[1]);
}
const testnet=readJSON('deployments/bsc-testnet/deployment.json').addresses;
for(const addr of Object.values(testnet)){
 assert.ok(text.includes('https://testnet.bscscan.com/address/'+addr),'TESTNET_ADDRESS_MISMATCH');
 assert.ok(!(text+mainDoc).includes('https://bscscan.com/address/'+addr),'WRONG_EXPLORER');
}
const mainnet=readJSON('deployments/bsc-mainnet/addresses.json'),a=mainnet.addresses;
for(const role of ['assemblyProxy','processor','protocolFactory','staticData','projectBeacon','assemblyImplementation','initializer'])assert.ok(text.includes('https://bscscan.com/address/'+a[role]),'MAINNET_ADDRESS_MISMATCH');
for(const role of ['protocolCircuitBeacon','protocolCircuitImplementation','transistors','projectBeaconOwner'])assert.ok(mainDoc.includes('https://bscscan.com/address/'+a[role]),'MAINNET_DETAIL_MISMATCH');
for(const addr of Object.values(a))assert.ok(!(text+mainDoc).includes('https://testnet.bscscan.com/address/'+addr),'WRONG_EXPLORER');
for(const r of readJSON('deployments/bsc-mainnet/receipts-index.json').transactions){assert.equal(r.address,a[r.role]);assert.ok(mainDoc.includes('https://bscscan.com/tx/'+r.txHash));}
for(const role of Object.values(mainnet.aliases))assert.ok(Object.hasOwn(a,String(role)),'INVALID_ALIAS');
assert.match(text,/CONTRACTS_ONLY_DEPLOYED/);assert.match(text,/ready=false/);
console.log('PASS_README_AND_MAINNET_DOC_LINKS_COMMANDS_NETWORK_ADDRESSES');
