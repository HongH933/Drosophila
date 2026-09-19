export type Hex = `0x${string}`;
export type Info = {nIn:number;nOut:number;nState:number;gateCount:number};
export type Instruction = {op:0;a:number;b:number;out:number}|{op:1;d:number;out:number};
export function pack(bits:ArrayLike<number>):Hex {
  const bytes=new Uint8Array(Math.ceil(bits.length/8));
  for(let i=0;i<bits.length;i++){if(bits[i]!==0&&bits[i]!==1)throw new Error('BIT_INVALID');bytes[i>>3]|=bits[i]<<(i%8);}
  return `0x${Buffer.from(bytes).toString('hex')}`;
}
export function unpack(hex:Hex,count:number):number[] {
  if(!/^0x(?:[0-9a-f]{2})*$/i.test(hex)||hex.length!==2+Math.ceil(count/8)*2)throw new Error('PACKED_LENGTH');
  const bytes=Buffer.from(hex.slice(2),'hex');
  if(count%8&&bytes.at(-1)!>>(count%8))throw new Error('NONCANONICAL_PADDING');
  return Array.from({length:count},(_,i)=>(bytes[i>>3]>>(i%8))&1);
}
export function decode(hex:Hex,info:Info):Instruction[] {
  if(!/^0x(?:[0-9a-f]{2})+$/i.test(hex))throw new Error('NETLIST_HEX');
  for(const n of Object.values(info))if(!Number.isSafeInteger(n)||n<0||n>0xffffff)throw new Error('INFO_RANGE');
  const bytes=Buffer.from(hex.slice(2),'hex'), result:Instruction[]=[];let offset=0,next=2+info.nIn,states=0;
  const u24=()=>{if(offset+3>bytes.length)throw new Error('TRUNCATED');const x=bytes.readUIntBE(offset,3);offset+=3;return x;};
  while(offset<bytes.length){
    const op=bytes[offset++],out=next++;
    if(op===0){const a=u24(),b=u24();if(a>=out||b>=out)throw new Error('NAND_FUTURE_SIGNAL');result.push({op,a,b,out});}
    else if(op===1){result.push({op,d:u24(),out});states++;}
    else throw new Error('UNSUPPORTED_OPCODE');
  }
  if(next>0xffffff||states!==info.nState||result.length!==info.gateCount||info.nOut>next-2-info.nIn)throw new Error('INFO_MISMATCH');
  if(result.some(x=>x.op===1&&x.d>=next))throw new Error('LATCH_SIGNAL_INVALID');
  return result;
}
export function encode(ins:Instruction[]):Hex {
  const data=Buffer.allocUnsafe(ins.reduce((s,x)=>s+(x.op===0?7:4),0));let offset=0;
  const u24=(n:number)=>{if(!Number.isInteger(n)||n<0||n>0xffffff)throw new Error('U24_RANGE');data.writeUIntBE(n,offset,3);offset+=3;};
  for(const x of ins){data[offset++]=x.op;if(x.op===0){u24(x.a);u24(x.b);}else u24(x.d);}
  return `0x${data.toString('hex')}`;
}
export function evaluatorLegacy(netlist:Hex,info:Info) {
  const ins=decode(netlist,info);
  return (state:Hex,input:Hex):{state:Hex;output:Hex}=>{
    const old=unpack(state,info.nState),inputs=unpack(input,info.nIn),signals=new Uint8Array(2+info.nIn+ins.length);
    signals[1]=1;signals.set(inputs,2);let cursor=0;
    for(const x of ins)signals[x.out]=x.op===0?1-(signals[x.a]&signals[x.b]):old[cursor++];
    const next=ins.filter(x=>x.op===1).map(x=>signals[(x as Extract<Instruction,{op:1}>).d]);
    return {state:pack(next),output:pack(signals.slice(signals.length-info.nOut))};
  };
}
/** Same NAND/LATCH semantics and encoding; compact decoded columns avoid one JS object per gate. */
export function evaluator(netlist:Hex,info:Info){
  for(const n of Object.values(info))if(!Number.isSafeInteger(n)||n<0||n>0xffffff)throw new Error('INFO_RANGE');
  if(!/^0x(?:[0-9a-f]{2})+$/i.test(netlist))throw new Error('NETLIST_HEX');
  const bytes=Buffer.from(netlist.slice(2),'hex'),ops=new Uint8Array(info.gateCount),a=new Uint32Array(info.gateCount),b=new Uint32Array(info.gateCount),latchSources=new Uint32Array(info.nState);
  let offset=0,gate=0,latch=0;const count=2+info.nIn+info.gateCount;
  const u24=()=>{if(offset+3>bytes.length)throw new Error('TRUNCATED');const x=bytes.readUIntBE(offset,3);offset+=3;return x;};
  while(offset<bytes.length){if(gate>=info.gateCount)throw new Error('INFO_MISMATCH');const op=bytes[offset++];ops[gate]=op;a[gate]=u24();
    if(op===0){b[gate]=u24();if(a[gate]>=gate+2+info.nIn||b[gate]>=gate+2+info.nIn)throw new Error('NAND_FUTURE_SIGNAL');}
    else if(op===1){if(latch>=info.nState||a[gate]>=count)throw new Error('LATCH_SIGNAL_INVALID');latchSources[latch++]=a[gate];}
    else throw new Error('UNSUPPORTED_OPCODE');gate++;
  }
  if(gate!==info.gateCount||latch!==info.nState||info.nOut>gate||count>0xffffff)throw new Error('INFO_MISMATCH');
  return (state:Hex,input:Hex):{state:Hex;output:Hex}=>{
    const old=unpack(state,info.nState),inputs=unpack(input,info.nIn),signals=new Uint8Array(count);signals[1]=1;signals.set(inputs,2);let cursor=0;
    for(let i=0;i<gate;i++)signals[2+info.nIn+i]=ops[i]===0?1-(signals[a[i]]&signals[b[i]]):old[cursor++];
    const next=new Uint8Array(info.nState);for(let i=0;i<next.length;i++)next[i]=signals[latchSources[i]];
    return {state:pack(next),output:pack(signals.subarray(count-info.nOut))};
  };
}
export class Gates {
  nIn:number;instructions:Instruction[]=[];next:number;memo=new Map<string,number>();
  constructor(nIn:number){this.nIn=nIn;this.next=2+nIn;}
  rawNand(a:number,b:number){const out=this.next++;this.instructions.push({op:0,a,b,out});return out;}
  nand(a:number,b:number):number {
    if(a===0||b===0)return 1;if(a===1&&b===1)return 0;
    const key=a<b?`${a},${b}`:`${b},${a}`;if(this.memo.has(key))return this.memo.get(key)!;
    const out=this.rawNand(a,b);this.memo.set(key,out);return out;
  }
  not(a:number){return this.nand(a,a);}
  and(a:number,b:number){if(a===b)return a;if(a===1)return b;if(b===1)return a;return this.not(this.nand(a,b));}
  or(a:number,b:number){if(a===b)return a;return this.nand(this.not(a),this.not(b));}
  xor(a:number,b:number){if(a===b)return 0;if(a===0)return b;if(b===0)return a;if(a===1)return this.not(b);if(b===1)return this.not(a);const t=this.nand(a,b);return this.nand(this.nand(a,t),this.nand(b,t));}
  mux(s:number,a:number,b:number){if(a===b)return a;return this.nand(this.nand(s,a),this.nand(this.not(s),b));}
  latch(){const gate:Extract<Instruction,{op:1}>={op:1,d:0,out:this.next++};this.instructions.push(gate);return gate;}
  constant(value:number,width:number){const v=BigInt.asUintN(width,BigInt(value));return Array.from({length:width},(_,i)=>Number(v>>BigInt(i)&1n));}
  add(a:number[],b:number[],carry=0) {return a.map((x,i)=>{const ab=this.xor(x,b[i]);const sum=this.xor(ab,carry);carry=this.nand(this.nand(x,b[i]),this.nand(ab,carry));return sum;});}
  // Signed >= a positive constant; compare magnitude only when sign is nonnegative.
  gePositive(a:number[],value:number){const c=this.constant(value,a.length);let ge=1;for(let i=0;i<a.length-1;i++)ge=c[i]?this.and(a[i],ge):this.or(a[i],ge);return this.and(this.not(a.at(-1)!),ge);}
  finish(outputs:number[]) {
    // Output ports are the final nOut signals. Do not hash-cons these buffer gates.
    const inverted=outputs.map(x=>this.not(x));for(const x of inverted)this.rawNand(x,x);
    return encode(this.instructions);
  }
}
