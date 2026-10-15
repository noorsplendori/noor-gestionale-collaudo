import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync('netlify/functions/noor-finance.mjs','utf8');
const ui=readFileSync('assets/js/finance-ui.js','utf8');
test('ledger details remain scoped by the server-side site equality queries',()=>{
 assert.match(server,/collection\('noorRefunds'\)\.where\('pointOfSaleId','==',site\)/);
 assert.match(server,/collection\('noorCashMovements'\)\.where\('pointOfSaleId','==',site\)/);
 assert.match(server,/entries:selected,totalEntries:entries.length/);
 assert.match(server,/requestedLimit==='all'/);
});
test('refund preview scoped to order site and central role',()=>{
 assert.match(server,/action==='refund-preview'/);
 assert.match(server,/authorizeFinance\(profile,site,'refund'\)/);
 assert.match(server,/orderSnap\.data\(\)\.pointOfSaleId!==site/);
 assert.match(server,/returnedQty/);
});
test('frontend blocks refund when preview fails and never reinstates stock',()=>{
 assert.match(ui,/request\('refund-preview'/);
 assert.match(ui,/btn\.disabled=true/);
 assert.match(ui,/restock:false/);
 assert.match(ui,/currentEntries=d.entries\|\|\[\]/);
});
