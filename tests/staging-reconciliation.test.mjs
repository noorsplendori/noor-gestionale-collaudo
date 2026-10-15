import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCashReconciliation} from '../netlify/lib/noor-finance-core.mjs';
const basic={operationId:'reconcile_test_1234',pointOfSaleId:'NR-001',day:'2026-10-15',countedCashCents:1050,note:'Contanti'};
test('quadratura calcola differenza in centesimi interi',()=>assert.equal(validateCashReconciliation(basic,1000).differenceCents,50));
test('quadratura rifiuta importi non interi',()=>assert.throws(()=>validateCashReconciliation({...basic,countedCashCents:10.5},1000)));
test('quadratura richiede sede',()=>assert.throws(()=>validateCashReconciliation({...basic,pointOfSaleId:''},1000)));
test('quadratura rifiuta teoria non affidabile',()=>assert.throws(()=>validateCashReconciliation(basic,NaN)));
