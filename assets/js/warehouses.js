// NOOR V2.5.85 FASE 2 — Creazione magazzino con inizializzazione atomica.
// ATTENZIONE: non completa l'isolamento multi-sede (regole Firebase da sviluppare).
import {state,warehouses,productWarehouseData,can,loadSettings,saveSettings} from './store.js';
import {db,auth} from './firebase.js';
import {doc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {esc,toast,confirmDialog,openModal} from './ui.js';
const $=s=>document.querySelector(s);
const allProducts=()=>state.products.filter(p=>p.deleted!==true);
let working=false;
function currentSelection(){
  const mode=$('#whSourceMode')?.value||'existing';
  const source=$('#whSourceId')?.value||'';
  const quantities=$('#whQuantities')?.value||'zero';
  const chosen=mode==='empty'?[]:mode==='existing'?allProducts().filter(p=>{const map=p.inventoryByWarehouse||{};const primary=String(warehouses()[0]?.id||'main');return (Object.prototype.hasOwnProperty.call(map,source)||String(source)===primary)&&productWarehouseData(p,source).deleted!==true}):allProducts().filter(p=>$('#whSelect_'+CSS.escape(String(p.id)))?.checked);
  return {mode,source,quantities,chosen};
}
function renderSummary(){
  const el=$('#whWizardSummary');if(!el)return;
  const {mode,source,quantities,chosen}=currentSelection();
  const n=chosen.length;
  const sum=quantities==='copy'?chosen.reduce((s,p)=>s+Math.max(0,productWarehouseData(p,source).qty),0):0;
  el.textContent=mode==='empty'?'Il nuovo magazzino sarà vuoto.':`${n} schede prodotto da inizializzare. Giacenze iniziali totali: ${sum} pezzi. L’origine non verrà modificata.`;
}
function refreshWizard(){
  const mode=$('#whSourceMode').value;
  $('#whSourceGroup').hidden=mode==='empty';
  $('#whQtyGroup').hidden=mode==='empty';
  $('#whProductSelection').hidden=mode!=='list';
  renderSummary();
}
export function renderWarehousesPage(){
 const list=$('#managedWarehouseList');if(!list)return;
 const all=Array.isArray(state.settings.warehouses)?state.settings.warehouses:warehouses();
 list.innerHTML=all.filter(w=>w.deleted!==true).map(w=>{const i=all.indexOf(w);const protectedWh=i===0||/online|shopify/i.test(w.name+' '+w.id);return `<div class="list-row noor-warehouse-row"><div class="noor-warehouse-title"><b>${esc(w.name)}</b><small>${esc(w.id)} · ${w.active===false?'Disattivato':'Attivo'}${protectedWh?' · Protetto':''}</small></div><div class="noor-warehouse-actions"><button class="btn secondary compact-btn" type="button" data-edit-warehouse="${i}">Modifica</button><button class="btn secondary compact-btn" type="button" data-deactivate-warehouse="${i}" ${w.active===false?'disabled':''}>Disattiva</button><button class="btn danger compact-btn" type="button" data-delete-warehouse="${i}" ${protectedWh?'disabled title="Magazzino principale o ONLINE protetto"':''}>Elimina</button></div></div>`}).join('')||'<div class="empty">Nessun magazzino.</div>';
 const deleted=all.filter(w=>w.deleted===true),archive=$('#deletedWarehousesPanel'),count=$('#deletedWarehouseCount');
 if(count)count.textContent=`(${deleted.length})`;
 if(archive){archive.innerHTML=`<h3>Magazzini eliminati</h3><p class="muted">Puoi recuperare i magazzini archiviati. L'eliminazione definitiva è consentita con tutte le giacenze a zero, nessuna sede assegnata e storico conservato.</p>`+(deleted.map(w=>{const i=all.indexOf(w);return `<div class="list-row noor-warehouse-row"><div class="noor-warehouse-title"><b>${esc(w.name)}</b><small>${esc(w.id)} · Eliminato</small></div><div class="noor-warehouse-actions"><button class="btn secondary compact-btn" type="button" data-restore-warehouse="${i}">Recupera</button><button class="btn danger compact-btn" type="button" data-purge-warehouse="${i}">Elimina definitivamente</button></div></div>`}).join('')||'<div class="empty">Nessun magazzino eliminato.</div>');
  archive.querySelectorAll('[data-restore-warehouse]').forEach(b=>b.onclick=()=>restoreWarehouse(Number(b.dataset.restoreWarehouse)));
  archive.querySelectorAll('[data-purge-warehouse]').forEach(b=>b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await purgeWarehouse(Number(b.dataset.purgeWarehouse));}finally{if(b.isConnected)b.disabled=false;}});
 }
 const archiveButton=$('#toggleDeletedWarehouses');if(archiveButton)archiveButton.onclick=()=>archive?.classList.toggle('hidden');
 list.querySelectorAll('[data-edit-warehouse]').forEach(button=>button.onclick=()=>openWarehouseEdit(Number(button.dataset.editWarehouse)));
 list.querySelectorAll('[data-deactivate-warehouse]').forEach(button=>button.onclick=()=>deactivateWarehouse(Number(button.dataset.deactivateWarehouse)));
 list.querySelectorAll('[data-delete-warehouse]').forEach(button=>button.onclick=()=>deleteWarehouse(Number(button.dataset.deleteWarehouse)));
 const btn=$('#openWarehouseWizard');if(btn)btn.onclick=()=>openWizard();
}
function warehouseDeleteMessage(title,reason){
 // An explicit NOOR modal is easier to read than a 2.6-second toast.
 openModal(title,`<div class="settings-info-note" role="alert">${esc(reason)}</div><div style="margin-top:14px"><button class="btn secondary" type="button" id="whDeleteClose">Ho capito</button></div>`);
 $('#whDeleteClose').onclick=()=>document.querySelector('#modal')?.classList.add('hidden');
}
function warehouseHasHistoricReferences(id){
 const historic=[...(state.orders||[]),...(state.shifts||[]),...(state.closures||[]),...(state.stockMovements||[]),...(state.cancelledOrders||[])];
 return historic.some(o=>[o.warehouseId,o.sourceWarehouseId,o.targetWarehouseId,o.fromWarehouseId,o.toWarehouseId].some(v=>String(v||'')===String(id))||(o.items||[]).some(it=>String(it.warehouseId||'')===String(id)));
}
async function restoreWarehouse(i){
 if(!can('settings'))return toast('Solo amministrazione centrale.');
 const all=state.settings.warehouses||[],w=all[i];if(!w||w.deleted!==true)return;
 if(!await confirmDialog(`Recuperare il magazzino "${w.name}"? Tornerà attivo nell’elenco.`, 'Recupera magazzino'))return;
 try{await saveSettings({warehouses:all.map((v,j)=>j===i?{...v,active:true,deleted:false,deletedAtClient:''}:v)});renderWarehousesPage();toast('Magazzino recuperato.')}catch(e){toast(e.message||'Recupero non riuscito.')}
}
async function purgeWarehouse(i){
 if(!can('settings'))return warehouseDeleteMessage('Permesso insufficiente','Solo Admin o Super Admin possono eliminare definitivamente un magazzino.');
 const all=state.settings.warehouses||[],w=all[i];
 if(!w)return warehouseDeleteMessage('Magazzino non trovato','Aggiorna la pagina e riprova.');
 if(w.deleted!==true)return warehouseDeleteMessage('Prima archivia il magazzino','Per eliminarlo definitivamente, premi prima Elimina, poi apri Magazzini eliminati e scegli Elimina definitivamente.');
 if(i===0||/online|shopify/i.test(w.name+' '+w.id))return warehouseDeleteMessage('Magazzino protetto','NOOR ONLINE e il magazzino principale non possono essere cancellati.');
 const linked=(state.settings.pointsOfSale||[]).some(p=>p.deleted!==true&&p.warehouseId===w.id)||(state.employees||[]).some(u=>u.preferredWarehouseId===w.id||(u.allowedWarehouseIds||[]).includes(w.id));
 if(linked)return warehouseDeleteMessage('Magazzino ancora assegnato','Rimuovi prima ogni assegnazione del magazzino a punti vendita e dipendenti, quindi riprova.');
 // I movimenti passati restano intatti; un riferimento storico minimo (tombstone)
 // conserva nome e ID originali anche quando il magazzino operativo viene rimosso.
 // La traccia anagrafica è conservata sempre, anche se lo storico non è stato caricato.
 const affected=(state.products||[]).filter(p=>Object.prototype.hasOwnProperty.call(p.inventoryByWarehouse||{},w.id));
 const nonZero=affected.filter(p=>Number((p.inventoryByWarehouse||{})[w.id]?.qty??(p.inventoryByWarehouse||{})[w.id]?.stock??0)!==0);
 if(nonZero.length)return warehouseDeleteMessage('Giacenze non azzerate',`Ci sono ${nonZero.length} schede prodotto con giacenza diversa da zero. Azzera correttamente le quantità prima di eliminare il magazzino.`);
 if(affected.length>250)return warehouseDeleteMessage('Troppi prodotti collegati','La cancellazione protetta richiede un intervento amministrativo dedicato per questo catalogo. Nessun dato è stato eliminato.');
 if(working)return warehouseDeleteMessage('Operazione in corso','Attendi che la richiesta precedente termini.');
 if(!await confirmDialog(`Magazzino: ${w.name}. Quantità non nulle: 0. Schede da pulire: ${affected.length}. Questa operazione cancella la configurazione del magazzino. Procedere?`, 'Eliminazione definitiva'))return;
 if(!await confirmDialog('ULTIMA CONFERMA: rimuovere magazzino operativo e giacenze a zero? Eventuali vendite e chiusure storiche NON verranno cancellate.', 'Conferma definitiva'))return;
 working=true;
 try{
  await runTransaction(db,async tx=>{
   const settingsRef=doc(db,'settings','global');
   const settingsSnap=await tx.get(settingsRef);
   if(!settingsSnap.exists())throw new Error('Configurazione non trovata.');
   const fresh=settingsSnap.data()||{},whs=fresh.warehouses||[];
   const existing=whs.find(x=>String(x.id)===String(w.id));
   if(!existing||existing.deleted!==true)throw new Error('Il magazzino è stato modificato. Aggiorna la pagina.');
   if((fresh.pointsOfSale||[]).some(pos=>pos.deleted!==true&&String(pos.warehouseId)===String(w.id)))throw new Error('Il magazzino è ancora assegnato a una sede.');
   // Firestore transactions require all reads before the first write.
   const refs=[];
   for(const product of affected){
    const ref=doc(db,'products',String(product.id));
    refs.push({ref,snap:await tx.get(ref)});
   }
   for(const {ref,snap} of refs){
    if(!snap.exists())throw new Error('Una scheda prodotto non è più disponibile.');
    const map={...(snap.data().inventoryByWarehouse||{})},item=map[w.id];
    if(Number(item?.qty??item?.stock??0)!==0)throw new Error('Una giacenza è cambiata: eliminazione annullata.');
    delete map[w.id];
    tx.update(ref,{inventoryByWarehouse:map});
   }
   const tombstones=Array.isArray(fresh.deletedWarehouseReferences)?fresh.deletedWarehouseReferences:[];
   const safeTombstones=!tombstones.some(x=>String(x.id)===String(w.id))
     ?[...tombstones,{id:String(w.id),name:String(existing.name||w.name),removedAtClient:new Date().toISOString()}]:tombstones;
   tx.update(settingsRef,{warehouses:whs.filter(x=>String(x.id)!==String(w.id)),deletedWarehouseReferences:safeTombstones,updatedAt:serverTimestamp(),updatedBy:auth.currentUser?.uid||''});
  });
  await loadSettings();
  // Reload the inventory cache before allowing another delete from the same UI.
  renderWarehousesPage();
  toast('Magazzino eliminato definitivamente.');
 }catch(e){
  console.error('warehouse purge',e);
  warehouseDeleteMessage('Eliminazione non completata',`${e?.message||'Errore imprevisto.'}${e?.code?' (codice: '+e.code+')':''}. Nessun dato dovrebbe essere stato cancellato se la transazione è fallita.`);
 }finally{working=false}
}

function openWarehouseEdit(i){
 if(!can('settings'))return toast('Solo amministrazione centrale.');
 const w=(state.settings.warehouses||[])[i],root=$('#warehouseWizard');if(!w||!root)return;
 root.innerHTML=`<div class="panel" style="padding:18px"><h3>Modifica magazzino</h3><p class="muted">Identificativo: ${esc(w.id)} (non modificabile)</p><form id="whEditForm" class="form-grid"><label class="full">Nome magazzino<input id="whEditName" required maxlength="90" value="${esc(w.name)}"></label><label>Stato<select id="whEditActive"><option value="1" ${w.active!==false?'selected':''}>Attivo</option><option value="0" ${w.active===false?'selected':''}>Disattivato</option></select></label><div class="full"><button class="btn primary" type="submit">Salva modifiche</button> <button class="btn secondary" type="button" id="whEditCancel">Annulla</button></div></form></div>`;
 $('#whEditCancel').onclick=()=>root.innerHTML='';
 $('#whEditForm').onsubmit=async e=>{e.preventDefault();const name=$('#whEditName').value.trim();if(!name)return toast('Inserisci il nome.');const active=$('#whEditActive').value==='1';const all=state.settings.warehouses||[];if(all.some((x,j)=>j!==i&&x.name.toLowerCase()===name.toLowerCase()))return toast('Nome già in uso.');if(!active&&w.active!==false){await deactivateWarehouse(i);return}try{await saveSettings({warehouses:all.map((x,j)=>j===i?{...x,name,active}:x)});root.innerHTML='';renderWarehousesPage();toast('Magazzino aggiornato.')}catch(err){toast(err.message||'Errore nel salvataggio.')}};
}
async function deactivateWarehouse(i){
 if(!can('settings'))return toast('Permesso non sufficiente.');
 const all=state.settings.warehouses||[],w=all[i];if(!w||w.active===false)return;
 if(i===0||/online|shopify/i.test(w.name+' '+w.id))return toast('Il magazzino principale o ONLINE non può essere disattivato.');
 if((state.settings.pointsOfSale||[]).some(p=>p.warehouseId===w.id))return toast('Scollega prima questo magazzino dal punto vendita.');
 if(state.products.some(p=>productWarehouseData(p,w.id).qty>0))return toast('Il magazzino contiene giacenze: prima trasferiscile o azzerale correttamente.');
 if((state.employees||[]).some(u=>u.preferredWarehouseId===w.id||(u.allowedWarehouseIds||[]).includes(w.id)))return toast('Il magazzino è assegnato a dipendenti: modifica prima i loro permessi.');
 const ok=await confirmDialog(`Disattivare "${w.name}"? Resterà nello storico e i dati non saranno cancellati.`, 'Disattiva magazzino');if(!ok)return;
 try{await saveSettings({warehouses:all.map((x,j)=>j===i?{...x,active:false}:x)});$('#warehouseWizard').innerHTML='';renderWarehousesPage();toast('Magazzino disattivato senza eliminare i dati.')}catch(err){toast(err.message||'Errore disattivazione magazzino.')}
}
async function deleteWarehouse(i){
 if(!can('settings'))return toast('Solo amministrazione centrale.');
 const all=state.settings.warehouses||[],wh=all[i];if(!wh||wh.deleted===true)return;
 // NOOR ONLINE è un'infrastruttura sincronizzata: mai eliminabile dalla UI.
 if(i===0||/online|shopify/i.test(wh.name+' '+wh.id))return toast('Magazzino principale e NOOR ONLINE protetti: eliminazione non consentita.');
 if((state.settings.pointsOfSale||[]).some(p=>p.warehouseId===wh.id))return toast('Rimuovi prima il collegamento con il punto vendita.');
 if((state.employees||[]).some(u=>u.preferredWarehouseId===wh.id||(u.allowedWarehouseIds||[]).includes(wh.id)))return toast('Il magazzino è ancora assegnato a dipendenti.');
 if(state.products.some(p=>productWarehouseData(p,wh.id).qty!==0))return toast('Il magazzino contiene giacenze: non può essere eliminato.');
 // L'archiviazione conserva i riferimenti storici, senza cancellare alcun documento.
 const ok=await confirmDialog(`Archiviare \"${wh.name}\"? Non comparirà fra i magazzini attivi. Storico e dati rimarranno recuperabili.`, 'Elimina magazzino');if(!ok)return;
 try{
  // Archiviazione logica: non cancellare mappe stock o documenti storici.
  await saveSettings({warehouses:all.map((w,j)=>j===i?{...w,active:false,deleted:true,deletedAtClient:new Date().toISOString()}:w)});
  $('#warehouseWizard').innerHTML='';renderWarehousesPage();toast('Magazzino eliminato dall’elenco attivo.');
 }catch(err){toast(err.message||'Impossibile eliminare il magazzino.')}
}
function openWizard(){
  if(!can('settings'))return toast('Solo amministrazione centrale.');
  const root=$('#warehouseWizard');if(!root)return;
  const sources=warehouses();
  root.innerHTML=`<div class="panel" style="padding:20px;border:1px solid var(--border-color,#ddd)"><h3>Crea nuovo magazzino</h3>
  <p class="muted">Nessun trasferimento, vendita o scarico nel magazzino d’origine.</p>
  <form id="whNewForm" class="form-grid">
  <label class="full">Nome nuovo magazzino<input id="whName" maxlength="90" placeholder="Es. NOOR MILANO" required></label>
  <label class="full">Come vuoi inizializzarlo?<select id="whSourceMode"><option value="existing">Copia tutti i prodotti da un magazzino</option><option value="list">Scegli una lista di prodotti</option><option value="empty">Magazzino vuoto</option></select></label>
  <label id="whSourceGroup">Magazzino di riferimento<select id="whSourceId">${sources.map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select></label>
  <label id="whQtyGroup">Giacenze iniziali<select id="whQuantities"><option value="zero">Tutte a zero (consigliato)</option><option value="copy">Copia le giacenze attuali</option></select></label>
  <div class="full" id="whProductSelection" hidden><b>Scegli i prodotti</b><label>Filtra elenco<input id="whFilterProducts" placeholder="Nome, barcode o marca"></label><div id="whProductList" style="max-height:260px;overflow:auto;border:1px solid var(--border-color,#ddd);padding:10px"></div></div>
  <div class="full settings-info-note" id="whWizardSummary" role="status"></div>
  <label class="full"><input type="checkbox" id="whConfirm" required> Confermo la creazione e le giacenze iniziali. La copia non è un trasferimento fisico.</label>
  <div class="full" style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" id="whSave" type="submit">Crea magazzino</button><button class="btn secondary" type="button" id="whCancel">Annulla</button></div>
  </form></div>`;
  const plist=$('#whProductList');
  plist.innerHTML=allProducts().map(p=>`<label style="display:flex;gap:8px;padding:5px"><input type="checkbox" id="whSelect_${esc(String(p.id))}" data-wh-product="${esc(String(p.id))}"><span>${esc(p.name||'Prodotto')} · ${esc(p.brand||'')} · ${esc(p.barcode||'')}</span></label>`).join('')||'<div class="empty">Nessun prodotto disponibile.</div>';
  $('#whSourceMode').onchange=refreshWizard;
  $('#whSourceId').onchange=renderSummary;
  $('#whQuantities').onchange=renderSummary;
  plist.onchange=renderSummary;
  $('#whFilterProducts').oninput=e=>{const q=e.target.value.toLowerCase().trim();plist.querySelectorAll('label').forEach(l=>{l.hidden=!l.textContent.toLowerCase().includes(q)})};
  $('#whCancel').onclick=()=>{root.innerHTML=''};
  $('#whNewForm').onsubmit=submitWizard;
  refreshWizard();
}
async function submitWizard(e){
 e.preventDefault();if(working)return;
 if(!can('settings'))return toast('Permesso non sufficiente.');
 const name=$('#whName').value.trim();if(!name)return toast('Inserisci un nome.');
 const {mode,source,quantities,chosen}=currentSelection();
 if(mode==='list'&&!chosen.length)return toast('Seleziona almeno un prodotto.');
 if(mode!=='empty'&&!source)return toast('Seleziona un magazzino di origine.');
 if(allProducts().length>250)return toast('Catalogo troppo grande per questa procedura: richiede importazione a blocchi protetta.');
 const id='wh-'+crypto.randomUUID().replaceAll('-','').slice(0,20);
 const selectedIds=new Set(chosen.map(p=>String(p.id)));
 const count=selectedIds.size;
 if(!await confirmDialog(`Creare "${name}" con ${count} prodotti e giacenze ${quantities==='copy'?'copiate':'a zero'}? Non è un trasferimento.`,'Conferma nuovo magazzino'))return;
 working=true;const btn=$('#whSave');btn.disabled=true;
 try{
   // Read all before writing: atomic creation or total rollback on error.
   await runTransaction(db,async tx=>{
     const settingsRef=doc(db,'settings','global');
     const settingsSnap=await tx.get(settingsRef);
     const originals=allProducts();
     const snapshots=[];
     for(const p of originals)snapshots.push({p,snap:await tx.get(doc(db,'products',String(p.id)))});
     const settings=settingsSnap.data()||{};
     const current=Array.isArray(settings.warehouses)?settings.warehouses:warehouses();
     if(current.some(w=>String(w.id)===id||String(w.name||'').trim().toLowerCase()===name.toLowerCase()))throw new Error('Nome del magazzino già presente.');
     const newList=[...current,{id,name,active:true}];
     const primary=String(current[0]?.id||'main');
     for(const {p,snap} of snapshots){
       if(!snap.exists())throw new Error('Prodotto non disponibile: '+p.name);
       const data=snap.data()||{};
       const map={...(data.inventoryByWarehouse||{})};
       const legacy=source===primary&&!map[source]?{qty:Number(data.qty??data.stock??0)||0,price:Number(data.price||0),cost:Number(data.cost||0),discountActive:!!data.discountActive,finalPrice:Number(data.finalPrice||0),deleted:!!data.deleted}:null;
       const src=map[source]||legacy||{};
       const included=selectedIds.has(String(p.id));
       const qty=included&&quantities==='copy'&&mode!=='empty'?Math.max(0,Number(src.qty??src.stock??0)||0):0;
       map[id]={qty,price:Number(src.price??data.price??0)||0,cost:Number(src.cost??data.cost??0)||0,discountActive:src.discountActive??data.discountActive??false,finalPrice:Number(src.finalPrice??data.finalPrice??0)||0,deleted:!included,initializationType:'warehouse-copy',initializedAtClient:new Date().toISOString()};
       tx.set(doc(db,'products',String(p.id)),{inventoryByWarehouse:map},{merge:true});
     }
     tx.set(settingsRef,{warehouses:newList,updatedAt:serverTimestamp(),updatedBy:auth.currentUser?.uid||''},{merge:true});
   });
   $('#warehouseWizard').innerHTML='';await loadSettings();renderWarehousesPage();toast('Magazzino creato. Nessun movimento sul magazzino di origine.');
 }catch(err){console.error('warehouse create',err);toast(err.message||'Creazione magazzino non riuscita.');}
 finally{working=false;if(btn?.isConnected)btn.disabled=false}
}
