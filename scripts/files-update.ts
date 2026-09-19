import {writeInventory} from '../src/public-files.ts';
console.log(JSON.stringify({status:'PUBLIC_INVENTORY_UPDATED',files:writeInventory().length}));
