import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {digest,sha256,fileHash,readJSON,regular} from './integrity.ts';
const safe=(s:string)=>typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(s)&&!s.includes('..');
export function validateManifest(m:any,trusted:string){assert.equal(digest(m),trusted,'EXPORT_DIGEST');assert.equal(m.schema,'droso-snapshot-bundle-v1');assert.equal(m.dataset,'male-cns:v1.0');assert.equal(m.block.number,'0x7db17ca');assert.equal(m.block.hash,'0x4b09598a04faf3f8f6cb635dc1d6776733b0c66713ba86ced57b870c23293c54');assert.equal(m.sourceSnapshotDigest,'a3e09d8b64310618ffe1f5ca10cb56b6a1495ebbf45bb3c441bb75502872e34e');
 const names=new Set<string>(),parts=new Set<string>();assert.ok(m.parts.length>0&&m.parts.length<128);
 for(const p of m.parts){assert.ok(safe(p.file)&&!parts.has(p.file),'DUPLICATE_OR_UNSAFE_PART');parts.add(p.file);assert.ok(p.bytes>0&&p.bytes<=32*1024*1024&&p.rawBytes<=32*1024*1024);for(const f of p.files){assert.ok(safe(f.name)&&!names.has(f.name),'DUPLICATE_OR_UNSAFE_FILE');names.add(f.name);assert.ok(Number.isSafeInteger(f.bytes)&&f.bytes>0&&f.bytes<=2*1024*1024);}}
}
export function unpackBundle(bundleDir:string,destination:string,manifest:any,trusted:string){validateManifest(manifest,trusted);const parent=path.dirname(destination);fs.mkdirSync(parent,{recursive:true});assert.ok(!fs.lstatSync(parent).isSymbolicLink(),'UNSAFE_PARENT');const exists=fs.existsSync(destination);if(exists)assert.ok(fs.lstatSync(destination).isDirectory()&&!fs.lstatSync(destination).isSymbolicLink(),'UNSAFE_DESTINATION');
 const temp=exists?undefined:fs.mkdtempSync(path.join(parent,'.unpack-'));try{for(const p of manifest.parts){const f=path.join(bundleDir,p.file);assert.equal(regular(f).size,p.bytes,'PART_SIZE');assert.equal(fileHash(f),p.sha256,'PART_HASH');const raw=gunzipSync(fs.readFileSync(f),{maxOutputLength:32*1024*1024});assert.equal(raw.length,p.rawBytes,'RAW_SIZE');let at=0;
 for(const item of p.files){assert.ok(at+4<=raw.length,'TRUNCATED_ENTRY');const n=raw.readUInt32LE(at);at+=4;assert.equal(n,item.bytes,'ENTRY_SIZE');assert.ok(at+n<=raw.length);const bytes=raw.subarray(at,at+n);at+=n;assert.equal(sha256(bytes),item.sha256,'ENTRY_HASH');const target=path.join(temp??destination,item.name);if(exists){assert.equal(regular(target).size,n);assert.equal(fileHash(target),item.sha256,'CACHE_CHANGED');}else fs.writeFileSync(target,bytes,{flag:'wx'});}
 assert.equal(at,raw.length,'EXTRA_ARCHIVE_BYTES');}
 if(temp)fs.renameSync(temp,destination);
 }catch(e){if(temp)fs.rmSync(temp,{recursive:true,force:true});throw e;}return destination;
}
export function initialSnapshot(){const release=readJSON('snapshots/initial/release.json'),m=readJSON('bundles/export-manifest.json');return {release,manifest:m,root:unpackBundle('bundles','.cache/initial',m,release.exportDigest)};}
