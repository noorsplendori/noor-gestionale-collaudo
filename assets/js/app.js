import {renderWarehousesPage} from './warehouses.js';
import {initShopifyPreview} from './shopify-preview.js';
import {auth,signInWithEmailAndPassword,signOut,onAuthStateChanged} from './firebase.js';
import {state,subscribe,loadProfile,loadSettings,startCoreListeners,ensureSecondaryListener,stopListeners,can,loadDiscounts,logAccess,hydrateFastHomeCache,hydrateProductImageCache,hydrateCachedProfile,hydrateFirestoreCache,loadOrderHistory,warehouses,allowedWarehouses,effectiveWarehouseId,setCurrentWarehouse,warehouseById,refreshProductsFromServer} from './store.js';
import {$,$$,toast,openModal,closeModal,confirmDialog} from './ui.js';
import {initRouter,setRouteHook,go} from './router.js';
import {renderProducts,renderDeletedProducts,renderSellProducts,openProduct,renderProductDetail} from './products.js';
import {addToCart,addByBarcode,renderCart,clearCart,applyDiscountCode,checkout,renderOrders,renderCancelledOrders,renderDiscountChoices} from './sales.js';
import {renderHome,renderLowStockPage,renderStock,renderDiscounts,addDiscount,loadEmployees,addEmployee,renderShifts,renderHomeShift,renderClosures,renderClosureDetail,createTodayClosure,renderAccess,renderSettings,renderPointsOfSale,submitSettings,bindSettingsBranding,bindHomeQuickActions,renderEmployeesRealtime,openStockMove,openStockTransfer,openBulkStockManager,renderBulkStockManager,renderStockMove,renderProfile,renderEmployeeOverview,renderRoleManagement} from './sections.js?v=2.5.85-f19';
import {renderFinance,renderReturns} from './finance-ui.js';
import {bindPrinterSettings,renderPrinterSettings} from './printer.js';


let deferredInstallPrompt=null;
function setupPwa(){
  // STAGING: service worker disabilitato per evitare cache della produzione o di fasi precedenti.
  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.getRegistrations().then(regs=>Promise.all(regs.map(r=>r.unregister()))).catch(()=>{}))}
  const btn=$('#installAppBtn');
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;if(btn)btn.classList.remove('hidden')});
  window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;if(btn)btn.classList.add('hidden');toast('App installata.')});
  if(btn)btn.onclick=async()=>{if(!deferredInstallPrompt){toast('Su iPhone/iPad usa Condividi → Aggiungi a Home.');return}deferredInstallPrompt.prompt();try{await deferredInstallPrompt.userChoice}catch{}deferredInstallPrompt=null;btn.classList.add('hidden')};
}
setupPwa();

const boot=$('#boot'),login=$('#login'),app=$('#app'),loginForm=$('#loginForm'),loginStatus=$('#loginStatus');
hydrateFastHomeCache();
hydrateProductImageCache().then(()=>{try{renderHome()}catch{}}).catch(()=>{});
function applyIdentity(){const st=state.settings||{};const appName=st.appName||'Noor Splendori';const sub=st.appSubtitle||'Gestionale';const fallbackLogo='/assets/icons/logo-noor-horizontal.png';const logo=st.appLogo||fallbackLogo;const loginLogo='/assets/icons/logo-noor-horizontal.png';const favicon=st.appFavicon||'/assets/icons/favicon-64.png';const buildLabel=st.buildLabel||'Build test';const buildVersion=st.buildVersion||'V2.5.5';const buildAuthor=st.buildAuthor||'Sony';const setLogo=(el,src)=>{if(!el)return;if(src){el.classList.add('has-image');el.innerHTML=`<img src="${src.replace(/"/g,'&quot;')}" alt="Logo">`}else{el.classList.remove('has-image');el.textContent='N'}};const setFavicon=src=>{let link=document.querySelector('link[rel="icon"]');if(!link){link=document.createElement('link');link.rel='icon';document.head.appendChild(link)}link.href=src||''};setLogo($('#topbarLogo'),logo);setLogo($('#versionLogo'),logo);setLogo($('#loginLogo'),loginLogo);setFavicon(favicon);if($('#versionBoxVersion'))$('#versionBoxVersion').textContent='Versione '+buildVersion;if($('#versionBoxBuild'))$('#versionBoxBuild').textContent=buildLabel+' '+buildVersion;if($('#versionBoxAuthor'))$('#versionBoxAuthor').textContent='Author: '+buildAuthor;document.title=appName+(sub?(' - '+sub):' - Gestionale')}
try{const c=localStorage.getItem('noor_v2_identity');if(c){state.settings={...state.settings,...JSON.parse(c)};applyIdentity()}const consent=localStorage.getItem('noor_access_consent');if(consent==='1'&&$('#loginAccessConsent'))$('#loginAccessConsent').checked=true}catch{}
function setVisibility(el,visible){if(!el)return;el.hidden=!visible;el.classList.toggle('hidden',!visible);if(visible){el.style.removeProperty('display')}else{el.style.setProperty('display','none','important')}}
function showLogin(msg=''){setVisibility(boot,false);setVisibility(app,false);setVisibility(login,true);loginStatus.textContent=msg;const b=$('#loginSubmitBtn');if(b){b.disabled=false;b.textContent='Accedi';b.removeAttribute('aria-busy')}}
let appUiInitialized=false;function showApp(){setVisibility(boot,false);setVisibility(login,false);setVisibility(app,true);try{applyProfile()}catch(e){console.warn('profile ui',e)}try{applyIdentity()}catch(e){console.warn('identity ui',e)}if(!appUiInitialized){try{initRouter()}catch(e){console.warn('router init',e)}try{bindHomeQuickActions()}catch(e){console.warn('home actions',e)}appUiInitialized=true}try{renderCart()}catch(e){console.warn('cart render',e)}try{renderHome()}catch(e){console.warn('home render',e)}try{renderHomeShift()}catch(e){console.warn('shift render',e)}loadSettings().catch(()=>{})}
function applyProfile(){const p=state.profile||{};renderWarehousePicker();$('#sideUserName').textContent=p.name||p.email||'Utente';$('#sideUserRole').textContent=({superadmin:'Super Admin','super-admin':'Super Admin',admin:'Admin',owner:'Owner',manager:'Manager',seller:'Venditore',supervisor:'Supervisore'})[String(p.role||'seller').toLowerCase()]||p.role||'Venditore';$$('[data-perm]').forEach(el=>el.classList.toggle('hidden',!can(el.dataset.perm)))}
function renderWarehousePicker(){const el=$('#warehousePicker');if(!el)return;const list=allowedWarehouses();const current=effectiveWarehouseId();el.innerHTML=list.map(w=>`<option value="${w.id}" ${String(w.id)===String(current)?'selected':''}>${w.name}</option>`).join('');el.disabled=list.length<=1;const label=el.closest('.top-warehouse-picker');if(label)label.classList.toggle('hidden',!list.length)}
let loginPending=false;
let appOpenedForUid='';let profileLoadPromise=null;
function prepareAuthenticatedUser(user){hydrateFastHomeCache();const cached=hydrateCachedProfile(user);if(!cached)state.profile={uid:user.uid,email:user.email||'',name:(user.email||'Utente').split('@')[0],role:'seller',active:true,_provisional:true};return cached}
function openAuthenticatedApp(user){
  const uid=String(user?.uid||'');
  if(!uid)return false;
  // Non avviare listener economici con il profilo provvisorio (seller senza sede).
  // Al login successivo riattiviamo i listener solo dopo il profilo letto da Firestore.
  if(appOpenedForUid!==uid){
    appOpenedForUid=uid;
    stopListeners();
    state.orders=[];state.shifts=[];state.closures=[];state.cancelledOrders=[];
    state.orderHistoryLoaded=false;
    state.loaded.orders=false;state.loaded.shifts=false;
    state.errors.orders='';state.errors.shifts='';
  }
  showApp();
  return true;
}
function refreshProfile(user){
  if(profileLoadPromise)return profileLoadPromise;
  profileLoadPromise=loadProfile(user).then(()=>{
    if(String(auth.currentUser?.uid||'')!==String(user.uid))return;
    applyProfile();
    // Ora pointOfSaleId e ruolo sono quelli verificati su Firebase.
    // Le query sono create ex novo sul perimetro effettivo della sede.
    startCoreListeners();
    setTimeout(()=>logAccess('login').catch(()=>{}),1500);
  }).catch(e=>{
    console.error('Impossibile verificare il profilo per avviare gli archivi economici:',e);
    state.errors.orders='Profilo non verificato: impossibile caricare gli ordini.';
    state.loaded.orders=true;
    try{renderHome()}catch{}
  }).finally(()=>{profileLoadPromise=null});
  return profileLoadPromise;
}
function enterAuthenticated(user){if(!user)return false;prepareAuthenticatedUser(user);const opened=openAuthenticatedApp(user);if(opened)refreshProfile(user);return opened}
loginForm.addEventListener('submit',async e=>{
  e.preventDefault();if(loginPending)return;
  const consent=$('#loginAccessConsent'),submit=$('#loginSubmitBtn');
  if(consent&&!consent.checked){loginStatus.textContent="Per accedere devi confermare l'accesso registrato.";return}
  try{localStorage.setItem('noor_access_consent',consent?.checked?'1':'0')}catch{}
  loginPending=true;if(submit){submit.disabled=true;submit.innerHTML='<span>Accesso in corso…</span><i class="login-btn-spinner" aria-hidden="true"></i>';submit.setAttribute('aria-busy','true')}loginStatus.textContent='';
  try{
    const email=$('#loginEmail').value.trim(),password=$('#loginPassword').value;
    const cred=await Promise.race([
      signInWithEmailAndPassword(auth,email,password),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('LOGIN_TIMEOUT')),12000))
    ]);
    const user=cred?.user||auth.currentUser;
    if(!user)throw new Error('LOGIN_NO_USER');
    // Transizione visiva immediata: non aspettiamo profilo, listener o Firestore.
    enterAuthenticated(user);
    loginStatus.textContent='';
  }catch(err){
    console.error('login',err);
    if(auth.currentUser){enterAuthenticated(auth.currentUser);loginStatus.textContent=''}
    else loginStatus.textContent=err?.message==='LOGIN_TIMEOUT'?'Accesso troppo lento. Riprova tra qualche secondo.':'Accesso non riuscito. Controlla le credenziali e riprova.';
  }finally{loginPending=false;if(!login.classList.contains('hidden')&&submit){submit.disabled=false;submit.textContent='Accedi';submit.removeAttribute('aria-busy')}}
});
const toggleLoginPassword=$('#toggleLoginPassword');if(toggleLoginPassword)toggleLoginPassword.onclick=()=>{const input=$('#loginPassword');if(!input)return;const show=input.type==='password';input.type=show?'text':'password';toggleLoginPassword.classList.toggle('is-visible',show);toggleLoginPassword.setAttribute('aria-label',show?'Nascondi password':'Mostra password');toggleLoginPassword.title=show?'Nascondi password':'Mostra password'};
const loginEmailInput=$('#loginEmail');
if(loginEmailInput){
  const focusEmail=()=>{if(document.activeElement===loginEmailInput)return;try{loginEmailInput.focus({preventScroll:true})}catch{loginEmailInput.focus()}};
  // iOS/PWA: il focus deve avvenire dentro il gesto iniziale, non dopo touchend.
  // Così anche il primissimo tap dopo l'installazione apre la tastiera.
  loginEmailInput.addEventListener('touchstart',focusEmail,{passive:true});
  loginEmailInput.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')focusEmail()});
  loginEmailInput.addEventListener('click',focusEmail);
}

$('#logoutBtn').onclick=async()=>{if(!await confirmDialog('Vuoi uscire dal gestionale?','Esci da Noor Splendori'))return;try{await logAccess('logout')}catch{}stopListeners();appOpenedForUid='';state.profile=null;state.currentWarehouseId='';await signOut(auth);showLogin()};
$('#modalClose').onclick=closeModal;$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});

const mobileMenuBtn=$('#mobileMenuBtn');
function closeMobileMenu(){document.body.classList.remove('mobile-menu-open')}
if(mobileMenuBtn)mobileMenuBtn.onclick=()=>document.body.classList.toggle('mobile-menu-open');
document.addEventListener('click',e=>{if(window.innerWidth>780)return;if(document.body.classList.contains('mobile-menu-open')&&!e.target.closest('#sidebar')&&!e.target.closest('#mobileMenuBtn'))closeMobileMenu()});
window.addEventListener('resize',()=>{if(window.innerWidth>780){closeMobileMenu()}else{$('#sidebar')?.classList.remove('collapsed')}});

$('#sideUserCard').onclick=()=>{closeMobileMenu();go('profile')};
if($('#topbarLogo'))$('#topbarLogo').onclick=()=>{closeMobileMenu();go('home')};
$('#collapseBtn').onclick=()=>{if(window.innerWidth<=780){closeMobileMenu();return}const s=$('#sidebar');s.classList.toggle('collapsed');localStorage.setItem('noor_v2_side',s.classList.contains('collapsed')?'1':'0')};if(localStorage.getItem('noor_v2_side')==='1'&&window.innerWidth>780)$('#sidebar').classList.add('collapsed');
$('#refreshBtn').onclick=()=>{renderAllVisible();toast('I dati online sono già sincronizzati in tempo reale.')};
$('#productSearch').oninput=renderProducts;['#productBrandFilter','#productCategoryFilter','#productFormatFilter','#productDiscountFilter','#productPageSize'].forEach(id=>{const el=$(id);if(el)el.onchange=renderProducts});if($('#openLowStockBtn'))$('#openLowStockBtn').onclick=()=>go('low-stock');if($('#backHomeFromLowStockBtn'))$('#backHomeFromLowStockBtn').onclick=()=>go('home');if($('#lowStockSearch'))$('#lowStockSearch').oninput=renderLowStockPage;if($('#lowStockPageSize'))$('#lowStockPageSize').onchange=renderLowStockPage;$('#addProductBtn').onclick=()=>openProduct();$('#openDeletedProductsBtn').onclick=()=>go('products-deleted');$('#backProductsFromDeletedBtn').onclick=()=>go('products');
$('#sellSearch').oninput=()=>renderSellProducts(addToCart);if($('#sellPageSize'))$('#sellPageSize').onchange=()=>renderSellProducts(addToCart);$('#barcodeInput').addEventListener('input',e=>{const val=e.target.value.replace(/\D/g,'').slice(0,13);e.target.value=val;if(val.length===13){if(addByBarcode(val)){e.target.value='';setTimeout(()=>e.target.focus(),0)}}});
$('#clearCartBtn').onclick=clearCart;$('#applyDiscountBtn').onclick=applyDiscountCode;$('#checkoutBtn').onclick=checkout;
$('#historySearch').oninput=renderOrders;$('#historyStatus').onchange=renderOrders;['#historyFrom','#historyTo','#historyPayment','#historyPageSize'].forEach(id=>{if($(id))$(id).onchange=renderOrders});$('#openCancelledOrdersBtn').onclick=()=>go('cancelled');$('#backHistoryBtn').onclick=()=>go('history');if($('#cancelledPageSize'))$('#cancelledPageSize').onchange=renderCancelledOrders;
$('#stockSearch').oninput=renderStock;$('#stockFilter').onchange=renderStock;if($('#stockPageSize'))$('#stockPageSize').onchange=renderStock;$('#openStockMoveBtn').onclick=()=>openStockMove();if($('#openStockTransferBtn'))$('#openStockTransferBtn').onclick=()=>openStockTransfer();if($('#openBulkStockBtn'))$('#openBulkStockBtn').onclick=()=>openBulkStockManager();if($('#backBulkStockBtn'))$('#backBulkStockBtn').onclick=()=>go('stock');if($('#warehousePicker'))$('#warehousePicker').onchange=e=>{if(setCurrentWarehouse(e.target.value)){renderAllVisible();renderCart();toast('Magazzino attivo: '+(warehouseById(e.target.value)?.name||e.target.value))}};$('#backStockBtn').onclick=()=>go('stock');
['#discountPageSize','#employeePageSize','#shiftPageSize','#closurePageSize','#accessPageSize'].forEach(id=>{const el=$(id);if(el)el.onchange=()=>{if(id==='#discountPageSize')renderDiscounts();if(id==='#employeePageSize')renderEmployeesRealtime();if(id==='#shiftPageSize')renderShifts();if(id==='#closurePageSize')renderClosures();if(id==='#accessPageSize')renderAccess()}});
$('#addDiscountBtn').onclick=addDiscount;$('#addEmployeeBtn').onclick=addEmployee;$('#createClosureBtn').onclick=createTodayClosure;$('#settingsForm').onsubmit=submitSettings;
function renderAllVisible(){const id=document.querySelector('.route.active')?.id?.replace('route-','')||'home';if(id==='home')renderHome();if(id==='products')renderProducts();if(id==='products-deleted')renderDeletedProducts();if(id==='product-detail')renderProductDetail();if(id==='sell'){renderSellProducts(addToCart);renderCart()}if(id==='history')renderOrders();if(id==='cancelled')renderCancelledOrders();if(id==='stock')renderStock();if(id==='stock-move')renderStockMove();if(id==='discounts')renderDiscounts();if(id==='employees')renderEmployeesRealtime();if(id==='employee-overview')renderEmployeeOverview();if(id==='roles')renderRoleManagement();if(id==='shifts')renderShifts();if(id==='closures')renderClosures();if(id==='finance')renderFinance();if(id==='returns')renderReturns();if(id==='settings')renderSettings();if(id==='points-of-sale')renderPointsOfSale();if(id==='warehouses')renderWarehousesPage();if(id==='profile')renderProfile()}
setRouteHook(async id=>{closeMobileMenu();if(id==='home'){renderHome();renderHomeShift();return}if(id==='low-stock'){renderLowStockPage();return}if(id==='products'){renderProducts();return}if(id==='products-deleted'){renderDeletedProducts();refreshProductsFromServer().then(()=>renderDeletedProducts()).catch(e=>console.warn('refresh deleted products',e));return}if(id==='product-detail'){renderProductDetail();return}if(id==='sell'){ensureSecondaryListener('discounts');renderSellProducts(addToCart);renderCart();setTimeout(()=>$('#barcodeInput')?.focus(),0);return}if(id==='history'){renderOrders();if(!state.orderHistoryLoaded)loadOrderHistory().catch(()=>{});return}if(id==='cancelled'){ensureSecondaryListener('cancelledOrders');renderCancelledOrders();return}if(id==='stock'){ensureSecondaryListener('stockMovements');renderStock();return}if(id==='stock-move'){renderStockMove();return}if(id==='stock-bulk'){renderBulkStockManager();return}if(id==='discounts'){ensureSecondaryListener('discounts');renderDiscounts();return}if(id==='shopify'){initShopifyPreview();return}if(id==='points-of-sale'){renderPointsOfSale();return}if(id==='warehouses'){renderWarehousesPage();return}if(id==='settings'){renderSettings();bindSettingsBranding();bindPrinterSettings({toast});renderPrinterSettings();return}if(id==='profile'){renderProfile();return}if(id==='employees'){ensureSecondaryListener('employees');loadEmployees();return}if(id==='employee-overview'){ensureSecondaryListener('employees');renderEmployeeOverview();return}if(id==='roles'){ensureSecondaryListener('employees');renderRoleManagement();return}if(id==='shifts'){renderShifts();return}if(id==='finance'){renderFinance();return}if(id==='returns'){renderReturns();return}if(id==='closures'){ensureSecondaryListener('closures');renderClosures();return}if(id==='closure-detail'){ensureSecondaryListener('closures');if(!state.orderHistoryLoaded)await loadOrderHistory().catch(()=>{});renderClosureDetail();return}if(id==='access'){ensureSecondaryListener('accessLogs');renderAccess()}});
subscribe((type)=>{if(type==='profile')applyProfile();if(type==='warehouse'){renderWarehousePicker();renderHome();if($('#route-products').classList.contains('active'))renderProducts();if($('#route-sell').classList.contains('active')){renderSellProducts(addToCart);renderCart()}if($('#route-stock').classList.contains('active'))renderStock();}if(type==='productImages'){renderHome();}if(type==='products'){renderHome();if($('#route-low-stock').classList.contains('active'))renderLowStockPage();if($('#route-products').classList.contains('active'))renderProducts();if($('#route-products-deleted').classList.contains('active'))renderDeletedProducts();if($('#route-product-detail').classList.contains('active'))renderProductDetail();if($('#route-sell').classList.contains('active'))renderSellProducts(addToCart);if($('#route-stock').classList.contains('active'))renderStock();if($('#route-stock-move').classList.contains('active'))renderStockMove();if($('#route-stock-bulk').classList.contains('active'))renderBulkStockManager()}if(type==='orders'){if($('#route-returns')?.classList.contains('active'))renderReturns();renderHome();renderHomeShift();if($('#route-history').classList.contains('active'))renderOrders();if($('#route-closure-detail').classList.contains('active'))renderClosureDetail()}if(type==='discounts'){if($('#route-discounts').classList.contains('active'))renderDiscounts();renderDiscountChoices()}if(type==='cancelledOrders'&&$('#route-cancelled').classList.contains('active'))renderCancelledOrders();if(type==='stockMovements'&&$('#route-stock').classList.contains('active'))renderStock();if(type==='employees'&&$('#route-employees').classList.contains('active'))renderEmployeesRealtime();if(type==='shifts'){renderHomeShift();if($('#route-shifts').classList.contains('active'))renderShifts()}if(type==='closures'){if($('#route-closures').classList.contains('active'))renderClosures();if($('#route-closure-detail').classList.contains('active'))renderClosureDetail()};if(type==='accessLogs'&&$('#route-access').classList.contains('active'))renderAccess();if(type==='settings'){renderWarehousePicker();applyIdentity();applyProfile();if($('#route-settings').classList.contains('active'))renderSettings();if($('#route-points-of-sale').classList.contains('active'))renderPointsOfSale();if($('#route-warehouses').classList.contains('active'))renderWarehousesPage();renderHome()}});
let lastProductServerSync=0;
const syncProductsOnResume=()=>{const now=Date.now();if(!auth.currentUser||now-lastProductServerSync<5000)return;lastProductServerSync=now;refreshProductsFromServer().catch(e=>console.warn('products resume sync',e))};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncProductsOnResume()});
window.addEventListener('focus',syncProductsOnResume);
window.addEventListener('online',()=>{$('#syncState').innerHTML='<i></i> Online'});window.addEventListener('offline',()=>{$('#syncState').innerHTML='<i style="background:#e94b6b"></i> Offline'});
const withTimeout=(promise,ms=5500)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Tempo di risposta Firebase scaduto.')),ms))]);
function showBootProblem(message='Connessione lenta o temporaneamente non disponibile.'){
  if(boot.classList.contains('hidden'))return;
  const msg=$('#bootMessage'),actions=$('#bootActions');
  if(msg)msg.textContent=message;
  if(actions)actions.classList.remove('hidden');
}
onAuthStateChanged(auth,user=>{if(!user){if(loginPending)return;appOpenedForUid='';state.profile=null;showLogin();return}enterAuthenticated(user)});
setTimeout(()=>{if(!boot.classList.contains('hidden'))showBootProblem('Sto preparando il gestionale. Puoi riprovare tra qualche secondo.')},6500);
const retryBoot=$('#bootRetry');if(retryBoot)retryBoot.onclick=()=>location.reload();
const openLoginBoot=$('#bootOpenLogin');if(openLoginBoot)openLoginBoot.onclick=()=>showLogin('Accedi nuovamente per continuare.');
window.NoorV2={go,state,version:'2.5.8'};
