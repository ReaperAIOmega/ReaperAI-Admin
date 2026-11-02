import test from 'node:test';import assert from 'node:assert/strict';
import {canonicalFundingUiEnabled,submitCanonicalFundingDraft} from '../funding-transaction.mjs';
const u=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),key=u(100);
const req={client_id:u(11),business_entity_id:u(21),case_id:null,expected_entity_revision:1,expected_case_revision:0};
const validResult={...req,operation_id:u(101),case_id:u(102),assessment_id:u(103),task_action_id:u(104),case_revision:1,fingerprint:'a'.repeat(64),missing:['repayment_source'],approval_status:'DRAFT',qualification:'READINESS_ONLY',delivery_eligible:false};
test('funding UI stays disabled; prepared adapter performs only canonical RPC',async()=>{
 assert.equal(canonicalFundingUiEnabled,false);let calls=0;
 const result=validResult;
 const io={rpc:async(name,args)=>{calls++;assert.equal(name,'submit_funding_intake');assert.deepEqual(args,{p_key:key,p_request:req});return {data:result,error:null};}};
 assert.deepEqual(await submitCanonicalFundingDraft(io,key,req),result);assert.equal(calls,1);
});
test('network ambiguity retains operation identity; invented authority is rejected',async()=>{
 await assert.rejects(submitCanonicalFundingDraft({rpc:async()=>{throw new Error('lost');}},key,req),e=>e.outcome==='UNKNOWN'&&e.idempotencyKey===key);
 await assert.rejects(submitCanonicalFundingDraft({rpc:async()=>({data:{...req,approval_status:'APPROVED'}})},key,req),e=>e.outcome==='UNKNOWN');
});

test('connection and unknown-completion SQL states preserve the original operation key',async()=>{
 for(const code of ['08006','08007','40003'])await assert.rejects(submitCanonicalFundingDraft({rpc:async()=>({error:{code,message:'Unknown completion'}})},key,req),e=>e.outcome==='UNKNOWN'&&e.idempotencyKey===key);
 for(const code of ['40001','40P01','23514'])await assert.rejects(submitCanonicalFundingDraft({rpc:async()=>({error:{code,message:'Rollback established'}})},key,req),e=>e.outcome==='REJECTED'&&e.idempotencyKey===key);
});


test('malformed canonical identities, missing evidence list and revision are unknown outcomes, never committed UI success',async()=>{
 for(const change of [{operation_id:'invented'},{assessment_id:null},{task_action_id:null},{fingerprint:'not-a-hash'},{case_revision:0},{missing:null},{business_entity_id:u(99)}]){
  await assert.rejects(submitCanonicalFundingDraft({rpc:async()=>({data:{...validResult,...change}})},key,req),e=>e.outcome==='UNKNOWN'&&e.idempotencyKey===key);
 }
});
