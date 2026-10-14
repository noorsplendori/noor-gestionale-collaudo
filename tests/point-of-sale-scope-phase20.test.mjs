import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../assets/js/store.js',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
test('financial listeners are scoped',()=>{for(const name of ['orders','shifts','closures','cancelledOrders'])assert.match(s,new RegExp("financialSource\\('"+name+"'"));});
test('financial collections enforce tenant reads',()=>{assert.match(rules,/function readOwnPointOfSale/);for(const name of ['orders','shifts','closures','cancelledOrders'])assert.match(rules,new RegExp('match /'+name+'/\\{'));});
