import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {decideSync,isOnlineWarehouse,safeStock} from '../netlify/functions/shopify-auto-sync-policy.mjs';
test('bootstrap only when equal',()=>{assert.equal(decideSync(null,2,2),'bootstrap');assert.equal(decideSync(null,2,1),'conflict_uninitialized')});
test('single-side changes',()=>{assert.equal(decideSync(2,2,1),'shopify_to_noor');assert.equal(decideSync(2,1,2),'noor_to_shopify')});
test('conflicts fail closed',()=>{assert.equal(decideSync(2,1,3),'conflict_both_changed');assert.equal(decideSync(2,-1,1),'invalid');assert.equal(decideSync(2,0,0),'aligned')});
test('online warehouse only',()=>{const w=[{id:'main',name:'ONLINE',active:true},{id:'local',name:'LOCALE',active:true}];assert.equal(isOnlineWarehouse(w,'main'),true);assert.equal(isOnlineWarehouse(w,'local'),false);assert.equal(isOnlineWarehouse([...w,{id:'other',name:'online',active:true}],'main'),false)});
test('unknown and duplicate mappings excluded',()=>{const p={id:'x',shopifyVariantId:'gid://shopify/ProductVariant/7',inventoryByWarehouse:{main:{qty:3}}};const v={id:p.shopifyVariantId,tracked:true,quantity:2,inventoryItemId:'gid://shopify/InventoryItem/9'};assert.equal(safeStock([p],[v],'main')[0].kind,'matched');assert.equal(safeStock([p,p],[v],'main')[0].reason,'duplicate_mapping');assert.equal(safeStock([],[v],'main')[0].kind,'skip')});
