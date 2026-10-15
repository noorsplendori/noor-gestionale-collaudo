// STAGING only: deterministic full cancellation policy. No online warehouse restock.
import {SaleError} from './noor-sale-core.mjs';
const str=v=>String(v??'').trim();
export function validateCancellation(order, profile, settings, periodStart) {
  if (!profile || profile.active===false || !['owner','superadmin','super-admin','admin'].includes(profile.role)) throw new SaleError(403,'Annullamento riservato agli amministratori.');
  if (!order || order.source!=='noor-staging-backend' || order.status!=='completed' || order.cancelled===true || order.partialCancelled===true || order.restoredFromCancelled===true) throw new SaleError(409,'Ordine non annullabile da questo percorso.');
  if (!str(order.pointOfSaleId) || !(settings.pointsOfSale||[]).some(p=>str(p.id)===str(order.pointOfSaleId))) throw new SaleError(409,'Sede non valida.');
  if (periodStart && (!str(order.createdAtClient) || str(order.createdAtClient)<periodStart)) throw new SaleError(409,'Ordine di periodo precedente: annullamento vietato.');
  if (!Array.isArray(order.items)||!order.items.length) throw new SaleError(409,'Righe ordine assenti.');
  const warehouses=settings.warehouses||[];
  const restocks=new Map();
  for (const line of order.items) {
    const id=str(line.productId), warehouseId=str(line.warehouseId), qty=Number(line.qty);
    if(!/^[\w-]{1,150}$/.test(id)||!warehouseId||!Number.isSafeInteger(qty)||qty<=0) throw new SaleError(409,'Riga ordine non affidabile.');
    const w=warehouses.find(w=>str(w.id)===warehouseId);
    if(!w)throw new SaleError(409,'Magazzino origine non trovato.');
    if(/^(noor\s*)?online$/i.test(str(w.name)) || /^(noor[ _-]?)?online$/i.test(warehouseId) || w.isOnline===true || w.shopifyConnected===true || w.shopifyLocationId) throw new SaleError(409,'Annullamento con magazzino ONLINE bloccato finché non è integrata la sincronizzazione Shopify.');
    const key=`${id}@@${warehouseId}`;
    restocks.set(key,{productId:id,warehouseId,qty:qty+(restocks.get(key)?.qty||0)});
  }
  return [...restocks.values()];
}
export function computeRestock(product, warehouseId, qty, primaryWarehouseId) {
  const map={...(product?.inventoryByWarehouse||{})};
  const entry=map[warehouseId];
  if(!entry || !Number.isSafeInteger(Number(entry.qty)) || Number(entry.qty)<0)throw new SaleError(409,'Giacenza non affidabile: annullamento rifiutato.');
  const after=Number(entry.qty)+qty;
  if(!Number.isSafeInteger(after) || after>100000000)throw new SaleError(409,'Giacenza risultante non valida.');
  map[warehouseId]={...entry,qty:after};
  const patch={inventoryByWarehouse:map};
  if(warehouseId===primaryWarehouseId)Object.assign(patch,{qty:after,stock:after,quantity:after});
  return patch;
}
