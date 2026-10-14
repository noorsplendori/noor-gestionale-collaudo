import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAllowedVariants,isVariantAuthorized} from '../netlify/functions/shopify-auto-sync-allowlist.mjs';
const a='gid://shopify/ProductVariant/55358337155399';
const b='gid://shopify/ProductVariant/123';
test('ALL is explicit and case sensitive',()=>{assert.equal(isVariantAuthorized('ALL',a),true);assert.equal(isVariantAuthorized('all',a),false);assert.equal(isVariantAuthorized(' ALL ',b),true)});
test('empty and malformed lists fail closed',()=>{for(const v of ['',undefined,',',a+',',a+','+a,'ALL,'+a,'*'])assert.equal(parseAllowedVariants(v).valid,false)});
test('limited rollout remains strictly limited',()=>{assert.equal(isVariantAuthorized(a,a),true);assert.equal(isVariantAuthorized(a,b),false);assert.equal(isVariantAuthorized(a+','+b,b),true)});
