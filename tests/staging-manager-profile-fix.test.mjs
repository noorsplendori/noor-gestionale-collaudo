import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const store=fs.readFileSync(new URL('../assets/js/store.js',import.meta.url),'utf8');
const sections=fs.readFileSync(new URL('../assets/js/sections.js',import.meta.url),'utf8');
const rules=fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
test('self profile writes omit updatedBy and reject forbidden changes',()=>{
 assert.match(store,/if\(self&&!can\('manageEmployees'\)\)/);
 assert.match(store,/if\(!self\|\|can\('manageEmployees'\)\)write\.updatedBy/);
 assert.match(rules,/hasOnly\(\['name','firstName','lastName','photo','avatar','phone','updatedAt','updatedAtClient'\]\)/);
});
test('profile form only updates authorized fields',()=>{
 assert.match(sections,/updateEmployeeProfile\(p\.uid,\{name:.*avatar:/);
 assert.doesNotMatch(sections,/updateEmployeeProfile\(p\.uid,\{name:.*email:/);
 assert.match(sections,/id="profileEmail"[^>]*readonly/);
});
test('order listeners still use point of sale scoped reads',()=>{
 assert.match(store,/where\('pointOfSaleId','==',id\|\|'__NO_SEDE_ASSEGNATA__'\)/);
 assert.match(rules,/readOwnPointOfSale\(\)/);
});
