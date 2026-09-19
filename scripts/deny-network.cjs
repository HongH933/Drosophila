// Clean-environment reproduction harness only: any networking attempt fails the run.
const deny=()=>{throw Error('OFFLINE_NETWORK_FORBIDDEN');};
globalThis.fetch=deny;
for(const name of ['node:net','node:tls','node:http','node:https','node:dgram','node:dns']){const m=require(name);for(const k of ['connect','createConnection','request','get','createSocket','lookup','resolve'])if(k in m)m[k]=deny;}
require('node:module').syncBuiltinESMExports();
