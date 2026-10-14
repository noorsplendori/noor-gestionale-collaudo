import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handler} from '../netlify/functions/noor-sale.mjs';
const store=readFileSync('assets/js/store.js','utf8');
const sales=readFileSync('assets/js/sales.js','utf8');
test('checkout routes to staging backend only and no direct save fallback',()=>{
  assert.match(store,/STAGING_SALE_ENDPOINT/);
  assert.match(store,/export async function saveOrder\(order\)\{/);
  assert.match(store,/Bearer /);
  assert.match(sales,/const confirmed=await saveOrder\(order\)/);
  assert.match(sales,/pendingSale\.id/);
});
test('GET does not record sale',async()=>{const r=await handler({httpMethod:'GET',headers:{}});assert.equal(r.statusCode,405)});
test('CORS localhost OPTIONS is allowed',async()=>{const r=await handler({httpMethod:'OPTIONS',headers:{origin:'http://localhost:5501'}});assert.equal(r.statusCode,204);assert.equal(r.headers['access-control-allow-origin'],'http://localhost:5501')});
test('CORS unknown origins denied',async()=>{const r=await handler({httpMethod:'OPTIONS',headers:{origin:'https://example.com'}});assert.equal(r.statusCode,403)});
test('POST with flag false refuses before credentials',async()=>{const prev=process.env.NOOR_STAGING_SALES_ENABLED;process.env.NOOR_STAGING_SALES_ENABLED='false';try{const r=await handler({httpMethod:'POST',headers:{origin:'http://localhost:5501'}});assert.equal(r.statusCode,503);assert.equal(JSON.parse(r.body).error,'Vendite backend di collaudo non abilitate')}finally{if(prev===undefined)delete process.env.NOOR_STAGING_SALES_ENABLED;else process.env.NOOR_STAGING_SALES_ENABLED=prev}});
