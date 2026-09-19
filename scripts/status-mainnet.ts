import {atomic,encode} from '../src/integrity.ts';
import {mainnetRpcURL,readonlyRpc,observeMainnet,StatusError} from '../src/mainnet-status.ts';
const args=process.argv.slice(2);
if(args.some(x=>x!=='--verify-deployment')){console.error('Only optional --verify-deployment is supported. This command is read-only.');process.exit(1);}
let report:any;
try {
 const url=mainnetRpcURL();
 report=url?await observeMainnet(readonlyRpc(url),undefined,args.includes('--verify-deployment')):{schema:'droso-mainnet-observation-v1',status:'NOT_RUN',reason:'BSC_MAINNET_RPC_URL_NOT_CONFIGURED',chainId:56,publicTransactions:0};
}catch(e){report={schema:'droso-mainnet-observation-v1',status:'UNAVAILABLE',reason:e instanceof StatusError?e.message:'READ_OR_DECODE_FAILED',chainId:56,publicTransactions:0,partial:e instanceof StatusError?e.partial:undefined};process.exitCode=1;}
atomic('results/mainnet-status.json',report);console.log(encode(report));
