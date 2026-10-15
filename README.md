# NOOR V2.5.85 — STAGING: Contabilità, quadrature e filtri

Pacchetto completo SOLO PER COLLAUDO. Ambiente associato esclusivamente a `noor-collaudo-2026` e Netlify `noor-gestionale-collaudo`. NON pubblicare sul gestionale di produzione.

## Modifiche
- Contabilità: movimenti filtrabili, scelta 50/100/Tutti con filtro applicato alle righe ricevute, riepilogo separato per sede.
- Resi: filtro Tutti / Resi completi / Resi parziali / Da rendere, mantenendo ricerca e scansione.
- Quadrature: elenco storico, rettifica con motivazione obbligatoria, storico append-only in `noorReconciliationRevisions`. Modifica e audit sono atomici in Firestore. Non è una chiusura fiscale.
- Nessuna modifica al motore Shopify di produzione. Non connettere questa copia a Firebase reale.

## Come provarlo (una sola volta)
1. Estrai tutto e apri `localhost:5501`: verifica solo filtri e form. In locale non si eseguono le nuove Function.
2. Per provare rettifiche e filtri oltre 50, carica TUTTI i file nel GitHub STAGING, attendi il deploy del Netlify STAGING e conferma le variabili server per il Firebase di collaudo.
3. Accedi come Owner, verifica storico quadrature, esegui una sola rettifica con nota di 8+ caratteri, controlla il valore nuovo e il precedente nello storico. Prova 50/100/Tutti e filtri Resi.
4. Non ripetere operazioni con errore incerto; controlla prima Firebase e logs. Non effettuare rimborsi esterni reali.

## Condizioni che impediscono il rilascio in produzione
- Vendita NOOR ONLINE dei dipendenti e integrazione/compatibilità con le 19 Functions Shopify della base produzione non verificate in modo conclusivo.
- Annullamenti e reintegri sicuri server-side, buoni acquisto e rimborsi elettronici non completi.
- Attivazione del nuovo periodo gestionale e chiusura fiscale definitiva non convalidate.
- Requisiti di sicurezza Firestore da testare con Firebase Emulator e credenziali per sedi diverse, oltre alle prove UI.

## Test automatici
`npm run build` e `npm run test:staging`. Le verifiche automatiche non sostituiscono un collaudo Firebase reale nell'ambiente isolato.
