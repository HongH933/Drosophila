export type PackedPlan={core:unknown;offsets:Uint32Array;sources:Uint32Array;weights:Int16Array;thresholds:Uint16Array;moduleOffsets:Uint32Array;frames:Uint8Array[];initialV:Int16Array;initialSpikes:Uint8Array;classification:string};
export function validatePackedData(p:Omit<PackedPlan,'core'>){
 const n=p.thresholds.length;if(!n||p.offsets.length!==n+1||p.offsets[0]!==0||p.offsets[n]!==p.sources.length||p.weights.length!==p.sources.length||p.initialV.length!==n||p.initialSpikes.length!==n||p.moduleOffsets[0]!==0||p.moduleOffsets.at(-1)!==n||!p.frames.length)throw Error('PACKED_SHAPE');
 for(let i=0;i<n;i++){if(p.offsets[i+1]<p.offsets[i]||p.thresholds[i]<1||p.thresholds[i]>32767||p.initialSpikes[i]>1)throw Error('PACKED_NEURON');let absolute=16384;for(let e=p.offsets[i];e<p.offsets[i+1];e++)absolute+=Math.abs(p.weights[e]);if(absolute>524287)throw Error('PACKED_ACCUMULATOR');}
 for(let s=0;s<p.moduleOffsets.length-1;s++){const first=p.moduleOffsets[s],last=p.moduleOffsets[s+1];if(last<=first||last-first>16||p.offsets[last]-p.offsets[first]>65536)throw Error('PACKED_MODULE');}
 const ext=p.frames[0].length;for(const frame of p.frames)if(frame.length!==ext||frame.some(v=>v>1))throw Error('PACKED_FRAME');for(const source of p.sources)if(source<0x80000000?source>=n:source-0x80000000>=ext)throw Error('PACKED_SOURCE');
}
