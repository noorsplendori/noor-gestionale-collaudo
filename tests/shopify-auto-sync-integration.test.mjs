import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,randomUUID} from 'node:crypto';
import {scheduledRun} from '../netlify/functions/shopify-auto-sync-worker.mjs';

const store=new Map();let seq=0,shopQty=2,shopMutationCount=0;
const ROOT='projects/gestionalenoor-2fa61/databases/(default)/documents';
const simpleDoc=(name,fields)=>({name:`${ROOT}/${name}`,fields,updateTime:`2026-10-11T12:00:${String(++seq).padStart(2,'0')}Z`});
const str=s=>({stringValue:s}),n=x=>({integerValue:String(x)});
const warehouses={arrayValue:{values:[{mapValue:{fields:{id:str('main'),name:str('ONLINE'),active:{booleanValue:true}}}},{mapValue:{fields:{id:str('local'),name:str('LOCALE'),active:{booleanValue:true}}}}]}};
const inventory={mapValue:{fields:{main:{mapValue:{fields:{qty:n(2)}}},local:{mapValue:{fields:{qty:n(50)}}}}}};
const productId='SHOPIFY_123',variantId='gid://shopify/ProductVariant/123';
const JSONResponse=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
function fakeFirestoreCommit(writes){
 for(const w of writes){const name=w.update?.name||w.verify;const doc=store.get(name);if(w.currentDocument?.exists===false&&doc)return JSONResponse({error:{status:'ALREADY_EXISTS'}},409);if(w.currentDocument?.updateTime!==undefined&&doc?.updateTime!==w.currentDocument.updateTime)return JSONResponse({error:{status:'FAILED_PRECONDITION'}},409)}
 for(const w of writes){if(w.verify)continue;let doc=store.get(w.update.name);if(w.updateMask){if(!doc)return JSONResponse({error:{status:'NOT_FOUND'}},404);const copy=structuredClone(doc.fields);for(const path of w.updateMask.fieldPaths)copy[path]=w.update.fields[path];doc=simpleDoc(w.update.name.slice(ROOT.length+1),copy)}else doc=simpleDoc(w.update.name.slice(ROOT.length+1),w.update.fields);store.set(w.update.name,doc)}
 return JSONResponse({writeResults:writes.map(()=>({}))});
}
function fakeFetch(url,init={}){
 const u=new URL(String(url));
 if(u.hostname==='oauth2.googleapis.com')return Promise.resolve(JSONResponse({access_token:'FAKE_GOOGLE_TOKEN'}));
 if(u.hostname==='7dt1x0-8i.myshopify.com'){
  if(u.pathname.endsWith('/access_token'))return Promise.resolve(JSONResponse({access_token:'FAKE_SHOPIFY_TOKEN'}));
  const data=JSON.parse(init.body||'{}');if(data.query.includes('products(first:'))return Promise.resolve(JSONResponse({data:{products:{pageInfo:{hasNextPage:false,endCursor:null},nodes:[{variants:{pageInfo:{hasNextPage:false},nodes:[{id:variantId,inventoryItem:{id:'gid://shopify/InventoryItem/900',tracked:true,inventoryLevel:{quantities:[{name:'available',quantity:shopQty}]}}}]}}]}}}));
  if(data.query.includes('productVariant(id:'))return Promise.resolve(JSONResponse({data:{productVariant:{id:variantId,inventoryItem:{tracked:true,inventoryLevel:{quantities:[{name:'available',quantity:shopQty}]}}}}}));
  if(data.query.includes('inventorySetQuantities')){
   shopMutationCount++;
   const q=data.variables.input.quantities[0];if(q.changeFromQuantity!==shopQty)return Promise.resolve(JSONResponse({data:{inventorySetQuantities:{inventoryAdjustmentGroup:null,userErrors:[{code:'COMPARE_QUANTITY_ERROR'}]}}}));
   shopQty=q.quantity;return Promise.resolve(JSONResponse({data:{inventorySetQuantities:{inventoryAdjustmentGroup:{createdAt:'2026-10-11'},userErrors:[]}}}));
  }
 }
 if(u.hostname==='firestore.googleapis.com'){
  if(u.pathname.endsWith('/documents:commit'))return Promise.resolve(fakeFirestoreCommit(JSON.parse(init.body).writes));
  const part=u.pathname.split('/documents/')[1];
  if(part==='products')return Promise.resolve(JSONResponse({documents:[store.get(`${ROOT}/products/${productId}`)]}));
  const doc=store.get(`${ROOT}/${part}`);return Promise.resolve(doc?JSONResponse(doc):JSONResponse({error:{status:'NOT_FOUND'}},404));
 }
 throw Error('unexpected_request '+u.pathname);
}
test('two directions, safe bootstrap, unaffected LOCALE, Firestore CAS and Shopify CAS',async()=>{
 const prevFetch=globalThis.fetch;
 const vars=['FIREBASE_SERVICE_ACCOUNT_JSON','SHOPIFY_SHOP_DOMAIN','SHOPIFY_CLIENT_ID','SHOPIFY_CLIENT_SECRET','NOOR_SHOPIFY_RECONCILIATION_LOCATION_ID','NOOR_SHOPIFY_RECONCILIATION_WAREHOUSE_ID','NOOR_SHOPIFY_AUTO_SYNC_ENABLED','NOOR_SHOPIFY_AUTO_SYNC_WRITES_ENABLED','NOOR_SHOPIFY_AUTO_SYNC_ROLLOUT','NOOR_SHOPIFY_AUTO_SYNC_ALLOWED_VARIANTS'];
 const original=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 Object.assign(process.env,{FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'gestionalenoor-2fa61',client_email:'test@test.iam.gserviceaccount.com',private_key:privateKey}),SHOPIFY_SHOP_DOMAIN:'7dt1x0-8i.myshopify.com',SHOPIFY_CLIENT_ID:'test',SHOPIFY_CLIENT_SECRET:'test',NOOR_SHOPIFY_RECONCILIATION_LOCATION_ID:'gid://shopify/Location/555',NOOR_SHOPIFY_RECONCILIATION_WAREHOUSE_ID:'main',NOOR_SHOPIFY_AUTO_SYNC_ENABLED:'true',NOOR_SHOPIFY_AUTO_SYNC_WRITES_ENABLED:'true',NOOR_SHOPIFY_AUTO_SYNC_ROLLOUT:'true',NOOR_SHOPIFY_AUTO_SYNC_ALLOWED_VARIANTS:variantId});
 store.clear();seq=0;shopQty=2;shopMutationCount=0;
 store.set(`${ROOT}/settings/global`,simpleDoc('settings/global',{warehouses}));
 store.set(`${ROOT}/products/${productId}`,simpleDoc(`products/${productId}`,{name:str('Test'),shopifyVariantId:str(variantId),inventoryByWarehouse:inventory,deleted:{booleanValue:false}}));
 globalThis.fetch=fakeFetch;
 try{
  const a=await scheduledRun();assert.equal(a.initialized,1);assert.equal(a.appliedNoorToShopify,0);
  shopQty=1;
  // Safe preview: when writes are disabled, differences are queued not treated as real conflicts.
  process.env.NOOR_SHOPIFY_AUTO_SYNC_WRITES_ENABLED='false';
  const preview=await scheduledRun();assert.equal(preview.pendingShopifyToNoor,1);assert.equal(preview.conflicts,0);
  assert.equal(Number(store.get(`${ROOT}/products/${productId}`).fields.inventoryByWarehouse.mapValue.fields.main.mapValue.fields.qty.integerValue),2);
  process.env.NOOR_SHOPIFY_AUTO_SYNC_WRITES_ENABLED='true';
  const b=await scheduledRun();assert.equal(b.appliedShopifyToNoor,1);
  let p=store.get(`${ROOT}/products/${productId}`);assert.equal(Number(p.fields.inventoryByWarehouse.mapValue.fields.main.mapValue.fields.qty.integerValue),1);
  assert.equal(Number(p.fields.inventoryByWarehouse.mapValue.fields.local.mapValue.fields.qty.integerValue),50);
  const updated=structuredClone(p.fields);updated.inventoryByWarehouse.mapValue.fields.main.mapValue.fields.qty=n(0);store.set(p.name,simpleDoc(`products/${productId}`,updated));
  const c=await scheduledRun();assert.equal(c.appliedNoorToShopify,1);assert.equal(shopQty,0);assert.equal(shopMutationCount,1);
  const d=await scheduledRun();assert.equal(d.aligned,1);assert.equal(shopMutationCount,1);
  shopQty=5;const changed=structuredClone(store.get(p.name).fields);changed.inventoryByWarehouse.mapValue.fields.main.mapValue.fields.qty=n(3);store.set(p.name,simpleDoc(`products/${productId}`,changed));
  const e=await scheduledRun();assert.equal(e.conflicts,1);assert.equal(shopQty,5);
  assert.equal(Number(store.get(p.name).fields.inventoryByWarehouse.mapValue.fields.main.mapValue.fields.qty.integerValue),3);
  // Resume a durable Shopify intent after an interrupted attempt; keep the same key.
  shopQty=0;
  const pendingQty=4;
  const recover=structuredClone(store.get(p.name).fields);
  recover.inventoryByWarehouse.mapValue.fields.main.mapValue.fields.qty=n(pendingQty);
  store.set(p.name,simpleDoc(`products/${productId}`,recover));
  const path=`shopifyAutoSyncStates/${createHash('sha256').update('7dt1x0-8i.myshopify.com|'+variantId).digest('hex')}`;
  const oldState=store.get(`${ROOT}/${path}`);
  const old=structuredClone(oldState.fields);
  Object.assign(old,{status:str('pending_shopify'),pendingFromQty:n(0),pendingTargetQty:n(4),pendingKey:str(randomUUID())});
  store.set(`${ROOT}/${path}`,simpleDoc(path,old));
  const f=await scheduledRun();assert.equal(f.appliedNoorToShopify,1);assert.equal(shopQty,4);
  assert.equal(store.get(`${ROOT}/${path}`).fields.status.stringValue,'aligned');

 }finally{
  globalThis.fetch=prevFetch;
  for(const k of vars){if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k]}
 }
});
