import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../assets/js/finance-ui.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../netlify/functions/noor-finance.mjs',import.meta.url),'utf8');
test('receipt display uses short reference without changing order id',()=>{assert.match(ui,/const orderCode=orderDisplayReference/);assert.match(ui,/orderId:String\(order\.id\)/)});
test('return badges distinguish complete and partial returns',()=>{assert.match(ui,/RESO PARZIALE/);assert.match(ui,/refundBadge\(o\)/);assert.match(ui,/refundBadge\(order\)/)});
test('backend return statuses scoped to point of sale',()=>{assert.match(api,/action==='refund-status'/);assert.match(api,/\.where\('pointOfSaleId','==',site\)/)});
