import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { sha256 } from './integrity.ts';
export const IO_LIMITS={maxBytes:1024*1024*1024,chunkBytes:1024*1024,maxFiles:1048576,maxNeurons:1000000,maxEdges:50000000};
function littleEndian(){if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1)throw Error('BINARY_HOST_ENDIAN');}
export function writeBinarySet(dir:string,arrays:Record<string,ArrayBufferView>,metadata:unknown){
 littleEndian();
 if(fs.existsSync(dir)&&fs.readdirSync(dir).length)throw Error('EMPTY_OUTPUT_REQUIRED');fs.mkdirSync(dir,{recursive:true});const files:any[]=[];
 for(const [name,a] of Object.entries(arrays)){if(!/^[a-zA-Z0-9_-]+$/.test(name))throw Error('BINARY_NAME');const bytes=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),fd=fs.openSync(path.join(dir,name+'.bin'),'wx'),digest=createHash('sha256');try{for(let i=0;i<bytes.length;i+=IO_LIMITS.chunkBytes){const chunk=bytes.subarray(i,Math.min(i+IO_LIMITS.chunkBytes,bytes.length));fs.writeSync(fd,chunk);digest.update(chunk);}}finally{fs.closeSync(fd);}files.push({name,bytes:bytes.length,sha256:digest.digest('hex')});}
 const body={schema:'fly-brain-binary-set-v1',endian:'LE',files,metadata},manifest=JSON.stringify(body),digest=sha256(manifest);fs.writeFileSync(path.join(dir,'index.json'),manifest+'\n');return {bytes:files.reduce((n,f)=>n+f.bytes,0),digest,files:files.length};
}
/** Exactly one destination allocation per array, incremental hashes, no hex/object or concat copy. */
export function readBinarySet(dir:string,expectedDigest?:string){
 littleEndian();
 const header=fs.lstatSync(path.join(dir,'index.json'));if(!header.isFile()||header.isSymbolicLink()||header.size>16*1024*1024)throw Error('BINARY_MANIFEST');
 const raw=fs.readFileSync(path.join(dir,'index.json'),'utf8').trim();if(raw.length>16*1024*1024||expectedDigest&&sha256(raw)!==expectedDigest)throw Error('BINARY_MANIFEST');const index=JSON.parse(raw),arrays:Record<string,Buffer>={};if(index.schema!=='fly-brain-binary-set-v1'||index.endian!=='LE'||index.files.length>IO_LIMITS.maxFiles)throw Error('BINARY_SCHEMA');let total=0;
 for(const f of index.files){if(!/^[a-zA-Z0-9_-]+$/.test(f.name)||!Number.isSafeInteger(f.bytes)||f.bytes<0||(total+=f.bytes)>IO_LIMITS.maxBytes||arrays[f.name])throw Error('BINARY_BUDGET');const file=path.join(dir,f.name+'.bin');if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size!==f.bytes)throw Error('BINARY_FILE');const buffer=Buffer.allocUnsafeSlow(f.bytes),fd=fs.openSync(file,'r'),digest=createHash('sha256');try{for(let offset=0;offset<f.bytes;){const n=fs.readSync(fd,buffer,offset,Math.min(IO_LIMITS.chunkBytes,f.bytes-offset),offset);if(!n)throw Error('BINARY_TRUNCATED');digest.update(buffer.subarray(offset,offset+n));offset+=n;}}finally{fs.closeSync(fd);}if(digest.digest('hex')!==f.sha256)throw Error('BINARY_HASH');arrays[f.name]=buffer;}
 return {arrays,metadata:index.metadata,bytes:total,digest:sha256(raw)};
}
