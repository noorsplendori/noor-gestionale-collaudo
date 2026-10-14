import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { initializeAuth, browserLocalPersistence, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { initializeFirestore, memoryLocalCache } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { stagingFirebaseConfig } from './staging-config.js';
// BLOCCO DI SICUREZZA: nessuna connessione possibile al Firebase reale.
export const firebaseConfig = stagingFirebaseConfig;
const PRODUCTION_PROJECT_ID = 'gestionalenoor-2fa61';
if (!firebaseConfig || !firebaseConfig.projectId ||
    firebaseConfig.projectId === PRODUCTION_PROJECT_ID ||
    !String(firebaseConfig.projectId).startsWith('noor-')) {
  throw new Error('STAGING BLOCCATO: configurare un progetto Firebase di test con ID che inizi per noor- e diverso dalla produzione.');
}
if (!['localhost', '127.0.0.1'].includes(location.hostname)) {
  throw new Error('STAGING BLOCCATO: questa copia puo essere avviata soltanto in locale.');
}
export const fbApp=initializeApp(firebaseConfig);
// Usiamo localStorage per la sessione Auth: evita dipendenze dalla vecchia cache IndexedDB.
export const auth=initializeAuth(fbApp,{persistence:browserLocalPersistence});
// Firestore resta volutamente in memoria. I vecchi dati persistenti non devono bloccare login o vendite.
export const db=initializeFirestore(fbApp,{localCache:memoryLocalCache()});
export {signInWithEmailAndPassword,signOut,onAuthStateChanged};
