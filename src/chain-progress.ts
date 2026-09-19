import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digest,readJSON} from './integrity.ts';
export const TOTAL_SLOTS=10419,TOTAL_PAGES=51567;
export function integer(v:unknown,max:number,label:string,min=0):number {assert.ok(typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max,label);return v as number;}
export function checkedCheckpoint(file:string,binding:string,source:string,previous?:any){
 const p=readJSON(file),{localDigest,...body}=p;assert.equal(digest(body),localDigest,'RESUME_CHANGED');
 assert.equal(p.binding,binding,'RESUME_BINDING');assert.equal(p.sourceDigest,source,'SOURCE_CHANGED');
 integer(p.slots,TOTAL_SLOTS,'SLOT_CURSOR');integer(p.pages,TOTAL_PAGES,'PAGE_CURSOR');
 if(p.pages>0)assert.equal(p.slots,p.totalSlots,'CURSOR_ORDER');
 integer(p.totalSlots,TOTAL_SLOTS,'SLOT_TOTAL',1);integer(p.totalPages,TOTAL_PAGES,'PAGE_TOTAL',1);
 assert.ok(p.slots<=p.totalSlots&&p.pages<=p.totalPages,'CURSOR_RANGE');
 if(previous){assert.ok(p.slots>=previous.slots&&p.pages>=previous.pages,'CURSOR_ROLLBACK');}
 assert.ok(['PARTIAL','UNAVAILABLE','FAILED','PASS_FULL','PASS_SAMPLE'].includes(p.status),'RESUME_STATUS');
 assert.notEqual(p.status,'FAILED','FAILED_REQUIRES_REVIEW');return p;
}
export function outputPath(p:string){assert.ok(/^results\/[a-zA-Z0-9_./-]+$/.test(p)&&!p.split('/').includes('..'),'OUTPUT_PATH');return p;}
/** Never steal an orphan lock automatically: PID reuse and partial reports need operator review. */
export function acquireLock(file:string){fs.mkdirSync(path.dirname(file),{recursive:true});const fd=fs.openSync(file,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({pid:process.pid,created:new Date().toISOString()}));fs.fsyncSync(fd);fs.closeSync(fd);return ()=>fs.unlinkSync(file);}
export function checkedSegmentResult(p:any,start:any,binding:string,source:string,reserved:number){
 const {localDigest,...body}=p;assert.equal(digest(body),localDigest,'SEGMENT_DIGEST');assert.equal(p.binding,binding);assert.equal(p.sourceDigest,source);
 integer(p.rpcThisInvocation,reserved,'SEGMENT_RPC');integer(p.slots,TOTAL_SLOTS,'SLOT_CURSOR');integer(p.pages,TOTAL_PAGES,'PAGE_CURSOR');
 assert.ok(p.slots>=start.slots&&p.pages>=start.pages,'CURSOR_ROLLBACK');
 if(p.status==='PASS_FULL'){assert.equal(p.slots,TOTAL_SLOTS);assert.equal(p.pages,TOTAL_PAGES);}
 return p;
}
