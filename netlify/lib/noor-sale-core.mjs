// Backend STAGING: pure sale policy / price and stock validation.
export class SaleError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const asId = value => String(value ?? '').trim();
const isPositiveInt = v => Number.isSafeInteger(v) && v > 0 && v <= 10000;
export function validateSaleInput(input, profile, settings) {
  if (!profile || profile.active === false || !['owner','superadmin','super-admin','admin','manager','supervisor','seller'].includes(profile.role)) throw new SaleError(403,'Utente non autorizzato.');
  if (!input || typeof input !== 'object' || !Array.isArray(input.items) || !input.items.length || input.items.length > 60) throw new SaleError(400,'Carrello non valido.');
  const saleId = asId(input.saleId);
  if (!/^[a-zA-Z0-9_-]{12,90}$/.test(saleId)) throw new SaleError(400,'Identificativo vendita non valido.');
  if (profile.permissionOverrides?.sell === false || profile.extraPermissions?.sell === false) throw new SaleError(403,'Permesso di vendita disabilitato.');
  const site = asId(profile.pointOfSaleId);
  const central = ['owner','superadmin','super-admin','admin'].includes(profile.role);
  const pointOfSaleId = central ? asId(input.pointOfSaleId || site) : site;
  const pointOfSale = (settings.pointsOfSale || []).find(s=>asId(s.id)===pointOfSaleId && s.active!==false && s.deleted!==true);
  if (!pointOfSale || !pointOfSaleId) throw new SaleError(403,'Punto vendita non autorizzato o inattivo.');
  if (!central && asId(input.pointOfSaleId || site)!==site) throw new SaleError(403,'Sede diversa da quella assegnata.');
  const warehouses = (settings.warehouses || []).filter(w=>w.active!==false && w.deleted!==true);
  const online = warehouses.find(w=>asId(w.name).toLowerCase()==='noor online' || asId(w.name).toLowerCase()==='online');
  const assigned = asId(pointOfSale.warehouseId);
  const permitOnline = profile.sellOnline === true || profile.canSellOnline === true || profile.permissionOverrides?.sellOnline === true;
  const permitted = central ? new Set(warehouses.map(w=>asId(w.id))) : new Set([assigned, ...(permitOnline && online ? [asId(online.id)] : [])]);
  const items = input.items.map(line=>{
    const productId=asId(line.productId), warehouseId=asId(line.warehouseId || assigned), qty=Number(line.qty);
    if(!/^[a-zA-Z0-9_-]{1,150}$/.test(productId) || !isPositiveInt(qty))throw new SaleError(400,'Riga prodotto non valida.');
    if(!permitted.has(warehouseId) || !warehouses.some(w=>asId(w.id)===warehouseId))throw new SaleError(403,'Magazzino non autorizzato.');
    return {productId,warehouseId,qty};
  });
  if (!['cash','card','contanti','pos'].includes(asId(input.payment).toLowerCase())) throw new SaleError(400,'Pagamento non supportato in questa prima versione.');
  return {saleId,pointOfSaleId,items,payment:asId(input.payment)};
}
export function priceAndDecrement(product,warehouseId,qty,primaryWarehouseId) {
  if (!product || product.deleted===true)throw new SaleError(409,'Prodotto non disponibile.');
  const map = {...(product.inventoryByWarehouse || {})};
  const entry = map[warehouseId] || (warehouseId===primaryWarehouseId ? {qty:product.qty ?? product.stock ?? product.quantity ?? 0,price:product.price,finalPrice:product.finalPrice,discountActive:product.discountActive} : null);
  if (!entry || entry.deleted===true || entry.active===false)throw new SaleError(409,'Prodotto non presente nel magazzino.');
  const current=Number(entry.qty);
  if (!Number.isSafeInteger(current) || current < qty)throw new SaleError(409,'Giacenza insufficiente.');
  const price=Number(entry.discountActive && Number(entry.finalPrice)>0 ? entry.finalPrice : (entry.price ?? product.price));
  if (!Number.isFinite(price) || price<0 || price>100000 || Math.round(price*100)/100!==price)throw new SaleError(409,'Prezzo prodotto non valido.');
  const after=current-qty;
  map[warehouseId]={...entry,qty:after};
  const patch={inventoryByWarehouse:map};
  if(warehouseId===primaryWarehouseId)Object.assign(patch,{qty:after,stock:after,quantity:after});
  return {patch,price,lineTotalCents:Math.round(price*100)*qty,quantityBefore:current,quantityAfter:after};
}
