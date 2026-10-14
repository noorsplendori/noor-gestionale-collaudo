import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkCommitPayload} from '../netlify/functions/shopify-commit-payload-check.mjs';
const src=readFileSync(new URL('../netlify/functions/shopify-reconciliation-apply.mjs',import.meta.url),'utf8');
test('real commit constructs canonical Firestore resource names',()=>{
 assert.match(src,/const documentRoot=`projects\/\$\{PROJECT\}\/databases\/\(default\)\/documents`/);
 assert.match(src,/const markerName=`\$\{documentRoot\}\/shopifySingleReconciliations\/\$\{requestId\}`/);
 assert.match(src,/const movementName=`\$\{documentRoot\}\/stockMovements\/shopify_reconcile_\$\{requestId\}`/);
 assert.match(src,/name:`\$\{documentRoot\}\/products\/\$\{encodeURIComponent\(productId\)\}`/);
 assert.doesNotMatch(src,/name:`\$\{base\}\/products/);
});
test('preflight rejects HTTP URLs as Firestore document resource names',()=>{
 const root='projects/gestionalenoor-2fa61/databases/(default)/documents';
 const t='2026-10-11T11:00:00Z'; const fields={inventoryByWarehouse:{mapValue:{fields:{main:{mapValue:{fields:{qty:{integerValue:'2'}}}}}}}};
 const writes=[{update:{name:`${root}/products/SHOPIFY_1`,fields},updateMask:{fieldPaths:['inventoryByWarehouse']},currentDocument:{updateTime:t}},{update:{name:`${root}/stockMovements/m1`,fields:{}},currentDocument:{exists:false}},{update:{name:`${root}/shopifySingleReconciliations/m1`,fields:{}},currentDocument:{exists:false}}];
 const expected={productId:'SHOPIFY_1',warehouseId:'main',updateTime:t};
 assert.equal(checkCommitPayload({writes},expected).ok,true);
 for(const w of writes)w.update.name='https://firestore.googleapis.com/v1/'+w.update.name;
 assert.equal(checkCommitPayload({writes},expected).checks.pathsValid,false);
});
