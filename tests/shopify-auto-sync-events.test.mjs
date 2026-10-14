import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {shouldWakeShopifyEvent} from '../netlify/functions/shopify-auto-sync-event-policy.mjs';
const allowed={enabled:true,wakeEnabled:true,persisted:true,eventLocation:'gid://shopify/Location/108937609543',configuredLocation:'gid://shopify/Location/108937609543',waitUntilAvailable:true};
test('only verified and persisted event from configured Shopify location wakes worker',()=>{
 assert.equal(shouldWakeShopifyEvent(allowed),true);
 for(const k of ['enabled','wakeEnabled','persisted','waitUntilAvailable'])assert.equal(shouldWakeShopifyEvent({...allowed,[k]:false}),false,k);
 assert.equal(shouldWakeShopifyEvent({...allowed,testOnly:true}),false);
 assert.equal(shouldWakeShopifyEvent({...allowed,eventLocation:'gid://shopify/Location/123'}),false);
 assert.equal(shouldWakeShopifyEvent({...allowed,configuredLocation:'123'}),false);
});
test('Noor write hooks exist for critical operations and do not send inventory quantities',()=>{
 const src=fs.readFileSync(new URL('../assets/js/store.js',import.meta.url),'utf8');
 for(const name of ['upsertProduct','updateStock','bulkUpdateStock','transferStock','saveOrder','cancelOrder','partialCancelOrder','restoreCancelledOrder','deleteProduct','restoreProduct','permanentlyDeleteProduct']){
  assert.match(src,new RegExp(`export async function ${name}\\(`));
  assert.match(src,new RegExp(`async function ${name}Original\\(`));
 }
 assert.match(src,/await operation\(\)/);
 assert.match(src,/wakeTouchesOnline\(affected\)/);
 assert.match(src,/Authorization:`Bearer \$\{token\}`/);
 assert.doesNotMatch(src,/fetch\('\/api\/shopify\/auto-sync-wake',[\s\S]{0,150}body:/);
});
test('wake endpoint does not accept inventory quantities or unverified users',()=>{
 const src=fs.readFileSync(new URL('../netlify/functions/shopify-auto-sync-wake.mjs',import.meta.url),'utf8');
 assert.match(src,/await authenticate\(request\)/);
 assert.match(src,/isSyncActiveUser\(claims.sub\)/);
 assert.match(src,/claimSyncWake\(\)/);
 assert.match(src,/context.waitUntil\(scheduledRun\(\)\)/);
 assert.doesNotMatch(src,/request\.json\(/);
});
