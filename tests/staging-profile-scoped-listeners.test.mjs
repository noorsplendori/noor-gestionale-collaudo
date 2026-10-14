import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const store=readFileSync(new URL('../assets/js/store.js',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
test('I listener economici partono solo dopo il profilo verificato',()=>{
 const block=app.slice(app.indexOf('function openAuthenticatedApp(user)'),app.indexOf('function enterAuthenticated(user)'));
 assert.doesNotMatch(block.slice(0,block.indexOf('function refreshProfile(user)')),/startCoreListeners\(/);
 assert.match(block,/loadProfile\(user\)\.then\(\(\)=>\{/);
 assert.match(block,/applyProfile\(\);[\s\S]*?startCoreListeners\(\)/);
});
test('Le query dei manager sono vincolate al punto vendita',()=>{
 assert.match(store,/where\('pointOfSaleId','==',id\|\|'__NO_SEDE_ASSEGNATA__'\)/);
 assert.match(store,/listenCollection\('orders'[\s\S]*?financialSource\('orders'/);
 assert.match(store,/loadOrderHistory\(max=300\)[\s\S]*?financialSource\('orders'/);
});
test('Nessuna cache economica riutilizzata tra account in staging',()=>{
 assert.match(store,/export function hydrateFastHomeCache\(\)\{return null;/);
 assert.match(store,/function persistFastHomeCache\(\)\{return;/);
});
test('I manager non hanno autorizzazioni amministrative sulle sedi',()=>{
 assert.match(rules,/myRole\(\) == 'manager' && permission in \['settings','manageEmployees','manageProducts'/);
 assert.match(rules,/match \/settings\/\{docId\} \{[\s\S]*?allow update: if centralReporting\(\) && can\('settings'\)/);
});
