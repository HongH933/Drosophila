import {readJSON} from './integrity.ts';
import type {Abi} from 'viem';
export const ba=readJSON('build/BrainAssemblyMicroPages.json').abi as Abi,da=readJSON('build/StaticMicroData.json').abi as Abi;
export const ca=readJSON('abi/Circuits.json') as Abi,fa=readJSON('abi/CircuitFactory.json') as Abi;
