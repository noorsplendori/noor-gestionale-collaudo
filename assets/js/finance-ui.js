import {orderDisplayReference,orderSearchReference} from './order-reference.mjs';
// NOOR STAGING only. No direct Firestore financial writes: every mutation goes through noor-finance.
import {auth} from './firebase.js';
import {state,money} from './store.js';
import {confirmDialog,toast} from './ui.js';
const ENDPOINT='https://noor-gestionale-collaudo.netlify.app/.netlify/functions/noor-finance';
const byId=id=>document.getElementById(id);
const central=()=>['owner','admin','superadmin','super-admin'].includes(String(state.profile?.role||'').toLowerCase());
const permittedSites=()=>{const sites=(state.settings?.pointsOfSale||[]).filter(p=>p.active!==false&&p.deleted!==true);return central()?sites:sites.filter(p=>p.id===state.profile?.pointOfSaleId)};
const errorText=e=>String(e?.message||e||'Errore sconosciuto');
const euro=cents=>money(Number(cents||0)/100);
function safeSite(){const s=permittedSites();return s.find(p=>p.id===selectedSite)||s[0]||null}
let selectedSite='',selectedOrder='';
const uniqueId=prefix=>prefix+'_'+crypto.randomUUID().replace(/-/g,'');
async function request(action,other={}){
  if(!['localhost','127.0.0.1'].includes(location.hostname))throw Error('Solo in locale.');
  const current=auth.currentUser;if(!current)throw Error('Effettua nuovamente l’accesso.');
  const site=safeSite();if(!site)throw Error('Sede non assegnata.');
  const response=await fetch(ENDPOINT,{method:'POST',headers:{'Authorization':'Bearer '+await current.getIdToken(),'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({action,pointOfSaleId:site.id,...other})});
  let body={};try{body=await response.json()}catch{}
  if(!response.ok||!body.ok)throw Error(body.error||`Richiesta fallita (${response.status})`);
  return body;
}
function element(tag,text){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x}
function notice(container,text){const x=element('div',text);x.className='noor-finance-note';container.append(x);return x}
function sitePicker(container,onChange){const sites=permittedSites();const wrap=element('label','Punto vendita');const select=element('select');select.setAttribute('aria-label','Punto vendita');for(const site of sites){const o=element('option',site.name+' ('+site.id+')');o.value=site.id;select.append(o)}const active=safeSite();if(active)select.value=active.id;selectedSite=select.value;select.disabled=!central();select.onchange=()=>{selectedSite=select.value;onChange()};wrap.append(select);container.append(wrap);return select}
export function renderFinance(){const root=byId('financeApp');if(!root)return;root.replaceChildren();if(!permittedSites().length){notice(root,'Non hai una sede assegnata.');return}
  const bar=element('div');bar.className='noor-finance-form';sitePicker(bar,renderFinance);const refresh=element('button','Aggiorna riepilogo');refresh.type='button';refresh.className='btn secondary';bar.append(refresh);root.append(bar);
  const grid=element('div');grid.className='noor-finance-grid';root.append(grid);const status=notice(root,'Riepilogo non ancora caricato.');
  async function load(){grid.replaceChildren();status.textContent='Caricamento riepilogo…';ledger.replaceChildren();refresh.disabled=true;try{const d=await request('summary');for(const [label,k] of [['Vendite','salesCents'],['Resi','refundCents'],['Entrate contanti','cashInCents'],['Uscite contanti','cashOutCents'],['Saldo contabile','netCents']]){const tile=element('div');tile.className='noor-finance-tile';tile.append(element('span',label),element('strong',euro(d.summary?.[k])));grid.append(tile)}renderEntries(d.entries||[]);status.textContent='Riepilogo della sede '+d.pointOfSaleId+' · periodo '+(d.periodStart||'non attivato')+'. Il saldo non sostituisce la quadratura di cassa.'}catch(e){status.textContent='Riepilogo non disponibile: '+errorText(e)}finally{refresh.disabled=false}}
  const ledger=element('div');ledger.className='noor-finance-ledger';root.append(ledger);
  function renderEntries(entries){ledger.replaceChildren();ledger.append(element('h3','Ultimi movimenti e resi (massimo 50)'));if(!entries.length){notice(ledger,'Nessun movimento o reso contabilizzato per questa sede.');return}const table=element('table');const thead=element('thead');const hr=element('tr');for(const text of ['Data','Tipo','Causale','Importo'])hr.append(element('th',text));thead.append(hr);table.append(thead);const body=element('tbody');for(const x of entries){const row=element('tr');row.append(element('td',x.date?new Date(x.date).toLocaleString('it-IT'):'—'),element('td',x.kind==='refund'?'Reso':x.kind==='cash_in'?'Entrata':'Uscita'),element('td',x.description||'—'),element('td',euro(x.amountCents)));body.append(row)}table.append(body);ledger.append(table)}
  refresh.onclick=load;
  if(central()){const title=element('h3','Registra movimento di cassa (solo collaudo)');root.append(title);const form=element('form');form.className='noor-finance-form';const kind=element('select');for(const [value,label] of [['cash_in','Entrata contanti'],['cash_out','Uscita contanti']]){const o=element('option',label);o.value=value;kind.append(o)}const amount=element('input');amount.type='number';amount.min='0.01';amount.step='0.01';amount.required=true;const reason=element('input');reason.maxLength=500;reason.minLength=4;reason.required=true;reason.placeholder='Es. fondo cassa di prova';const label=(name,el)=>{const l=element('label',name);l.append(el);form.append(l)};label('Tipo',kind);label('Importo €',amount);label('Causale (4-500 caratteri)',reason);const btn=element('button','Registra movimento test');btn.type='submit';btn.className='btn primary';form.append(btn);const msg=notice(root,'Nessun movimento inviato.');root.append(form);form.onsubmit=async e=>{e.preventDefault();const cents=Math.round(Number(amount.value)*100);if(!Number.isSafeInteger(cents)||cents<=0){msg.textContent='Importo non valido';return}if(!await confirmDialog('Registrare questo movimento di cassa nel Firebase STAGING?','Conferma movimento di cassa'))return;const op=uniqueId('cash');btn.disabled=true;try{const d=await request('movement',{operationId:op,type:kind.value,amountCents:cents,reason:reason.value.trim()});msg.textContent='Movimento registrato: '+d.operationId;toast('Movimento registrato correttamente');amount.value='';reason.value='';await load()}catch(err){msg.textContent=errorText(err)+' · Se hai dubbi sull’esito, controlla il registro prima di riprovare.'}finally{btn.disabled=false}}}
  if(central()){
    const h=element('h3','Quadratura contanti di prova');root.append(h);
    notice(root,'Non è una chiusura fiscale definitiva: registra un controllo del contante contato per una singola giornata. Non modifica giacenze o incassi.');
    const wrap=element('form');wrap.className='noor-finance-form';root.append(wrap);
    const day=element('input');day.type='date';day.value=new Date().toISOString().slice(0,10);day.required=true;
    const amount=element('input');amount.type='number';amount.min='0';amount.step='0.01';amount.required=true;
    const note=element('input');note.maxLength=500;note.placeholder='Nota (facoltativa)';
    for(const [caption,field] of [['Giornata',day],['Contanti effettivamente contati (€)',amount],['Nota',note]]){const label=element('label',caption);label.append(field);wrap.append(label)}
    const submit=element('button','Registra quadratura di prova');submit.type='submit';submit.className='btn primary';wrap.append(submit);
    const output=notice(root,'Nessuna quadratura registrata in questa sessione.');
    wrap.onsubmit=async event=>{event.preventDefault();const countedCashCents=Math.round(Number(amount.value)*100);
      if(!Number.isSafeInteger(countedCashCents)||countedCashCents<0){output.textContent='Importo non valido';return}
      if(!await confirmDialog('Registrare una quadratura contanti di prova? Non equivale a chiusura fiscale.','Conferma quadratura'))return;
      submit.disabled=true;
      try{const d=await request('reconcile',{operationId:uniqueId('reconcile'),day:day.value,countedCashCents,note:note.value.trim()});output.textContent='Quadratura salvata · Teorico '+euro(d.expectedCashCents)+' · Contato '+euro(d.countedCashCents)+' · Differenza '+euro(d.differenceCents);toast('Quadratura di prova registrata')}
      catch(err){output.textContent=errorText(err)+' · Controlla le quadrature registrate prima di ripetere.'}finally{submit.disabled=false}
    };
  }
  load();
}
export function renderReturns(){
  const root=byId('returnsApp');if(!root)return;root.replaceChildren();
  if(!central()){notice(root,'I rimborsi sono riservati all’Owner durante il collaudo.');return}
  if(!permittedSites().length){notice(root,'Nessun punto vendita attivo.');return}
  const top=element('div');top.className='noor-finance-form noor-refund-controls';sitePicker(top,renderReturns);root.append(top);
  const orders=(state.orders||[]).filter(o=>o.pointOfSaleId===safeSite()?.id&&o.status==='completed'&&o.source==='noor-staging-backend');
  const box=element('section');box.className='noor-refund-search';root.append(box);
  const label=element('label','Cerca un ordine o scansiona il codice dello scontrino');box.append(label);
  const input=element('input');input.type='search';input.autocomplete='off';input.placeholder='Numero ordine, codice a barre, articolo, venditore…';input.setAttribute('aria-label','Cerca o scansiona ordine');label.append(input);
  const hint=element('small','Puoi digitare il numero, incollare un codice o usare uno scanner USB/Bluetooth che scrive nel campo. Premi Invio per selezionare il primo risultato.');box.append(hint);
  const results=element('div');results.className='noor-refund-results';box.append(results);
  const details=element('div');details.className='noor-refund-details';root.append(details);
  const lines=element('div');root.append(lines);
  const message=notice(root,orders.length?'Cerca e seleziona un ordine per visualizzare il dettaglio.':'Nessun ordine di prova disponibile per questa sede.');
  const form=element('form');form.className='noor-finance-form noor-refund-form';root.append(form);
  const orderCode=orderDisplayReference;
  let refundStatuses=new Map();
  const refundBadge=o=>{const x=refundStatuses.get(String(o.id));if(!x||x.returned<=0)return null;const total=(o.items||[]).reduce((sum,i)=>sum+Number(i.qty||0),0);return x.returned>=total&&total>0?'RESO':'RESO PARZIALE'};
  const orderDate=o=>{const raw=o.date||o.createdAtClient||o.createdAt;const d=raw?.toDate?raw.toDate():new Date(raw||0);return !raw||isNaN(d)?'Data non disponibile':d.toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'})};
  const orderSummary=o=>`${orderCode(o)} ${o.id||''} ${o.sellerName||o.employeeName||''} ${o.payment||o.paymentMethod||''} ${(o.items||[]).map(i=>[i.name,i.productName,i.productId,i.barcode].join(' ')).join(' ')}`.toLowerCase();
  function previewList(){
    const q=input.value.trim().toLowerCase();const matching=orders.filter(o=>!q||orderSummary(o).includes(q)).slice(0,30);
    results.replaceChildren();
    if(!matching.length){notice(results,'Nessun ordine trovato in questa sede. Verifica il numero o il codice scansionato.');return}
    for(const o of matching){const button=element('button');button.type='button';button.className='noor-refund-result'+(String(o.id)===selectedOrder?' selected':'');
      const info=element('span');const numberRow=element('div');numberRow.className='noor-refund-number-row';const number=element('strong','Ordine '+orderCode(o));numberRow.append(number);const badge=refundBadge(o);if(badge){const tag=element('span',badge);tag.className='noor-refund-status'+(badge==='RESO'?' completed':' partial');numberRow.append(tag)}const meta=element('small',orderDate(o)+' · '+(o.payment||o.paymentMethod||'Pagamento non indicato')+' · '+(o.sellerName||o.employeeName||'Venditore non indicato'));
      const products=element('small',(o.items||[]).map(i=>`${i.productName||i.name||i.productId} × ${i.qty||0}`).join(' · ')||'Nessun articolo');info.append(numberRow,meta,products);
      button.append(info,element('b',money(o.total||0)));button.onclick=()=>{selectedOrder=String(o.id);input.value=orderCode(o);previewList();void build()};results.append(button)}
  }
  async function build(){
    lines.replaceChildren();form.replaceChildren();details.replaceChildren();
    const order=orders.find(o=>String(o.id)===selectedOrder);
    if(!order){message.textContent='Seleziona un ordine per consultare gli articoli e registrare un eventuale reso.';return}
    const heading=element('div');heading.className='noor-refund-details-head';
    const headingText=element('div');headingText.append(element('small','RIEPILOGO ORDINE'));const detailedTitle=element('div');detailedTitle.className='noor-refund-number-row';detailedTitle.append(element('h3','Ordine '+orderCode(order)));const detailBadge=refundBadge(order);if(detailBadge){const tag=element('span',detailBadge);tag.className='noor-refund-status'+(detailBadge==='RESO'?' completed':' partial');detailedTitle.append(tag)}headingText.append(detailedTitle,element('p',orderDate(order)+' · '+(order.sellerName||order.employeeName||'Venditore non indicato')));
    heading.append(headingText,element('strong',money(order.total||0)));details.append(heading);
    const facts=element('div');facts.className='noor-refund-facts';for(const [k,v] of [['Pagamento',order.payment||order.paymentMethod||'—'],['Articoli',(order.items||[]).reduce((a,i)=>a+Number(i.qty||0),0)+' pz'],['Sede',safeSite()?.name||safeSite()?.id||'—']]){const cell=element('div');cell.append(element('small',k),element('b',String(v)));facts.append(cell)}details.append(facts);
    const inputs=[];
    for(const line of order.items||[]){const item=element('div');item.className='noor-refund-line';const text=element('div');text.className='noor-refund-line-label';text.append(element('strong',line.productName||line.name||line.productId),element('small','Venduti: '+line.qty+' · Prezzo unitario: '+money(line.unitPrice??line.price??0)+' · Magazzino: '+(line.warehouseName||line.warehouseId||'—')));const q=element('input');q.type='number';q.min='0';q.max=String(line.qty);q.step='1';q.value='0';q.setAttribute('aria-label','Quantità da rendere per '+(line.productName||line.name||line.productId));item.append(text,q);lines.append(item);inputs.push({line,q})}
    const reason=element('input');reason.required=true;reason.minLength=4;reason.maxLength=500;reason.placeholder='Es. prodotto difettoso';const l=element('label','Motivo del reso');l.append(reason);form.append(l);
    const btn=element('button','Registra reso contabile di prova');btn.type='submit';btn.className='btn primary';form.append(btn);message.textContent='Controllo disponibilità resi…';btn.disabled=true;
    try{const preview=await request('refund-preview',{orderId:String(order.id)});if(selectedOrder!==String(order.id))return;
      for(const {line,q} of inputs){const d=(preview.lines||[]).find(x=>x.productId===String(line.productId)&&x.warehouseId===String(line.warehouseId));const available=Math.max(0,Number(d?.soldQty||0)-Number(d?.returnedQty||0));q.max=String(available);q.disabled=available===0;q.parentElement.querySelector('.noor-refund-line-label').append(element('small','Ancora rendibili: '+available+' · Già resi: '+Number(d?.returnedQty||0)))}
      btn.disabled=!inputs.some(x=>!x.q.disabled);message.textContent='Reso esclusivamente contabile: nessun reintegro e nessuna erogazione fisica.';
    }catch(err){message.textContent='Reso non disponibile: '+errorText(err);btn.disabled=true}
    form.onsubmit=async e=>{e.preventDefault();const items=inputs.map(({line,q})=>({productId:String(line.productId),warehouseId:String(line.warehouseId),qty:Number(q.value),restock:false})).filter(i=>i.qty>0);
      if(!items.length){message.textContent='Seleziona almeno una quantità da rendere.';return}
      if(inputs.some(({q})=>Number(q.value)>Number(q.max))){message.textContent='La quantità supera quella ancora rendibile.';return}
      if(!await confirmDialog('Registrare questo reso contabile su Firebase STAGING? Nessun reintegro delle giacenze e nessuna erogazione fisica.','Conferma reso'))return;
      btn.disabled=true;try{const data=await request('refund',{orderId:String(order.id),operationId:uniqueId('refund'),reason:reason.value.trim(),refundMethod:'cash',items});message.textContent='Reso registrato: '+data.operationId+' · '+euro(data.amountCents);toast('Reso contabile registrato');await loadRefundStatuses();await build()}
      catch(err){message.textContent=errorText(err)+' · Verifica il registro prima di riprovare.'}finally{btn.disabled=false}
    };
  }
  input.oninput=()=>{selectedOrder='';lines.replaceChildren();form.replaceChildren();details.replaceChildren();previewList();};
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const q=input.value.trim().toLowerCase();const exact=orders.find(o=>orderCode(o).toLowerCase()===q||String(o.id).toLowerCase()===q);const first=exact||orders.find(o=>orderSummary(o).includes(q));if(first){selectedOrder=String(first.id);input.value=orderCode(first);previewList();void build()}}};
  async function loadRefundStatuses(){try{const res=await request('refund-status');refundStatuses=new Map(Object.entries(res.orders||{}).map(([id,value])=>[id,{returned:Number(value.returned||0)}]));previewList()}catch(err){notice(results,'Stato resi non disponibile: '+errorText(err))}}
  previewList();void loadRefundStatuses();if(orders.some(o=>String(o.id)===selectedOrder))void build();
}
