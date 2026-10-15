// Riferimento leggibile per gli ordini; l’ID completo resta invariato nel database.
// Il riferimento abbreviato è un’etichetta visiva, non una chiave primaria.
export function orderFullReference(order) {
  return String(order?.orderNumber || order?.orderId || order?.id || '').trim();
}
export function orderDisplayReference(order) {
  const full = orderFullReference(order);
  return /^[0-9a-f]{24,}$/i.test(full) ? 'N-' + full.slice(0, 12).toUpperCase() : full;
}
export function orderSearchReference(order) {
  return [orderFullReference(order), orderDisplayReference(order)].join(' ').toLowerCase();
}
