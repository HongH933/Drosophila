import fs from 'node:fs';import assert from 'node:assert/strict';import path from 'node:path';
import {readJSON} from '../src/integrity.ts';
const text=fs.readFileSync('README.md','utf8'),p=readJSON('package.json'),a=readJSON('deployments/bsc-testnet/deployment.json').addresses;
for(const m of text.matchAll(/\]\(([^)]+)\)/g)){const link=m[1];if(!link.startsWith('https://')&&!link.startsWith('#'))assert.ok(fs.existsSync(path.resolve(link.split('#')[0])),'MISSING_LINK_'+link);}
for(const m of text.matchAll(/npm run ([\w:-]+)/g))assert.ok(p.scripts[m[1]],'MISSING_SCRIPT_'+m[1]);
for(const addr of Object.values(a))assert.ok(text.includes('https://testnet.bscscan.com/address/'+addr),'ADDRESS_MISMATCH');
assert.ok(!text.includes('https://bscscan.com/'));console.log('PASS_README_LINKS_COMMANDS_ADDRESSES');
