import { keccak256,concatHex,type Hex } from 'viem';
import { ZERO } from './merkle.ts';
/** O(log N) commitment memory, using the V3 empty-subtree rule. */
export class IncrementalMerkle{
 private stack:(Hex|undefined)[]=[];count=0;
 append(value:Hex){let level=0,n=this.count++;while(n&1){const left=this.stack[level]!;value=left===ZERO&&value===ZERO?ZERO:keccak256(concatHex([left,value]));this.stack[level]=undefined;level++;n=Math.floor(n/2);}this.stack[level]=value;}
 finish(){if(!this.count)return ZERO;let base=1;while(base<this.count)base*=2;while(this.count<base)this.append(ZERO);return this.stack[Math.log2(base)]!;}
}
