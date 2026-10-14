import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const store=fs.readFileSync(new URL('../assets/js/store.js',import.meta.url),'utf8');
const rules=fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const router=fs.readFileSync(new URL('../assets/js/router.js',import.meta.url),'utf8');
test('manager non eredita all true',()=>{
 assert.match(store,/manager:\{sell:true/);
 assert.doesNotMatch(store,/manager:\{all:true\}/);
 assert.match(rules,/return isOwner\(\) \|\| myRole\(\) == 'admin';/);
});
test('manager privilegi elevati negati anche con override',()=>{
 for(const p of ['settings','manageEmployees','manageProducts','manageDiscounts','viewAccessLogs']){
  assert.ok(store.includes(p));assert.ok(rules.includes(p));
 }
 assert.match(store,/if\(r==='manager'&&\[/);
 assert.match(rules,/!\(myRole\(\) == 'manager' && permission in/);
});
test('route anagrafiche protetta e scritture settings riservate al centro',()=>{
 assert.match(router,/'points-of-sale':'settings'/);
 assert.match(store,/if\(!can\('settings'\)\)throw new Error/);
 assert.match(rules,/allow update: if centralReporting\(\) && can\('settings'\)/);
});
