import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('independent finance and returns routes with navigation',()=>{const html=read('index.html'),router=read('assets/js/router.js');for(const route of ['finance','returns']){assert.match(html,new RegExp('data-route="'+route+'"'));assert.match(html,new RegExp('id="route-'+route+'"'));assert.match(router,new RegExp(route+":\\["));assert.match(router,new RegExp(route+":'/"));}});
test('finance operations use backend only, are scoped, and do not touch Shopify',()=>{const code=read('assets/js/finance-ui.js');assert.match(code,/noor-finance/);assert.match(code,/pointOfSaleId:site\.id/);assert.match(code,/getIdToken\(\)/);assert.match(code,/restock:false/);assert.doesNotMatch(code,/collection\(|setDoc\(|updateDoc\(|runTransaction\(|shopify/i);});
test('finance interface included in route hooks',()=>{const code=read('assets/js/app.js');assert.match(code,/renderFinance\(\)/);assert.match(code,/renderReturns\(\)/);});
