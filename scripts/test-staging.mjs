// Staging regression suite excludes Shopify production-only integration tests.
// Do not remove those tests: run them against the full production candidate.
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const tests=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')&&!name.startsWith('shopify-')).sort().map(name=>'tests/'+name);
if(!tests.length)throw new Error('No staging tests discovered');
const run=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit'});
if(run.error)throw run.error;
process.exit(run.status ?? 1);
