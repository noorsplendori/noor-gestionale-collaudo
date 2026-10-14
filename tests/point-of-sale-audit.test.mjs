import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPointOfSaleCoverage} from '../assets/js/point-of-sale-audit.mjs';
test('reports missing and unknown site ids without changing input',()=>{
 const settings={pointsOfSale:[{id:'NR-001'}]};
 const rows=[{pointOfSaleId:'NR-001'},{pointOfSaleId:''},{pointOfSaleId:'NR-999'}];
 const result=auditPointOfSaleCoverage(settings,{orders:rows});
 assert.deepEqual(result.rows[0],{label:'Vendite',key:'orders',total:3,assigned:1,without:1,unknown:1});
 assert.equal(rows[0].pointOfSaleId,'NR-001');
 assert.equal(result.unassigned,1);
});
