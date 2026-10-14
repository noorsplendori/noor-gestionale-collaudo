import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const store=readFileSync(new URL('assets/js/store.js',root),'utf8');
const sections=readFileSync(new URL('assets/js/sections.js',root),'utf8');
const rules=readFileSync(new URL('firestore.rules',root),'utf8');
test('owner only and no localhost writes',()=>{
 assert.match(store,/\['owner','superadmin','super-admin'\]/);
 assert.match(store,/location\.hostname/);
 assert.match(store,/runTransaction\(db/);
 assert.match(store,/managementPeriodStartAt/);
 assert.match(store,/openShifts\.empty/);
});
test('UI requires typed confirmation and in-app dialog',()=>{
 assert.match(sections,/managementPeriodConfirmCode/);
 assert.match(sections,/confirmDialog\(/);
 assert.match(sections,/activateManagementPeriod\(\)/);
 assert.doesNotMatch(sections,/const code=prompt\(/);
});
test('Firestore locks management period fields',()=>{
 assert.match(rules,/periodProtectedUpdate/);
 assert.match(rules,/managementPeriodActivatedBy/);
 assert.match(rules,/\|\| \(isOwner\(\)/);
});
