import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const sha256=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
export function canonicalJSON(v:any):string {if(Array.isArray(v))return '['+v.map(canonicalJSON).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(v[k])).join(',')+'}';return JSON.stringify(v);}
export const canonicalSHA256=(v:unknown)=>sha256(canonicalJSON(v));
export const encode=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x);
export const digest=(v:unknown)=>canonicalSHA256(JSON.parse(encode(v)));
export const readJSON=(f:string)=>JSON.parse(fs.readFileSync(f,'utf8'));
// Node's permission sandbox denies fsync even on allowed files. Offline output remains
// atomically selected and hash-validated; normal execution still flushes to disk.
export function flush(fd:number){try{fs.fsyncSync(fd);}catch(e){if(!(process.permission && (e as NodeJS.ErrnoException).code==='ERR_ACCESS_DENIED'))throw e;}}
export function atomic(file:string,value:unknown){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+randomUUID(),fd=fs.openSync(tmp,'wx');try{fs.writeFileSync(fd,encode(value)+'\n');flush(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
export function fileHash(file:string){const fd=fs.openSync(file,'r'),h=createHash('sha256'),b=Buffer.alloc(1048576);try{for(;;){const n=fs.readSync(fd,b);if(!n)break;h.update(b.subarray(0,n));}}finally{fs.closeSync(fd);}return h.digest('hex');}
export function regular(file:string){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink())throw Error('UNSAFE_FILE');return s;}
