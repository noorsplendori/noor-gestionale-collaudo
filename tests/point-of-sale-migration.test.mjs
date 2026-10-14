import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../assets/js/point-of-sale-migration.mjs',import.meta.url),'utf8');
test('F13 includes closures and excludes users',()=>{assert.match(s,/closures:22/);assert.match(s,/orders:324,shifts:37/);assert.match(s,/if\(name in EXPECTED\)/);assert.match(s,/runTransaction/)});
test('F13 requires Super Admin and never overwrites a different point of sale',()=>{assert.match(s,/isMigrationAdmin\(profile\)/);assert.match(s,/if\(current\|\|legacy/);assert.match(s,/preview\?\.valid/)});
test('F13 does not write money or stock',()=>{assert.doesNotMatch(s,/transaction\.update\(ref,\{[^}]*\b(total|amount|qty|inventoryByWarehouse)\b/s)});
