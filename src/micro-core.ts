import { Gates, decode, type Hex, type Info } from './netlist.ts';
import { MICRO_OPTIMIZED } from './micro-netlist.ts';
import { hash } from './model.ts';

export const MICRO_VERSION='lif-int16-bitserial-v1';
export const PIN={a:0,weight:1,spike:2,first:3,fitEnable:4,fitFirst:5,sign15:6,sign19:7,compareEnable:8,compareFirst:9,threshold:10,signBit:11} as const;
export type MicroCore={version:string;info:Info;netlist:Hex;netlistHash:string;nand:number;latch:number;bytes:number};
/** Independent original implementation. All arithmetic is NAND logic, including clamp and reset.
 * Latches: carry, signed-fit predicate, unsigned >= predicate. Outputs: sum, result bit, spike.
 * Larger words live in authenticated external bit storage; only public bit selection is external. */
export function compileMicroCore(optimized=true):MicroCore {
  const g=new Gates(12),q=[g.latch(),g.latch(),g.latch()],p=(n:keyof typeof PIN)=>2+PIN[n];
  const carry=g.and(q[0].out,g.not(p('first'))),weighted=g.and(p('weight'),p('spike'));
  const ab=g.xor(p('a'),weighted),sum=g.xor(ab,carry);
  q[0].d=g.nand(g.nand(p('a'),weighted),g.nand(ab,carry));
  const equal=g.not(g.xor(p('a'),p('sign15')));
  const fit=g.and(equal,g.or(p('fitFirst'),q[1].out));
  q[1].d=g.mux(p('fitEnable'),fit,q[1].out);
  const limit=g.xor(p('sign19'),g.not(p('signBit')));
  const clamped=g.mux(q[1].out,p('a'),limit);
  const prior=g.or(p('compareFirst'),q[2].out);
  const ge=g.mux(p('threshold'),g.and(clamped,prior),g.or(clamped,prior));
  q[2].d=g.mux(p('compareEnable'),ge,q[2].out);
  const spike=g.and(g.not(p('sign19')),q[2].out),result=g.and(clamped,g.not(spike));
  const raw=g.finish([sum,result,spike]),netlist=optimized?MICRO_OPTIMIZED.netlist:raw,info=optimized?{...MICRO_OPTIMIZED.info}:{nIn:12,nOut:3,nState:3,gateCount:g.instructions.length};
  const ins=decode(netlist,info),nand=ins.filter(x=>x.op===0).length,latch=ins.length-nand;
  if(nand+latch>150)throw Error('MICRO_COMPONENT_BUDGET');
  return {version:MICRO_VERSION,info,netlist,netlistHash:hash(netlist),nand,latch,bytes:(netlist.length-2)/2};
}
