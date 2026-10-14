import {isLegacyRecord} from './management-period.mjs';
import {db,auth} from './firebase.js';
import {collection,doc,getDoc,getDocs,getDocFromCache,getDocsFromCache,getDocsFromServer,onSnapshot,query,limit,orderBy,setDoc,serverTimestamp,runTransaction,where,addDoc,deleteDoc,writeBatch,increment} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

export const state={
  profile:null,products:[],orders:[],discounts:[],shifts:[],closures:[],employees:[],cancelledOrders:[],stockMovements:[],accessLogs:[],currentWarehouseId:'',
  fastHomeCache:null,productImageCache:{},orderHistoryLoaded:false,
  settings:{appName:'Noor Splendori',appSubtitle:'Gestionale Cloud',buildLabel:'Build test',buildVersion:'V2.5.10',buildAuthor:'Sony',companyName:'Noor Splendori',companyPhone:'',companyEmail:'',companyVat:'',lowStockMax:5,homeLowStockLimit:5,homeLatestOrdersLimit:5,showStockValue:true,showCostValue:true,showQuickActions:true,appLogo:'',loginLogo:'',receiptLogo:'',receiptFooter:'Grazie per il tuo acquisto',receiptVatRate:22,logoWidth:90,logoHeight:90,productBrands:[],productFormats:[],productCategories:[],productNotes:[],warehouses:[{id:'main',name:'Magazzino principale',active:true}]},
  listeners:[],loaded:{products:false,orders:false,discounts:false,shifts:false,closures:false,employees:false,cancelledOrders:false,stockMovements:false,accessLogs:false},
  errors:{products:'',orders:'',discounts:'',shifts:'',closures:'',employees:'',cancelledOrders:'',stockMovements:'',accessLogs:''}
};
const subs=new Set();
export const subscribe=fn=>{subs.add(fn);return()=>subs.delete(fn)};
export const emit=(type)=>subs.forEach(fn=>{try{fn(type,state)}catch(e){console.error(e)}});
export const money=n=>Number(n||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'});
export const toDate=v=>{try{if(v?.toDate)return v.toDate();if(v)return new Date(v)}catch{}return null};
export const norm=s=>String(s??'').trim();
const listify=v=>Array.isArray(v)?v.map(x=>String(x??'').trim()).filter(Boolean):(typeof v==='string'?v.split(/\n|,|;/).map(x=>x.trim()).filter(Boolean):[]);
const normalizeProductRecord=p=>{const photo=productPhoto(p);const photos=Array.from(new Set([...(Array.isArray(p?.photos)?p.photos:[]),p?.photo,p?.coverPhoto,p?.image,p?.imageUrl].filter(Boolean)));return {...p,notes:listify(p?.notes),photos,photo:p?.photo||photo,coverPhoto:p?.coverPhoto||photo,inventoryByWarehouse:(p?.inventoryByWarehouse&&typeof p.inventoryByWarehouse==='object')?p.inventoryByWarehouse:{}}};
const normalizeWarehouses=v=>{const arr=Array.isArray(v)?v:[];const clean=arr.map((w,i)=>({id:String(w?.id||('wh'+(i+1))).trim().replace(/[^a-zA-Z0-9_-]/g,'-').toLowerCase(),name:String(w?.name||('Magazzino '+(i+1))).trim(),active:w?.active!==false,deleted:w?.deleted===true,deletedAtClient:String(w?.deletedAtClient||'')})).filter(w=>w.id&&w.name);return clean.length?clean:[{id:'main',name:'Magazzino principale',active:true}]};
const normalizeSettingsLists=st=>({...st,productBrands:listify(st?.productBrands),productFormats:listify(st?.productFormats),productCategories:listify(st?.productCategories),productNotes:listify(st?.productNotes),productNotesTop:listify(st?.productNotesTop),productNotesHeart:listify(st?.productNotesHeart),productNotesBase:listify(st?.productNotesBase),warehouses:normalizeWarehouses(st?.warehouses),pointsOfSale:Array.isArray(st?.pointsOfSale)?st.pointsOfSale.filter(x=>x&&x.id&&x.name).map(x=>({id:String(x.id),name:String(x.name),warehouseId:String(x.warehouseId||''),address:String(x.address||''),email:String(x.email||''),phone:String(x.phone||''),active:x.active!==false,deleted:x.deleted===true,deletedAtClient:String(x.deletedAtClient||'')})):[]});
const FAST_HOME_KEY='noor_v2_fast_home_v1';
const GLOBAL_SETTINGS_KEY='noor_v2_global_settings';
const PROFILE_CACHE_KEY='noor_v2_profile_cache';
const compactIdentityCache=data=>{const d={...(data||{})};for(const k of ['appLogo','loginLogo','receiptLogo','appFavicon']){if(String(d[k]||'').startsWith('data:'))delete d[k]}return d};
const compactGlobalCache=data=>{const d={...(data||{})};for(const k of ['appLogo','loginLogo','receiptLogo','appFavicon'])delete d[k];return d};

const safePhoto=v=>{const s=String(v||'');return s&&s.length<900&&!s.startsWith('data:')?s:''};
const PRODUCT_IMAGE_DB='noor_v2_product_images';
const PRODUCT_IMAGE_STORE='images';
const openProductImageDb=()=>new Promise((resolve,reject)=>{try{const req=indexedDB.open(PRODUCT_IMAGE_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(PRODUCT_IMAGE_STORE))db.createObjectStore(PRODUCT_IMAGE_STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)}catch(e){reject(e)}});
export async function hydrateProductImageCache(){try{const db=await openProductImageDb();const tx=db.transaction(PRODUCT_IMAGE_STORE,'readonly');const store=tx.objectStore(PRODUCT_IMAGE_STORE);const keysReq=store.getAllKeys(),valsReq=store.getAll();await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});const keys=keysReq.result||[],vals=valsReq.result||[];const cache={};keys.forEach((k,i)=>{if(vals[i])cache[String(k)]=vals[i]});state.productImageCache={...(state.productImageCache||{}),...cache};emit('productImages');return cache}catch(e){console.warn('product image cache hydrate',e);return {}}}
async function persistProductImages(products=[]){try{const pairs=[];for(const p of products){const direct=p?.coverPhoto||p?.photo||p?.image||p?.imageUrl||p?.img||(Array.isArray(p?.photos)?p.photos.find(Boolean):'')||'';if(p?.id&&direct)pairs.push([String(p.id),direct])}if(!pairs.length)return;for(const [id,src] of pairs)state.productImageCache[id]=src;const db=await openProductImageDb();const tx=db.transaction(PRODUCT_IMAGE_STORE,'readwrite');const store=tx.objectStore(PRODUCT_IMAGE_STORE);for(const [id,src] of pairs)store.put(src,id);await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}catch(e){console.warn('product image cache persist',e)}}

async function removeProductImageCacheEntry(id){try{delete state.productImageCache[String(id)];const dbi=await openProductImageDb();const tx=dbi.transaction(PRODUCT_IMAGE_STORE,'readwrite');tx.objectStore(PRODUCT_IMAGE_STORE).delete(String(id));await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}catch(e){console.warn('product image cache remove',e)}}
async function pruneProductImageCache(validIds){try{const keep=new Set((validIds||[]).map(String));for(const id of Object.keys(state.productImageCache||{}))if(!keep.has(String(id)))delete state.productImageCache[id];const dbi=await openProductImageDb();const tx=dbi.transaction(PRODUCT_IMAGE_STORE,'readwrite'),store=tx.objectStore(PRODUCT_IMAGE_STORE),req=store.getAllKeys();await new Promise((res,rej)=>{req.onsuccess=res;req.onerror=()=>rej(req.error)});for(const key of req.result||[])if(!keep.has(String(key)))store.delete(key);await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}catch(e){console.warn('product image cache prune',e)}}

const slimProduct=p=>({id:p.id,name:p.name||'',brand:p.brand||'',category:p.category||'',size:p.size||'',format:p.format||'',qty:Number(p.qty??p.stock??p.quantity??0)||0,stock:Number(p.qty??p.stock??p.quantity??0)||0,quantity:Number(p.qty??p.stock??p.quantity??0)||0,price:Number(p.price||0),cost:Number(p.cost||0),finalPrice:Number(p.finalPrice||0),discountActive:!!p.discountActive,deleted:!!p.deleted,createdAtClient:p.createdAtClient||'',updatedAtClient:p.updatedAtClient||'',photo:safePhoto(productPhoto(p)),coverPhoto:safePhoto(productPhoto(p)),inventoryByWarehouse:(p.inventoryByWarehouse&&typeof p.inventoryByWarehouse==='object')?p.inventoryByWarehouse:{}});
const slimOrder=o=>({id:o.id,orderId:o.orderId||'',orderNumber:o.orderNumber||'',status:o.status||'',cancelled:!!o.cancelled,total:Number(o.total||0),subtotal:Number(o.subtotal||0),date:o.date||'',createdAtClient:o.createdAtClient||'',createdAt:o.createdAtClient||'',pointOfSaleId:o.pointOfSaleId||'',sellerUid:o.sellerUid||'',employeeUid:o.employeeUid||'',createdByUid:o.createdByUid||'',payment:o.payment||o.paymentMethod||'',items:(o.items||[]).slice(0,8).map(i=>({productId:i.productId||'',productName:i.productName||'',qty:Number(i.qty||0),unitPrice:Number(i.unitPrice||i.price||0),price:Number(i.price||i.unitPrice||0),netTotal:Number(i.netTotal??i.total??0),total:Number(i.total??i.netTotal??0),photo:safePhoto(i.photo)}))});
const slimShift=s=>({id:s.id,status:s.status||'',deleted:!!s.deleted,pointOfSaleId:s.pointOfSaleId||'',sellerUid:s.sellerUid||'',employeeUid:s.employeeUid||'',sellerName:s.sellerName||'',employeeName:s.employeeName||'',startAtClient:s.startAtClient||'',endAtClient:s.endAtClient||''});
let fastCacheTimer=null;
export function hydrateFastHomeCache(){return null;/* STAGING: nessuna cache economica condivisa tra account */try{const raw=localStorage.getItem(FAST_HOME_KEY);if(!raw)return null;const c=JSON.parse(raw);if(!c||Date.now()-Number(c.ts||0)>1000*60*60*24*3)return null;state.fastHomeCache=c;if(c.ready?.products&&Array.isArray(c.products)&&!state.products.length){state.products=c.products.map(normalizeProductRecord);state.loaded.products=true}if(c.ready?.orders&&Array.isArray(c.orders)&&!state.orders.length){state.orders=c.orders;state.loaded.orders=true}if(c.ready?.shifts&&Array.isArray(c.shifts)&&!state.shifts.length){state.shifts=c.shifts;state.loaded.shifts=true}return c}catch{return null}}
function persistFastHomeCache(){return;/* STAGING: evitare persistenza dati economici condivisi */try{const prev=state.fastHomeCache||{};const c={ts:Date.now(),ready:{products:state.loaded.products||!!prev.ready?.products,orders:state.loaded.orders||!!prev.ready?.orders,shifts:state.loaded.shifts||!!prev.ready?.shifts},products:state.loaded.products?state.products.filter(p=>p.deleted!==true).map(slimProduct):(prev.products||[]),orders:state.loaded.orders?state.orders.filter(o=>o.test!==true).slice(0,30).map(slimOrder):(prev.orders||[]),shifts:state.loaded.shifts?state.shifts.filter(s=>s.deleted!==true).slice(0,12).map(slimShift):(prev.shifts||[])};state.fastHomeCache=c;localStorage.setItem(FAST_HOME_KEY,JSON.stringify(c))}catch(e){console.warn('fast home cache',e)}}
function scheduleFastHomeCache(){clearTimeout(fastCacheTimer);fastCacheTimer=setTimeout(persistFastHomeCache,120)}

export const role=()=>String(state.profile?.role||'seller').toLowerCase();
export const permissionCatalog=[
  {key:'sell',label:'Vendite',desc:'Accedere alla cassa, creare e concludere vendite.'},
  {key:'viewProducts',label:'Visualizza prodotti',desc:'Consultare catalogo, schede prodotto e prezzi.'},
  {key:'manageProducts',label:'Gestisci prodotti',desc:'Creare, modificare, duplicare, eliminare e ripristinare prodotti.'},
  {key:'viewStock',label:'Magazzino',desc:'Visualizzare giacenze, carichi/scarichi, trasferimenti e scorte basse.'},
  {key:'viewOrders',label:'Storico vendite',desc:'Consultare ordini, ricevute e dettagli delle vendite.'},
  {key:'cancelOrders',label:'Annullamenti / resi',desc:'Annullare ordini totalmente o parzialmente.'},
  {key:'editPayment',label:'Modifica pagamenti',desc:'Correggere il metodo di pagamento degli ordini.'},
  {key:'viewDiscounts',label:'Visualizza sconti',desc:'Consultare i codici sconto disponibili.'},
  {key:'manageDiscounts',label:'Gestisci sconti',desc:'Creare, modificare ed eliminare codici sconto.'},
  {key:'createClosure',label:'Chiusure',desc:'Visualizzare e creare chiusure giornaliere.'},
  {key:'editClosure',label:'Gestisci chiusure',desc:'Modificare chiusure, integrare o rimuovere ordini.'},
  {key:'manageEmployees',label:'Dipendenti',desc:'Creare, modificare, eliminare dipendenti e vedere panoramiche.'},
  {key:'viewAccessLogs',label:'Controllo accessi',desc:'Consultare il registro degli accessi al gestionale.'},
  {key:'viewRevenue',label:'Dati economici',desc:'Visualizzare incassi, valori di magazzino e dati economici.'},
  {key:'settings',label:'Impostazioni',desc:'Modificare configurazione generale, scontrino, magazzini e ruoli.'}
];
export const roleDefaultPermissions={
  seller:{sell:true,viewProducts:true,viewStock:true,viewDiscounts:true,viewOrders:true,createClosure:true,viewRevenue:true},
  supervisor:{sell:true,viewProducts:true,viewStock:true,viewDiscounts:true,viewOrders:true,cancelOrders:true,editPayment:true,createClosure:true,editClosure:true,viewRevenue:true},
  admin:{all:true},manager:{sell:true,viewProducts:true,viewStock:true,viewDiscounts:true,viewOrders:true,cancelOrders:true,editPayment:true,createClosure:true,editClosure:true,viewRevenue:true},owner:{all:true},superadmin:{all:true},'super-admin':{all:true}
};
export const permissionsForRole=(r=role())=>{const key=String(r||'seller').toLowerCase();const defaults=roleDefaultPermissions[key]||roleDefaultPermissions.seller;const configured=state.settings?.rolePermissions?.[key];if(defaults.all)return Object.fromEntries(permissionCatalog.map(x=>[x.key,true]));const out={};for(const item of permissionCatalog){out[item.key]=configured&&Object.prototype.hasOwnProperty.call(configured,item.key)?!!configured[item.key]:!!defaults[item.key]}return out};
export const can=p=>{const r=role();if(r==='manager'&&['settings','manageEmployees','manageProducts','manageDiscounts','viewAccessLogs'].includes(p))return false;if(r==='superadmin'||r==='super-admin')return true;const own=state.profile?.permissionOverrides;if(own&&Object.prototype.hasOwnProperty.call(own,p))return !!own[p];const legacy=state.profile?.extraPermissions;if(legacy&&Object.prototype.hasOwnProperty.call(legacy,p))return !!legacy[p];const perms=permissionsForRole(r);return !!perms[p]};
export const productPhoto=p=>p?.coverPhoto||p?.photo||p?.image||p?.imageUrl||p?.img||(Array.isArray(p?.photos)?p.photos.find(Boolean):'')||state.productImageCache?.[String(p?.id||'')]||'';
export const salePrice=(p,warehouseId=effectiveWarehouseId())=>productSalePrice(p,warehouseId);

// Anagrafiche delle sedi: NON costituiscono ancora un confine di autorizzazione.
export const pointsOfSale=()=>Array.isArray(state.settings?.pointsOfSale)?state.settings.pointsOfSale:[];
export const pointOfSaleById=id=>pointsOfSale().find(p=>p.id===String(id||'')&&p.deleted!==true);
export const currentPointOfSale=()=>pointOfSaleById(state.profile?.pointOfSaleId);
export const warehouses=()=>normalizeWarehouses(state.settings?.warehouses).filter(w=>w.active!==false&&w.deleted!==true);
export const warehouseById=id=>normalizeWarehouses(state.settings?.warehouses).find(w=>String(w.id)===String(id))||normalizeWarehouses(state.settings?.warehouses)[0];
export const allowedWarehouses=()=>{const all=warehouses();const ids=Array.isArray(state.profile?.allowedWarehouseIds)?state.profile.allowedWarehouseIds.map(String):[];if(can('settings')||can('manageEmployees'))return all;const site=state.settings?.pointsOfSale?.find(p=>String(p.id)===String(state.profile?.pointOfSaleId||''));if(String(state.profile?.role||'').toLowerCase()==='manager'){const assigned=String(site?.warehouseId||'');return assigned?all.filter(w=>String(w.id)===assigned):[]}if(!ids.length)return all;const set=new Set(ids);return all.filter(w=>set.has(String(w.id)))};
export function effectiveWarehouseId(){const allowed=allowedWarehouses();const wanted=state.currentWarehouseId||state.profile?.preferredWarehouseId||localStorage.getItem('noor_current_warehouse')||allowed[0]?.id||warehouses()[0]?.id||'main';return allowed.some(w=>String(w.id)===String(wanted))?String(wanted):String(allowed[0]?.id||warehouses()[0]?.id||'main')}
export function setCurrentWarehouse(id){const w=allowedWarehouses().find(x=>String(x.id)===String(id));if(!w)return false;state.currentWarehouseId=String(w.id);try{localStorage.setItem('noor_current_warehouse',state.currentWarehouseId)}catch{}emit('warehouse');return true}
export function productWarehouseData(p,warehouseId=effectiveWarehouseId()){
  if(!p)return {qty:0,price:0,cost:0,discountActive:false,finalPrice:0,deleted:false};
  const map=p.inventoryByWarehouse&&typeof p.inventoryByWarehouse==='object'?p.inventoryByWarehouse:{};
  if(map[warehouseId]){const d=map[warehouseId]||{};const deleted=d.deleted===true;return {qty:deleted?0:(Number(d.qty??d.stock??0)||0),price:Number(d.price??p.price??0)||0,cost:Number(d.cost??p.cost??0)||0,discountActive:d.discountActive??p.discountActive??false,finalPrice:Number(d.finalPrice??p.finalPrice??0)||0,deleted}}
  const primary=warehouses()[0]?.id||'main';
  if(String(warehouseId)===String(primary)){const deleted=p.deleted===true;return {qty:deleted?0:(Number(p.qty??p.stock??p.quantity??0)||0),price:Number(p.price||0)||0,cost:Number(p.cost||0)||0,discountActive:!!p.discountActive,finalPrice:Number(p.finalPrice||0)||0,deleted}}
  return {qty:0,price:Number(p.price||0)||0,cost:Number(p.cost||0)||0,discountActive:!!p.discountActive,finalPrice:Number(p.finalPrice||0)||0,deleted:false};
}
export const productDeletedInWarehouse=(p,warehouseId=effectiveWarehouseId())=>p?.deleted===true||productWarehouseData(p,warehouseId).deleted===true;
export const productQty=(p,warehouseId=effectiveWarehouseId())=>productWarehouseData(p,warehouseId).qty;
export const productListPrice=(p,warehouseId=effectiveWarehouseId())=>productWarehouseData(p,warehouseId).price;
export const productCost=(p,warehouseId=effectiveWarehouseId())=>productWarehouseData(p,warehouseId).cost;
export const productSalePrice=(p,warehouseId=effectiveWarehouseId())=>{const d=productWarehouseData(p,warehouseId);return d.discountActive&&Number(d.finalPrice)>0?Number(d.finalPrice):Number(d.price||0)};
export const availabilityByWarehouse=p=>warehouses().map(w=>({warehouse:w,...productWarehouseData(p,w.id)}));
function inventoryWithLegacy(p){const map={...((p?.inventoryByWarehouse&&typeof p.inventoryByWarehouse==='object')?p.inventoryByWarehouse:{})};const primary=warehouses()[0]?.id||'main';if(!map[primary])map[primary]={qty:Number(p?.qty??p?.stock??p?.quantity??0)||0,price:Number(p?.price||0)||0,cost:Number(p?.cost||0)||0,discountActive:!!p?.discountActive,finalPrice:Number(p?.finalPrice||0)||0,deleted:!!p?.deleted};return map}


export function hydrateCachedProfile(user){try{const raw=localStorage.getItem(PROFILE_CACHE_KEY);if(!raw)return null;const p=JSON.parse(raw);if(!p||String(p.uid||'')!==String(user?.uid||''))return null;state.profile=p;emit('profile');return p}catch{return null}}
export async function loadProfile(user){const s=await getDoc(doc(db,'users',user.uid));if(!s.exists())throw new Error('Profilo utente non trovato.');const p={uid:user.uid,email:user.email,...s.data()};if(p.active===false)throw new Error('Account disattivato.');state.profile=p;try{localStorage.setItem(PROFILE_CACHE_KEY,JSON.stringify(p))}catch{}emit('profile');return p}
export async function hydrateFirestoreCache(){return false}

export async function loadSettings(){try{const cachedGlobal=localStorage.getItem(GLOBAL_SETTINGS_KEY);if(cachedGlobal)state.settings=normalizeSettingsLists({...state.settings,...JSON.parse(cachedGlobal)});const cached=localStorage.getItem('noor_v2_identity');if(cached)state.settings=normalizeSettingsLists({...state.settings,...JSON.parse(cached)})}catch{}emit('settings');try{const [g,i]=await Promise.all([getDoc(doc(db,'settings','global')),getDoc(doc(db,'settings','identity'))]);if(g.exists())state.settings=normalizeSettingsLists({...state.settings,...g.data()});if(i.exists()){state.settings=normalizeSettingsLists({...state.settings,...i.data()});try{localStorage.setItem('noor_v2_identity',JSON.stringify(compactIdentityCache(i.data())))}catch{}}}catch(e){console.warn('settings',e)}emit('settings')}
// Il nuovo periodo e' un confine immutabile: una sola attivazione, senza effetti sulle scorte.
// La transazione rilegge Firebase e non usa lo stato/cache locale per decidere.
export async function activateManagementPeriod(){
 const roleName=String(state.profile?.role||'').toLowerCase();
 if(!['owner','superadmin','super-admin'].includes(roleName))throw new Error('Solo Owner o Super Admin puo attivare il nuovo periodo.');
 if(!auth.currentUser || String(state.profile?.uid||'')!==String(auth.currentUser.uid))throw new Error('Sessione amministrativa non verificata.');
 if(['localhost','127.0.0.1','::1'].includes(location.hostname))throw new Error('Operazione reale non consentita da localhost: usa il rilascio pubblicato dopo i controlli Firebase.');
 const openShifts=await getDocs(query(collection(db,'shifts'),where('status','==','open')));
 if(!openShifts.empty)throw new Error('Sono presenti turni aperti: chiuderli prima di iniziare il nuovo periodo.');
 const ref=doc(db,'settings','global');
 const activated=await runTransaction(db,async tx=>{
   const snap=await tx.get(ref);
   if(!snap.exists())throw new Error('Configurazione globale assente: operazione interrotta.');
   if(snap.data()?.managementPeriodStartAt)throw new Error('Nuovo periodo gia attivo: non e possibile riavviarlo.');
   const when=new Date().toISOString();
   tx.update(ref,{managementPeriodStartAt:when,managementPeriodActivatedBy:auth.currentUser.uid,managementPeriodActivatedAtClient:when});
   return when;
 });
 return activated;
}

export async function saveSettings(patch){if(!can('settings'))throw new Error('Solo amministratori centrali possono modificare impostazioni e punti vendita.');state.settings=normalizeSettingsLists({...state.settings,...patch});try{localStorage.setItem(GLOBAL_SETTINGS_KEY,JSON.stringify(compactGlobalCache(state.settings)))}catch{};await setDoc(doc(db,'settings','global'),{...patch,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()},{merge:true});emit('settings')}
export async function saveIdentitySettings(patch){state.settings={...state.settings,...patch};await setDoc(doc(db,'settings','identity'),{...patch,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString(),updatedBy:auth.currentUser?.uid||'',updatedByEmail:auth.currentUser?.email||''},{merge:true});try{localStorage.setItem('noor_v2_identity',JSON.stringify(compactIdentityCache(state.settings)))}catch{}emit('settings')}

function listenCollection(name,key,sorter=null,filter=null,sourceRef=null){
  const warm=state.loaded[key]&&Array.isArray(state[key])&&state[key].length>0;
  if(!warm)state.loaded[key]=false;state.errors[key]='';
  const unsub=onSnapshot(sourceRef||collection(db,name),snap=>{
    let arr=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(key==='products'){arr=arr.map(normalizeProductRecord);persistProductImages(arr)}
    if(filter)arr=arr.filter(filter); if(sorter)arr.sort(sorter);
    state[key]=arr;state.loaded[key]=true;state.errors[key]='';if(key==='products'||key==='orders'||key==='shifts')scheduleFastHomeCache();emit(key);
  },e=>{console.error(name,e);state.loaded[key]=true;state.errors[key]=e?.message||('Errore caricamento '+name);emit(key)});
  state.listeners.push(unsub);
}

export async function refreshProductsFromServer(){
  const snap=await getDocsFromServer(collection(db,'products'));
  let arr=snap.docs.map(d=>normalizeProductRecord({id:d.id,...d.data()})).filter(x=>x.test!==true);
  arr.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'it'));
  state.products=arr;state.loaded.products=true;state.errors.products='';
  persistProductImages(arr);pruneProductImageCache(arr.map(p=>p.id));scheduleFastHomeCache();emit('products');
  return arr;
}

// Fase 20: confine di lettura per sede. Gli archivi senza sede restano invisibili
// agli operatori di negozio; Owner/Admin centrali conservano la vista globale.
export const isCentralReportingRole=()=>['owner','superadmin','super-admin','admin'].includes(role());
export const reportingPointOfSaleId=()=>isCentralReportingRole()?'':String(state.profile?.pointOfSaleId||'').trim();
function financialSource(name, options={}){
 if(isCentralReportingRole())return options.central||collection(db,name);
 const id=reportingPointOfSaleId();
 // Fail closed: un operatore senza sede non deve ricevere collezioni globali.
 return query(collection(db,name),where('pointOfSaleId','==',id||'__NO_SEDE_ASSEGNATA__'),...(options.limit?[limit(options.limit)]:[]));
}
const secondaryActive=new Set();
export function startCoreListeners(){
  stopListeners();
  // Solo i dati indispensabili alla Home: niente collezioni amministrative all'avvio.
  listenCollection('products','products',(a,b)=>String(a.name||'').localeCompare(String(b.name||''),'it'),x=>x.test!==true);
  listenCollection('orders','orders',(a,b)=>String(b.createdAtClient||b.date||b.cancelledAtClient||'').localeCompare(String(a.createdAtClient||a.date||a.cancelledAtClient||'')),x=>x.test!==true,financialSource('orders',{central:query(collection(db,'orders'),orderBy('createdAtClient','desc'),limit(40)),limit:40}));
  listenCollection('shifts','shifts',(a,b)=>String(b.startAtClient||'').localeCompare(String(a.startAtClient||'')),null,financialSource('shifts'));
  state.listeners.push(onSnapshot(doc(db,'settings','identity'),snap=>{if(!snap.exists())return;const data=snap.data()||{};state.settings=normalizeSettingsLists({...state.settings,...data});try{localStorage.setItem('noor_v2_identity',JSON.stringify(compactIdentityCache(data)))}catch{}emit('settings')},e=>console.warn('identity',e)));
  state.listeners.push(onSnapshot(doc(db,'settings','global'),snap=>{if(!snap.exists())return;state.settings=normalizeSettingsLists({...state.settings,...snap.data()});try{localStorage.setItem(GLOBAL_SETTINGS_KEY,JSON.stringify(compactGlobalCache(state.settings)))}catch{}emit('settings')},e=>console.warn('global settings',e)));
}
export function ensureSecondaryListener(key){
  if(secondaryActive.has(key))return;secondaryActive.add(key);
  if(key==='discounts')listenCollection('discounts','discounts',(a,b)=>String(a.code||a.id).localeCompare(String(b.code||b.id),'it'));
  if(key==='closures')listenCollection('closures','closures',(a,b)=>String(b.date||b.createdAtClient||'').localeCompare(String(a.date||a.createdAtClient||'')),null,financialSource('closures'));
  if(key==='employees')listenCollection('users','employees',(a,b)=>String(a.name||a.email||'').localeCompare(String(b.name||b.email||''),'it'));
  if(key==='cancelledOrders')listenCollection('cancelledOrders','cancelledOrders',(a,b)=>String(b.cancelledAtClient||b.date||'').localeCompare(String(a.cancelledAtClient||a.date||'')),x=>x.restored!==true&&x.permanentlyDeleted!==true,financialSource('cancelledOrders'));
  if(key==='stockMovements')listenCollection('stockMovements','stockMovements',(a,b)=>String(b.createdAtClient||'').localeCompare(String(a.createdAtClient||'')));
  if(key==='accessLogs')listenCollection('accessLogs','accessLogs',(a,b)=>String(b.createdAtClient||b.date||b.timestamp||'').localeCompare(String(a.createdAtClient||a.date||a.timestamp||'')));
}
export function startSecondaryListeners(){['discounts','closures','employees','cancelledOrders','stockMovements','accessLogs'].forEach(ensureSecondaryListener)}
export function stopListeners(){state.listeners.forEach(x=>{try{x()}catch{}});state.listeners=[];secondaryActive.clear()}
export async function loadDiscounts(){/* realtime listener already active */ emit('discounts')}

async function deleteProductOriginal(id,warehouseId=effectiveWarehouseId()){
  if(!id)throw new Error('Prodotto non valido.');
  const ref=doc(db,'products',String(id)),now=new Date().toISOString();
  await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw new Error('Prodotto non trovato.');const data=snap.data()||{},map=inventoryWithLegacy(data),wid=String(warehouseId||effectiveWarehouseId()),current={...(map[wid]||{})};map[wid]={...current,deleted:true,deletedAtClient:now,deletedBy:auth.currentUser?.uid||''};const patch={inventoryByWarehouse:map,updatedAt:serverTimestamp(),updatedAtClient:now,updatedBy:auth.currentUser?.uid||''};const primary=warehouses()[0]?.id||'main';if(String(wid)===String(primary))Object.assign(patch,{qty:0,stock:0,quantity:0});tx.set(ref,patch,{merge:true})});
}
async function permanentlyDeleteProductOriginal(id){
  if(!id)throw new Error('Prodotto non valido.');
  await deleteDoc(doc(db,'products',String(id)));
  state.products=state.products.filter(p=>String(p.id)!==String(id));
  await removeProductImageCacheEntry(id);
  persistFastHomeCache();
  emit('products');
}
async function restoreProductOriginal(id,warehouseId=effectiveWarehouseId()){
  if(!id)throw new Error('Prodotto non valido.');
  const ref=doc(db,'products',String(id)),now=new Date().toISOString();
  await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw new Error('Prodotto non trovato.');const data=snap.data()||{},map=inventoryWithLegacy(data),wid=String(warehouseId||effectiveWarehouseId()),current={...(map[wid]||{})};map[wid]={...current,deleted:false,restoredAtClient:now,restoredBy:auth.currentUser?.uid||''};const patch={deleted:false,inventoryByWarehouse:map,restoredAt:serverTimestamp(),restoredAtClient:now,restoredBy:auth.currentUser?.uid||'',updatedAt:serverTimestamp(),updatedAtClient:now};const primary=warehouses()[0]?.id||'main';if(String(wid)===String(primary)){const qty=Number(map[wid]?.qty||0);Object.assign(patch,{qty,stock:qty,quantity:qty})}tx.set(ref,patch,{merge:true})});
}
async function upsertProductOriginal(p){
  const id=norm(p.id)||('P'+Date.now()),photo=productPhoto(p),photos=Array.from(new Set((Array.isArray(p.photos)?p.photos:(photo?[photo]:[])).filter(Boolean))),notes=listify(p.notes);
  const base=state.products.find(x=>String(x.id)===String(id))||{};const isNew=!base.id;let inventory=isNew?{}:inventoryWithLegacy(base);
  if(p.inventoryByWarehouse&&typeof p.inventoryByWarehouse==='object')inventory={...inventory,...p.inventoryByWarehouse};
  const targetIds=Array.isArray(p.targetWarehouseIds)?p.targetWarehouseIds.map(String):[];
  const sourceWid=String(p.sourceWarehouseId||p.warehouseId||effectiveWarehouseId());
  const warehouseValue={qty:Number(p.qty)||0,price:Number(p.price)||0,cost:Number(p.cost)||0,discountActive:!!p.discountActive,finalPrice:Number(p.finalPrice)||0};
  if(isNew&&targetIds.length){
    for(const w of warehouses())inventory[String(w.id)]={deleted:!targetIds.includes(String(w.id)),qty:0,price:0,cost:0,discountActive:false,finalPrice:0};
    for(const wid of targetIds)inventory[wid]={...(inventory[wid]||{}),deleted:false,...warehouseValue};
  }else if(!isNew&&p.replaceWarehouseAssignments&&targetIds.length){
    const selected=new Set(targetIds);
    const knownIds=Array.from(new Set([...warehouses().map(w=>String(w.id)),...Object.keys(inventory)]));
    const previouslyAssigned=new Set(knownIds.filter(wid=>inventory[wid]?.deleted!==true && (Object.prototype.hasOwnProperty.call(inventory,wid)||wid===String(warehouses()[0]?.id||'main'))));
    for(const wid of knownIds){
      const current={...(inventory[wid]||{})};
      if(selected.has(wid)){
        const newlyAssigned=!previouslyAssigned.has(wid);
        inventory[wid]={...current,deleted:false,...((wid===sourceWid||newlyAssigned)?warehouseValue:{})};
      }else if(previouslyAssigned.has(wid)||Object.prototype.hasOwnProperty.call(inventory,wid)){
        inventory[wid]={...current,deleted:true,deletedAtClient:new Date().toISOString(),deletedBy:auth.currentUser?.uid||''};
      }
    }
  }else if(targetIds.length){
    for(const wid of targetIds)inventory[wid]={...(inventory[wid]||{}),deleted:false,...warehouseValue};
  }else if(!p.inventoryByWarehouse){
    const wid=String(p.warehouseId||effectiveWarehouseId());inventory[wid]={...(inventory[wid]||{}),deleted:false,...warehouseValue};
  }
  const primary=warehouses()[0]?.id||'main',primaryData=inventory[primary]||{qty:0,price:Number(p.price)||0,cost:Number(p.cost)||0,discountActive:!!p.discountActive,finalPrice:Number(p.finalPrice)||0};
  const clean={...p};delete clean.targetWarehouseIds;delete clean.warehouseId;delete clean.sourceWarehouseId;delete clean.replaceWarehouseAssignments;
  await setDoc(doc(db,'products',id),{...clean,id,photo,coverPhoto:p.coverPhoto||photo,photos,notes,inventoryByWarehouse:inventory,price:Number(primaryData.price)||0,cost:Number(primaryData.cost)||0,qty:Number(primaryData.qty)||0,stock:Number(primaryData.qty)||0,quantity:Number(primaryData.qty)||0,discountActive:!!primaryData.discountActive,finalPrice:Number(primaryData.finalPrice)||0,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString(),updatedBy:auth.currentUser?.uid||''},{merge:true});return id
}
// Shopify initial inventory import: ONLY Noor ONLINE, never Shopify or other warehouses.
export async function importShopifyInitialStock(productId,warehouseId,expectedQty,shopifyVariantId,locationId){
 if(!can('settings')||!can('manageProducts')||!auth.currentUser)throw Error('Permessi insufficienti');
 const wh=warehouses().find(w=>String(w.id)===String(warehouseId));
 if(!wh||!/^online$/i.test(wh.name.trim()))throw Error('Magazzino ONLINE non valido');
 if(!Number.isSafeInteger(expectedQty)||expectedQty<0)throw Error('Quantità Shopify non valida');
 const ref=doc(db,'products',String(productId)),now=new Date().toISOString();
 await runTransaction(db,async tx=>{
  const snap=await tx.get(ref);if(!snap.exists())throw Error('Prodotto Noor non trovato');
  const data=snap.data();if(data.deleted===true)throw Error('Prodotto nel cestino');
  if(data.shopifyVariantId&&String(data.shopifyVariantId)!==String(shopifyVariantId))throw Error('Variante Shopify diversa');
  const map=inventoryWithLegacy(data);
  if(map[String(warehouseId)]?.deleted===true)throw Error('Prodotto eliminato da ONLINE');
  const before=Number(map[String(warehouseId)]?.qty||0);
  if(!Number.isFinite(before))throw Error('Quantità Noor non valida');
  map[String(warehouseId)]={...(map[String(warehouseId)]||{}),qty:expectedQty};
  const patch={inventoryByWarehouse:map,updatedAt:serverTimestamp(),updatedAtClient:now,updatedBy:auth.currentUser.uid};
  const primary=warehouses()[0]?.id||'main';
  if(String(warehouseId)===String(primary))Object.assign(patch,{qty:expectedQty,stock:expectedQty,quantity:expectedQty});
  tx.set(ref,patch,{merge:true});
  const movement=doc(collection(db,'stockMovements'));
  tx.set(movement,{productId:String(productId),productName:data.name||'',warehouseId:String(warehouseId),warehouseName:wh.name,operation:'reset',delta:expectedQty-before,qty:Math.abs(expectedQty-before),qtyBefore:before,qtyAfter:expectedQty,note:'Prima importazione giacenze Shopify → Noor ONLINE',source:'shopify_initial_import',shopifyVariantId:String(shopifyVariantId),shopifyLocationId:String(locationId),createdAt:serverTimestamp(),createdAtClient:now,uid:auth.currentUser.uid,email:auth.currentUser.email||''});
 });
}

async function updateStockOriginal(productId,delta,note='Manuale',warehouseId=effectiveWarehouseId()){
  const ref=doc(db,'products',String(productId));return await runTransaction(db,async tx=>{const s=await tx.get(ref);if(!s.exists())throw new Error('Prodotto non trovato');const data=s.data(),map=inventoryWithLegacy(data),cur=Number(map[warehouseId]?.qty||0),next=cur+Number(delta||0);if(next<0)throw new Error('Quantità insufficiente');map[warehouseId]={...(map[warehouseId]||{}),qty:next,price:Number(map[warehouseId]?.price??data.price??0),cost:Number(map[warehouseId]?.cost??data.cost??0),discountActive:map[warehouseId]?.discountActive??data.discountActive??false,finalPrice:Number(map[warehouseId]?.finalPrice??data.finalPrice??0)};const patch={inventoryByWarehouse:map,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()};const primary=warehouses()[0]?.id||'main';if(String(warehouseId)===String(primary))Object.assign(patch,{qty:next,stock:next,quantity:next});tx.set(ref,patch,{merge:true});const m=doc(collection(db,'stockMovements'));const wh=warehouseById(warehouseId);tx.set(m,{productId:String(productId),productName:data.name||'',warehouseId:String(warehouseId),warehouseName:wh?.name||warehouseId,operation:Number(delta)>=0?'load':'unload',delta:Number(delta),qty:Math.abs(Number(delta)),qtyBefore:cur,qtyAfter:next,note,createdAt:serverTimestamp(),createdAtClient:new Date().toISOString(),uid:auth.currentUser?.uid||'',email:auth.currentUser?.email||'',userName:state.profile?.name||auth.currentUser?.email||''});return {qtyBefore:cur,qtyAfter:next}})
}

async function bulkUpdateStockOriginal(productIds,warehouseId,operation='reset',qty=1,note='Gestione massiva'){
  const ids=Array.from(new Set((productIds||[]).map(String).filter(Boolean)));
  if(!ids.length)throw new Error('Seleziona almeno un prodotto.');
  if(!warehouseId)throw new Error('Seleziona il magazzino.');
  if(!['reset','load','unload'].includes(operation))throw new Error('Operazione non valida.');
  qty=Math.max(1,Number(qty)||1);
  const selected=ids.map(id=>state.products.find(p=>String(p.id)===id)).filter(Boolean);
  if(!selected.length)throw new Error('Nessun prodotto valido selezionato.');
  const wh=warehouseById(warehouseId),primary=warehouses()[0]?.id||'main',now=new Date().toISOString();
  for(let offset=0;offset<selected.length;offset+=180){
    const batch=writeBatch(db),chunk=selected.slice(offset,offset+180);
    for(const data of chunk){
      const map=inventoryWithLegacy(data),cur=Number(map[warehouseId]?.qty||0);
      let next=cur;
      if(operation==='reset')next=0;
      if(operation==='load')next=cur+qty;
      if(operation==='unload')next=Math.max(0,cur-qty);
      const delta=next-cur;
      map[warehouseId]={...(map[warehouseId]||{}),qty:next,price:Number(map[warehouseId]?.price??data.price??0),cost:Number(map[warehouseId]?.cost??data.cost??0),discountActive:map[warehouseId]?.discountActive??data.discountActive??false,finalPrice:Number(map[warehouseId]?.finalPrice??data.finalPrice??0)};
      const patch={inventoryByWarehouse:map,updatedAt:serverTimestamp(),updatedAtClient:now};
      if(String(warehouseId)===String(primary))Object.assign(patch,{qty:next,stock:next,quantity:next});
      batch.set(doc(db,'products',String(data.id)),patch,{merge:true});
      const movementRef=doc(collection(db,'stockMovements'));
      batch.set(movementRef,{productId:String(data.id),productName:data.name||'',warehouseId:String(warehouseId),warehouseName:wh?.name||warehouseId,operation:operation==='load'?'load':(operation==='reset'?'reset':'unload'),delta,qty:Math.abs(delta),qtyBefore:cur,qtyAfter:next,note,bulk:true,createdAt:serverTimestamp(),createdAtClient:now,uid:auth.currentUser?.uid||'',email:auth.currentUser?.email||'',userName:state.profile?.name||auth.currentUser?.email||''});
    }
    await batch.commit();
  }
}
async function transferStockOriginal(productId,fromWarehouseId,toWarehouseId,qty,note='Trasferimento magazzino'){
  qty=Math.max(1,Number(qty)||0);if(!fromWarehouseId||!toWarehouseId||fromWarehouseId===toWarehouseId)throw new Error('Seleziona due magazzini diversi.');const ref=doc(db,'products',String(productId));await runTransaction(db,async tx=>{const s=await tx.get(ref);if(!s.exists())throw new Error('Prodotto non trovato');const data=s.data(),map=inventoryWithLegacy(data);const from=Number(map[fromWarehouseId]?.qty||0),to=Number(map[toWarehouseId]?.qty||0);if(from<qty)throw new Error('Quantità insufficiente nel magazzino di origine.');map[fromWarehouseId]={...(map[fromWarehouseId]||{}),qty:from-qty};map[toWarehouseId]={...(map[toWarehouseId]||{}),qty:to+qty,price:Number(map[toWarehouseId]?.price??map[fromWarehouseId]?.price??data.price??0),cost:Number(map[toWarehouseId]?.cost??map[fromWarehouseId]?.cost??data.cost??0),discountActive:map[toWarehouseId]?.discountActive??map[fromWarehouseId]?.discountActive??data.discountActive??false,finalPrice:Number(map[toWarehouseId]?.finalPrice??map[fromWarehouseId]?.finalPrice??data.finalPrice??0)};const patch={inventoryByWarehouse:map,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()};const primary=warehouses()[0]?.id||'main';if(String(fromWarehouseId)===String(primary)||String(toWarehouseId)===String(primary)){const pd=map[primary]||{};Object.assign(patch,{qty:Number(pd.qty||0),stock:Number(pd.qty||0),quantity:Number(pd.qty||0)})}tx.set(ref,patch,{merge:true});const m=doc(collection(db,'stockMovements'));tx.set(m,{productId:String(productId),productName:data.name||'',operation:'transfer',qty,delta:0,fromWarehouseId,fromWarehouseName:warehouseById(fromWarehouseId)?.name||fromWarehouseId,toWarehouseId,toWarehouseName:warehouseById(toWarehouseId)?.name||toWarehouseId,note,createdAt:serverTimestamp(),createdAtClient:new Date().toISOString(),uid:auth.currentUser?.uid||'',email:auth.currentUser?.email||'',userName:state.profile?.name||auth.currentUser?.email||''})})
}

async function saveOrderOriginal(order){
  if(!can('manageProducts')) throw new Error('Vendita non disponibile per questo ruolo nella versione di sicurezza: autorizzazione backend ancora da completare.');
  const cleanOrder={...order,pointOfSaleId:String(order.pointOfSaleId||state.profile?.pointOfSaleId||''),pointOfSaleName:pointOfSaleById(order.pointOfSaleId||state.profile?.pointOfSaleId)?.name||'',warehouseId:order.warehouseId||effectiveWarehouseId(),warehouseName:order.warehouseName||warehouseById(order.warehouseId||effectiveWarehouseId())?.name||'',items:(order.items||[]).map(i=>({...i,warehouseId:i.warehouseId||order.warehouseId||effectiveWarehouseId(),warehouseName:i.warehouseName||warehouseById(i.warehouseId||order.warehouseId||effectiveWarehouseId())?.name||'',photo:safePhoto(i.photo)}))};
  const grouped={};cleanOrder.items.forEach(i=>{const wid=String(i.warehouseId||cleanOrder.warehouseId||effectiveWarehouseId()),key=String(i.productId)+'@@'+wid;if(!grouped[key])grouped[key]={productId:String(i.productId),warehouseId:wid,need:0};grouped[key].need+=Number(i.qty||0)});
  try{
    await runTransaction(db,async tx=>{
      const reads=[];
      for(const g of Object.values(grouped)){const ref=doc(db,'products',g.productId),snap=await tx.get(ref);if(!snap.exists())throw new Error('Prodotto non trovato online');reads.push({ref,snap,...g})}
      for(const r of reads){const data=r.snap.data(),map=inventoryWithLegacy(data),cur=Number(map[r.warehouseId]?.qty||0);if(cur<r.need)throw new Error('Stock insufficiente in '+(warehouseById(r.warehouseId)?.name||'magazzino')+': '+(data.name||'prodotto'));const next=cur-r.need;map[r.warehouseId]={...(map[r.warehouseId]||{}),qty:next};const patch={inventoryByWarehouse:map,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()};const primary=warehouses()[0]?.id||'main';if(String(r.warehouseId)===String(primary))Object.assign(patch,{qty:next,stock:next,quantity:next});tx.set(r.ref,patch,{merge:true})}
      tx.set(doc(db,'orders',cleanOrder.orderId),{...cleanOrder,createdAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
    });
  }catch(e){
    const code=String(e?.code||'').toLowerCase(),msg=String(e?.message||'').toLowerCase();
    // Non riprovare mai usando le quantità in cache: si rischiano overselling e decrementi concorrenti.
    if(code.includes('resource-exhausted')||msg.includes('quota exceeded')){
      throw new Error('Firestore ha raggiunto un limite temporaneo. Vendita NON registrata: ricontrolla lo storico prima di riprovare.');
    }
    throw e;
  }
}

async function cancelOrderOriginal(order,reason='Annullamento completo'){
  if(String(order.status||'').toLowerCase().includes('cancel'))return;
  await runTransaction(db,async tx=>{
    const grouped={};for(const item of order.items||[]){const wid=String(item.warehouseId||order.warehouseId||effectiveWarehouseId()),key=String(item.productId)+'@@'+wid;if(!grouped[key])grouped[key]={productId:String(item.productId),warehouseId:wid,qty:0};grouped[key].qty+=Number(item.qty||0)}
    const reads=[];for(const g of Object.values(grouped)){const ref=doc(db,'products',g.productId),snap=await tx.get(ref);reads.push({ref,snap,...g})}
    for(const r of reads){if(!r.snap.exists())continue;const data=r.snap.data(),map=inventoryWithLegacy(data),cur=Number(map[r.warehouseId]?.qty||0),next=cur+r.qty;map[r.warehouseId]={...(map[r.warehouseId]||{}),qty:next};const patch={inventoryByWarehouse:map,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()};const primary=warehouses()[0]?.id||'main';if(String(r.warehouseId)===String(primary))Object.assign(patch,{qty:next,stock:next,quantity:next});tx.set(r.ref,patch,{merge:true})}
    const now=new Date().toISOString(),rec={...order,status:'cancelled',cancelled:true,cancelledAt:serverTimestamp(),cancelledAtClient:now,cancelledByUid:auth.currentUser?.uid||'',cancelledByName:state.profile?.name||'',cancelReason:reason};
    tx.set(doc(db,'orders',String(order.orderId||order.id)),{status:'cancelled',cancelled:true,cancelledAt:serverTimestamp(),cancelledAtClient:now,cancelledByUid:auth.currentUser?.uid||'',cancelReason:reason,updatedAt:serverTimestamp()},{merge:true});
    tx.set(doc(db,'cancelledOrders',String(order.orderId||order.id)),rec,{merge:true});
  })
}

async function partialCancelOrderOriginal(order,selections,reason='Annullamento parziale'){
  const selected=Object.entries(selections||{}).map(([idx,qty])=>({idx:Number(idx),qty:Number(qty)||0})).filter(x=>x.qty>0);if(!selected.length)throw new Error('Seleziona almeno una quantità da annullare.');const orderId=String(order.orderId||order.id),now=new Date().toISOString();
  await runTransaction(db,async tx=>{
    const newItems=(order.items||[]).map(x=>({...x})),cancelledItems=[],restore={};
    for(const s1 of selected){const item=newItems[s1.idx];if(!item)continue;const oldQty=Number(item.qty||0);if(s1.qty>oldQty)throw new Error('Quantità da annullare superiore a quella venduta.');const unitNet=oldQty?Number(item.netTotal??item.total??0)/oldQty:Number(item.unitPrice||item.price||0),unitGross=oldQty?Number(item.grossTotal??item.total??0)/oldQty:Number(item.originalPrice||item.unitPrice||item.price||0);cancelledItems.push({...item,qty:s1.qty,netTotal:Number((unitNet*s1.qty).toFixed(2)),total:Number((unitGross*s1.qty).toFixed(2))});const wid=String(item.warehouseId||order.warehouseId||effectiveWarehouseId()),key=String(item.productId)+'@@'+wid;if(!restore[key])restore[key]={productId:String(item.productId),warehouseId:wid,qty:0};restore[key].qty+=s1.qty;item.qty=oldQty-s1.qty;item.netTotal=Number((unitNet*item.qty).toFixed(2));item.total=Number((unitGross*item.qty).toFixed(2));item.grossTotal=item.total}
    const reads=[];for(const g of Object.values(restore)){const ref=doc(db,'products',g.productId),snap=await tx.get(ref);reads.push({ref,snap,...g})}
    for(const r of reads){if(!r.snap.exists())continue;const data=r.snap.data(),map=inventoryWithLegacy(data),cur=Number(map[r.warehouseId]?.qty||0),next=cur+r.qty;map[r.warehouseId]={...(map[r.warehouseId]||{}),qty:next};const patch={inventoryByWarehouse:map,updatedAt:serverTimestamp(),updatedAtClient:now};const primary=warehouses()[0]?.id||'main';if(String(r.warehouseId)===String(primary))Object.assign(patch,{qty:next,stock:next,quantity:next});tx.set(r.ref,patch,{merge:true})}
    const kept=newItems.filter(i=>Number(i.qty||0)>0),newTotal=Number(kept.reduce((a,i)=>a+Number(i.netTotal??i.total??0),0).toFixed(2));if(!kept.length)tx.set(doc(db,'orders',orderId),{status:'cancelled',cancelled:true,items:newItems,total:0,cancelledAt:serverTimestamp(),cancelledAtClient:now,cancelReason:reason,updatedAt:serverTimestamp()},{merge:true});else tx.set(doc(db,'orders',orderId),{items:kept,total:newTotal,partialCancelled:true,lastPartialCancelledAt:serverTimestamp(),lastPartialCancelledAtClient:now,updatedAt:serverTimestamp()},{merge:true});
    const recId=orderId+'-PART-'+Date.now();tx.set(doc(db,'cancelledOrders',recId),{id:recId,orderId,orderNumber:order.orderNumber||orderId,partial:true,cancelledItems,cancelledValue:Number(cancelledItems.reduce((a,i)=>a+Number(i.netTotal||0),0).toFixed(2)),cancelReason:reason,cancelledAt:serverTimestamp(),cancelledAtClient:now,cancelledByUid:auth.currentUser?.uid||'',cancelledByName:state.profile?.name||''})
  })
}

async function restoreCancelledOrderOriginal(rec){
  const orderId=String(rec.orderId||rec.id).replace(/-PART-\d+$/,'');if(rec.partial)throw new Error('Gli annullamenti parziali sono registri storici e non si ripristinano automaticamente.');
  await runTransaction(db,async tx=>{const oref=doc(db,'orders',orderId),os=await tx.get(oref),order=os.exists()?{id:os.id,...os.data()}:rec,grouped={};for(const item of order.items||rec.items||[]){const wid=String(item.warehouseId||order.warehouseId||effectiveWarehouseId()),key=String(item.productId)+'@@'+wid;if(!grouped[key])grouped[key]={productId:String(item.productId),warehouseId:wid,qty:0};grouped[key].qty+=Number(item.qty||0)}const reads=[];for(const g of Object.values(grouped)){const ref=doc(db,'products',g.productId),snap=await tx.get(ref);reads.push({ref,snap,...g})}for(const r of reads){if(!r.snap.exists())continue;const data=r.snap.data(),map=inventoryWithLegacy(data),cur=Number(map[r.warehouseId]?.qty||0);if(cur<r.qty)throw new Error('Stock insufficiente per ripristinare '+(data.name||'prodotto'));const next=cur-r.qty;map[r.warehouseId]={...(map[r.warehouseId]||{}),qty:next};const patch={inventoryByWarehouse:map,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()};const primary=warehouses()[0]?.id||'main';if(String(r.warehouseId)===String(primary))Object.assign(patch,{qty:next,stock:next,quantity:next});tx.set(r.ref,patch,{merge:true})}tx.set(oref,{...order,status:'completed',cancelled:false,cancelledAt:null,cancelledAtClient:'',restoredFromCancelled:true,restoredAt:serverTimestamp(),restoredAtClient:new Date().toISOString(),updatedAt:serverTimestamp()},{merge:true});tx.delete(doc(db,'cancelledOrders',String(rec.id)))})
}

export async function deleteCancelledRecord(id){await deleteDoc(doc(db,'cancelledOrders',String(id)))}

export async function saveDiscount(data){const code=norm(data.code).toUpperCase();if(!code)throw new Error('Inserisci il codice.');await setDoc(doc(db,'discounts',code),{...data,id:code,code,value:Number(data.value)||0,active:data.active!==false,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()},{merge:true})}
export async function deleteDiscount(id){await deleteDoc(doc(db,'discounts',String(id)))}
export async function updateEmployeeProfile(id,patch){if(!id)throw new Error('Dipendente non valido.');const self=String(id)===String(auth.currentUser?.uid||'');const ownFields=['name','firstName','lastName','photo','avatar','phone'];if(self&&!can('manageEmployees')){const forbidden=Object.keys(patch||{}).filter(k=>!ownFields.includes(k));if(forbidden.length)throw new Error('Dal profilo puoi modificare solo i dati personali. Per modificare email o permessi rivolgiti all’Owner.');}const write={...patch,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()};if(!self||can('manageEmployees'))write.updatedBy=auth.currentUser?.uid||'';await setDoc(doc(db,'users',String(id)),write,{merge:true});if(self){state.profile={...(state.profile||{}),...patch};try{localStorage.setItem(PROFILE_CACHE_KEY,JSON.stringify(state.profile))}catch{}emit('profile')}}
export async function deleteEmployeeProfile(id){if(!id)throw new Error('Dipendente non valido.');if(String(id)===String(auth.currentUser?.uid||''))throw new Error('Non puoi eliminare il tuo stesso profilo.');await deleteDoc(doc(db,'users',String(id)))}

export async function loadOrderHistory(max=300){try{const snap=await getDocs(financialSource('orders',{central:query(collection(db,'orders'),orderBy('createdAtClient','desc'),limit(max)),limit:max}));const arr=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.test!==true);arr.sort((a,b)=>String(b.createdAtClient||b.date||'').localeCompare(String(a.createdAtClient||a.date||'')));state.orders=arr;state.loaded.orders=true;state.orderHistoryLoaded=true;state.errors.orders='';emit('orders');return arr}catch(e){console.error('order history',e);state.errors.orders=e?.message||'Errore caricamento ordini';emit('orders');throw e}}

export async function getLazyCollection(name,max=200){const financial=['orders','shifts','closures','cancelledOrders'].includes(String(name));const source=financial?financialSource(name,{central:query(collection(db,name),limit(max)),limit:max}):query(collection(db,name),limit(max));const s=await getDocs(source);return s.docs.map(d=>({id:d.id,...d.data()}))}
export async function getUserShifts(){const uid=auth.currentUser?.uid;if(!uid)return[];return state.shifts.filter(x=>x.sellerUid===uid||x.employeeUid===uid||x.uid===uid||can('manageEmployees')||can('settings'))}
export async function startShift(){const p=state.profile||{};return addDoc(collection(db,'shifts'),{status:'open',deleted:false,sellerUid:p.uid,employeeUid:p.uid,pointOfSaleId:String(p.pointOfSaleId||''),sellerEmail:p.email||'',sellerName:p.name||p.email||'',employeeName:p.name||p.email||'',startAt:serverTimestamp(),startAtClient:new Date().toISOString()})}
export async function closeShift(shift){return setDoc(doc(db,'shifts',shift.id),{status:'closed',endAt:serverTimestamp(),endAtClient:new Date().toISOString()},{merge:true})}
export async function updateShift(id,patch){return setDoc(doc(db,'shifts',id),{...patch,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()},{merge:true})}
export async function deleteShift(id){return setDoc(doc(db,'shifts',id),{deleted:true,deletedAt:serverTimestamp(),deletedAtClient:new Date().toISOString()},{merge:true})}
export async function restoreShift(id){return setDoc(doc(db,'shifts',id),{deleted:false,restoredAt:serverTimestamp(),restoredAtClient:new Date().toISOString()},{merge:true})}

// Eliminazione fisica riservata a turni già archiviati e privi di riferimenti economici.
// Non effettua mai annullamenti, resi o movimenti di inventario.
export async function permanentlyDeleteArchivedShift(id){
  const uid=auth.currentUser?.uid;
  const role=String(state.profile?.role||'').toLowerCase();
  if(!uid||!['owner','superadmin','super-admin','super_admin'].includes(role))throw new Error('Solo Owner / Super Admin può eliminare definitivamente un turno.');
  if(!id)throw new Error('Turno non valido.');
  // Carica da server anche i documenti non visibili nella schermata, senza paginazione.
  const shiftRef=doc(db,'shifts',String(id));
  const shiftSnap=await getDoc(shiftRef);
  if(!shiftSnap.exists())throw new Error('Il turno non esiste più.');
  const shift=shiftSnap.data();
  if(shift.deleted!==true)throw new Error('Prima sposta il turno tra quelli eliminati.');
  if(shift.status==='open'&&!shift.endAtClient&&!shift.endAt)throw new Error('Il turno è aperto. Chiudilo prima di archiviarlo.');
  const start=toDate(shift.startAtClient||shift.startAt),end=toDate(shift.endAtClient||shift.endAt);
  if(!start||!end||end<start)throw new Error('Il turno non ha un inizio e una fine validi: cancellazione bloccata.');
  const seller=String(shift.sellerUid||shift.employeeUid||'');
  if(!seller)throw new Error('Il turno non ha un operatore identificabile: cancellazione bloccata.');
  const [ordersSnap,closuresSnap]=await Promise.all([getDocs(collection(db,'orders')),getDocs(collection(db,'closures'))]);
  const linkedOrder=ordersSnap.docs.some(d=>{
    const o=d.data();
    if(String(o.shiftId||o.turnId||'')===String(id))return true;
    const who=String(o.sellerUid||o.employeeUid||o.createdByUid||'');
    const when=toDate(o.date||o.createdAtClient||o.createdAt);
    return who===seller&&when&&when>=start&&when<=end;
  });
  if(linkedOrder)throw new Error('Eliminazione bloccata: esistono vendite collegate a questo turno.');
  const startDay=start.toISOString().slice(0,10),endDay=end.toISOString().slice(0,10);
  const linkedClosure=closuresSnap.docs.some(d=>{
    const c=d.data();
    if(String(c.shiftId||c.turnId||'')===String(id))return true;
    // Senza legame esplicito, blocco prudenziale per una chiusura nella stessa giornata
    // quando l'operatore risulta indicato.
    const who=String(c.sellerUid||c.employeeUid||c.createdByUid||'');
    const day=String(c.date||c.createdAtClient||'').slice(0,10);
    return who===seller&&day>=startDay&&day<=endDay;
  });
  if(linkedClosure)throw new Error('Eliminazione bloccata: esistono chiusure collegate a questo turno.');
  // Ricontrollo del turno subito prima della cancellazione: il documento potrebbe essere stato ripristinato.
  await runTransaction(db,async tx=>{
    const snap=await tx.get(shiftRef);
    if(!snap.exists()||snap.data().deleted!==true)throw new Error('Il turno è stato modificato: ripeti la verifica.');
    tx.delete(shiftRef);
  });
  return true;
}

export async function saveClosure(rec){const id=rec.id||('CLS-'+Date.now());return setDoc(doc(db,'closures',id),{...rec,id,deleted:false,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString(),createdAtClient:rec.createdAtClient||new Date().toISOString()},{merge:true})}
export async function deleteClosure(id){return setDoc(doc(db,'closures',id),{deleted:true,deletedAt:serverTimestamp(),deletedAtClient:new Date().toISOString()},{merge:true})}
export async function restoreClosure(id){return setDoc(doc(db,'closures',id),{deleted:false,restoredAt:serverTimestamp(),restoredAtClient:new Date().toISOString()},{merge:true})}

export async function integrateOrderIntoClosure(closureId,orderId){const c=state.closures.find(x=>String(x.id)===String(closureId));const o=state.orders.find(x=>String(x.id||x.orderId)===String(orderId));if(!c||!o)throw new Error('Chiusura o ordine non trovato.');const ids=Array.from(new Set([...(c.orderIds||[]).map(String),String(o.id||o.orderId)]));const all=state.orders.filter(x=>ids.includes(String(x.id||x.orderId)));const total=Number(all.reduce((a,x)=>a+Number(x.total||0),0).toFixed(2));const payments={};for(const x of all){const k=x.payment||x.paymentMethod||'Altro';payments[k]=(payments[k]||0)+Number(x.total||0)};await Promise.all([setDoc(doc(db,'orders',String(o.id||o.orderId)),{closureId:String(closureId),closureDate:c.date||'',integratedAt:serverTimestamp(),integratedAtClient:new Date().toISOString()},{merge:true}),setDoc(doc(db,'closures',String(closureId)),{orderIds:ids,orders:ids.length,total,payments,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()},{merge:true})])}

export async function removeOrderFromClosure(closureId,orderId){
  const c=state.closures.find(x=>String(x.id)===String(closureId));
  const o=state.orders.find(x=>String(x.id||x.orderId)===String(orderId));
  if(!c||!o)throw new Error('Chiusura o ordine non trovato.');
  const ids=(c.orderIds||[]).map(String).filter(x=>x!==String(o.id||o.orderId));
  const all=state.orders.filter(x=>ids.includes(String(x.id||x.orderId)));
  const total=Number(all.reduce((a,x)=>a+Number(x.total||0),0).toFixed(2));
  const payments={};for(const x of all){const k=x.payment||x.paymentMethod||'Altro';payments[k]=(payments[k]||0)+Number(x.total||0)}
  await Promise.all([
    setDoc(doc(db,'orders',String(o.id||o.orderId)),{closureId:'',closureDate:'',removedFromClosureAt:serverTimestamp(),removedFromClosureAtClient:new Date().toISOString()},{merge:true}),
    setDoc(doc(db,'closures',String(closureId)),{orderIds:ids,orders:ids.length,total,payments,updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()},{merge:true})
  ])
}
export async function logAccess(event='login'){try{const p=state.profile||{};await addDoc(collection(db,'accessLogs'),{event,action:event,outcome:event==='login'?'Accesso riuscito':event,name:p.name||p.email||'',email:p.email||auth.currentUser?.email||'',role:p.role||'',uid:p.uid||auth.currentUser?.uid||'',device:navigator.userAgent||'',createdAt:serverTimestamp(),createdAtClient:new Date().toISOString()})}catch(e){console.warn('access log',e)}}

// V2.5.77: after committed ONLINE stock changes, send an authenticated wake hint.
// The hint carries NO quantities, is best effort, and never changes checkout outcomes.
// All stock changes remain committed by the original code. The periodic worker recovers missed hints.
function onlineWarehouseForWake(){return warehouses().find(w=>w.active&&String(w.name||'').trim().toLowerCase()==='online')?.id||null}
function wakeTouchesOnline(ids){const online=onlineWarehouseForWake();return online&&ids.some(id=>String(id||'')===String(online))}
function wakeOrderWarehouses(order){return (order?.items||[]).map(i=>i.warehouseId||order.warehouseId||effectiveWarehouseId())}
function sendOnlineSyncWake(){
 if(!auth.currentUser||typeof navigator!=='undefined'&&navigator.onLine===false)return;
 void (async()=>{try{
  const token=await auth.currentUser.getIdToken();
  await fetch('/api/shopify/auto-sync-wake',{method:'POST',headers:{Authorization:`Bearer ${token}`}});
 }catch{/* Scheduled synchronization remains the fallback. */}})();
}
async function afterOnlineCommitted(operation,affected){
 const result=await operation();
 if(wakeTouchesOnline(affected))sendOnlineSyncWake();
 return result;
}
export async function upsertProduct(p){
 const ids=[p?.warehouseId||p?.sourceWarehouseId||effectiveWarehouseId(),...(p?.targetWarehouseIds||[]),...Object.keys(p?.inventoryByWarehouse||{})];
 return afterOnlineCommitted(()=>upsertProductOriginal(p),ids);
}
export async function updateStock(productId,delta,note='Manuale',warehouseId=effectiveWarehouseId()){
 return afterOnlineCommitted(()=>updateStockOriginal(productId,delta,note,warehouseId),[warehouseId]);
}
export async function bulkUpdateStock(productIds,warehouseId,operation='reset',qty=1,note='Gestione massiva'){
 return afterOnlineCommitted(()=>bulkUpdateStockOriginal(productIds,warehouseId,operation,qty,note),[warehouseId]);
}
export async function transferStock(productId,fromWarehouseId,toWarehouseId,qty,note='Trasferimento magazzino'){
 return afterOnlineCommitted(()=>transferStockOriginal(productId,fromWarehouseId,toWarehouseId,qty,note),[fromWarehouseId,toWarehouseId]);
}
const STAGING_SALE_ENDPOINT='https://noor-gestionale-collaudo.netlify.app/.netlify/functions/noor-sale';
export async function saveOrder(order){
  if(!['localhost','127.0.0.1'].includes(location.hostname))throw new Error('Vendite STAGING consentite soltanto da localhost.');
  if(!auth.currentUser)throw new Error('Accesso richiesto per registrare la vendita.');
  if(!state.profile?.pointOfSaleId)throw new Error('Selezionare la sede autorizzata prima di vendere.');
  const token=await auth.currentUser.getIdToken();
  const request={saleId:String(order.id),pointOfSaleId:String(order.pointOfSaleId||state.profile.pointOfSaleId),items:(order.items||[]).map(i=>({productId:String(i.productId),warehouseId:String(i.warehouseId),qty:Number(i.qty)})),payment:String(order.payment||order.paymentMethod||'')};
  let response;
  try{response=await fetch(STAGING_SALE_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(request),cache:'no-store'});}
  catch(e){throw new Error('Risposta vendita sconosciuta. Controlla lo Storico prima di riprovare: '+(e.message||'rete non disponibile'));}
  let data={};try{data=await response.json()}catch{}
  if(!response.ok||data.ok!==true)throw new Error(data.error||('Backend vendita non disponibile (HTTP '+response.status+').'));
  if(!data.order||!data.saleId)throw new Error('Risposta backend incompleta: controlla lo Storico prima di riprovare.');
  return data.order;
}
export async function cancelOrder(order,reason='Annullamento completo'){
 if(String(state.profile?.role||'').toLowerCase()==='manager')throw new Error('Annullamenti e ripristini bloccati per i responsabili nello STAGING: attendere il percorso backend protetto.');
 if(isLegacyRecord(order,state.settings))throw new Error('Vendita del periodo precedente: annullamento operativo e reintegro scorte bloccati.');
 return afterOnlineCommitted(()=>cancelOrderOriginal(order,reason),wakeOrderWarehouses(order));
}
export async function partialCancelOrder(order,selections,reason='Annullamento parziale'){
 if(String(state.profile?.role||'').toLowerCase()==='manager')throw new Error('Annullamenti e ripristini bloccati per i responsabili nello STAGING: attendere il percorso backend protetto.');
 if(isLegacyRecord(order,state.settings))throw new Error('Vendita del periodo precedente: annullamento parziale e reintegro scorte bloccati.');
 return afterOnlineCommitted(()=>partialCancelOrderOriginal(order,selections,reason),wakeOrderWarehouses(order));
}
export async function restoreCancelledOrder(rec){
 if(String(state.profile?.role||'').toLowerCase()==='manager')throw new Error('Annullamenti e ripristini bloccati per i responsabili nello STAGING: attendere il percorso backend protetto.');
 if(isLegacyRecord(rec,state.settings))throw new Error('Operazione del vecchio periodo: ripristino magazzino bloccato.');
 return afterOnlineCommitted(()=>restoreCancelledOrderOriginal(rec),wakeOrderWarehouses(rec));
}

// Product removal / restore affects sale availability, not just quantities.
function productOnlineAssigned(productId){
 const online=onlineWarehouseForWake();
 if(!online)return false;
 const p=state.products.find(x=>String(x.id)===String(productId));
 return !!p && p.inventoryByWarehouse?.[online]?.deleted!==true &&
   (Object.hasOwn(p.inventoryByWarehouse||{},online)||String(warehouses()[0]?.id)===String(online));
}
export async function deleteProduct(id,warehouseId=effectiveWarehouseId()){
 return afterOnlineCommitted(()=>deleteProductOriginal(id,warehouseId),[warehouseId]);
}
export async function restoreProduct(id,warehouseId=effectiveWarehouseId()){
 return afterOnlineCommitted(()=>restoreProductOriginal(id,warehouseId),[warehouseId]);
}
export async function permanentlyDeleteProduct(id){
 const touches=productOnlineAssigned(id);
 return afterOnlineCommitted(()=>permanentlyDeleteProductOriginal(id),touches?[onlineWarehouseForWake()]:[]);
}
