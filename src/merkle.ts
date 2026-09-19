import {encodeAbiParameters,parseAbiParameters,keccak256,type Hex} from 'viem';
export const ZERO=('0x'+'00'.repeat(32)) as Hex;
export const indexedLeaf=(index:number,contentHash:Hex)=>keccak256(encodeAbiParameters(parseAbiParameters('uint256 index,bytes32 contentHash'),[BigInt(index),contentHash]));
export const V3_SLOT_ABI=parseAbiParameters('(uint8 width,uint32 gateCount,uint32 netlistBytes,bytes32 netlistHash,bytes32 edgeRoot,uint32[] neurons,uint32[] edgeCounts,uint16[] thresholds,bytes initialState)');
