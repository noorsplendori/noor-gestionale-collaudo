// Verifica ripetibile del candidato STAGING. Non attiva servizi o scritture.
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(p,'utf8');
const checks=[];
const check=(name,pass,meaning)=>checks.push({name,pass,meaning});
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{stdio:'inherit'});return r.status===0};
check('Build STAGING',run('npm',['run','build']),'Compilazione locale');
check('Test STAGING',run('npm',['run','test:staging']),'Regressioni automatiche');
check('Staging Firebase separato',read('assets/js/staging-config.js').includes('noor-collaudo-2026'),'Firebase di collaudo configurato');
check('Backend vendite separato',read('netlify/functions/noor-sale.mjs').includes("expectedProject='noor-collaudo-2026'") && read('netlify/functions/noor-sale.mjs').includes('NOOR_STAGING_SALES_ENABLED'),'Backend legato a collaudo');
check('Backend finanza separato',read('netlify/functions/noor-finance.mjs').includes("const expected='noor-collaudo-2026'") && read('netlify/functions/noor-finance.mjs').includes('NOOR_STAGING_FINANCE_ENABLED'),'Finanza legata a collaudo');
check('Shopify di produzione NON compreso',!readdirSync('netlify/functions').some(n=>n.startsWith('shopify-')),'Richiede integrazione verificata con V2.5.84');
const financial=read('netlify/lib/noor-finance-core.mjs');
const notReady=[
 ['Annullamenti e ripristini backend',existsSync('netlify/functions/noor-cancel.mjs'),'Backend dedicato non incluso; operazioni sospese'],
 ['Buoni acquisto utilizzabili',!financial.includes('store credit and external payment refunds deliberately not automated'),'Emissione/spesa buono non automatizzate'],
 ['Rimborsi automatici elettronici',!financial.includes('Solo rimborso contanti contabilizzabile'),'Nessuna integrazione gestore pagamenti'],
 ['Chiusure fiscali definitive',!read('netlify/functions/noor-finance.mjs').includes('finalClosure:false'),'Quadratura non equivale a chiusura fiscale'],
 ['Pubblicazione diretta produzione',!read('netlify.toml').includes('STAGING ONLY'),'Configurazione limitata a localhost e Firebase collaudo']
];
console.log('\n=== PREFLIGHT NOOR V2.5.85 ===');
for(const c of checks) console.log((c.pass?'OK':'ERRORE')+' | '+c.name+' — '+c.meaning);
console.log('\n=== CONDIZIONI DI RILASCIO ANCORA APERTE ===');
for(const [name,done,meaning] of notReady) console.log((done?'OK':'NON PRONTO')+' | '+name+' — '+meaning);
if(checks.some(c=>!c.pass))process.exitCode=2;
else if(notReady.some(c=>!c[1])){console.log('\nESITO: COLLAUDO STAGING CONSENTITO. DEPLOY PRODUZIONE NON AUTORIZZATO.');process.exitCode=3;}
else console.log('\nESITO: verifica statica superata; servono comunque prove end-to-end su Firebase e Shopify.');
