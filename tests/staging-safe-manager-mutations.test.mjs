import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const store=readFileSync(new URL('../assets/js/store.js',import.meta.url),'utf8');
test('manager can read only own economic records',()=>{
 assert.match(rules,/function managerReadsOwnSite\(\)[\s\S]*?readOwnPointOfSale\(\)/);
 assert.match(rules,/function readOwnPointOfSale\(\)[\s\S]*?resource\.data\.get\('pointOfSaleId', ''\) == myPointOfSale\(\)/);
});
test('manager cannot modify orders or cancelledOrders even with override',()=>{
 assert.match(rules,/allow update: if myRole\(\) != 'manager' && orderInActivePeriod\(\)/);
 assert.match(rules,/allow create: if myRole\(\) != 'manager' && can\('cancelOrders'\)/);
 assert.match(rules,/allow update: if myRole\(\) != 'manager' && can\('cancelOrders'\)/);
 assert.match(rules,/allow delete: if myRole\(\) != 'manager' && can\('cancelOrders'\)/);
});
test('client blocks stock-affecting cancellation for manager',()=>{
 for(const name of ['cancelOrder','partialCancelOrder','restoreCancelledOrder']){
  const start=store.indexOf('export async function '+name+'(');
  assert.notEqual(start,-1);
  assert.match(store.slice(start,start+430),/role.*manager.*STAGING/);
 }
});
test('seller order creation remains blocked without manageProducts',()=>{
 assert.match(rules,/allow create: if can\('sell'\) && can\('manageProducts'\)/);
});
