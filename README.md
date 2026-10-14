# NOOR V2.5.85 — Fase 15 · Correzione scansione migrazione

Corretto l’errore `Cannot read properties of undefined (reading 'filter')` segnalato nella Fase 14. La schermata verifica esplicitamente la presenza dei campi `legacyReview`, `eligible`, `stats` e `candidateTotal` prima di presentare azioni di scrittura. Un modulo precedente conservato nella cache viene rifiutato in sicurezza. Versionamento dei moduli e del service worker aggiornato per forzare il caricamento di F15.

## File modificati rispetto alla Fase 14
- `assets/js/sections.js`
- `assets/js/app.js`
- `index.html`
- `sw.js`
- `tests/point-of-sale-migration-f15.test.mjs` (nuovo, solo test)

## Test dell’utente
1. Estrarre lo ZIP completo della Fase 15 in una cartella nuova o sostituire i file elencati nella cartella locale.
2. Aprire la pagina in Chrome e premere Ctrl+F5. Se necessario eliminare la cache del service worker per localhost.
3. Punti vendita → Migrazione storici → Analizza tutti gli archivi. Attesi 324 vendite, 37 turni, 22 chiusure, 383 candidati, con eventuali `storeId` legacy indicati a parte.
4. NON premere Applica attribuzione storica prima del backup di Firestore e del controllo finale della scansione.

## Sicurezza
Firebase `firestore.rules`: **non aggiornare**. Nessuna modifica alle funzioni Netlify o alla sincronizzazione Shopify. Il gestionale localhost continua a utilizzare Firebase reale; la scansione è sola lettura. Produzione: mantenere V2.5.84.

---

# NOOR V2.5.85 — Fase 13 · Migrazione storici confermata (SOLO TEST)

La scansione completa riscontrata dall'utente ha rilevato **324 vendite, 37 turni, 22 chiusure** senza sede. L'utente conferma che appartengono a LATINFIEXPO – RESCALDINA (`NR-002`). I **5 utenti senza sede NON vengono migrati**.

**La Fase 13 sostituisce i vincoli di conteggio della Fase 12 descritti più sotto.**

## Precauzioni
- La scansione è di sola lettura; premere **Applica attribuzione storica** modifica Firebase di produzione anche da localhost.
- L'operazione richiede Owner/Super Admin, controllo esatto dei totali (324/37/22), conferma esplicita e digitazione di NR-002.
- Scritture atomiche per documento, con riesame della sede prima dell'aggiornamento; aggiornato solo `pointOfSaleId` e metadati di audit. Nessun cambiamento ad importi, giacenze, prodotti o Shopify.
- In caso di interruzione, ripetere la scansione prima di riprovare. Eseguire un backup Firestore prima della migrazione.
- Non distribuire ai responsabili: le regole multi-sede definitive NON sono ancora implementate.

## File modificati rispetto a Fase 12
- `assets/js/point-of-sale-migration.mjs`
- `assets/js/sections.js`
- `tests/point-of-sale-migration.test.mjs`
- `README.md`

**Firebase `firestore.rules`: nessuna modifica in Fase 13.** Netlify Functions Shopify invariato. Versione produzione: mantenere V2.5.84.

# NOOR V2.5.85 — Fase 8 (sviluppo, NON pubblicare in produzione)

- Badge verde "Attivo" e rosso "Disattivato" nelle schede dei punti vendita, anche da chiuse.
- Eliminazione definitiva magazzini: diagnostica esplicita con finestra NOOR per vincoli e errori Firebase; doppia conferma e transazione atomica già previste.
- Il tasto elimina definitivamente è nell'archivio, dopo l'archiviazione (Elimina → Magazzini eliminati → Elimina definitivamente).
- Lo stato Firebase deve essere verificato nel browser reale, con soli magazzini di test e senza dati storici. Nessuna modifica a firestore.rules in questa fase.
- La futura sezione monetaria rimane da sviluppare: cassa/chiusure e incassi per sede, contabilità separata Shopify/gestionale, resi e buoni.
- **NON è il rilascio multi-sede definitivo**: mancano isolamento per sede, migrazione storici, permessi backend e test con Firebase Emulator. Mantieni V2.5.84 in produzione.

## File cambiati rispetto alla Fase 7
- assets/js/warehouses.js
- assets/js/sections.js
- assets/css/app.css
- sw.js
- README.md

## Note di sicurezza
La cancellazione è irreversibile e deve essere autorizzata solo per magazzini di test veramente privi di dipendenze.
La verifica dello storico tramite dati caricati nel client non sostituisce una validazione server-side completa.

# NOOR V2.5.85 — Fase 6 (sviluppo, NON pubblicare)

- Magazzini: archiviazione di magazzini locali a giacenza zero e senza assegnazioni, anche in presenza di storico (storico conservato). Eliminazione definitiva bloccata in presenza di qualsiasi riferimento.
- Punti vendita: Elimina (archivia), Punti vendita eliminati, Recupera e cancellazione definitiva soltanto senza dipendenti né riferimenti storici. ID NR- non riutilizzati.
- Lo stato di archiviazione delle sedi viene preservato dalla normalizzazione Firebase e da Salva modifiche sedi.
- Shopify: nessun cambiamento. Su localhost il pannello può non collegarsi alle Netlify Functions pubblicate.
- Regole Firebase non aggiornate. Isolamento multi-sede ancora NON implementato: NON distribuire ai responsabili.

File modificati rispetto a Fase 5: assets/js/warehouses.js, assets/js/sections.js, assets/js/store.js, sw.js, README.md.

Test prima del rilascio: archiviazione/recupero sede di prova, salvataggio senza perdita delle sedi archiviate, cancellazione definitiva solo per sede mai usata, archiviazione magazzino senza stock, blocco per giacenze/assegnazioni, Shopify in produzione senza regressioni.

# NOOR V2.5.85 — Fase 3: Sedi e magazzini (non rilascio multi-sede definitivo)

Base: V2.5.85 Fase 2. Motore Shopify invariato.

## Cambiamenti
- Punti vendita: elenco delle sedi persistite; creazione separata con campi che si svuotano dopo il salvataggio; codice NR- stabile; indirizzo, email e cellulare; modifica di sedi esistenti; possibilità di disattivare le sedi tramite stato.
- Magazzini: pulsanti **Modifica** e **Disattiva** (eliminazione logica protetta, senza cancellare storici o dati). Disattivazione negata per magazzino principale/ONLINE, con giacenza residua o associato a sede/dipendente. L'ID rimane immutabile.
- Conferme creazione magazzino e disattivazione: dialog personalizzato NOOR, non confirm del browser. Toast NOOR per operazioni riuscite/errori.
- I dati delle sedi address/email/phone rimangono conservati attraverso il caricamento e la normalizzazione delle impostazioni.

## File cambiati rispetto a Fase 2
- assets/js/sections.js
- assets/js/warehouses.js
- assets/js/store.js
- index.html
- sw.js
- README.md

## Firebase
`firestore.rules` **non cambia** in questa fase. ATTENZIONE: la sicurezza multi-sede definitiva NON è ancora presente, pertanto non assegnare accessi reali a responsabili locali, e non considerare questa versione un rilascio produttivo multi-sede.

## Test consigliati (ambiente isolato; localhost da solo usa Firebase reale)
1. Crea una sede NR- e verifica che appaia nell'elenco e che il modulo di creazione sia vuoto.
2. Riapri la pagina, verifica persistenza di nome, indirizzo, email, telefono e magazzino assegnato.
3. Modifica i dati di una sede esistente e salva; ricarica e confronta.
4. Rinomina un magazzino esistente e verifica la persistenza.
5. Prova a disattivare il magazzino principale/ONLINE: deve impedire l'azione.
6. Prova a disattivare un magazzino associato a sede o con stock > 0: deve impedire l'azione.
7. Disattiva un magazzino locale inutilizzato e vuoto: non deve cancellare ordini, prodotti o movimenti storici.
8. Verifica i dialog personalizzati e l'assenza di pop-up confirm nativi nella procedura magazzino.
9. Verifica che Shopify e NOOR ONLINE mantengano l'allineamento preesistente senza modifiche al codice di sincronizzazione.

## Nota su eliminazione
La funzione **Disattiva** sostituisce la cancellazione fisica del magazzino per garantire integrità dei dati storici e dei riferimenti contabili; una cancellazione irreversibile non è disponibile in questa fase.


## Fase 4 — UI sedi, magazzini, ricerca dipendenti
- Sedi in schede chiuse di default, espandibili con click.
- Pulsanti magazzino riallineati: Modifica, Disattiva, Elimina (archiviazione logica solo magazzini locali inattaccabili da operazioni/giacenze note). NOOR ONLINE e principale protetti senza opzione password client-side.
- Ricerca per nome o codice sede nei moduli nuovo/modifica dipendente.
- NON attivare in produzione multi-sede senza regole Firebase e migrazione; firestore.rules invariato.


## Fase 5 — UI richieste
- Pulsanti Crea magazzino e Magazzini eliminati in alto; archivio con Recupera o Elimina definitivamente.
- Eliminazione definitiva ammessa solo quando non esistono riferimenti in prodotti/storico e nessun collegamento con sedi o dipendenti; due conferme NOOR.
- Punti vendita mostrati come card compatte, arricchite di contatti, indirizzo e magazzino.
- Nuovo punto vendita inizialmente chiuso e apribile con Crea punto vendita nella barra superiore.
- NON pubblicare in produzione per responsabili di sede: isolamento Firebase multi-sede ancora da completare. firestore.rules invariato.


## V2.5.85 Fase 7
- Punti vendita: pulsante archivio nella barra superiore e freccia d'apertura arrotondata.
- Magazzini archiviati: cancellazione definitiva delle mappe di giacenza a zero in transazione con rimozione della configurazione. Rimangono bloccati riferimenti storici e assegnazioni.
- Questa versione non completa l'isolamento multi-sede: non pubblicare regole Firebase o abilitare responsabili indipendenti senza la migrazione di sicurezza.

## V2.5.85 Fase 9 — Schede sede e rimozione magazzino
- Apertura sede in lettura; modifica solo tramite Modifica, con Salva e Annulla sulla singola scheda.
- La rimozione definitiva di un magazzino locale archiviato con giacenze a zero e senza assegnazioni rimuove i riferimenti di inventario a zero e la configurazione, conservando i documenti storici e una traccia ID/nome in `settings/global.deletedWarehouseReferences`.
- Nessuna cancellazione dei documenti orders/closures/shifts/stockMovements. NOOR ONLINE sempre protetto.
- Questa è una fase di sviluppo, non rilascia i permessi multi-sede definitivi. Non aggiornare firestore.rules in questa fase.

## Fase 10 — Diagnostica copertura punti vendita (sola lettura)
La pagina **Punti vendita** include il riepilogo dei record *caricati* di ordini, turni, chiusure e dipendenti con `pointOfSaleId` valido, vuoto o sconosciuto. La diagnostica è visibile soltanto a chi ha accesso alle impostazioni e non modifica Firestore, inventario, ordini o Shopify. Non interpreta il conteggio come verifica completa della collezione: gli elenchi possono essere parziali e il caricamento può essere differito. Non attiva isolamento multi-sede o `sellOnline`.

File modificati rispetto alla Fase 9: `index.html`, `assets/js/sections.js`, `sw.js`. Nuovi: `assets/js/point-of-sale-audit.mjs`, `tests/point-of-sale-audit.test.mjs`. `firestore.rules` non cambia in questa fase.


## V2.5.85 Fase 11 — Impaginazione punti vendita
- Le schede punto vendita sono distanziate in griglia responsiva; l'archivio delle sedi eliminate viene aperto in un riquadro autonomo a piena larghezza sotto le schede.
- La richiesta dell'utente indica che vendite/turni precedenti sono della sede LATINFIEXPO - RESCALDINA NR-002; **nessuna migrazione automatica** è eseguita in questa fase. Prima di applicare attributi storici occorrono lettura completa, anteprima e conferma.
- Cambiano solo `assets/css/app.css`, `sw.js` e questa documentazione. `firestore.rules` NON cambia; funzioni Shopify invariate. Non rilasciare come versione multi-sede con isolamenti di accesso: manca la sicurezza Firebase definitiva.

## V2.5.85 Fase 12 — Migrazione amministrativa controllata
- Nella sezione Punti vendita il Super Admin/Owner può avviare una scansione **completa** di `orders`, `shifts`, `closures`, `users` direttamente su Firestore, distinta dalla diagnostica di 40 ordini limitata ai dati caricati.
- Solo i documenti `orders` e `shifts` privi di `pointOfSaleId` sono candidati per `NR-002` (LATINFIEXPO – RESCALDINA). I documenti già assegnati non vengono sovrascritti; `closures` e `users` sono solo censiti e NON migrati.
- L'assegnazione è **opt-in**, richiede checkbox, digitazione di `NR-002` e conferma grafica NOOR. Durante la scrittura ogni documento viene rileggendo per evitare di sovrascrivere una sede già attribuita. Il processo è suddiviso in batch di massimo 100 documenti; se una parte fallisce, i batch già confermati possono essere ripresi ricominciando dalla scansione. Nessuna modifica a importi, pagamenti, quantità, prodotti o magazzini.
- **ATTENZIONE:** la prova in localhost utilizza Firebase reale! Per testare soltanto l'interfaccia premi *Analizza tutti gli archivi* ma NON *Applica attribuzione storica*.
- **Fase non definitiva:** l'isolamento per punto vendita di ordini/turni/chiusure e i permessi `sellOnline` lato server/Firebase sono ancora da implementare; non fornire accessi multi-sede reali e non pubblicare nuove regole incompiute.
- File cambiati dalla Fase 11: `assets/js/sections.js`, `index.html`, `sw.js`; nuovi `assets/js/point-of-sale-migration.mjs` e `tests/point-of-sale-migration.test.mjs`. `firestore.rules` invariato. Netlify Functions Shopify invariate.

- Salvaguardia aggiuntiva: la Fase 12 ammette la scrittura soltanto se la scansione completa conferma esattamente **40 vendite e 37 turni** candidati senza altri identificativi di sede; ogni differenza blocca la migrazione e richiede una nuova valutazione.

## V2.5.85 Fase 14 — Migrazione storici NR-002 (correzione conteggio e riferimenti legacy)
- La schermata mostra ora i documenti **candidati totali**, includendo chiusure con vecchio campo `storeId`. La Fase 13 le contava fra le 22 chiusure senza sede, ma poteva ometterle dai candidati perché `storeId` non coincideva con `NR-002`.
- I vecchi `storeId` non vengono eliminati o sovrascritti. Sono mostrati in anteprima e richiedono una **seconda conferma esplicita** da Owner/Super Admin che ne ha controllato la provenienza prima di attribuire `pointOfSaleId=NR-002`.
- La migrazione resta bloccata in caso di conteggi diversi da 324 vendite / 37 turni / 22 chiusure o record già assegnati ad altra sede. I 5 utenti non assegnati NON vengono migrati.
- All'applicazione: nuova scansione completa, confronto ID e riferimenti legacy, verifica transazionale per ogni documento, aggiornamento del solo identificativo sede e metadati di migrazione. Se una transazione fallisce, eventuali transazioni precedenti possono essere già salvate: ripetere la scansione prima di riprendere.
- **ATTENZIONE:** utilizzare solo in locale per anteprima. Il tasto **Applica attribuzione storica** scrive realmente nel Firebase di produzione anche da localhost. Prima di usarlo serve un backup Firestore verificato. Non pubblicare in produzione per ruoli multi-sede prima del completamento delle regole di accesso.
- Cambiati rispetto alla Fase 13: `assets/js/point-of-sale-migration.mjs`, `assets/js/sections.js`, `sw.js`; nuovo test `tests/point-of-sale-migration-f14.test.mjs`. `firebase/firestore.rules` invariato. Netlify e Shopify invariati.


## V2.5.85 Fase 16 — Preparazione nuovo periodo
- Nessuna cancellazione o attribuzione storica. Abbandonata la necessità di migrare i vecchi ordini per ripartire da zero.
- Aggiunto un pannello **in sola anteprima** nella sezione Punti vendita per il nuovo periodo gestionale. **Non è ancora abilitata l'attivazione**, fino al completamento degli altri report e regole Firebase.
- Aggiunti filtri client per periodo configurato in Home, Storico, Turni e Chiusure (per futuri test).
- Aggiunti controlli applicativi sulle API di annullamento e ripristino delle vendite precedenti, per evitare reintegri involontari. Questi controlli non sostituiscono regole backend Firebase.
- NON caricare su produzione come sistema definitivo. Nessuna variazione a firebase/firestore.rules; Shopify invariato.


## Fase 17 — Verifica economica per sede (solo lettura)
Aggiunta in Punti vendita / Nuovo periodo gestionale una selezione della sede con riepilogo di vendite, turni, chiusure e record ancora senza sede sui dati caricati nel browser. Nessuna scrittura Firebase, nessuna nuova attivazione, nessuna modifica a magazzino, Shopify o regole. La versione resta NON pubblicabile per i responsabili: isolamento Firebase ancora mancante.


## Fase 18 — Registrazione nuovo periodo (rilascio con vincoli)
- Owner/Super Admin: comando di attivazione una tantum tramite transazione sul documento settings/global.
- Blocco esplicito su localhost per evitare scritture involontarie al Firebase reale.
- firestore.rules aggiornata per proteggere i campi del periodo da modifiche e azzeramenti ripetuti.
- Nessun ordine, turno, chiusura o prodotto e' cancellato. Nessuna variazione di giacenze.
- ATTENZIONE: regole multi-sede / profili responsabili ancora da implementare. Non attivare accessi a responsabili o venditori di sedi diverse.
- Applicare regole e codice come unita' solo dopo verifica Firebase Emulator e test di regressione in staging.


## Fase 19 — Eliminazione definitiva turni archiviati (sviluppo)
- Da Turni > Turni eliminati, Owner/Super Admin visualizza **Elimina definitivamente**.
- La cancellazione legge tutti gli ordini e le chiusure Firestore, richiede turno chiuso con date valide, assenza di vendite dell'operatore nell'intervallo e assenza di chiusure collegate, poi cancella il documento turno.
- Nessun annullamento ordine né reintegro scorte.
- Le verifiche client-side non garantiscono l'assenza di scritture concorrenti: NON pubblicare come sicurezza finale; per produzione serve endpoint server privilegiato con log e vincoli robusti.
- Firestore rules: NON MODIFICATE in questa fase (la cancellazione shift è già Owner-only).
- V2.5.84 resta versione pubblicata.


## Fase 20 — Isolamento di lettura economica (DA NON PUBBLICARE PARZIALMENTE)

- `assets/js/store.js`: gli ascoltatori di ordini, turni, chiusure e ordini annullati usano query `pointOfSaleId` per venditori/responsabili; ruoli Owner/Super Admin/Admin conservano le query globali. Gli utenti senza sede ottengono zero righe (fail closed).
- `firestore.rules`: riserva lettura e creazione delle raccolte economiche alla sede attribuita, salvo accesso centrale, e limita gli aggiornamenti allo stesso `pointOfSaleId`.
- **NON pubblicare solo il frontend o solo le regole:** aggiornamento coordinato e test con Firebase Emulator prima del deploy. Gli ordini storici privi di sede restano visibili solo ai ruoli centrali.
- **Limitazione ancora aperta:** per un isolamento completo serve proteggere anche percorsi di lettura indiretti, movimenti di magazzino/annullamenti, creazione dipendenti, vendite multi-magazzino e scansioni complete. Le regole non sostituiscono l'autorizzazione atomica della vendita Online. Non assegnare ancora accesso a responsabili reali.
- Shopify, funzioni Netlify, giacenze e dati Firebase: nessuna modifica eseguita da questo ZIP.


## Fase 21 — Chiusura percorsi di lettura economica (SVILUPPO, NON PUBBLICARE)
- `loadOrderHistory` e `getLazyCollection` non usano più query globali sui documenti economici per responsabili/venditori: passano da `financialSource`, che applica `pointOfSaleId`.
- `firestore.rules`: gli aggiornamenti a `cancelledOrders` da una sede non possono modificare `pointOfSaleId` verso un’altra sede.
- Nessuna modifica a Shopify o ai movimenti di magazzino.
- Rischio critico **ancora aperto**: la regola `products` concede a chi ha `sell` o `viewStock` di modificare direttamente i campi inventario. La vendita ONLINE va trasferita a un backend autenticato con controlli atomici prima di distribuire accessi dipendenti.
- Test testuali/sintattici non costituiscono un test di autorizzazione Firebase. Prima di pubblicare servono Firebase Emulator e test con due identità realistiche, anche sui percorsi indiretti.
- `firestore.rules` **SÌ, cambiate**, ma **NON pubblicarle ancora**. Produzione: V2.5.84.
- File aggiornati rispetto a Fase 20: `assets/js/store.js`, `firestore.rules`, `sw.js`; nuovo test `tests/point-of-sale-scope-phase21.test.mjs`.
