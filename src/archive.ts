import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalJSON,canonicalSHA256 } from './integrity.ts';
export const ARCHIVE_LIMITS={headerBytes:1048576,sectionBytes:64*1024*1024,archiveBytes:1024*1024*1024,ioChunkBytes:1048576,sections:64};
export const rawSHA256=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export function fileSHA256(file:string){const fd=fs.openSync(file,'r'),h=createHash('sha256'),chunk=Buffer.alloc(ARCHIVE_LIMITS.ioChunkBytes);try{for(;;){const n=fs.readSync(fd,chunk);if(!n)break;h.update(chunk.subarray(0,n));}}finally{fs.closeSync(fd);}return h.digest('hex');}
export function writeArchive(file:string,metadata:unknown,sections:{name:string;category:'A'|'B';bytes:Uint8Array}[]){
 let offset=0;const index=sections.map(s=>{const item={name:s.name,category:s.category,offset,bytes:s.bytes.length,rawSha256:rawSHA256(s.bytes)};offset+=s.bytes.length;return item;}),header=Buffer.from(canonicalJSON({schema:'fly-brain-indexed-archive-v1',metadata,sections:index})),prefix=Buffer.alloc(8);prefix.write('FBD1');prefix.writeUInt32LE(header.length,4);
 if(header.length>ARCHIVE_LIMITS.headerBytes||offset+header.length+8>ARCHIVE_LIMITS.archiveBytes||sections.length>ARCHIVE_LIMITS.sections||sections.some(s=>s.bytes.length>ARCHIVE_LIMITS.sectionBytes))throw Error('ARCHIVE_BUDGET');
 const fd=fs.openSync(file,'wx');try{fs.writeSync(fd,prefix);fs.writeSync(fd,header);for(const section of sections)for(let i=0;i<section.bytes.length;i+=ARCHIVE_LIMITS.ioChunkBytes)fs.writeSync(fd,section.bytes.subarray(i,i+ARCHIVE_LIMITS.ioChunkBytes));}finally{fs.closeSync(fd);}
 return {bytes:8+header.length+offset,rawFileSha256:fileSHA256(file),headerCanonicalSha256:canonicalSHA256(JSON.parse(header.toString())),headerBytes:header.length,sections:index};
}
/** Seekable bounded header + incrementally verified sections; never parses a graph-sized JSON. */
export function openArchive(file:string){
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>ARCHIVE_LIMITS.archiveBytes||stat.size<8)throw Error('ARCHIVE_FILE');const fd=fs.openSync(file,'r');try{
  const prefix=Buffer.alloc(8);if(fs.readSync(fd,prefix,0,8,0)!==8||prefix.toString('ascii',0,4)!=='FBD1')throw Error('ARCHIVE_SCHEMA');const n=prefix.readUInt32LE(4);if(n>ARCHIVE_LIMITS.headerBytes||n+8>stat.size)throw Error('ARCHIVE_HEADER_BUDGET');const b=Buffer.alloc(n);if(fs.readSync(fd,b,0,n,8)!==n)throw Error('ARCHIVE_TRUNCATED');const header=JSON.parse(b.toString());if(header.schema!=='fly-brain-indexed-archive-v1'||!Array.isArray(header.sections)||header.sections.length>ARCHIVE_LIMITS.sections)throw Error('ARCHIVE_HEADER');let cursor=0;const names=new Set<string>();for(const s of header.sections){if(!/^[a-z0-9-]+$/.test(s.name)||names.has(s.name)||s.offset!==cursor||!Number.isSafeInteger(s.bytes)||s.bytes<0||s.bytes>ARCHIVE_LIMITS.sectionBytes||!['A','B'].includes(s.category))throw Error('ARCHIVE_SECTION');names.add(s.name);cursor+=s.bytes;}if(cursor+n+8!==stat.size)throw Error('ARCHIVE_LENGTH');
  const section=(name:string)=>{const s=header.sections.find((s:any)=>s.name===name);if(!s)throw Error('ARCHIVE_MISSING_SECTION');const value=Buffer.allocUnsafeSlow(s.bytes),h=createHash('sha256'),f=fs.openSync(file,'r');try{for(let i=0;i<s.bytes;){const read=fs.readSync(f,value,i,Math.min(ARCHIVE_LIMITS.ioChunkBytes,s.bytes-i),8+n+s.offset+i);if(!read)throw Error('ARCHIVE_TRUNCATED');h.update(value.subarray(i,i+read));i+=read;}}finally{fs.closeSync(f);}if(h.digest('hex')!==s.rawSha256)throw Error('ARCHIVE_SECTION_HASH');return value;};
  return {header,section,bytes:stat.size};
 }finally{fs.closeSync(fd);}
}
