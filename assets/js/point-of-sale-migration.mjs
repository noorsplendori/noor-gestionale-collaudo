// Fase 12: strumenti di analisi completa e migrazione esplicita, solo amministrativa.
// Nessuna scrittura avviene durante la scansione e nessuna quantità/importo viene modificato.
import {collection,doc,getDocs,getDoc,query,limit,startAfter,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {db,auth} from './firebase.js';
const COLLECTIONS=['orders','shifts','closures','users'];
export function isMigrationAdmin(profile){return ['owner','superadmin','super-admin'].includes(String(profile?.role||'').toLowerCase())}
const EXPECTED={orders:324,shifts:37,closures:22};
export function migrationPreview(rows,targetId){
 const stats={},eligible=[],legacyReview=[],blocked=[];
 for(const name of COLLECTIONS){
  const docs=rows[name]||[];let assigned=0,without=0,assignedTarget=0,assignedOther=0;
  for(const rec of docs){
   const point=String(rec.pointOfSaleId||'').trim(),legacy=String(rec.storeId||'').trim();
   if(point){assigned++;if(point===targetId)assignedTarget++;else assignedOther++}
   else{
    without++;
    if(name in EXPECTED){
     const item={collection:name,id:rec.id,legacyStoreId:legacy};
     if(legacy&&legacy!==targetId){
      // storeId può riferirsi a una sede o a un identificativo legacy:
      // non eliminarlo né trattarlo silenziosamente come NR-002.
      legacyReview.push(item);
     }else eligible.push(item);
    }
   }
  }
  stats[name]={total:docs.length,assigned,without,assignedTarget,assignedOther};
 }
 const countsMatch=Object.entries(EXPECTED).every(([name,n])=>stats[name].total===n&&stats[name].assignedOther===0);
 const candidateTotal=eligible.length+legacyReview.length;
 const allUnassigned=Object.keys(EXPECTED).reduce((n,k)=>n+stats[k].without,0);
 const valid=countsMatch&&candidateTotal===allUnassigned&&blocked.length===0;
 return {targetId,stats,eligible,legacyReview,blocked,valid,countsMatch,candidateTotal,expected:EXPECTED};
}
export async function readAllPointOfSaleCollections(onProgress=()=>{}){
 const out={};for(const name of COLLECTIONS){const rows=[];let cursor=null;
  for(;;){let q=query(collection(db,name),limit(300));if(cursor)q=query(collection(db,name),startAfter(cursor),limit(300));const snap=await getDocs(q);for(const d of snap.docs)rows.push({id:d.id,...d.data()});onProgress(name,rows.length);if(snap.empty||snap.size<300)break;cursor=snap.docs[snap.docs.length-1];}
  out[name]=rows;
 }return out;
}
// Le tre collezioni sono migrate solo con conferma esplicita: utenti esclusi.
// Ogni documento viene ricontrollato atomicamente per evitare sovrascritture concorrenti.
export async function applyHistoricPointOfSaleMigration({preview,targetId,profile,approveLegacy=false,onProgress=()=>{}}){
 if(!isMigrationAdmin(profile)||auth.currentUser?.uid!==profile?.uid)throw new Error('Solo Owner/Super Admin autenticato può avviare la migrazione.');
 if(targetId!=='NR-002'||!preview?.valid||preview.targetId!==targetId)throw new Error('Anteprima non valida o destinazione diversa da NR-002.');
 if(!Object.entries(EXPECTED).every(([name,n])=>preview.stats[name]?.total===n&&preview.stats[name]?.assignedOther===0))throw new Error('Conteggi non corrispondenti alla scansione verificata.');
 if(preview.legacyReview?.length&&!approveLegacy)throw new Error('Occorre approvare esplicitamente le chiusure con identificativo storeId legacy.');
 const work=[...(preview.eligible||[]),...(approveLegacy?preview.legacyReview||[]:[])];
 const unique=new Set(work.map(i=>i.collection+'/'+i.id));
 if(unique.size!==work.length||work.length!==preview.candidateTotal)throw new Error('Elenco della migrazione incoerente. Ripeti la scansione.');
 // Ricontrollo completo prima di qualsiasi modifica: evita scansioni vecchie.
 const fresh=migrationPreview(await readAllPointOfSaleCollections(),targetId);
 const freshKeys=[...fresh.eligible,...fresh.legacyReview].map(i=>i.collection+'/'+i.id+'|'+i.legacyStoreId).sort();
 const currentKeys=work.map(i=>i.collection+'/'+i.id+'|'+i.legacyStoreId).sort();
 if(!fresh.valid||freshKeys.length!==currentKeys.length||freshKeys.some((k,i)=>k!==currentKeys[i]))throw new Error('Dati cambiati dopo la scansione. Ripeti l’anteprima: nessuna scrittura eseguita.');
 let changed=0,skipped=0;
 for(const item of work){
  if(!(item.collection in EXPECTED))throw new Error('Archivio non autorizzato.');
  const ref=doc(db,item.collection,item.id);
  const result=await runTransaction(db,async transaction=>{
   const snap=await transaction.get(ref);
   if(!snap.exists())throw new Error('Documento non più presente: '+item.collection+'/'+item.id);
   const data=snap.data(),current=String(data.pointOfSaleId||'').trim(),legacy=String(data.storeId||'').trim();
   if(current===targetId)return 'skipped';
   if(current||legacy!==item.legacyStoreId)throw new Error('Conflitto sede o riferimento legacy sul documento '+item.collection+'/'+item.id+'. Migrazione interrotta.');
   if(legacy&&legacy!==targetId&&!approveLegacy)throw new Error('Riferimento legacy non approvato.');
   transaction.update(ref,{pointOfSaleId:targetId,posMigrationSource:'NOOR_V2.5.85_F14',posMigratedAt:serverTimestamp(),posMigratedByUid:auth.currentUser.uid});
   return 'changed';
  });
  if(result==='changed')changed++;else skipped++;
  if((changed+skipped)%10===0||changed+skipped===work.length)onProgress({changed,skipped,total:work.length});
 }
 return {changed,skipped};
}
