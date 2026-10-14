// STAGING ONLY. Requires firebase-admin on the Netlify server and separate STAGING credentials.
import {validateSaleInput,priceAndDecrement,SaleError} from '../lib/noor-sale-core.mjs';
const allowedOrigin = origin => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
const json=(statusCode,body,origin='')=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store',...(allowedOrigin(origin)?{'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-headers':'Authorization, Content-Type','access-control-allow-methods':'POST, OPTIONS'}:{})},body:JSON.stringify(body)});
export async function handler(event){
  const origin=event.headers?.origin || event.headers?.Origin || '';
  const respond=(status,body)=>json(status,body,origin);
  if(event.httpMethod==='OPTIONS')return allowedOrigin(origin)?json(204,{},origin):json(403,{error:'Origine non autorizzata'});
  if(event.httpMethod!=='POST')return respond(405,{error:'Metodo non supportato'});
  if(!allowedOrigin(origin))return respond(403,{error:'STAGING: richiesta consentita soltanto da localhost'});
  if(process.env.NOOR_STAGING_SALES_ENABLED!=='true')return respond(503,{error:'Vendite backend di collaudo non abilitate'});
  const expectedProject='noor-collaudo-2026';
  if(process.env.NOOR_STAGING_PROJECT_ID!==expectedProject || process.env.GCLOUD_PROJECT=== 'gestionalenoor-2fa61')return respond(503,{error:'Configurazione STAGING non valida'});
  const token=/^Bearer (.+)$/.exec(event.headers?.authorization || event.headers?.Authorization || '')?.[1];
  if(!token)return respond(401,{error:'Autenticazione richiesta'});
  try{
    const admin=await import('firebase-admin');
    // Credentials supplied ONLY as server environment variable, never embedded in this archive.
    const credentials=JSON.parse(process.env.NOOR_STAGING_SERVICE_ACCOUNT_JSON || '{}');
    if(credentials.project_id!==expectedProject)throw new SaleError(503,'Account di servizio di collaudo mancante');
    if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(credentials),projectId:expectedProject});
    if(admin.app().options.projectId!==expectedProject)throw new SaleError(503,'Progetto Firebase non valido');
    const verified=await admin.auth().verifyIdToken(token,true);
    if(verified.firebase?.sign_in_provider==='anonymous')throw new SaleError(403,'Account non consentito');
    const db=admin.firestore();
    const profileSnap=await db.doc(`users/${verified.uid}`).get();
    if(!profileSnap.exists)throw new SaleError(403,'Profilo non trovato');
    const profile=profileSnap.data();
    const settingsSnap=await db.doc('settings/global').get();
    if(!settingsSnap.exists)throw new SaleError(503,'Configurazione sedi mancante');
    const request=JSON.parse(event.body || '{}');
    const validated=validateSaleInput(request,profile,settingsSnap.data());
    const results=await db.runTransaction(async tx=>{
      const orderRef=db.doc(`orders/${validated.saleId}`);
      const orderSnap=await tx.get(orderRef);
      if(orderSnap.exists){
        if(orderSnap.data().createdByUid===verified.uid && orderSnap.data().source==='noor-staging-backend')return {saleId:validated.saleId,alreadySaved:true,total:orderSnap.data().total,order:{...orderSnap.data(),createdAt:null,updatedAt:null}};
        throw new SaleError(409,'ID vendita già esistente');
      }
      const grouped=new Map();
      for(const item of validated.items){const key=`${item.productId}@@${item.warehouseId}`;const current=grouped.get(key);grouped.set(key,{...item,qty:item.qty+(current?.qty || 0)});}
      const entries=[...grouped.values()];
      const reads=[];
      for(const line of entries){const ref=db.doc(`products/${line.productId}`);reads.push({...line,ref,snap:await tx.get(ref)});}
      const primaryWarehouseId=String((settingsSnap.data().warehouses || [])[0]?.id || 'main');
      // Compute all changes BEFORE writes; merge updates if the same product appears in several warehouses.
      const updates=new Map(),orderItems=[];let totalCents=0;
      for(const line of reads){
        if(!line.snap.exists)throw new SaleError(409,'Prodotto non trovato');
        const prev=updates.get(line.productId)?.data || line.snap.data();
        const result=priceAndDecrement(prev,line.warehouseId,line.qty,primaryWarehouseId);
        updates.set(line.productId,{ref:line.ref,data:{...prev,...result.patch},patch:result.patch});
        totalCents+=result.lineTotalCents;
        orderItems.push({productId:line.productId,productName:line.snap.data().name || '',warehouseId:line.warehouseId,qty:line.qty,price:result.price,unitPrice:result.price,netTotal:result.lineTotalCents/100,total:result.lineTotalCents/100});
      }
      const now=new Date().toISOString();
      for(const {ref,patch} of updates.values())tx.update(ref,{...patch,updatedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAtClient:now,updatedBy:verified.uid});
      const storedOrder={id:validated.saleId,orderId:validated.saleId,orderNumber:validated.saleId,pointOfSaleId:validated.pointOfSaleId,items:orderItems,warehouseId:orderItems[0].warehouseId,status:'completed',source:'noor-staging-backend',payment:validated.payment,paymentMethod:validated.payment,total:totalCents/100,subtotal:totalCents/100,sellerUid:verified.uid,employeeUid:verified.uid,createdByUid:verified.uid,createdAt:admin.firestore.FieldValue.serverTimestamp(),createdAtClient:now,date:now,updatedAt:admin.firestore.FieldValue.serverTimestamp()};
      tx.create(orderRef,storedOrder);
      return {saleId:validated.saleId,total:totalCents/100,alreadySaved:false,order:{...storedOrder,createdAt:null,updatedAt:null}};
    });
    return respond(200,{ok:true,...results});
  }catch(e){const status=e instanceof SaleError?e.status:500;return respond(status,{error:status===500?'Errore interno. Nessuna conferma di vendita. Verificare storico prima di riprovare.':e.message});}
}
