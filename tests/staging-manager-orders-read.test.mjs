import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const store=readFileSync(new URL('../assets/js/store.js',import.meta.url),'utf8');
test('Manager read requires document belonging to assigned POS',()=>{
 assert.match(rules,/function managerReadsOwnSite\(\)\s*\{\s*return activeUser\(\) && myRole\(\) == 'manager' && readOwnPointOfSale\(\);/);
 assert.match(rules,/resource\.data\.get\('pointOfSaleId', ''\) == myPointOfSale\(\)/);
});
test('Orders and closures allow direct scoped manager reads without broad read',()=>{
 assert.match(rules,/match \/orders\/\{orderId\} \{\s*allow read: if managerReadsOwnSite\(\)/);
 assert.match(rules,/match \/closures\/\{closureId\} \{\s*allow read: if managerReadsOwnSite\(\)/);
});
test('The client query always includes the assigned POS',()=>{
 assert.match(store,/where\('pointOfSaleId','==',id\|\|'__NO_SEDE_ASSEGNATA__'\)/);
 assert.match(store,/financialSource\('orders'/);
});
