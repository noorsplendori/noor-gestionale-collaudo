import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSaleInput,priceAndDecrement,SaleError} from '../netlify/lib/noor-sale-core.mjs';
const store=readFileSync(new URL('../assets/js/store.js',import.meta.url),'utf8');
const func=readFileSync(new URL('../netlify/functions/noor-sale.mjs',import.meta.url),'utf8');
test('all legacy cancellation entry points are blocked in staging',()=>{
 for (const fn of ['cancelOrder','partialCancelOrder','restoreCancelledOrder']) {
  const body=store.split(`export async function ${fn}(`)[1]?.split('\n}')[0];
  assert.ok(body?.includes('throw new Error('), fn);
  assert.ok(!body?.includes('cancelOrderOriginal')&&!body?.includes('partialCancelOrderOriginal')&&!body?.includes('restoreCancelledOrderOriginal'));
 }
});
test('sale endpoint is isolated to localhost, disabled by env flag and staging project id',()=>{
 assert.match(func,/allowedOrigin\(origin\)/);
 assert.match(func,/NOOR_STAGING_SALES_ENABLED/);
 assert.match(func,/noor-collaudo-2026/);
 assert.match(func,/verifyIdToken\(token,true\)/);
});
test('online warehouse requires explicit permission',()=>{
 const settings={pointsOfSale:[{id:'NR-001',warehouseId:'theoria'}],warehouses:[{id:'theoria',name:'THEORIA'},{id:'online',name:'NOOR ONLINE'}]};
 const request={saleId:'my_safe_order_001',pointOfSaleId:'NR-001',payment:'cash',items:[{productId:'test',warehouseId:'online',qty:1}]};
 const user={role:'manager',active:true,pointOfSaleId:'NR-001'};
 assert.throws(()=>validateSaleInput(request,user,settings),SaleError);
 assert.equal(validateSaleInput(request,{...user,sellOnline:true},settings).items[0].warehouseId,'online');
});
test('inactive warehouse product cannot be sold',()=>{
 assert.throws(()=>priceAndDecrement({inventoryByWarehouse:{theoria:{qty:10,price:10,active:false}}},'theoria',1,'theoria'),SaleError);
});
test('pricing refuses fractions of a cent',()=>{
 assert.throws(()=>priceAndDecrement({inventoryByWarehouse:{theoria:{qty:10,price:10.001}}},'theoria',1,'theoria'),SaleError);
});
