import assert from 'node:assert/strict';
import {previewPeriodBySite} from '../assets/js/management-period.mjs';
const input={orders:[{pointOfSaleId:'NR-002',createdAtClient:'2026-10-01T10:00:00Z',total:40},{pointOfSaleId:'NR-002',createdAtClient:'2026-10-01T11:00:00Z',total:30,cancelled:true},{pointOfSaleId:'NR-001',createdAtClient:'2026-10-01T09:00:00Z',total:90},{createdAtClient:'2026-10-01T08:00:00Z',total:20}],shifts:[{pointOfSaleId:'NR-002',startAtClient:'2026-10-01T07:00:00Z'}],closures:[{pointOfSaleId:'NR-002',date:'2026-10-01'}]};
const v=previewPeriodBySite(input,'NR-002',Date.parse('2026-10-14T00:00:00Z'));
assert.equal(v.orders,2);assert.equal(v.salesTotal,40);assert.equal(v.shifts,1);assert.equal(v.closures,1);assert.equal(v.missing.orders,1);assert.equal(v.hasUnassigned,true);assert.throws(()=>previewPeriodBySite(input));console.log('period preview: 7 assertions OK');
