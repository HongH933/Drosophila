import { binaryEvaluator } from './binary-gates.ts';
import { compileMicroCore, PIN, type MicroCore } from './micro-core.ts';
import { validatePackedData, type PackedPlan } from './packed-runtime.ts';
import { readBinarySet, writeBinarySet } from './packed-io.ts';
import { isDeepStrictEqual } from 'node:util';
import { pack, type Hex } from './netlist.ts';
import { createHash } from 'node:crypto';
export const MICRO_PLAN_VERSION='packed-micro-v2';
export type MicroPlan=Omit<PackedPlan,'core'> & {core:MicroCore};
export function validateMicroPlan(p:MicroPlan){if(!isDeepStrictEqual(p.core,compileMicroCore()))throw Error('MICRO_CORE_BYTES');validatePackedData(p);}
export function writeMicroPlan(dir:string,p:MicroPlan,provenance:unknown){validateMicroPlan(p);const {core,classification,frames,...a}=p;return writeBinarySet(dir,{...a,...Object.fromEntries(frames.map((f,i)=>['frame'+i,f]))},{schema:MICRO_PLAN_VERSION,core,classification,frames:frames.length,provenance});}
export function loadMicroPlan(dir:string,trustedDigest:string){if(!/^[a-f0-9]{64}$/.test(trustedDigest))throw Error('TRUSTED_PLAN_REQUIRED');const r=readBinarySet(dir,trustedDigest),a=r.arrays,m=r.metadata;if(m.schema!==MICRO_PLAN_VERSION)throw Error('MICRO_PLAN_SCHEMA');const view=(k:string,C:any)=>{const b=a[k];if(!b||b.length%C.BYTES_PER_ELEMENT)throw Error('MICRO_ARRAY');return new C(b.buffer,b.byteOffset,b.length/C.BYTES_PER_ELEMENT);};const plan:MicroPlan={core:m.core,classification:m.classification,frames:Array.from({length:m.frames},(_,i)=>view('frame'+i,Uint8Array)),offsets:view('offsets',Uint32Array),sources:view('sources',Uint32Array),weights:view('weights',Int16Array),thresholds:view('thresholds',Uint16Array),moduleOffsets:view('moduleOffsets',Uint32Array),initialV:view('initialV',Int16Array),initialSpikes:view('initialSpikes',Uint8Array)};validateMicroPlan(plan);return {plan,provenance:m.provenance,bytes:r.bytes,digest:r.digest};}
type Saved={metadata:{schema:string;planDigest:string;step:number;round:number;version:number;active:boolean;presentCount:number;completed:number};arrays:Record<string,any>};
/** One decoded actual netlist, separate module states, lazy rounds and O(1) admission/barrier.
 * All neural arithmetic is performed by NAND/LATCH, never by this bit router. */
export class PackedMicroRuntime {
 readonly plan:MicroPlan;readonly planDigest:string;v:Int16Array;spikes:Uint8Array;pendingV:Int16Array;pendingSpikes:Uint8Array;
 readonly neuron:Uint32Array;readonly cursor:Uint32Array;readonly cycles:Uint32Array;readonly phase:Uint8Array;readonly bit:Uint8Array;readonly acc:Uint32Array;readonly states:Uint8Array;readonly workRound:Float64Array;
 step=0;round=0;active=false;#version=1;#roundVersion=1;#count:number;#completed=0;#present:Uint8Array;#q:Uint8Array[];#input=new Uint8Array(12);#output=new Uint8Array(3);#run:ReturnType<typeof binaryEvaluator>;
 constructor(p:MicroPlan,planDigest:string){validateMicroPlan(p);if(!/^[a-f0-9]{64}$/.test(planDigest))throw Error('TRUSTED_PLAN_REQUIRED');Object.freeze(p.core.info);Object.freeze(p.core);Object.freeze(p.frames);Object.freeze(p);this.plan=p;this.planDigest=planDigest;const m=p.moduleOffsets.length-1;this.#count=m;this.#present=new Uint8Array(m).fill(1);this.v=p.initialV.slice();this.spikes=p.initialSpikes.slice();this.pendingV=new Int16Array(this.v.length);this.pendingSpikes=new Uint8Array(this.v.length);this.neuron=p.moduleOffsets.slice(0,m);this.cursor=new Uint32Array(m);this.cycles=new Uint32Array(m);this.phase=new Uint8Array(m);this.bit=new Uint8Array(m);this.acc=new Uint32Array(m);this.states=new Uint8Array(m*3);this.workRound=new Float64Array(m);this.#q=Array.from({length:m},(_,s)=>this.states.subarray(3*s,3*s+3));this.#run=binaryEvaluator(p.core.netlist,p.core.info);}
 get modules(){return this.#present.length;}get version(){return this.#version;}get presentCount(){return this.#count;}get completed(){return this.#completed;}
 ready(){if(!Number.isSafeInteger(this.#version)||this.#version<1||!Number.isSafeInteger(this.round)||this.round<0||!Number.isSafeInteger(this.step)||this.step<0||this.step>this.plan.frames.length||this.#count<0||this.#count>this.modules||this.#completed<0||this.#completed>this.modules||this.active&&this.#version!==this.#roundVersion)throw Error('ASSEMBLY_INVARIANT');return this.#count===this.modules;}
 begin(){if(this.active||!this.ready()||this.step>=this.plan.frames.length||this.round===Number.MAX_SAFE_INTEGER)throw Error('NOT_READY');this.round++;this.#roundVersion=this.version;this.#completed=0;this.active=true;}
 #slot(s:number){if(!Number.isInteger(s)||s<0||s>=this.modules)throw Error('SLOT');}
 done(s:number){return this.workRound[s]===this.round&&this.phase[s]===5;}
 expected(s:number){this.#slot(s);const fresh=this.workRound[s]!==this.round;return {version:this.version,round:this.round,neuron:fresh?0:this.neuron[s]-this.plan.moduleOffsets[s],cursor:fresh?0:this.cursor[s],bit:fresh?0:this.bit[s],phase:fresh?0:this.phase[s],cycles:fresh?0:this.cycles[s]};}
 remaining(s:number){const p=this.plan,first=p.moduleOffsets[s],last=p.moduleOffsets[s+1];return (last-first)*55+20*(p.offsets[last]-p.offsets[first])-(this.workRound[s]===this.round?this.cycles[s]:0);}
 advance(s:number,count=1,expected=this.expected(s)){
  this.#slot(s);if(!this.active||!this.ready()||Object.entries(this.expected(s)).some(([k,v])=>v!==expected[k as keyof typeof expected]))throw Error('STALE_MICRO_OP');if(!Number.isInteger(count)||count<1||count>65536||count>this.remaining(s))throw Error('MICRO_BATCH');
  const p=this.plan;if(this.workRound[s]!==this.round){this.workRound[s]=this.round;this.neuron[s]=p.moduleOffsets[s];this.cursor[s]=this.bit[s]=this.phase[s]=this.cycles[s]=this.acc[s]=0;this.#q[s].fill(0);this.pendingV.fill(0,p.moduleOffsets[s],p.moduleOffsets[s+1]);this.pendingSpikes.fill(0,p.moduleOffsets[s],p.moduleOffsets[s+1]);}
  let n=this.neuron[s],cursor=this.cursor[s],b=this.bit[s],phase=this.phase[s],acc=this.acc[s];const input=this.#input,output=this.#output,q=this.#q[s],frame=p.frames[this.step];
  for(let j=0;j<count;j++){
   input.fill(0);input[PIN.sign15]=(acc>>>15)&1;input[PIN.sign19]=(acc>>>19)&1;input[PIN.signBit]=Number(b===15);
   if(phase===0){input[PIN.a]=(this.v[n]>>Math.min(b+1,15))&1;input[PIN.first]=1;}
   else if(phase===1){const e=p.offsets[n]+cursor,source=p.sources[e];input[PIN.a]=(acc>>>b)&1;input[PIN.weight]=(p.weights[e]>>Math.min(b,15))&1;input[PIN.spike]=source<0x80000000?this.spikes[source]:frame[source-0x80000000];input[PIN.first]=Number(b===0);}
   else if(phase===2){input[PIN.a]=(acc>>>(16+b))&1;input[PIN.fitEnable]=1;input[PIN.fitFirst]=Number(b===0);}
   else {input[PIN.a]=(acc>>>b)&1;if(phase===3){input[PIN.compareEnable]=1;input[PIN.compareFirst]=Number(b===0);input[PIN.threshold]=(p.thresholds[n]>>>b)&1;}}
   this.#run(q,input,output);
   if(phase<=1)acc=(acc&~(1<<b))|(output[0]<<b);
   else if(phase===4){this.pendingV[n]=(this.pendingV[n]&~(1<<b))|(output[1]<<b);this.pendingSpikes[n]=output[2];}
   b++;
   if(phase===0&&b===20){b=0;phase=p.offsets[n+1]===p.offsets[n]?2:1;}
   else if(phase===1&&b===20){b=0;cursor++;if(cursor===p.offsets[n+1]-p.offsets[n])phase=2;}
   else if(phase===2&&b===4){b=0;phase=3;}
   else if(phase===3&&b===15){b=0;phase=4;}
   else if(phase===4&&b===16){b=0;cursor=0;n++;phase=n===p.moduleOffsets[s+1]?5:0;if(phase===5)this.#completed++;}
  }
  this.neuron[s]=n;this.cursor[s]=cursor;this.bit[s]=b;this.phase[s]=phase;this.acc[s]=acc;this.cycles[s]+=count;
 }
 commit(){if(!this.active||!this.ready()||this.#completed!==this.modules)throw Error('INCOMPLETE');[this.v,this.pendingV]=[this.pendingV,this.v];[this.spikes,this.pendingSpikes]=[this.pendingSpikes,this.spikes];this.step++;this.active=false;this.#completed=0;}
 tick(reverse=false){this.begin();for(let j=0;j<this.modules;j++){const s=reverse?this.modules-1-j:j;while(!this.done(s))this.advance(s,Math.min(65536,this.remaining(s)));}this.commit();}
 withdraw(s:number){this.#slot(s);if(!this.#present[s]||this.version===Number.MAX_SAFE_INTEGER)throw Error('MISSING_OR_VERSION');this.#present[s]=0;this.#count--;this.#invalidate();}
 deposit(s:number){this.#slot(s);if(this.#present[s]||this.version===Number.MAX_SAFE_INTEGER)throw Error('OCCUPIED_OR_VERSION');this.#present[s]=1;this.#count++;this.#invalidate();}
 #invalidate(){this.#version++;this.#roundVersion=this.version;this.active=false;this.#completed=0;}
 snapshot():Saved {return {metadata:{schema:'micro-checkpoint-v2',planDigest:this.planDigest,step:this.step,round:this.round,version:this.version,active:this.active,presentCount:this.#count,completed:this.#completed},arrays:Object.fromEntries(Object.entries(this.#arrays()).map(([k,a])=>[k,a.slice()]))};}
 #arrays(){return {v:this.v,spikes:this.spikes,pendingV:this.pendingV,pendingSpikes:this.pendingSpikes,neuron:this.neuron,cursor:this.cursor,cycles:this.cycles,phase:this.phase,bit:this.bit,acc:this.acc,states:this.states,workRound:this.workRound,present:this.#present};}
 #validate(saved:Saved){const {metadata:m,arrays:a}=saved;if(m.schema!=='micro-checkpoint-v2'||m.planDigest!==this.planDigest||!Number.isSafeInteger(m.version)||m.version<1||!Number.isSafeInteger(m.round)||m.round<0||!Number.isSafeInteger(m.step)||m.step<0||m.step>this.plan.frames.length||typeof m.active!=='boolean'||m.active&&m.step===this.plan.frames.length)throw Error('CHECKPOINT_HEADER');for(const [k,v] of Object.entries(this.#arrays()))if(a[k]?.constructor!==v.constructor||a[k].length!==v.length)throw Error('CHECKPOINT_SHAPE');if(a.present.some((x:number)=>x>1)||a.present.reduce((n:number,x:number)=>n+x,0)!==m.presentCount||m.active&&m.presentCount!==this.modules||a.states.some((x:number)=>x>1)||a.spikes.some((x:number)=>x>1)||a.pendingSpikes.some((x:number)=>x>1))throw Error('CHECKPOINT_BITS');let completed=0;
  for(let s=0;s<this.modules;s++){const first=this.plan.moduleOffsets[s],last=this.plan.moduleOffsets[s+1],n=a.neuron[s],phase=a.phase[s],b=a.bit[s],cursor=a.cursor[s],r=a.workRound[s];if(!Number.isSafeInteger(r)||r<0||r>m.round||a.acc[s]>=1048576||n<first||n>last||phase>5||(phase===5)!==(n===last))throw Error('CHECKPOINT_WORK');if(r===m.round&&phase===5)completed++;let prior=55*(n-first)+20*(this.plan.offsets[n]-this.plan.offsets[first]),d=this.plan.offsets[n+1]-this.plan.offsets[n];if(phase===5){if(b||cursor)throw Error('CHECKPOINT_DONE');}else {if(b>=(phase<=1?20:phase===2?4:phase===3?15:16)||phase===0&&cursor!==0||phase===1&&cursor>=d||phase>=2&&cursor!==d)throw Error('CHECKPOINT_CURSOR');prior+=phase===0?b:phase===1?20+20*cursor+b:phase===2?20+20*d+b:phase===3?24+20*d+b:39+20*d+b;}if(prior!==a.cycles[s])throw Error('CHECKPOINT_CYCLES');}
  if(m.completed!==(m.active?completed:0))throw Error('CHECKPOINT_COMPLETION');
 }
 audit(){this.ready();this.#validate({metadata:this.snapshot().metadata,arrays:this.#arrays()});return true;}
 digest(saved:Saved){const h=createHash('sha256').update(JSON.stringify(saved.metadata));for(const [k,a] of Object.entries(saved.arrays)){h.update(k);h.update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));}return h.digest('hex');}
 restore(saved:Saved,trustedStateDigest:string){if(!trustedStateDigest||this.digest(saved)!==trustedStateDigest)throw Error('TRUSTED_STATE_REQUIRED');this.#validate(saved);for(const [k,a] of Object.entries(this.#arrays()))a.set(saved.arrays[k]);const m=saved.metadata;this.step=m.step;this.round=m.round;this.#version=this.#roundVersion=m.version;this.active=m.active;this.#count=m.presentCount;this.#completed=m.completed;}
 save(dir:string){const s=this.snapshot();this.#validate(s);return {...writeBinarySet(dir,s.arrays,s.metadata),stateDigest:this.digest(s)};}
 load(dir:string,trustedFileDigest:string,trustedStateDigest:string){if(!trustedFileDigest)throw Error('TRUSTED_FILE_REQUIRED');const r=readBinarySet(dir,trustedFileDigest),a:Record<string,any>={};for(const [k,v] of Object.entries(this.#arrays())){const b=r.arrays[k],C=v.constructor as any;if(!b||b.length%C.BYTES_PER_ELEMENT)throw Error('CHECKPOINT_SHAPE');a[k]=new C(b.buffer,b.byteOffset,b.length/C.BYTES_PER_ELEMENT);}this.restore({metadata:r.metadata,arrays:a},trustedStateDigest);}
 work(s:number){const e=this.expected(s),fresh=this.workRound[s]!==this.round;return {...e,state:pack(fresh?[0,0,0]:this.#q[s]),acc:('0x'+Buffer.from([fresh?0:this.acc[s]&255,fresh?0:(this.acc[s]>>>8)&255,fresh?0:this.acc[s]>>>16]).toString('hex')) as Hex};}
}
