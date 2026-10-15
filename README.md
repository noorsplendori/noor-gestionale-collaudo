# NOOR V2.5.85 — Pacchetto unico di accettazione STAGING

Questa versione raccoglie la cassa backend, la separazione per sede, Contabilità, resi contabili, quadratura contanti, codici ordine abbreviati e le relative prove automatiche. **Non è ancora il rilascio da usare in produzione.**

## Verifiche in un solo passaggio

Dalla root del progetto: `npm run preflight:rilascio`. Il comando verifica build, test STAGING, isolamento dal Firebase reale e segnala automaticamente le condizioni che impediscono la pubblicazione in produzione. Un codice di uscita 3 indica che i test STAGING sono superati ma restano funzioni bloccanti; non significa che il pacchetto sia corrotto.

Per l'ultima tornata di test reali utilizzare SOLO il repository privato `noor-gestionale-collaudo`, Netlify STAGING e il progetto Firebase `noor-collaudo-2026`. Non caricare qui credenziali server. Non copiare credenziali Shopify e non cambiare `firestore.rules` nel progetto reale.

### Unica sessione di collaudo applicativo

1. Owner: ordine fittizio in THEORIA, controllare scorta e ricevuta con codice breve.
2. Manager THEORIA/LATINFIEXPO: verifica delle letture proprie e assenza dei dati dell'altra sede; controllare anche dinieghi Firestore per richieste dirette.
3. Contabilità: riepiloghi separati, singolo movimento di cassa, quadratura indicativa e impossibilità di duplicarne una per la stessa giornata.
4. Resi: dettagli ordine, ricerca, reso parziale/totale contabile, badge e rifiuto del doppio reso; verificare che NON avvenga reintegro automatico.
5. NOOR ONLINE: richiede test autorizzazioni e riconciliazione con Shopify in ambiente dedicato prima della produzione.
6. Nuovo periodo: non attivare sul Firebase reale e non cancellare storici; la piena attivazione sicura resta un requisito aperto.

Non ripetere operazioni in caso di errore ambiguo: verificare prima che non siano già state salvate.

## Bloccanti per il rilascio di produzione

- Backend per annullamenti/ripristini con stock e audit atomici non ancora completo.
- Buoni acquisto e rimborsi elettronici automatici non operativi; il modulo attuale registra esclusivamente resi contabili contanti supportati.
- Chiusure fiscali definitive non implementate: la quadratura di prova è solo informativa.
- Attivazione del nuovo periodo economico e protezione completa degli storici da collaudare.
- Verifica completa delle regole Firestore con utenti reali di sedi differenti, e allineamento del codice alla V2.5.84 che contiene le Functions Shopify reali.
- La configurazione web e server attuale è intenzionalmente limitata a STAGING: non sostituirla alla produzione.

### Aggiornamenti

Per il solo test finale STAGING caricare **tutti** i file di questo ZIP nella root del repository `noor-gestionale-collaudo`, attendere Netlify, poi utilizzare `localhost:5501` per il frontend. `firestore.rules`: non aggiornare per questo pacchetto. Per la produzione: nessun file da pubblicare finché i bloccanti non sono risolti.
