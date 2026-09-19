// Test harness: fail on attempted networking rather than assert an unmeasured zero.
const state={mode:'NODE_NETWORK_APIS_BLOCKED',attempts:0};
Object.defineProperty(globalThis,'__drosoNetworkGuard',{value:state,writable:false});
const deny=()=>{state.attempts++;throw Error('OFFLINE_NETWORK_FORBIDDEN');};
globalThis.fetch=deny;
for(const name of ['node:net','node:tls','node:http','node:https','node:dgram','node:dns']){const m=require(name);for(const k of ['connect','createConnection','request','get','createSocket','lookup','resolve'])if(k in m)m[k]=deny;}
require('node:module').syncBuiltinESMExports();
