import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync('netlify/functions/noor-finance.mjs','utf8');
const ui=readFileSync('assets/js/finance-ui.js','utf8');
test('ledger supports controlled 50, 100, all scope',()=>{assert.match(server,/\['50','100','all'\]/);assert.match(server,/entries:selected/);assert.match(ui,/entryLimit='50'/)});
test('reconciliations are revised via protected audit in single transaction',()=>{assert.match(server,/action==='reconcile-revise'/);assert.match(server,/noorReconciliationRevisions/);assert.match(server,/tx\.create\(audit/);assert.match(server,/tx\.update\(ref/);assert.match(server,/previousCountedCashCents/)});
test('return list has status filter',()=>{assert.match(ui,/Resi completi/);assert.match(ui,/Resi parziali/);assert.match(ui,/returnFilter==='available'/)});
