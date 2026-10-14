import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const store=readFileSync(new URL('../assets/js/store.js',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
test('storico ordini non richiama una query globale per gli operatori',()=>{
  assert.match(store,/loadOrderHistory\(max=300\).*?getDocs\(financialSource\('orders'/s);
});
test('caricamenti lazy delle collezioni economiche usano il filtro di sede',()=>{
  assert.match(store,/getLazyCollection\(name,max=200\).*?financialSource\(name,/s);
  for(const key of ['orders','shifts','closures','cancelledOrders'])assert.match(store,new RegExp("'"+key+"'"));
});
test('annullamenti non possono cambiare pointOfSaleId durante update da sede',()=>{
  assert.match(rules,/match \/cancelledOrders\/\{recordId\}[\s\S]*?allow update: if[^;]*request\.resource\.data\.get\('pointOfSaleId'/);
});
test('rimosso il permesso sell per modifiche dirette di inventario',()=>{
  assert.doesNotMatch(rules,/\(can\('viewStock'\) \|\| can\('sell'\)\) && onlyInventoryFieldsChanged/);
  assert.match(rules,/match \/products\/\{productId\}[\s\S]*?allow update: if can\('manageProducts'\);/);
});
