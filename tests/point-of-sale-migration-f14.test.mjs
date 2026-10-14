import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../assets/js/point-of-sale-migration.mjs',import.meta.url),'utf8');
const sections=readFileSync(new URL('../assets/js/sections.js',import.meta.url),'utf8');
test('F14 identifies all three collections including legacy closures',()=>{
 assert.match(migration,/orders:324,shifts:37,closures:22/);
 assert.match(migration,/legacyReview\.push\(item\)/);
 assert.match(migration,/candidateTotal=eligible\.length\+legacyReview\.length/);
 assert.match(sections,/Documenti candidati: '\+preview\.candidateTotal/);
});
test('F14 requires separate explicit legacy approval, does not silently discard legacy values',()=>{
 assert.match(sections,/id="posMigrationLegacyApprove"/);
 assert.match(migration,/approveLegacy=false/);
 assert.match(migration,/legacy!==item\.legacyStoreId/);
 assert.match(migration,/posMigrationSource:'NOOR_V2\.5\.85_F14'/);
});
test('F14 re-scans before writes and checks each doc transactionally',()=>{
 assert.match(migration,/const fresh=migrationPreview\(await readAllPointOfSaleCollections\(\),targetId\)/);
 assert.match(migration,/freshKeys\.some/);
 assert.match(migration,/runTransaction\(db/);
 assert.doesNotMatch(migration,/transaction\.update\(ref,\{[^}]*\b(total|amount|qty|inventoryByWarehouse)\b/s);
});
