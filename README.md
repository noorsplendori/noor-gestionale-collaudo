# NOOR V2.5.85 – STAGING Contabilità e Resi

Progetto completo esclusivamente per collaudo. Firebase: `noor-collaudo-2026`. Netlify: `noor-gestionale-collaudo`. Non caricare nel repository della produzione.

## Aggiornamento
- Contabilità: riepilogo per sede più registro degli ultimi 50 movimenti di cassa e resi, con data, tipo, causale e importo.
- Resi: richiesta di anteprima backend delle quantità già rese e ancora rendibili, prima di consentire la conferma. Il controllo definitivo rimane nel backend durante la transazione.
- Resi contabili solo in contanti: nessuna esecuzione di rimborso esterno e nessun reintegro automatico di magazzino.
- Nessun cambiamento alle funzioni Shopify o alle regole Firestore.

## Deploy e collaudo
Le schermate possono essere verificate in locale su localhost:5501. Le nuove chiamate server (`refund-preview` e dettaglio del riepilogo) richiedono il deploy del repository STAGING su Netlify. Per provarle operativamente, `NOOR_STAGING_FINANCE_ENABLED` deve essere impostata a `true` **solo dopo il controllo dell'ambiente STAGING e delle credenziali**, e deve essere rimessa a `false` alla fine dei test. Mantieni invariati i valori delle variabili delle vendite già verificate.

L'interfaccia è volutamente limitata a localhost: non usarla come frontend pubblico.

Test consigliati: eseguire `node --test tests/staging-finance.test.mjs tests/staging-finance-ui.test.mjs tests/staging-finance-detail.test.mjs` e `npm run build`.

Non pronto per produzione: mancano emissione di buoni, rimborsi sui provider di pagamento, riconciliazione contanti/POS, chiusure di cassa definitive e test integrativi Firebase.
