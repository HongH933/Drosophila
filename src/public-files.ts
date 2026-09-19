import fs from 'node:fs';
import path from 'node:path';
import {fileHash,atomic} from './integrity.ts';
export function publicFiles(){const files:string[]=[];
 const walk=(dir:string)=>{for(const name of fs.readdirSync(dir).sort()){if(['.git','node_modules','.cache','results','release','.DS_Store'].includes(name)||(name.startsWith('.env')&&name!=='.env.example'))continue;const f=path.posix.join(dir,name),s=fs.lstatSync(f);if(s.isSymbolicLink())throw Error('RELEASE_SYMLINK');if(s.isDirectory())walk(f);else if(s.isFile()&&f!=='checksums/files.json')files.push(f);}};
 walk('.');return files;
}
export function writeInventory(){const files=publicFiles();atomic('checksums/files.json',{schema:'droso-public-files-v1',files:files.map(file=>({file,bytes:fs.statSync(file).size,sha256:fileHash(file)}))});return files;}
