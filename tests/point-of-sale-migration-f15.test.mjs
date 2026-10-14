import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sections=readFileSync(new URL('../assets/js/sections.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
test('F15 fails closed on stale migration preview without legacyReview',()=>{
 assert.match(sections,/Array\.isArray\(preview\.legacyReview\)/);
 assert.match(sections,/posMigrationState=null/);
 assert.match(sections,/Nessuna scrittura effettuata/);
});
test('F15 independently busts module and service worker cache',()=>{
 assert.match(sections,/point-of-sale-migration\.mjs\?v=2\.5\.85-f18/);
 assert.match(app,/sections\.js\?v=2\.5\.85-f19/);
 assert.match(index,/app\.js\?v=2\.5\.85-f19/);
 assert.match(sw,/noor-v2\.5\.85-f21/);
});
