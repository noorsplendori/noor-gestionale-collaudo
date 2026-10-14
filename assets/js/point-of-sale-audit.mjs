// Diagnostica di sola lettura: non costituisce verifica di sicurezza o migrazione.
export function auditPointOfSaleCoverage(settings={},collections={}) {
  const points=(settings.pointsOfSale||[]).filter(p=>p&&p.id);
  const ids=new Set(points.map(p=>String(p.id)));
  const names=[['Vendite','orders'],['Turni','shifts'],['Chiusure','closures'],['Dipendenti','employees']];
  const rows=names.map(([label,key])=>{
    const records=Array.isArray(collections[key])?collections[key]:[];
    let without=0,unknown=0,assigned=0;
    for(const r of records){
      const id=String(r?.pointOfSaleId||'').trim();
      if(!id)without++;
      else if(!ids.has(id))unknown++;
      else assigned++;
    }
    return {label,key,total:records.length,assigned,without,unknown};
  });
  return {points:points.length,rows,unassigned:rows.reduce((n,r)=>n+r.without,0),unknown:rows.reduce((n,r)=>n+r.unknown,0)};
}
