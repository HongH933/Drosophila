import {compileMicroCore} from '../src/micro-core.ts';
import type {MicroPlan} from '../src/packed-micro.ts';
export function fixture():MicroPlan{return {core:compileMicroCore(),offsets:new Uint32Array([0,2,3,3]),sources:new Uint32Array([1,0,0]),weights:new Int16Array([32767,-32768,-32768]),thresholds:new Uint16Array([32,32767,1]),moduleOffsets:new Uint32Array([0,1,3]),initialV:new Int16Array([-32768,32767,-1]),initialSpikes:new Uint8Array([1,1,0]),frames:[new Uint8Array(),new Uint8Array()],classification:'SYNTHETIC_BOUNDARY_TEST'};}
