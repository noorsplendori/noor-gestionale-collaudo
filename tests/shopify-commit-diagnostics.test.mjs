import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCommitError} from '../netlify/functions/shopify-reconciliation-apply.mjs';
test('Firestore precondition error classified without leaking raw details',()=>{
 const v=classifyCommitError(409,{error:{status:'FAILED_PRECONDITION',message:'Precondition failed on sensitive product 123'}});
 assert.deepEqual(v,{httpStatus:409,rpcStatus:'FAILED_PRECONDITION',category:'precondition'});
 assert.ok(!JSON.stringify(v).includes('123'));
});
test('Unrecognized error codes never copied to diagnostic',()=>{
 const v=classifyCommitError(400,{error:{status:'TOKEN_XYZ',message:'private_key=ABC'}});
 assert.deepEqual(v,{httpStatus:400,rpcStatus:'UNKNOWN',category:'unclassified'});
});
test('Field path errors distinguishable',()=>{
 assert.equal(classifyCommitError(400,{error:{status:'INVALID_ARGUMENT',message:'Invalid field path'}}).category,'field_mask');
});
