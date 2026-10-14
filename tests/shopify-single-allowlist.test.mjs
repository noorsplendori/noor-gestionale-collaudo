import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isAllowedSingleReconciliation as allowed} from '../netlify/functions/shopify-reconciliation-apply.mjs';
const input={productId:'product_1',variantId:'gid://shopify/ProductVariant/123',warehouseId:'online_1',locationId:'gid://shopify/Location/123'};
const env={NOOR_SHOPIFY_RECONCILIATION_PRODUCT_ID:input.productId,NOOR_SHOPIFY_RECONCILIATION_VARIANT_ID:input.variantId,NOOR_SHOPIFY_RECONCILIATION_WAREHOUSE_ID:input.warehouseId,NOOR_SHOPIFY_RECONCILIATION_LOCATION_ID:input.locationId};
test('one fully matched target is allowed',()=>assert.equal(allowed(input,env),true));
for (const [field,key] of Object.entries({productId:'NOOR_SHOPIFY_RECONCILIATION_PRODUCT_ID',variantId:'NOOR_SHOPIFY_RECONCILIATION_VARIANT_ID',warehouseId:'NOOR_SHOPIFY_RECONCILIATION_WAREHOUSE_ID',locationId:'NOOR_SHOPIFY_RECONCILIATION_LOCATION_ID'})) {
 test('reject changed '+field,()=>assert.equal(allowed({...input,[field]:'different'},env),false));
 test('reject absent configuration '+field,()=>{const e={...env};delete e[key];assert.equal(allowed(input,e),false)});
 test('reject blank configuration '+field,()=>assert.equal(allowed(input,{...env,[key]:''}),false));
}
