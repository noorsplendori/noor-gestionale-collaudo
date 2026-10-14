import {can} from './store.js';

const meta={
  home:['Home','Situazione aggiornata del negozio.'],
  products:['Prodotti','Catalogo e anagrafica prodotti.'],
  'low-stock':['Scorte basse','Prodotti sotto la soglia impostata.'],
  'products-deleted':['Prodotti eliminati','Archivio prodotti rimossi e ripristino.'],
  'product-detail':['Scheda prodotto','Dettaglio e modifica prodotto.'],
  sell:['Vendi','Vendita rapida e carrello.'],
  history:['Storico vendite','Ordini completati e annullati.'],
  cancelled:['Ordini annullati','Registro annullamenti completi e parziali.'],
  stock:['Magazzino','Giacenze e movimenti.'],
  'stock-move':['Carico / Scarico','Movimento manuale o tramite barcode.'],
  'stock-bulk':['Reset / Carico / Scarico','Gestione massiva delle giacenze.'],
  discounts:['Sconti','Codici extra carrello.'],
  employees:['Dipendenti','Account e ruoli.'],
  'employee-overview':['Panoramica dipendente','Dati, rendimento, accessi e suggerimenti operativi.'],
  roles:['Gestione ruoli','Permessi predefiniti per ciascun ruolo.'],
  shifts:['Turni','Turno corrente e storico.'],
  finance:['Contabilità','Movimenti di cassa e riepilogo per sede.'],
  returns:['Resi e rimborsi','Rimborsi contabili controllati.'],
  closures:['Chiusure','Riepiloghi giornalieri.'],
  'closure-detail':['Dettaglio chiusura','Ordini integrati e reintegro.'],
  access:['Controllo accessi','Ultimi accessi registrati.'],
  shopify:['Shopify','Centro sincronizzazione e prodotti.'],
  'points-of-sale':['Punti vendita','Anagrafiche sedi e magazzini associati.'],
  warehouses:['Magazzini','Gestione e inizializzazione magazzini.'],
  settings:['Impostazioni','Configurazione gestionale.'],
  profile:['Il mio profilo','Dati personali e account.']
};

const routePerm={finance:'viewRevenue',returns:'viewOrders',products:'viewProducts','low-stock':'viewStock','products-deleted':'manageProducts','product-detail':'viewProducts',sell:'sell',history:'viewOrders',stock:'viewStock','stock-move':'viewStock','stock-bulk':'viewStock',discounts:'viewDiscounts',employees:'manageEmployees','employee-overview':'manageEmployees',roles:'manageEmployees',closures:'createClosure','closure-detail':'createClosure',access:'viewAccessLogs',settings:'settings',shopify:'settings','points-of-sale':'settings',warehouses:'settings'};

const routePaths={
  home:'/',
  products:'/prodotti',
  'low-stock':'/prodotti/scorte-basse',
  'products-deleted':'/prodotti/eliminati',
  'product-detail':'/prodotti/scheda',
  sell:'/vendi',
  history:'/storico',
  cancelled:'/storico/annullati',
  stock:'/magazzino',
  'stock-move':'/magazzino/carico-scarico',
  'stock-bulk':'/magazzino/reset',
  discounts:'/sconti',
  employees:'/dipendenti',
  'employee-overview':'/dipendenti/panoramica',
  roles:'/dipendenti/ruoli',
  shifts:'/turni',
  finance:'/gestione-monetaria',
  returns:'/resi-rimborsi',
  closures:'/chiusure',
  'closure-detail':'/chiusure/dettaglio',
  access:'/accessi',
  shopify:'/shopify',
  'points-of-sale':'/punti-vendita',
  warehouses:'/magazzini',
  settings:'/impostazioni',
  profile:'/profilo'
};

const pathRoutes=Object.fromEntries(Object.entries(routePaths).map(([route,path])=>[path,route]));
let onRoute=()=>{};
let routerStarted=false;

function normalizePath(pathname){
  let p=String(pathname||'/').split('?')[0].split('#')[0]||'/';
  try{p=decodeURI(p)}catch{}
  if(p.length>1)p=p.replace(/\/+$/,'');
  return p||'/';
}

function routeFromPath(pathname){
  const p=normalizePath(pathname);
  return pathRoutes[p]||null;
}

function syncBrowserUrl(id,{replace=false,skipHistory=false}={}){
  if(skipHistory||typeof window==='undefined'||!window.history)return;
  const next=routePaths[id]||'/';
  const current=normalizePath(window.location.pathname);
  if(current===next)return;
  const fn=replace?'replaceState':'pushState';
  window.history[fn]({noorRoute:id},'',next+window.location.hash);
}

export function setRouteHook(fn){onRoute=fn}

export function go(id,options={}){
  if(!meta[id])id='home';
  if(routePerm[id]&&!can(routePerm[id]))id='home';
  document.querySelectorAll('.route').forEach(x=>x.classList.toggle('active',x.id==='route-'+id));
  document.querySelectorAll('#mainNav [data-route]').forEach(x=>x.classList.toggle('active',x.dataset.route===id));
  const m=meta[id]||meta.home;
  const title=document.getElementById('pageTitle');
  const sub=document.getElementById('pageSub');
  if(title)title.textContent=m[0];
  if(sub)sub.textContent=m[1];
  localStorage.setItem('noor_v2_route',id);
  syncBrowserUrl(id,options);
  onRoute(id);
}

export function initRouter(){
  document.querySelectorAll('[data-route]').forEach(b=>{
    if(b.dataset.routerBound==='1')return;
    b.dataset.routerBound='1';
    b.addEventListener('click',()=>go(b.dataset.route));
  });

  let first=routeFromPath(window.location.pathname)||localStorage.getItem('noor_v2_route')||'home';
  if(first==='product-detail'&&!document.querySelector('#route-product-detail'))first='products';
  if(first==='closure-detail'&&!document.querySelector('#route-closure-detail'))first='closures';
  if(first==='employee-overview'&&!document.querySelector('#route-employee-overview'))first='employees';
  go(first,{replace:true});

  if(!routerStarted){
    window.addEventListener('popstate',()=>{
      const route=routeFromPath(window.location.pathname)||'home';
      go(route,{skipHistory:true});
    });
    routerStarted=true;
  }
}
