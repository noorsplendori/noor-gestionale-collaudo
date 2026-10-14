// Il nuovo periodo NON modifica o elimina documenti o giacenze.
export function recordTime(record){
 const raw=record?.createdAtClient||record?.startAtClient||record?.date||record?.createdAt||record?.startAt||'';
 if(raw?.toDate)return raw.toDate().getTime();
 const millis=Date.parse(String(raw||''));return Number.isFinite(millis)?millis:NaN;
}
export function periodStart(settings){const value=settings?.managementPeriodStartAt;const ms=Date.parse(String(value||''));return value&&Number.isFinite(ms)?ms:null}
export function inManagementPeriod(record,settings){const start=periodStart(settings);return start===null||recordTime(record)>=start}
export function isLegacyRecord(record,settings){const start=periodStart(settings);return start!==null&&!(recordTime(record)>=start)}
export function checkedPeriodStart(settings){const start=periodStart(settings);return start===null?'':new Date(start).toISOString()}

// Diagnostica preparatoria: opera soltanto sui record caricati, senza scritture.
export function previewPeriodBySite({orders=[],shifts=[],closures=[]}={},siteId='',cutoff=Date.now()){
 const target=String(siteId||'').trim();
 if(!target)throw new Error('Seleziona una sede valida.');
 const isTarget=r=>String(r?.pointOfSaleId||'').trim()===target;
 const isPrevious=r=>{const t=recordTime(r);return !Number.isFinite(t)||t<cutoff};
 const oldOrders=orders.filter(r=>isTarget(r)&&isPrevious(r));
 const oldShifts=shifts.filter(r=>isTarget(r)&&isPrevious(r));
 const oldClosures=closures.filter(r=>isTarget(r)&&isPrevious(r));
 const missing={orders:orders.filter(r=>!String(r?.pointOfSaleId||'').trim()).length,shifts:shifts.filter(r=>!String(r?.pointOfSaleId||'').trim()).length,closures:closures.filter(r=>!String(r?.pointOfSaleId||'').trim()).length};
 const validSales=oldOrders.filter(o=>o.cancelled!==true&&!String(o.status||'').toLowerCase().includes('cancel'));
 return {siteId:target,orders:oldOrders.length,shifts:oldShifts.length,closures:oldClosures.length,salesTotal:validSales.reduce((sum,o)=>sum+(Number(o.total)||0),0),missing,hasUnassigned:Object.values(missing).some(n=>n>0)};
}
