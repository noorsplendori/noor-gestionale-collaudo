import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCommitCandidate} from '../netlify/functions/shopify-commit-preflight.mjs';
const doc={updateTime:'2026-10-11T10:00:00.123Z',fields:{inventoryByWarehouse:{mapValue:{fields:{main:{mapValue:{fields:{qty:{integerValue:'2'}}}}}}},name:{stringValue:'test'}}};
test('valid product structure passes preflight',()=>assert.equal(checkCommitCandidate({product:doc,warehouseId:'main',fieldPaths:['inventoryByWarehouse']}).ok,true));
test('missing update time detected',()=>assert.equal(checkCommitCandidate({product:{fields:doc.fields},warehouseId:'main',fieldPaths:['inventoryByWarehouse']}).checks.versionPresent,false));
test('invalid Firestore field encoding detected',()=>assert.equal(checkCommitCandidate({product:{...doc,fields:{...doc.fields,name:'bad'}},warehouseId:'main',fieldPaths:['inventoryByWarehouse']}).checks.fieldValuesValid,false));
test('missing warehouse stock detected',()=>assert.equal(checkCommitCandidate({product:doc,warehouseId:'local',fieldPaths:['inventoryByWarehouse']}).checks.stockShape,false));
test('invalid update mask detected',()=>assert.equal(checkCommitCandidate({product:doc,warehouseId:'main',fieldPaths:['inventoryByWarehouse','inventoryByWarehouse']}).checks.writeMaskValid,false));
