// STAGING ONLY. Safe cancellation of backend-origin orders in local warehouses.
import {SaleError} from '../lib/noor-sale-core.mjs';
import {validateCancellation,computeRestock} from '../lib/noor-cancel-core.mjs';
const allowed=o=>/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o||'');
const json=(code,body,origin='')=>({statusCode:code,headers:{'content-type':'application/json','cache-control':'no-store',...(allowed(origin)?{'access-control-allow-origin':origin,'access-control-allow-headers':'Authorization, Content-Type','access-control-allow-methods':'POST, OPTIONS'}:{})},body:JSON.stringify(body)});
export async function handler(event){
  const origin=event.headers?.origin||event.headers?.Origin||'';const send=(c,b)=>json(c,b,origin);
  if(event.httpMethod==='OPTIONS')return allowed(origin)?send(204,{}):send(403,{error:'Origine non consentita'});
  if(event.httpMethod!=='POST')return send(405,{error:'Metodo non supportato'});
  if(!allowed(origin))return send(403,{error:'Solo localhost'});
  if(process.env.NOOR_STAGING_CANCEL_ENABLED!=='true')return send(503,{error:'Annullamenti STAGING disabilitati'});
  const project='noor-collaudo-2026';
  if(process.env.NOOR_STAGING_PROJECT_ID!==project)return send(503,{error:'Progetto non autorizzato'});
  const token=/^Bearer (.+)$/.exec(event.headers?.authorization||event.headers?.Authorization||'')?.[1];
  if(!token)return send(401,{error:'Autenticazione necessaria'});
  try{
    const admin=await import('firebase-admin');
    const creds=JSON.parse(process.env.NOOR_STAGING_SERVICE_ACCOUNT_JSON||'{}');
    if(creds.project_id!==project)throw new SaleError(503,'Credenziali non autorizzate');
    if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(creds),projectId:project});
    if(admin.app().options.projectId!==project)throw new SaleError(503,'Firebase non autorizzato');
    const user=await admin.auth().verifyIdToken(token,true);
    const data=JSON.parse(event.body||'{}');const orderId=String(data.orderId||'');
    if(!/^[\w-]{12,90}$/.test(orderId))throw new SaleError(400,'Ordine non valido');
    const db=admin.firestore();const [p,c]=await Promise.all([db.doc(`users/${user.uid}`).get(),db.doc('settings/global').get()]);
    if(!p.exists||!c.exists)throw new SaleError(403,'Configurazione o profilo assente');
    const now=new Date().toISOString();
    const output=await db.runTransaction(async tx=>{
      const orderRef=db.doc(`orders/${orderId}`), auditRef=db.doc(`noorCancellations/${orderId}`);
      const [orderSnap,auditSnap]=await Promise.all([tx.get(orderRef),tx.get(auditRef)]);
      if(auditSnap.exists)throw new SaleError(409,'Ordine già annullato');
      if(!orderSnap.exists)throw new SaleError(404,'Ordine non trovato');
      const order=orderSnap.data();
      const lines=validateCancellation(order,p.data(),c.data(),String(c.data().managementPeriodStartAt||''));
      const refunds=await tx.get(db.collection('noorRefunds').where('orderId','==',orderId));
      if(!refunds.empty)throw new SaleError(409,'Ordine con resi: annullamento completo vietato');
      const reads=[];
      for(const l of lines){const ref=db.doc(`products/${l.productId}`); reads.push({...l,ref,snap:await tx.get(ref)});}
      const primary=String(c.data().warehouses?.[0]?.id||'main');const patches=new Map();
      for(const line of reads){if(!line.snap.exists)throw new SaleError(409,'Prodotto non trovato'); const prior=patches.get(line.productId)?.data||line.snap.data();const patch=computeRestock(prior,line.warehouseId,line.qty,primary);patches.set(line.productId,{ref:line.ref,data:{...prior,...patch},patch});}
      for(const {ref,patch} of patches.values())tx.update(ref,{...patch,updatedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAtClient:now,updatedBy:user.uid});
      tx.update(orderRef,{status:'cancelled',cancelledAtClient:now,cancelledByUid:user.uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
      tx.create(auditRef,{orderId,pointOfSaleId:order.pointOfSaleId,createdByUid:user.uid,createdAtClient:now,createdAt:admin.firestore.FieldValue.serverTimestamp(),restocked:lines});
      return {orderId,status:'cancelled'};
    });
    return send(200,{ok:true,...output});
  }catch(e){const code=e instanceof SaleError?e.status:500;return send(code,{error:code===500?'Errore interno: verificare lo storico prima di riprovare.':e.message});}
}
