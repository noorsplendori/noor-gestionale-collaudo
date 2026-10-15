import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const store=readFileSync(new URL('../assets/js/store.js',import.meta.url),'utf8');
test('modifica ordini storici vietata dopo attivazione periodo',()=>{
  assert.match(rules,/function orderInActivePeriod\(\)/);
  assert.match(rules,/match \/orders\/\{orderId\}[\s\S]*?allow update: if[^;]*orderInActivePeriod\(\)/);
});
test('venditori non scrivono inventario da client',()=>{
  assert.match(rules,/match \/products\/\{productId\}[\s\S]*?allow update: if can\('manageProducts'\);/);
  assert.match(store,/async function saveOrderOriginal\(order\)\{\s+if\(!can\('manageProducts'\)\)/);
});
