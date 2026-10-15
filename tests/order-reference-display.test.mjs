import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orderDisplayReference,orderFullReference,orderSearchReference} from '../assets/js/order-reference.mjs';
const sale=readFileSync(new URL('../assets/js/sales.js',import.meta.url),'utf8');
const sections=readFileSync(new URL('../assets/js/sections.js',import.meta.url),'utf8');
test('long technical UUID is shortened consistently while underlying ID is preserved',()=>{
  const order={id:'eab7da77d7384d22a553a59769affb2a'};
  assert.equal(orderDisplayReference(order),'N-EAB7DA77D738');
  assert.equal(orderFullReference(order),order.id);
  assert.match(orderSearchReference(order),/eab7da77d7384d22a553a59769affb2a/);
  assert.match(orderSearchReference(order),/n-eab7da77d738/);
});
test('human order labels are not modified',()=>assert.equal(orderDisplayReference({orderNumber:'NOOR-1234'}),'NOOR-1234'));
test('history, modal and paper receipt use short label but barcode preserves source',()=>{
  assert.match(sale,/esc\(orderDisplayReference\(o\)\)/);
  assert.match(sale,/const num=orderDisplayReference\(order\), barcodeReference=orderFullReference\(order\)/);
  assert.match(sale,/orderBarcodeSvg\(barcodeReference\)/);
  assert.match(sections,/orderDisplayReference\(o\)/);
});
