import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {safeStock} from '../netlify/functions/shopify-auto-sync-policy.mjs';
const v=(i,barcode='',sku='')=>({id:`gid://shopify/ProductVariant/${i}`,barcode,sku,tracked:true,quantity:2,inventoryItemId:`gid://shopify/InventoryItem/${i}`});
const p=(id,barcode='',sku='',variantId='')=>({id,barcode,sku,shopifyVariantId:variantId,inventoryByWarehouse:{main:{qty:2},local:{qty:40}}});
test('matches unique barcode when imported products lack variant ids',()=>{
 const out=safeStock([p('a','123')],[v(10,'123')],'main');assert.equal(out[0].kind,'matched');assert.equal(out[0].product.id,'a');assert.equal(out[0].noorQty,2);
});
test('matches unique SKU when barcode absent',()=>assert.equal(safeStock([p('a','','ITEM-A')],[v(10,'','item-a')],'main')[0].kind,'matched'));
test('rejects ambiguous barcode, SKU and conflicting variant IDs',()=>{
 assert.equal(safeStock([p('a','X'),p('b','X')],[v(10,'X')],'main')[0].reason,'ambiguous_mapping');
 assert.equal(safeStock([p('a','X')],[v(10,'X'),v(11,'X')],'main')[0].reason,'duplicate_shopify_code');
 assert.equal(safeStock([p('a','X','','gid://shopify/ProductVariant/11')],[v(10,'X')],'main')[0].reason,'conflicting_variant_id');
});
test('one Noor document cannot be assigned to two Shopify variants',()=>{
 const result=safeStock([p('a','X','Z')],[v(10,'X'),v(11,'','Z')],'main');
 assert.equal(result.filter(x=>x.kind==='matched').length,0);assert.equal(result.filter(x=>x.reason==='duplicate_noor_mapping').length,2);
});
test('local stock is never selected by online matcher',()=>{
 const result=safeStock([p('a','X')],[v(10,'X')],'main');assert.equal(result[0].noorQty,2);assert.notEqual(result[0].noorQty,40);
});
