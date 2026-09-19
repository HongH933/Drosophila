import fs from 'node:fs';
import path from 'node:path';
import {digest,fileHash} from './integrity.ts';
/** Execution identity excludes reports/docs so publishing results does not change the tested program. */
export function sourceIdentity(){
 const roots=['src','scripts','contracts','abi','build','core','snapshots','deployments','package.json','package-lock.json','tsconfig.json'];
 const files:string[]=[];
 const walk=(p:string)=>{const s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('SOURCE_SYMLINK');if(s.isDirectory())for(const n of fs.readdirSync(p).sort())walk(path.posix.join(p,n));else files.push(p);};
 roots.forEach(walk);files.sort();const entries=files.map(file=>({file,sha256:fileHash(file)}));
 return {schema:'droso-execution-source-v1',digest:digest(entries),files:entries};
}
