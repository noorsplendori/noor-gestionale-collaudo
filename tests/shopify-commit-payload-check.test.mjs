import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCommitPayload} from '../netlify/functions/shopify-commit-payload-check.mjs';
const base='projects/p/databases/(default)/documents';
const stamp='2026-10-11T11:00:00.123456Z';
const V=n=>({integerValue:String(n)});
function fixture(){const fields={inventoryByWarehouse:{mapValue:{fields:{main:{mapValue:{fields:{qty:V(1)}}}}}},updatedAt:{timestampValue:stamp}};return {writes:[{update:{name:`${base}/products/SHOPIFY_1`,fields},updateMask:{fieldPaths:['inventoryByWarehouse','updatedAt']},currentDocument:{updateTime:stamp}},{update:{name:`${base}/stockMovements/shopify_reconcile_1`,fields:{qty:V(1)}},currentDocument:{exists:false}},{update:{name:`${base}/shopifySingleReconciliations/1`,fields:{qty:V(1)}},currentDocument:{exists:false}}]};}
const expected={productId:'SHOPIFY_1',warehouseId:'main',updateTime:stamp};
test('valid atomic payload shape',()=>assert.equal(checkCommitPayload(fixture(),expected).ok,true));
test('detects missing product updateTime',()=>{let p=fixture();delete p.writes[0].currentDocument.updateTime;assert.equal(checkCommitPayload(p,expected).checks.casUpdateTime,false)});
test('detects invalid update mask',()=>{let p=fixture();p.writes[0].updateMask.fieldPaths=['bad.path'];assert.equal(checkCommitPayload(p,expected).checks.updateMaskValid,false)});
test('detects create-once guard omission',()=>{let p=fixture();delete p.writes[1].currentDocument;assert.equal(checkCommitPayload(p,expected).checks.createOnlyMarkers,false)});
test('detects duplicate document name',()=>{let p=fixture();p.writes[2].update.name=p.writes[1].update.name;assert.equal(checkCommitPayload(p,expected).checks.uniqueDocuments,false)});
test('detects wrong product target',()=>assert.equal(checkCommitPayload(fixture(),{...expected,productId:'OTHER'}).checks.expectedProduct,false));
test('does not accept missing writes',()=>assert.equal(checkCommitPayload({},expected).ok,false));
