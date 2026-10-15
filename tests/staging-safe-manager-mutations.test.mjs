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
test('storno completo riservato al backend e annullamenti parziali bloccati',()=>{
 const start=store.indexOf('export async function cancelOrder(order)');
 assert.ok(start>=0);
 const full=store.slice(start,store.indexOf('export async function partialCancelOrder',start));
 assert.match(full,/STAGING_CANCEL_ENDPOINT/);
 assert.match(full,/auth\.currentUser\.getIdToken/);
 assert.match(full,/noor-staging-backend/);
 assert.match(full,/\['owner','admin','superadmin','super-admin'\]/);
 assert.match(full,/method:'POST'/);
 for(const name of ['partialCancelOrder','restoreCancelledOrder']){
  const index=store.indexOf('export async function '+name+'(');
  assert.ok(index>=0);
  assert.match(store.slice(index,index+160),/throw new Error/);
 }
});
test('seller order creation remains blocked without manageProducts',()=>{
 assert.match(rules,/allow create: if can\('sell'\) && can\('manageProducts'\)/);
});
