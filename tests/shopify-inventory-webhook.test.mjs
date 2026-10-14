// Tests isolated from production: no network, no actual Shopify/Firestore calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac, generateKeyPairSync} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const path=pathToFileURL(resolve('netlify/functions/shopify-inventory-webhook.mjs')).href;
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const account={project_id:'gestionalenoor-2fa61',client_email:'noor-test@gestionalenoor-2fa61.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})};
const envBackup={...process.env};
const fetchBackup=globalThis.fetch;
const payload={inventory_item_id:123456,location_id:654321,available:7,updated_at:'2026-10-10T20:00:00Z'};
const json=JSON.stringify(payload);
const secret='test-only-not-a-real-secret';
const shop='test-shop.myshopify.com';
let calls;
let documents;
let failWrite;
function createRequest({body=json,topic='inventory_levels/update',source=shop,id='abcdefff-1234-4567-890a-123456789abc',signature=true,method='POST'}={}) {
  const hmac=createHmac('sha256',secret).update(body).digest('base64');
  const headers={'x-shopify-topic':topic,'x-shopify-shop-domain':source,'x-shopify-webhook-id':id,'x-shopify-hmac-sha256':signature?hmac:'bad'};
  return new Request('https://example.invalid/api/shopify/inventory-webhook',{method,headers,body:method==='POST'?body:undefined});
}
async function invoke(options) {
  const {default:handler}=await import(path);
  const res=await handler(createRequest(options));
  return {status:res.status,body:await res.json()};
}
function setup() {
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON=JSON.stringify(account);
  process.env.SHOPIFY_CLIENT_SECRET=secret;
  process.env.SHOPIFY_SHOP_DOMAIN=shop;
  calls=[];documents=new Map();failWrite=false;
  globalThis.fetch=async (input,opts={})=>{
    calls.push({input:String(input),method:opts.method});
    if(String(input).includes('oauth2.googleapis.com/token'))return new Response(JSON.stringify({access_token:'test-token'}),{status:200});
    if(String(input).includes('firestore.googleapis.com')){
      if(failWrite)return new Response('unavailable',{status:503});
      const id=new URL(input).searchParams.get('documentId');
      if(documents.has(id))return new Response('already exists',{status:409});
      documents.set(id,JSON.parse(opts.body));
      return new Response('{}',{status:200});
    }
    throw new Error('Unexpected network request');
  };
}
test('protected webhook inbox: accepted, duplicate, invalid signature, errors, no inventory writes',async t=>{
  t.after(()=>{globalThis.fetch=fetchBackup;process.env=envBackup;});
  await t.test('GET is rejected without backend access',async()=>{setup(); const r=await invoke({method:'GET'}); assert.equal(r.status,405);assert.equal(calls.length,0);});
  await t.test('invalid signature is rejected before persistence',async()=>{setup();const r=await invoke({signature:false});assert.equal(r.status,401);assert.equal(calls.length,0);});
  await t.test('wrong shop/topic are rejected before persistence',async()=>{setup();assert.equal((await invoke({source:'other.myshopify.com'})).status,403);assert.equal((await invoke({topic:'orders/create'})).status,403);assert.equal(calls.length,0);});
  await t.test('valid event is stored once and never written to inventory',async()=>{
    setup(); const first=await invoke({}); const second=await invoke({});
    assert.equal(first.status,200);assert.equal(first.body.code,'recorded_not_processed');
    assert.equal(second.status,200);assert.equal(second.body.code,'already_recorded');
    assert.equal(documents.size,1);
    assert.equal([...documents.values()][0].fields.status.stringValue,'pending_not_processed');
    assert.ok(calls.every(c=>c.input.includes('oauth2.googleapis.com/token')||c.input.includes('/documents/shopifyInventoryWebhookInbox?documentId=')));
    assert.equal(first.body.inventoryWritesEnabled,false);
  });
  await t.test('persistence failure returns retriable 503',async()=>{setup();failWrite=true;const r=await invoke({});assert.equal(r.status,503);assert.equal(r.body.code,'firestore_write_failed');assert.equal(documents.size,0);});
});
