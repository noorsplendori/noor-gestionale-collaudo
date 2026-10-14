import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const store=readFileSync(new URL('../assets/js/store.js',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const sale=store.slice(store.indexOf('async function saveOrderOriginal(order){'),store.indexOf('async function cancelOrderOriginal('));
test('vendita: nessun fallback da cache dopo quota Firestore',()=>{
 assert.match(sale,/await runTransaction\(db/);
 assert.doesNotMatch(sale,/writeBatch\(/);
 assert.doesNotMatch(sale,/quotaFallback/);
 assert.match(sale,/Vendita NON registrata/);
});
test('venditore non può registrare ordini fittizi o movimenti da client',()=>{
 const orders=rules.slice(rules.indexOf('match /orders/{orderId}'),rules.indexOf('match /cancelledOrders/'));
 assert.match(orders,/allow create: if can\('sell'\) && can\('manageProducts'\)/);
 const movements=rules.slice(rules.indexOf('match /stockMovements/'),rules.indexOf('match /shifts/'));
 assert.match(movements,/allow create: if can\('manageProducts'\);/);
});
