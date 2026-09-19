import { decode,type Hex,type Info } from './netlist.ts';

/** Decoded instructions are private, shared and immutable. Scratch belongs to a runner. */
const cache=new Map<string,ReturnType<typeof compile>>();
function compile(netlist:Hex,info:Info){
  const instructions=decode(netlist,info),ops=new Uint8Array(instructions.length),a=new Uint32Array(ops.length),b=new Uint32Array(ops.length),latches=new Uint32Array(info.nState);
  let cursor=0;instructions.forEach((x,i)=>{ops[i]=x.op;if(x.op===0){a[i]=x.a;b[i]=x.b;}else{a[i]=x.d;latches[cursor++]=x.d;}});
  const base=2+info.nIn,count=base+ops.length,nState=info.nState,nOut=info.nOut;
  return Object.freeze({create(){
    const signals=new Uint8Array(count);signals[1]=1;
    return (state:Uint8Array,input:Uint8Array,output:Uint8Array)=>{
      if(state.length!==nState||input.length!==base-2||output.length!==nOut)throw Error('BINARY_GATE_SHAPE');
      signals.set(input,2);let j=0;
      // All old latch values enter signals before next state is written, including aliasing state/output.
      for(let i=0;i<ops.length;i++)signals[base+i]=ops[i]===0?1-(signals[a[i]]&signals[b[i]]):state[j++];
      for(let i=0;i<nState;i++)state[i]=signals[latches[i]];
      for(let i=0;i<nOut;i++)output[i]=signals[count-nOut+i];
    };
  }});
}
export function binaryEvaluator(netlist:Hex,info:Info){
  const key=`${info.nIn}/${info.nOut}/${info.nState}/${info.gateCount}/${netlist}`;
  let core=cache.get(key);if(!core){core=compile(netlist,info);cache.set(key,core);}return core.create();
}
export function decodedCoreCount(){return cache.size;}
