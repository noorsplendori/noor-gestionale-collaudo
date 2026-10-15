// STAGING ONLY. Protected financial endpoints; no external payment-provider refunds.
import {SaleError} from '../lib/noor-sale-core.mjs';
import {authorizeFinance,validateRefund,validateCashMovement,validateCashReconciliation,summarizeLedger} from '../lib/noor-finance-core.mjs';
const ORIGIN=/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const response=(code,body,origin='')=>({statusCode:code,headers:{'content-type':'application/json','cache-control':'no-store',...(ORIGIN.test(origin)?{'access-control-allow-origin':origin,'access-control-allow-headers':'Authorization, Content-Type','access-control-allow-methods':'POST, OPTIONS','vary':'Origin'}:{})},body:JSON.stringify(body)});
export async function handler(event){
  const origin=event.headers?.origin||event.headers?.Origin||'';
  const send=(code,data)=>response(code,data,origin);
  if(event.httpMethod==='OPTIONS')return ORIGIN.test(origin)?send(204,{}):send(403,{error:'Origine non autorizzata'});
  if(event.httpMethod!=='POST')return send(405,{error:'Metodo non supportato'});
  if(!ORIGIN.test(origin))return send(403,{error:'Solo localhost'});
  if(process.env.NOOR_STAGING_FINANCE_ENABLED!=='true')return send(503,{error:'Gestione monetaria STAGING disabilitata'});
  const expected='noor-collaudo-2026';
  if(process.env.NOOR_STAGING_PROJECT_ID!==expected)return send(503,{error:'Progetto staging errato'});
  const token=/^Bearer (.+)$/.exec(event.headers?.authorization||event.headers?.Authorization||'')?.[1];
  if(!token)return send(401,{error:'Autenticazione richiesta'});
  try{
    const admin=await import('firebase-admin');
    const creds=JSON.parse(process.env.NOOR_STAGING_SERVICE_ACCOUNT_JSON||'{}');
    if(creds.project_id!==expected)throw new SaleError(503,'Credenziali staging non valide');
    if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(creds),projectId:expected});
    if(admin.app().options.projectId!==expected)throw new SaleError(503,'Firebase non autorizzato');
    const verified=await admin.auth().verifyIdToken(token,true);
    const db=admin.firestore();
    const profileSnap=await db.doc(`users/${verified.uid}`).get();
    if(!profileSnap.exists)throw new SaleError(403,'Profilo non trovato');
    const profile=profileSnap.data();
    const data=JSON.parse(event.body||'{}');
    const action=String(data.action||'');
    const site=String(data.pointOfSaleId||'');
    authorizeFinance(profile,site,action==='refund'?'refund':['movement','reconcile'].includes(action)?'adjust':'read');
    const config=await db.doc('settings/global').get();
    if(!config.exists||!(config.data().pointsOfSale||[]).some(p=>String(p.id)===site&&p.active!==false&&p.deleted!==true))throw new SaleError(403,'Sede inattiva o inesistente');
    const now=new Date().toISOString();
    if(action==='summary'){
      // Narrow equality queries; never enumerate another location's documents.
      const [o,r,m]=await Promise.all([
        db.collection('orders').where('pointOfSaleId','==',site).get(),
        db.collection('noorRefunds').where('pointOfSaleId','==',site).get(),
        db.collection('noorCashMovements').where('pointOfSaleId','==',site).get()
      ]);
      const period=String(config.data().managementPeriodStartAt||'');
      const inPeriod=d=>!period||(typeof d.createdAtClient==='string'&&d.createdAtClient>=period);
      const list=snap=>snap.docs.map(x=>x.data()).filter(inPeriod);
      const refunds=list(r),movements=list(m);
      const entries=[
        ...refunds.map(d=>({kind:'refund',id:String(d.operationId||''),date:String(d.createdAtClient||''),amountCents:Number(d.amountCents||0),description:String(d.reason||'Reso').slice(0,150)})),
        ...movements.map(d=>({kind:d.type,id:String(d.operationId||''),date:String(d.createdAtClient||''),amountCents:Number(d.amountCents||0),description:String(d.reason||'Movimento').slice(0,150)}))
      ].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,50);
      return send(200,{ok:true,pointOfSaleId:site,periodStart:period,summary:summarizeLedger(list(o),refunds,movements),entries});
    }
    if(action==='refund-status'){
      // Data is already constrained to the authenticated user's authorized location.
      const snap=await db.collection('noorRefunds').where('pointOfSaleId','==',site).get();
      const orders={};
      for(const doc of snap.docs){const d=doc.data();if(d.status!=='completed'||!d.orderId)continue;
        const id=String(d.orderId);const returned=(d.items||[]).reduce((n,i)=>n+Number(i.qty||0),0);
        if(!Number.isSafeInteger(returned)||returned<0)continue;
        orders[id]={returned:(orders[id]?.returned||0)+returned};
      }
      return send(200,{ok:true,orders});
    }
    if(action==='refund-preview'){
      authorizeFinance(profile,site,'refund');
      if(!/^[a-zA-Z0-9_-]{12,90}$/.test(String(data.orderId||'')))throw new SaleError(400,'ID ordine non valido');
      const [orderSnap,prior]=await Promise.all([
        db.doc(`orders/${data.orderId}`).get(),
        db.collection('noorRefunds').where('orderId','==',data.orderId).get()
      ]);
      if(!orderSnap.exists||orderSnap.data().pointOfSaleId!==site)throw new SaleError(404,'Ordine non trovato nella sede');
      const order=orderSnap.data(),start=String(config.data().managementPeriodStartAt||'');
      if(order.status!=='completed'||order.source!=='noor-staging-backend')throw new SaleError(409,'Ordine non idoneo al reso');
      if(start&&(!order.createdAtClient||order.createdAtClient<start))throw new SaleError(409,'Ordine storico non rimborsabile');
      const returned=new Map();
      for(const doc of prior.docs){const d=doc.data();if(d.status!=='completed')continue;for(const i of d.items||[]){const key=String(i.productId)+'@@'+String(i.warehouseId);returned.set(key,(returned.get(key)||0)+Number(i.qty||0));}}
      const lines=(order.items||[]).map(line=>({productId:String(line.productId),warehouseId:String(line.warehouseId),soldQty:Number(line.qty),returnedQty:returned.get(String(line.productId)+'@@'+String(line.warehouseId))||0}));
      return send(200,{ok:true,orderId:data.orderId,lines});
    }
    if(action==='reconciliations'){
      const snap=await db.collection('noorReconciliations').where('pointOfSaleId','==',site).get();
      return send(200,{ok:true,entries:snap.docs.map(d=>d.data()).sort((a,b)=>String(b.createdAtClient).localeCompare(String(a.createdAtClient))).slice(0,30)});
    }
    if(action==='reconcile'){
      // Snapshot indicativo: i dati non sono una chiusura fiscale e possono cambiare con nuove vendite.
      const day=String(data.day||'');
      const activePeriod=String(config.data().managementPeriodStartAt||'').slice(0,10);
      if(activePeriod && day<activePeriod)throw new SaleError(409,'Giornata precedente al periodo gestionale attivo.');
      if(day>now.slice(0,10))throw new SaleError(400,'Impossibile registrare una quadratura futura.');
      const ordersSnap=await db.collection('orders').where('pointOfSaleId','==',site).get();
      const refundsSnap=await db.collection('noorRefunds').where('pointOfSaleId','==',site).get();
      const movementSnap=await db.collection('noorCashMovements').where('pointOfSaleId','==',site).get();
      const dayOf=d=>String(d.createdAtClient||'').slice(0,10);
      // Solo ordini contanti espliciti. Nessuna stima per ordini con metodo non identificato.
      const todayOrders=ordersSnap.docs.map(x=>x.data()).filter(x=>dayOf(x)===day&&x.status==='completed');
      if(todayOrders.some(x=>!['cash','contanti'].includes(String(x.paymentMethod||x.payment||'').toLowerCase())))
        throw new SaleError(409,'Quadratura non disponibile: giornata con pagamenti non-contanti o non riconosciuti.');
      const sum=(arr,key)=>arr.reduce((n,x)=>n+Number(x[key]||0),0);
      const sold=sum(todayOrders.map(x=>({cents:Math.round(Number(x.total||0)*100)})),'cents');
      const returned=sum(refundsSnap.docs.map(x=>x.data()).filter(x=>dayOf(x)===day&&x.status==='completed'&&x.refundMethod==='cash'),'amountCents');
      const todayMovements=movementSnap.docs.map(x=>x.data()).filter(x=>dayOf(x)===day);
      const ins=sum(todayMovements.filter(x=>x.type==='cash_in'),'amountCents');
      const outs=sum(todayMovements.filter(x=>x.type==='cash_out'),'amountCents');
      const expected=sold-returned+ins-outs;
      if(expected<0)throw new SaleError(409,'Contante teorico negativo: verificare i movimenti prima della quadratura.');
      const valid=validateCashReconciliation(data,expected);
      const key=site+'__'+day;
      const ref=db.doc('noorReconciliations/'+key);
      await db.runTransaction(async tx=>{
        const old=await tx.get(ref);
        if(old.exists)throw new SaleError(409,'Quadratura già registrata per questa sede e giornata.');
        tx.create(ref,{...valid,createdByUid:verified.uid,createdAtClient:now,createdAt:admin.firestore.FieldValue.serverTimestamp(),source:'noor-staging-reconciliation',finalClosure:false});
      });
      return send(200,{ok:true,...valid,warning:'Quadratura di prova; non equivale a chiusura fiscale definitiva.'});
    }
    if(action==='movement'){
      const movement=validateCashMovement(data);
      const result=await db.runTransaction(async tx=>{
        const ref=db.doc(`noorCashMovements/${movement.operationId}`);
        const prior=await tx.get(ref);
        if(prior.exists)throw new SaleError(409,'Movimento già registrato');
        tx.create(ref,{...movement,createdByUid:verified.uid,createdAtClient:now,createdAt:admin.firestore.FieldValue.serverTimestamp(),source:'noor-staging-finance'});
        return {operationId:movement.operationId};
      });
      return send(200,{ok:true,...result});
    }
    if(action==='refund'){
      if(!/^[a-zA-Z0-9_-]{12,90}$/.test(String(data.orderId||'')))throw new SaleError(400,'ID ordine non valido');
      if(!/^[a-zA-Z0-9_-]{12,90}$/.test(String(data.operationId||'')))throw new SaleError(400,'ID reso non valido');
      const output=await db.runTransaction(async tx=>{
        const orderRef=db.doc(`orders/${data.orderId}`);
        const operationRef=db.doc(`noorRefunds/${data.operationId}`);
        const [original,previousOperation]=await Promise.all([tx.get(orderRef),tx.get(operationRef)]);
        if(previousOperation.exists)throw new SaleError(409,'Reso già registrato');
        if(!original.exists||original.data().pointOfSaleId!==site)throw new SaleError(404,'Ordine non trovato nella sede');
        const start=String(config.data().managementPeriodStartAt||'');
        if(start && (!(typeof original.data().createdAtClient==='string') || original.data().createdAtClient<start))throw new SaleError(409,'Ordine storico non rimborsabile con questa procedura');
        // Single order metadata serializes refunds of same order. Read all prior refunds before writing.
        const q=db.collection('noorRefunds').where('orderId','==',data.orderId);
        const previousSnap=await tx.get(q);
        const validated=validateRefund(data,original.data(),previousSnap.docs.map(d=>d.data()));
        const productRefs=validated.items.filter(i=>i.restock).map(i=>db.doc(`products/${i.productId}`));
        const snapshots=[];for(const ref of productRefs)snapshots.push(await tx.get(ref));
        const changes=new Map();let idx=0;
        for(const item of validated.items){
          if(!item.restock)continue;
          const ref=productRefs[idx],snap=snapshots[idx];idx++;
          if(!snap.exists)throw new SaleError(409,'Prodotto da reintegrare non trovato');
          const d=changes.get(item.productId)?.data||snap.data();
          const map={...(d.inventoryByWarehouse||{})};
          const current=map[item.warehouseId];
          if(!current||!Number.isSafeInteger(Number(current.qty)))throw new SaleError(409,'Magazzino non disponibile per il reintegro');
          const newQty=Number(current.qty)+item.qty;
          if(!Number.isSafeInteger(newQty)||newQty>100000000)throw new SaleError(409,'Quantità non valida');
          map[item.warehouseId]={...current,qty:newQty};
          changes.set(item.productId,{ref,data:{...d,inventoryByWarehouse:map},inventoryByWarehouse:map});
        }
        for(const {ref,inventoryByWarehouse} of changes.values())tx.update(ref,{inventoryByWarehouse,updatedAtClient:now,updatedBy:verified.uid});
        const stored={...validated,pointOfSaleId:site,orderId:data.orderId,createdByUid:verified.uid,createdAtClient:now,createdAt:admin.firestore.FieldValue.serverTimestamp(),status:'completed',source:'noor-staging-finance',externalPaymentRefundExecuted:false};
        tx.create(operationRef,stored);
        // Serializable metadata: conflicts on concurrent refunds for the same order.
        tx.update(orderRef,{refundRevision:(Number(original.data().refundRevision)||0)+1,updatedAtClient:now});
        return {operationId:validated.operationId,amountCents:validated.amountCents};
      });
      return send(200,{ok:true,...output,warning:'Movimento contabile registrato; eventuale rimborso con carta va eseguito sul terminale del gestore pagamenti.'});
    }
    throw new SaleError(400,'Operazione sconosciuta');
  }catch(err){const code=err instanceof SaleError?err.status:500;return send(code,{error:code===500?'Errore interno, controllare i documenti prima di ripetere.':err.message});}
}
