import test from 'node:test';import assert from 'node:assert/strict';
import {validateCancellation,computeRestock} from '../netlify/lib/noor-cancel-core.mjs';
const settings={pointsOfSale:[{id:'NR-001'}],warehouses:[{id:'w1',name:'THEORIA'},{id:'w2',name:'NOOR ONLINE'}]};
const admin={role:'admin',active:true};
const makeOrder=(warehouseId='w1')=>({source:'noor-staging-backend',status:'completed',pointOfSaleId:'NR-001',createdAtClient:'2026-10-15T10:00:00Z',items:[{productId:'abc',warehouseId,qty:2}]});
test('annullamento locale sicuro',()=>assert.equal(validateCancellation(makeOrder(),admin,settings,'2026-10-14')[0].qty,2));
test('manager non annulla',()=>assert.throws(()=>validateCancellation(makeOrder(),{role:'manager'},settings,''),/amministratori/));
test('online protetto',()=>assert.throws(()=>validateCancellation(makeOrder('w2'),admin,settings,''),/ONLINE/));
test('periodo precedente protetto',()=>assert.throws(()=>validateCancellation(makeOrder(),admin,settings,'2026-10-16'),/precedente/));
test('ordini legacy protetti',()=>assert.throws(()=>validateCancellation({...makeOrder(),source:'legacy'},admin,settings,''),/non annullabile/));
test('reintegro locale coerente',()=>assert.equal(computeRestock({inventoryByWarehouse:{w1:{qty:9}}},'w1',2,'w1').qty,11));
test('giacenza corrotta rifiutata',()=>assert.throws(()=>computeRestock({inventoryByWarehouse:{w1:{qty:-1}}},'w1',2,'w1'),/non affidabile/));

test('ordine parzialmente annullato non viene reintegrato due volte',()=>assert.throws(()=>validateCancellation({...makeOrder(),partialCancelled:true},admin,settings,''),/non annullabile/));
test('ordine ripristinato non viene reintegrato nuovamente',()=>assert.throws(()=>validateCancellation({...makeOrder(),restoredFromCancelled:true},admin,settings,''),/non annullabile/));
test('magazzino collegato a Shopify non viene reintegrato',()=>assert.throws(()=>validateCancellation(makeOrder('w3'),admin,{...settings,warehouses:[...settings.warehouses,{id:'w3',name:'WEB',shopifyLocationId:'12345'}]},''),/ONLINE/));
