import {auth} from './firebase.js';
import {state,can,warehouses,productQty,upsertProduct,refreshProductsFromServer,importShopifyInitialStock,saveSettings} from './store.js';
import {esc} from './ui.js';

const norm=s=>String(s??'').trim().toLowerCase();
const asNumber=s=>Number.isFinite(Number(s))?Number(s):0;
const gidId=s=>'SHOPIFY_'+String(s||'').split('/').pop();
const displayName=v=>v.variant&&v.variant!=='Default Title'?`${v.product} — ${v.variant}`:v.product;
function compare(data){
 const online=warehouses().find(w=>/online/i.test(w.name));
 const barcodeMap=new Map(),skuMap=new Map(),shopifyIds=new Map();
 for(const p of state.products){
  for(const [map,key] of [[barcodeMap,norm(p.barcode)],[skuMap,norm(p.sku)]]){if(key)map.set(key,[...(map.get(key)||[]),p]);}
  if(p.shopifyVariantId)shopifyIds.set(p.shopifyVariantId,[...(shopifyIds.get(p.shopifyVariantId)||[]),p]);
 }
 const shopifyBarcodeCounts=new Map(),shopifySkuCounts=new Map();
 for(const v of data.variants){if(norm(v.barcode))shopifyBarcodeCounts.set(norm(v.barcode),(shopifyBarcodeCounts.get(norm(v.barcode))||0)+1);if(norm(v.sku))shopifySkuCounts.set(norm(v.sku),(shopifySkuCounts.get(norm(v.sku))||0)+1)}
 const rows=data.variants.map(v=>{
  const barcodeMatches=v.barcode?(barcodeMap.get(norm(v.barcode))||[]):[];
  const skuMatches=v.sku?(skuMap.get(norm(v.sku))||[]):[];
  const idMatches=shopifyIds.get(v.variantId)||[];
  const matches=[...new Map([...barcodeMatches,...skuMatches,...idMatches].map(p=>[p.id,p])).values()];
  const duplicateShopify=!!(v.barcode&&shopifyBarcodeCounts.get(norm(v.barcode))>1)||!!(v.sku&&shopifySkuCounts.get(norm(v.sku))>1);
  const match=matches.length===1?matches[0]:null;
  const status=duplicateShopify?'Codice duplicato su Shopify':matches.length>1?'Abbinamento ambiguo':match?'Già presente':!v.barcode&&!v.sku?'Senza barcode/SKU': 'Da importare';
  return {...v,match,status,localQty:match&&online?productQty(match,online.id):null,importable:status==='Da importare'};
 });
 return {rows,online};
}
// Sorting is presentation-only: row identity and original import indices are preserved.
const shopifyCollator=new Intl.Collator('it',{sensitivity:'base',numeric:true});
function orderedShopifyRows(rows,sort='name-asc'){
 const indexed=rows.map((row,index)=>({row,index}));
 const brandOf=r=>String(r.match?.brand||r.vendor||r.product||'').trim();
 const numberOf=r=>Number.isFinite(Number(r.quantity))&&r.quantity!==null?Number(r.quantity):Number.POSITIVE_INFINITY;
 return indexed.sort((a,b)=>{
  const x=a.row,y=b.row;
  let delta=0;
  if(sort==='brand-asc')delta=shopifyCollator.compare(brandOf(x),brandOf(y));
  else if(sort==='quantity-asc'||sort==='quantity-desc'){
   const ax=numberOf(x),by=numberOf(y);
   delta=ax===by?0:ax===Number.POSITIVE_INFINITY?1:by===Number.POSITIVE_INFINITY?-1:ax-by;
   if(sort==='quantity-desc'&&Number.isFinite(ax)&&Number.isFinite(by))delta=-delta;
  }else delta=shopifyCollator.compare(displayName(x),displayName(y));
  return delta||shopifyCollator.compare(displayName(x),displayName(y))||a.index-b.index;
 });
}
function renderTable(rows,online,sort="name-asc"){
 return `<div style="overflow:auto;max-height:540px"><table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr><th>Importa</th><th>Prodotto Shopify</th><th>Barcode / SKU</th><th>Prezzo</th><th>Qtà Shopify</th><th>Prodotto Noor</th><th>Esito</th></tr></thead><tbody>${orderedShopifyRows(rows,sort).map(({row:r,index:i})=>`<tr><td>${r.importable?`<input type="checkbox" data-shopify-select="${i}" aria-label="Importa ${esc(displayName(r))}">`:'—'}</td><td>${esc(displayName(r))}</td><td>${esc(r.barcode||'—')}<small style="display:block">SKU: ${esc(r.sku||'—')}</small></td><td>${esc(r.price||'—')} €</td><td>${r.quantity===null?'—':Number(r.quantity)}</td><td>${esc(r.match?.name||'—')}</td><td>${esc(r.status)}</td></tr>`).join('')}</tbody></table></div>`;
}
export function initShopifyPreview(){
 const route=document.querySelector('#route-shopify');if(!route||route.querySelector('#shopifyPreviewPanel'))return;
 const panel=document.createElement('section');panel.id='shopifyPreviewPanel';panel.className='panel';panel.style.cssText='margin-top:18px;padding:20px';
 panel.innerHTML='<h2>Prodotti e abbinamenti</h2><p>Importazione selettiva delle schede prodotto in Noor ONLINE. Le quantità NON vengono importate e Shopify non viene modificato. Noor LOCALE resta escluso.</p><button type="button" class="btn primary" id="shopifyPreviewRun">Leggi e confronta prodotti</button><div id="shopifyPreviewResults" style="margin-top:14px"></div>';
 route.append(panel);
 const run=panel.querySelector('#shopifyPreviewRun'),target=panel.querySelector('#shopifyPreviewResults');
 async function refreshAutoSyncStatus(){
  const out=document.querySelector('#shopifyAutoSyncStatusText');if(!out)return;
  if(!auth.currentUser){out.textContent='Sincronizzazione automatica: accedi come amministratore per vedere lo stato.';return}
  try{
   const token=await auth.currentUser.getIdToken();
   const response=await fetch('/api/shopify/auto-sync-status',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
   const info=await response.json();if(!response.ok||!info.ok)throw Error(info.code||'non disponibile');
   if(!info.enabled){out.textContent='Sincronizzazione automatica: DISATTIVATA. Nessuna scrittura automatica verso Shopify o Noor.';return}
   const run=info.lastRun;
   const blocked=run?.writesBlockedByCoverage===true;
   const head=blocked?'PREPARAZIONE / SCRITTURE BLOCCATE PER COPERTURA INCOMPLETA':info.writesEnabled?'ATTIVA (ogni 15 minuti)':'PREPARAZIONE / SOLO CHECKPOINT (ogni 15 minuti)';
   const last=run?` Ultimo controllo ${new Date(run.checkedAt).toLocaleString('it-IT')}: ${run.checked} prodotti controllati in questo ciclo; ${run.eligibleVariants||0}/${run.catalogVariants||0} varianti idonee, ${run.conflicts} conflitti, ${run.errors} errori. ${run.appliedShopifyToNoor} aggiornati in Noor; ${run.appliedNoorToShopify} aggiornati in Shopify.`:' Nessun controllo automatico completato.';
   out.textContent=`Sincronizzazione automatica: ${head}.${last}${run?.lastError?' Errore: '+run.lastError:''}`;
  }catch{out.textContent='Sincronizzazione automatica: stato momentaneamente non disponibile. Controlla i log Netlify.'}
 }
 // Live webhook management is protected by the backend's super-admin role check.
 const statusSection=document.querySelector('#shopifyWebhookLiveControls');
 async function webhookLiveRequest(method='GET'){
  if(!auth.currentUser)throw Error('Accedi prima come amministratore.');
  const jwt=await auth.currentUser.getIdToken();
  const r=await fetch('/api/shopify/webhook-subscription',{method,headers:{authorization:`Bearer ${jwt}`,...(method==='POST'?{'content-type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify({confirmation:'REGISTER_INVENTORY_WEBHOOK'})}:{})});
  const j=await r.json();if(!r.ok||!j.ok)throw Error(j.code||'Verifica webhook non disponibile');return j;
 }
 if(statusSection){
  const check=statusSection.querySelector('#shopifyWebhookCheck');
  const activate=statusSection.querySelector('#shopifyWebhookActivate');
  const out=statusSection.querySelector('#shopifyWebhookLiveStatus');
  if(check)check.onclick=async()=>{out.textContent='Verifica sottoscrizione in corso…';activate.disabled=true;try{const v=await webhookLiveRequest();out.textContent=v.registered?'Webhook inventario Shopify registrato. '+(v.wakeEnabled?'Richiamo anticipato abilitato.':'Richiamo anticipato disattivato su Netlify.'):'Webhook live non ancora registrato.'+(v.otherSubscriptions?' Sono presenti altre sottoscrizioni da verificare.':'');activate.disabled=v.registered||v.duplicate||v.otherSubscriptions>0;}catch(e){out.textContent='Errore: '+e.message}};
  if(activate)activate.onclick=async()=>{if(!confirm('Registrare su Shopify il webhook inventario verso NOOR? Non modifica alcuna giacenza.'))return;activate.disabled=true;out.textContent='Registrazione in corso…';try{const v=await webhookLiveRequest('POST');out.textContent=v.registered?'Webhook inventario registrato. Per attivare il controllo anticipato imposta NOOR_SHOPIFY_EVENT_WAKE_ENABLED=true su Netlify.':'Risposta: '+v.code;}catch(e){out.textContent='Registrazione non completata: '+e.message}};
 }
 const refreshButton=document.querySelector('#shopifyAutoSyncRefresh');if(refreshButton)refreshButton.onclick=refreshAutoSyncStatus;
 refreshAutoSyncStatus();

 const dashboard=document.querySelector('#shopifyDashboardSummary');if(dashboard&&!dashboard.children.length)dashboard.innerHTML='<div class="shopify-dashboard-card"><small>Stato dati</small><strong>Da leggere</strong><p>Premi Leggi e confronta prodotti per aggiornare i contatori.</p></div><div class="shopify-dashboard-card"><small>Ultima sincronizzazione giacenze</small><strong>Mai</strong><p>Non ancora attivata.</p></div>';
 let lastData=null,lastRows=[],lastOnline=null;let lastReadAt=0;let selectedSort="name-asc";
 async function readPreview(){
  if(!can('settings')||!auth.currentUser)throw Error('Accesso riservato agli amministratori autenticati.');
  await refreshProductsFromServer();
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/shopify/preview',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
  const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Errore lettura Shopify');
  const {rows,online}=compare(data);lastData=data;lastRows=rows;lastOnline=online;lastReadAt=Date.now();
  const counts={};for(const row of rows)counts[row.status]=(counts[row.status]||0)+1;
  const dashboard=document.querySelector('#shopifyDashboardSummary');
  if(dashboard){
   const matched=rows.filter(r=>r.status==='Già presente').length;
   const missing=rows.filter(r=>r.status==='Da importare').length;
   const ambiguous=rows.length-matched-missing;
   const mismatch=rows.filter(r=>r.match&&r.quantity!==null&&r.localQty!==null&&Number(r.quantity)!==Number(r.localQty)).length;
   const cards=[['Varianti Shopify',rows.length,'Ultima lettura: '+new Date().toLocaleString('it-IT')],['Abbinate a Noor',matched,'Prodotti riconosciuti'],['Da importare',missing,'Prodotti mancanti'],['Da verificare',ambiguous,'Codici ambigui o assenti'],['Giacenze differenti',mismatch,'Confronto, nessuna modifica'],['Ultima importazione',state.settings.shopifyInitialImportAt?new Date(state.settings.shopifyInitialImportAt).toLocaleString('it-IT'):'Mai',state.settings.shopifyInitialImportAt?'Giacenze importate in Noor ONLINE':'Importazione giacenze non attivata']];
   dashboard.innerHTML=cards.map(([label,value,sub])=>`<div class="shopify-dashboard-card"><small>${esc(label)}</small><strong>${esc(String(value))}</strong><p>${esc(sub)}</p></div>`).join('');
  }
  const safe=data.complete&&online&&data.location&&data.location.active;
  target.innerHTML=`<p><b>Sede Shopify:</b> ${esc(data.location?.name||'—')} · <b>Magazzino Noor:</b> ${esc(online?.name||'NON TROVATO')}</p><p><b>Prodotti letti:</b> ${data.productsSeen} · <b>Varianti:</b> ${data.variantCount} · <b>Stato:</b> ${data.complete?'Completo':'PARZIALE — importazione bloccata'}</p><p>${Object.entries(counts).map(([k,v])=>`<span class="pill">${esc(k)}: ${v}</span>`).join(' ')}</p><div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin:12px 0"><label for="shopifyPreviewSort"><b>Ordina prodotti:</b></label><select id="shopifyPreviewSort" aria-label="Ordina prodotti Shopify" style="max-width:100%;padding:8px"><option value="name-asc" ${selectedSort==='name-asc'?'selected':''}>Nome: A → Z</option><option value="brand-asc" ${selectedSort==='brand-asc'?'selected':''}>Marca: A → Z</option><option value="quantity-asc" ${selectedSort==='quantity-asc'?'selected':''}>Quantità Shopify: crescente</option><option value="quantity-desc" ${selectedSort==='quantity-desc'?'selected':''}>Quantità Shopify: decrescente</option></select></div><div id="shopifySortedResults">${renderTable(rows,online,selectedSort)}</div><section style="border-top:1px solid #ddd;margin-top:16px;padding-top:14px"><h3>V2.5.56 · Test sincronizzazione (sola lettura)</h3><p>Seleziona un prodotto abbinato: confronteremo le quantità aggiornate senza modificare Shopify o Noor. Questo test non attiva ancora la sincronizzazione.</p><select id="shopifySyncTestVariant" style="max-width:100%;width:100%;padding:9px"><option value="">Seleziona una variante abbinata…</option>${rows.filter(r=>r.status==='Già presente'&&r.match&&r.tracked===true&&Number.isSafeInteger(r.quantity)&&r.quantity>=0).map(r=>`<option value="${esc(r.variantId)}">${esc(displayName(r))}</option>`).join('')}</select> <button type="button" class="btn" id="shopifySyncTestRun">Verifica prodotto</button><p id="shopifySyncTestResult" role="status"></p></section><section style="border-top:1px solid #ddd;margin-top:16px;padding-top:14px"><h3>V2.5.64 · Riconciliazione singolo prodotto (anteprima protetta)</h3><p>Seleziona una differenza e verifica di nuovo Shopify e Noor ONLINE. Non viene modificata alcuna giacenza.</p><select id="shopifyReconcileSelect" style="max-width:100%;width:100%;padding:9px"><option value="">Seleziona un prodotto con differenza…</option>${rows.filter(r=>r.status==='Già presente'&&r.match?.deleted!==true&&r.tracked===true&&Number.isSafeInteger(r.quantity)&&r.quantity>=0&&Number.isSafeInteger(Number(r.localQty))&&Number(r.localQty)>=0&&Number(r.quantity)!==Number(r.localQty)&&!r.match?.inventoryByWarehouse?.[String(online?.id)]?.deleted).map(r=>`<option value="${esc(r.variantId)}">${esc(displayName(r))}</option>`).join('')}</select> <button type="button" class="btn" id="shopifyReconcileReview">Verifica differenza aggiornata</button><p id="shopifyReconcileResult" role="status"></p><p><small>Controllo in sola lettura: nessuna conferma di allineamento e nessun aggiornamento Shopify o Noor. Se ci sono operazioni concorrenti, il futuro aggiornamento richiederà ulteriori verifiche backend.</small></p><p><button type="button" class="btn" id="shopifyReconcileGuard">V2.5.66 · Confronto backend Shopify + Noor</button></p><p id="shopifyReconcileGuardResult" role="status"></p><p><button type="button" class="btn" id="shopifyReconcileIds">V2.5.69 · Mostra ID verificati (sola lettura)</button></p><pre id="shopifyReconcileIdsResult" role="status" style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit"></pre><p><button type="button" class="btn" id="shopifyReconcileApply">V2.5.67 · Allinea singolo prodotto (con conferma)</button></p><p id="shopifyReconcileApplyResult" role="status">Disponibile solo dopo abilitazione protetta su Netlify. Shopify e LOCALE non saranno modificati.</p></section><p><b>Protezione:</b> importazione esclusivamente Shopify → Noor ONLINE; nessuna scrittura su Shopify o Noor LOCALE.</p>${safe?'<button type="button" class="btn primary" id="shopifyImportSelected">Importa prodotti selezionati (senza giacenze)</button>':'<p>Importazione non disponibile: lettura incompleta o magazzino ONLINE non trovato.</p>'}<p id="shopifyImportStatus" role="status"></p>${safe?'<section style="border-top:1px solid #ddd;margin-top:20px;padding-top:16px"><h3>Prima importazione giacenze</h3><p>Confronta le quantità prima di aggiornare Noor ONLINE. Shopify e LOCALE non saranno modificati.</p><button type="button" class="btn" id="shopifyStockReview">Verifica differenze e prepara importazione</button><div id="shopifyStockReviewContent" style="margin-top:12px"></div></section>':''}`;
  const guardBtn=target.querySelector('#shopifyReconcileGuard');
  if(guardBtn)guardBtn.onclick=async()=>{
   const output=target.querySelector('#shopifyReconcileGuardResult');
   const variantId=target.querySelector('#shopifyReconcileSelect')?.value;
   const match=lastRows.find(r=>r.variantId===variantId);
   if(!match?.match?.id||!lastOnline?.id||match.status!=='Già presente'){
    output.textContent='Prima seleziona una differenza valida.';return;
   }
   guardBtn.disabled=true;output.textContent='Controllo backend Firestore in corso…';
   try{
    const token=await auth.currentUser.getIdToken();
    const response=await fetch('/api/shopify/reconciliation-guard',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({productId:String(match.match.id),warehouseId:String(lastOnline.id),variantId:String(match.variantId),locationId:String(lastData?.location?.id||'')})});
    const data=await response.json();
    if(!response.ok||!data.ok){output.textContent='Controllo bloccato: '+(data.code||response.status);return}
    const valid=data.code==='double_snapshot_verified'&&String(data.shopifyVariantId)===String(match.variantId)&&Number(data.noorQty)===Number(match.localQty)&&Number(data.shopifyQty)===Number(match.quantity);
    output.textContent=valid?`Backend confermato · Noor ONLINE: ${data.noorQty} · Shopify: ${data.shopifyQty} · differenza: ${data.delta}. Doppia lettura sul server. Nessuna giacenza modificata.`:'BLOCCATO: quantità Shopify o Noor cambiate dal confronto iniziale. Ripeti Leggi e confronta prodotti.';
   }catch(e){output.textContent='Controllo non riuscito: '+(e.message||'errore')}
   finally{const button=target.querySelector('#shopifyReconcileGuard');if(button)button.disabled=false}
  };
  const idsBtn=target.querySelector('#shopifyReconcileIds');
  if(idsBtn)idsBtn.onclick=async()=>{
   const result=target.querySelector('#shopifyReconcileIdsResult');
   const variantId=target.querySelector('#shopifyReconcileSelect')?.value;
   const row=lastRows.find(r=>r.variantId===variantId);
   if(!row?.match||!lastOnline||!lastData?.location?.id){result.textContent='Seleziona un prodotto abbinato e premi Leggi e confronta prodotti.';return}
   idsBtn.disabled=true;result.textContent='Verifica ID sul backend in corso…';
   try{
    const token=await auth.currentUser.getIdToken();
    const response=await fetch('/api/shopify/reconciliation-guard',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({productId:String(row.match.id),warehouseId:String(lastOnline.id),variantId:String(row.variantId),locationId:String(lastData.location.id)}),cache:'no-store'});
    const data=await response.json();
    if(!response.ok||data.code!=='double_snapshot_verified'||String(data.productId)!==String(row.match.id)||String(data.warehouseId)!==String(lastOnline.id)||String(data.shopifyVariantId)!==String(row.variantId)||String(data.shopifyLocationId)!==String(lastData.location.id))throw Error(data.code||'identificativi_non_confermati');
    result.textContent='ID confermati dal backend (sola lettura):\n'+
      'NOOR_SHOPIFY_RECONCILIATION_PRODUCT_ID='+data.productId+'\n'+
      'NOOR_SHOPIFY_RECONCILIATION_VARIANT_ID='+data.shopifyVariantId+'\n'+
      'NOOR_SHOPIFY_RECONCILIATION_WAREHOUSE_ID='+data.warehouseId+'\n'+
      'NOOR_SHOPIFY_RECONCILIATION_LOCATION_ID='+data.shopifyLocationId+'\n'+
      'Noor ONLINE: '+data.noorQty+' · Shopify: '+data.shopifyQty+'\nNessuna giacenza modificata.';
   }catch(e){result.textContent='Verifica non riuscita: '+String(e.message||'errore')}
   finally{idsBtn.disabled=false}
  };
  const applyBtn=target.querySelector('#shopifyReconcileApply');
  if(applyBtn)applyBtn.onclick=async()=>{
   const output=target.querySelector('#shopifyReconcileApplyResult');
   const variantId=target.querySelector('#shopifyReconcileSelect')?.value;
   const row=lastRows.find(r=>r.variantId===variantId);
   if(!row?.match?.id||row.status!=='Già presente'||!lastOnline?.id||!lastData?.location?.id){output.textContent='Seleziona prima un prodotto abbinato con differenza.';return}
   applyBtn.disabled=true;
   try{
    // Fresh authoritative server comparison: do not trust browser snapshots alone.
    const token=await auth.currentUser.getIdToken();
    const input={productId:String(row.match.id),warehouseId:String(lastOnline.id),variantId:String(row.variantId),locationId:String(lastData.location.id)};
    const check=await fetch('/api/shopify/reconciliation-guard',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(input)});
    const snapshot=await check.json();
    if(!check.ok||snapshot.code!=='double_snapshot_verified'||Number(snapshot.noorQty)!==Number(row.localQty)||Number(snapshot.shopifyQty)!==Number(row.quantity)){output.textContent='BLOCCATO: dati cambiati o verifica backend non riuscita. Premi Leggi e confronta prodotti.';return}
    if(!confirm(`ALLINEAMENTO MANUALE SOLO NOOR ONLINE\n\n${displayName(row)}\nNoor ONLINE: ${snapshot.noorQty} → ${snapshot.shopifyQty}\nShopify: nessuna modifica\nLOCALE: nessuna modifica\n\nConfermi?`)){output.textContent='Operazione annullata.';return}
    const phrase=prompt('Per confermare scrivi esattamente: ALLINEA ONLINE');
    if(phrase!=='ALLINEA ONLINE'){output.textContent='Conferma non valida: nessuna modifica.';return}
    // Fresh UUID for this one attempt; never retry silently after a network error.
    const requestId=crypto.randomUUID();
    const response=await fetch('/api/shopify/reconciliation-apply',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({...input,expectedNoorQty:snapshot.noorQty,expectedShopifyQty:snapshot.shopifyQty,confirmation:phrase,requestId})});
    const result=await response.json();
    output.textContent=response.ok&&result.code==='single_reconciliation_applied'?`ALLINEAMENTO ESEGUITO: Noor ONLINE ${result.previousQty} → ${result.newQty}. Rileggi tutti i prodotti per verificare.`:`ALLINEAMENTO NON ESEGUITO: ${result.code||response.status}. Nessun tentativo automatico di ripetizione.`;
   }catch(e){output.textContent='Esito non confermato: '+(e.message||'errore')+'. Verifica le giacenze prima di qualsiasi nuovo tentativo.'}
   finally{applyBtn.disabled=false}
  };
  const reconcileBtn=target.querySelector('#shopifyReconcileReview');
  if(reconcileBtn)reconcileBtn.onclick=async()=>{
   const variantId=target.querySelector('#shopifyReconcileSelect')?.value;
   const output=target.querySelector('#shopifyReconcileResult');
   if(!variantId){output.textContent='Seleziona un prodotto con giacenza differente.';return}
   reconcileBtn.disabled=true;output.textContent='Rilettura di Shopify e Firestore in corso…';
   try{
    await readPreview();
    const fresh=lastRows.find(r=>r.variantId===variantId);
    const destination=target.querySelector('#shopifyReconcileResult');
    const selector=target.querySelector('#shopifyReconcileSelect');if(selector)selector.value=variantId;
    if(!fresh||!lastData?.complete||!lastData.location?.active||!lastOnline||!/online/i.test(lastOnline.name||'')||fresh.status!=='Già presente'||!fresh.match||fresh.match.deleted===true||fresh.match.inventoryByWarehouse?.[String(lastOnline.id)]?.deleted||fresh.tracked!==true||!Number.isSafeInteger(fresh.quantity)||fresh.quantity<0||!Number.isSafeInteger(Number(fresh.localQty))||Number(fresh.localQty)<0){
     if(destination)destination.textContent='BLOCCATO: dati incompleti, abbinamento non univoco o magazzino non valido.';return;
    }
    const same=Number(fresh.localQty)===fresh.quantity;
    if(destination)destination.textContent=`${displayName(fresh)} · Noor ONLINE: ${fresh.localQty} · Shopify: ${fresh.quantity} · ${same?'GIÀ ALLINEATO':'DIFFERENZA: '+(fresh.quantity-Number(fresh.localQty))+' pezzo/i (Shopify − Noor)'}. Verifica effettuata alle ${new Date().toLocaleTimeString('it-IT')}. SOLA LETTURA: nessuna giacenza modificata. Una vendita Shopify non autorizza automaticamente una sovrascrittura Noor.`;
   }catch(e){const dest=target.querySelector('#shopifyReconcileResult');if(dest)dest.textContent='Verifica non riuscita: '+(e.message||'errore')}
   finally{const btn=target.querySelector('#shopifyReconcileReview');if(btn)btn.disabled=false}
  };
  const sortControl=target.querySelector('#shopifyPreviewSort');if(sortControl)sortControl.onchange=()=>{selectedSort=sortControl.value;const table=target.querySelector('#shopifySortedResults');if(table)table.innerHTML=renderTable(lastRows,lastOnline,selectedSort);};
  const testBtn=target.querySelector('#shopifySyncTestRun');if(testBtn)testBtn.onclick=async()=>{const selected=target.querySelector('#shopifySyncTestVariant')?.value;const output=target.querySelector('#shopifySyncTestResult');if(!selected){output.textContent='Seleziona prima un prodotto.';return}testBtn.disabled=true;output.textContent='Aggiornamento dati in corso…';try{await readPreview();const fresh=lastRows.find(r=>r.variantId===selected);const freshOutput=target.querySelector('#shopifySyncTestResult');const selector=target.querySelector('#shopifySyncTestVariant');if(selector)selector.value=selected;if(!fresh||fresh.status!=='Già presente'||!fresh.match||!lastOnline||fresh.tracked!==true||!Number.isSafeInteger(fresh.quantity)||fresh.quantity<0||!Number.isFinite(fresh.localQty)){if(freshOutput)freshOutput.textContent='Test non idoneo: abbinamento, magazzino o giacenza da verificare.';return}if(freshOutput)freshOutput.textContent=`${displayName(fresh)} · Noor ONLINE: ${fresh.localQty} · Shopify: ${fresh.quantity} · ${Number(fresh.localQty)===Number(fresh.quantity)?'ALLINEATO':'DIFFERENZA DA RISOLVERE'} · Test sola lettura: nessuna quantità modificata.`}catch(e){const o=target.querySelector('#shopifySyncTestResult');if(o)o.textContent='Test fallito: '+(e.message||'errore')}finally{const b=target.querySelector('#shopifySyncTestRun');if(b)b.disabled=false}};if(safe){target.querySelector('#shopifyImportSelected').onclick=importSelected;target.querySelector('#shopifyStockReview').onclick=reviewStock;}
 }
 async function reviewStock(){
  const area=target.querySelector('#shopifyStockReviewContent');
  if(!lastData?.complete||!lastOnline||!lastData.location?.active){area.textContent='Lettura incompleta: importazione bloccata.';return}
  if(Date.now()-lastReadAt>5*60*1000){area.textContent='Lettura scaduta: premi Leggi e confronta prodotti per aggiornare.';return}
  const eligible=lastRows.filter(r=>r.status==='Già presente'&&r.match&&r.match.deleted!==true&&r.tracked===true&&Number.isSafeInteger(r.quantity)&&r.quantity>=0&&Number.isFinite(r.localQty)&&!r.match.inventoryByWarehouse?.[String(lastOnline.id)]?.deleted);
  const changed=eligible.filter(r=>Number(r.quantity)!==Number(r.localQty));
  const excluded=lastRows.length-eligible.length;
  area.innerHTML=`<p><b>${changed.length} giacenze differenti</b> · ${eligible.length} varianti idonee · ${excluded} escluse (abbinamenti, tracciamento o quantità non validi).</p><div style="max-height:330px;overflow:auto"><table style="width:100%;text-align:left"><thead><tr><th>Prodotto</th><th>Noor ONLINE</th><th>Shopify</th></tr></thead><tbody>${changed.map(r=>`<tr><td>${esc(displayName(r))}</td><td>${Number(r.localQty)}</td><td><b>${Number(r.quantity)}</b></td></tr>`).join('')}</tbody></table></div><p><b>Attenzione:</b> anche le quantità Shopify uguali a zero verranno applicate a Noor ONLINE. L'operazione non è una sincronizzazione bidirezionale.</p><label style="display:block;margin:12px 0"><input type="checkbox" id="shopifyStockAck"> Ho verificato le differenze e confermo che Shopify è la fonte delle quantità iniziali.</label><label>Scrivi <b>IMPORTA</b> per confermare: <input id="shopifyStockPhrase" autocomplete="off" style="max-width:150px"></label> <button type="button" class="btn primary" id="shopifyStockApply" ${changed.length?'':'disabled'}>Importa ${changed.length} giacenze in Noor ONLINE</button><p id="shopifyStockResult" role="status"></p>`;
  const button=area.querySelector('#shopifyStockApply');
  button.onclick=async()=>{
   const status=area.querySelector('#shopifyStockResult');
   if(!area.querySelector('#shopifyStockAck').checked||area.querySelector('#shopifyStockPhrase').value.trim()!=='IMPORTA'){status.textContent='Spunta la conferma e scrivi IMPORTA.';return}
   if(Date.now()-lastReadAt>5*60*1000){status.textContent='Lettura scaduta. Aggiorna prima di importare.';return}
   if(!confirm(`Confermi la prima importazione di ${changed.length} giacenze da Shopify a Noor ONLINE? Le quantità ONLINE saranno sostituite, anche con ZERO. Shopify e LOCALE non saranno modificati.`))return;
   button.disabled=true;run.disabled=true;let done=0;const errors=[];
   for(const row of changed){
    try{await importShopifyInitialStock(row.match.id,lastOnline.id,Number(row.quantity),row.variantId,lastData.location.id);done++;status.textContent=`Aggiornate ${done} di ${changed.length} giacenze…`}
    catch(e){errors.push(`${displayName(row)}: ${e.message||'errore'}`)}
   }
   try{if(!errors.length&&done===changed.length)await saveSettings({shopifyInitialImportAt:new Date().toISOString(),shopifyInitialImportLocationId:lastData.location.id,shopifyInitialImportWarehouseId:lastOnline.id})}catch(e){errors.push('Registrazione completamento: '+e.message)}
   status.textContent=`Operazione terminata: ${done} aggiornate, ${errors.length} errori.${errors.length?' '+errors.slice(0,5).join(' | '):' Importazione registrata.'} Shopify e LOCALE non modificati. Premi Leggi e confronta prodotti per verificare.`;
   run.disabled=false;
  };
 }
 async function importSelected(){
  const button=target.querySelector('#shopifyImportSelected'),status=target.querySelector('#shopifyImportStatus');
  const selected=[...target.querySelectorAll('[data-shopify-select]:checked')].map(el=>lastRows[Number(el.dataset.shopifySelect)]).filter(x=>x?.importable);
  if(!selected.length){status.textContent='Seleziona almeno un prodotto da importare.';return}
  if(!lastData?.complete||!lastOnline){status.textContent='Importazione bloccata: anteprima incompleta.';return}
  if(!confirm(`Importare ${selected.length} varianti come nuovi prodotti in Noor ONLINE, con quantità iniziale ZERO? Shopify e Noor LOCALE non saranno modificati.`))return;
  button.disabled=true;run.disabled=true;
  let imported=0;const failures=[];
  try{
   for(const v of selected){
    try{
     if(!can('settings')||!auth.currentUser)throw Error('Sessione o permessi non validi');
     // Reload server-side Firestore records before each creation to avoid stale comparisons.
     await refreshProductsFromServer();
     const fresh=compare({variants:[v]}).rows[0];
     if(!fresh.importable)throw Error('Prodotto già presente o abbinamento ambiguo');
     if(state.products.some(p=>p.id===gidId(v.variantId)))throw Error('ID Shopify già importato');
     const price=asNumber(v.price);
     const id=gidId(v.variantId);
     const name=displayName(v);
     await upsertProduct({id,name,barcode:v.barcode||'',sku:v.sku||'',description:v.description||'',price,cost:0,qty:0,brand:'',category:'',size:v.variant!=='Default Title'?v.variant:'',notes:[],notesTop:[],notesHeart:[],notesBase:[],photo:v.imageUrl||'',coverPhoto:v.imageUrl||'',photos:v.imageUrl?[v.imageUrl]:[],shopifyProductId:v.productId,shopifyVariantId:v.variantId,shopifyInventoryItemId:v.inventoryItemId,shopifySource:'imported',targetWarehouseIds:[String(lastOnline.id)],sourceWarehouseId:String(lastOnline.id),warehouseId:String(lastOnline.id)});
     imported++;status.textContent=`Importati ${imported} di ${selected.length}…`;
    }catch(e){failures.push(`${displayName(v)}: ${e.message||'errore'}`)}
   }
   status.textContent=`Importati ${imported} prodotti. ${failures.length?`Non importati ${failures.length}: ${failures.slice(0,4).join(' | ')}`:'Nessun errore.'} Rilettura in corso…`;
   await readPreview();
   const newStatus=target.querySelector('#shopifyImportStatus');if(newStatus)newStatus.textContent=`Importazione completata: ${imported} prodotti creati, ${failures.length} non importati. Quantità non sincronizzate.${failures.length?' Dettagli: '+failures.slice(0,4).join(' | '):''}`;
  }catch(e){status.textContent='Errore: '+(e.message||'imprevisto')}finally{run.disabled=false;if(button.isConnected)button.disabled=false}
 }
 run.onclick=async()=>{run.disabled=true;target.textContent='Lettura aggiornata di Shopify e Noor…';try{await readPreview()}catch(e){target.textContent='Anteprima non disponibile: '+(e.message||'errore')}finally{run.disabled=false}};
}
