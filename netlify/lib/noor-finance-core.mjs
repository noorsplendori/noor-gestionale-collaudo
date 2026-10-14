// NOOR STAGING: deterministic validations shared by returns and monetary ledger.
import {SaleError} from './noor-sale-core.mjs';
const text = v => String(v ?? '').trim();
const cents = v => Number.isSafeInteger(v) && v >= 0 && v <= 100000000;
export const centralRole = role => ['owner','superadmin','super-admin','admin'].includes(role);
export function authorizeFinance(profile,site,kind='read') {
  if(!profile || profile.active===false) throw new SaleError(403,'Utente non attivo.');
  const central=centralRole(profile.role);
  if(!text(site) || (!central && text(profile.pointOfSaleId)!==text(site))) throw new SaleError(403,'Sede non autorizzata.');
  if(kind==='refund' && !central) throw new SaleError(403,'Rimborso riservato agli amministratori durante il collaudo.');
  if(kind==='adjust' && !central) throw new SaleError(403,'Movimento di cassa riservato agli amministratori durante il collaudo.');
  if(!central && !['manager','supervisor'].includes(profile.role)) throw new SaleError(403,'Consultazione monetaria non autorizzata.');
  return {central,pointOfSaleId:text(site)};
}
export function validateRefund(input,order,previous=[]) {
  if(!input || typeof input!=='object')throw new SaleError(400,'Dati reso assenti.');
  if(!order || order.status!=='completed' || order.source!=='noor-staging-backend')throw new SaleError(409,'Ordine non idoneo al reso di collaudo.');
  const id=text(input.operationId),reason=text(input.reason);
  if(!/^[a-zA-Z0-9_-]{12,90}$/.test(id))throw new SaleError(400,'Identificativo reso non valido.');
  if(reason.length<4 || reason.length>500)throw new SaleError(400,'Motivo reso obbligatorio (4-500 caratteri).');
  if(!Array.isArray(input.items) || !input.items.length || input.items.length>60)throw new SaleError(400,'Righe reso non valide.');
  const lines=order.items||[];const already=new Map();
  for(const old of previous){if(old.status!=='completed')continue;for(const p of old.items||[]){const key=`${p.productId}@@${p.warehouseId}`;already.set(key,(already.get(key)||0)+p.qty);}}
  const used=new Set();let amountCents=0;
  const items=input.items.map(item=>{
    const productId=text(item.productId),warehouseId=text(item.warehouseId),qty=Number(item.qty),restock=item.restock===true;
    if(restock)throw new SaleError(409,'Reintegro automatico disabilitato fino al collaudo completo di magazzino e Shopify.');
    const key=`${productId}@@${warehouseId}`;
    if(used.has(key))throw new SaleError(400,'Riga reso duplicata.');used.add(key);
    if(!Number.isSafeInteger(qty)||qty<=0)throw new SaleError(400,'Quantità reso non valida.');
    const original=lines.filter(i=>text(i.productId)===productId&&text(i.warehouseId)===warehouseId);
    if(original.length!==1)throw new SaleError(409,'Riga non riconosciuta o duplicata nell’ordine.');
    const sold=Number(original[0].qty),price=Number(original[0].price);
    if(!Number.isSafeInteger(sold)||sold<=0||!Number.isFinite(price)||Math.round(price*100)!==price*100||price<0)throw new SaleError(409,'Dati ordine non affidabili.');
    if(qty+(already.get(key)||0)>sold)throw new SaleError(409,'Quantità già resa o superiore al venduto.');
    const refundCents=Math.round(price*100)*qty;amountCents+=refundCents;
    return {productId,warehouseId,qty,restock,unitPriceCents:Math.round(price*100),refundCents};
  });
  if(!cents(amountCents)||amountCents===0)throw new SaleError(409,'Importo rimborso non valido.');
  if(text(input.refundMethod)!=='cash')throw new SaleError(400,'Solo rimborso contanti contabilizzabile nel collaudo; pagamenti elettronici da gestire esternamente.');
  // Account-level store credit and external payment refunds deliberately not automated.
  return {operationId:id,reason,items,amountCents,refundMethod:text(input.refundMethod)};
}
export function validateCashMovement(input){
  const id=text(input.operationId),site=text(input.pointOfSaleId),type=text(input.type),reason=text(input.reason),amountCents=Number(input.amountCents);
  if(!/^[a-zA-Z0-9_-]{12,90}$/.test(id)||!site)throw new SaleError(400,'Identificativo operazione o sede non valido.');
  if(!['cash_in','cash_out'].includes(type))throw new SaleError(400,'Tipologia movimento non valida.');
  if(!Number.isSafeInteger(amountCents)||amountCents<=0||!cents(amountCents))throw new SaleError(400,'Importo in centesimi non valido.');
  if(reason.length<4||reason.length>500)throw new SaleError(400,'Causale obbligatoria.');
  return {operationId:id,pointOfSaleId:site,type,reason,amountCents};
}
export function summarizeLedger(orders,refunds,movements){
  const sum=(array,key)=>array.reduce((n,d)=>n+Number(d[key]||0),0);
  const salesCents=orders.filter(d=>d.status==='completed').reduce((n,d)=>n+Math.round(Number(d.total||0)*100),0);
  const refundCents=sum(refunds.filter(d=>d.status==='completed'),'amountCents');
  const cashInCents=sum(movements.filter(d=>d.type==='cash_in'),'amountCents');
  const cashOutCents=sum(movements.filter(d=>d.type==='cash_out'),'amountCents');
  return {salesCents,refundCents,cashInCents,cashOutCents,netCents:salesCents-refundCents+cashInCents-cashOutCents};
}
