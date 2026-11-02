import test from 'node:test';import assert from 'node:assert/strict';import {submitRecoverableFundingDraft as submit,canonicalFundingUiEnabled} from '../funding-transaction.mjs';
const u=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),key=u(100),runtime={staging:true,url:'https://qemjnekgcbuddayzhdtr.supabase.co'};
const input={client_id:u(11),business_entity_id:u(21),case_id:null,expected_entity_revision:1,expected_case_revision:0,amount_requested:250000,use_of_funds:'Synthetic written readiness blueprint',time_horizon:'Unknown',repayment_source:null,underwriting:{}};
function fixture({lost=false,aal='aal2'}={}){
 const values=new Map(),calls=[],commits=new Map();let losses=lost?1:0;
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const s={auth:{getUser:async()=>({data:{user:{id:u(1)}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:aal}})}},rpc:async(name,args)=>{
  calls.push(structuredClone(args));assert.equal(name,'submit_funding_intake');
  if(!commits.has(args.p_key))commits.set(args.p_key,{operation_id:u(101),case_id:u(102),assessment_id:u(103),task_action_id:u(104),client_id:input.client_id,business_entity_id:input.business_entity_id,case_revision:1,fingerprint:'a'.repeat(64),missing:['repayment_source'],qualification:'READINESS_ONLY',approval_status:'DRAFT',delivery_eligible:false});
  if(losses-->0)throw Error('lost after database commit');return{data:commits.get(args.p_key)};
 }};
 return{s,storage,values,calls,commits};
}
test('lost post-commit response and tab reload replay the original key and frozen request; one canonical operation',async()=>{
 const f=fixture({lost:true});await assert.rejects(submit(f.s,runtime,f.storage,key,input),e=>e.outcome==='UNKNOWN');
 assert.equal(f.commits.size,1);assert.equal(JSON.parse([...f.values.values()][0]).state,'PENDING');
 const r=await submit(f.s,runtime,f.storage,key,structuredClone(input));assert.equal(r.operation_id,u(101));assert.equal(f.commits.size,1);assert.deepEqual(f.calls[0],f.calls[1]);
 assert.equal(JSON.parse([...f.values.values()][0]).state,'COMMITTED');
});
test('changed amount, client, entity or case under a saved operation cannot replace the uncertain request',async()=>{
 for(const change of [{amount_requested:50000},{client_id:u(12)},{business_entity_id:u(22)},{case_id:u(99)}]){
  const f=fixture({lost:true});await assert.rejects(submit(f.s,runtime,f.storage,key,input));await assert.rejects(submit(f.s,runtime,f.storage,key,{...input,...change}),/conflict/);assert.equal(f.calls.length,1);
 }
});
test('AAL1, production and non-durable storage fail before any funding transaction',async()=>{
 assert.equal(canonicalFundingUiEnabled,false);
 for(const [options,rt] of [[{aal:'aal1'},runtime],[{}, {...runtime,staging:false}]]){
  const f=fixture(options);await assert.rejects(submit(f.s,rt,f.storage,key,input));assert.equal(f.calls.length,0);
 }
 const f=fixture();f.storage.setItem=()=>{throw Error('quota unavailable');};await assert.rejects(submit(f.s,runtime,f.storage,key,input));assert.equal(f.calls.length,0);
});
test('previously committed local result cannot grant authority without a new canonical replay',async()=>{
 const f=fixture();await submit(f.s,runtime,f.storage,key,input);f.s.rpc=async()=>({error:{code:'42501',message:'account suspended'}});
 await assert.rejects(submit(f.s,runtime,f.storage,key,input),e=>e.outcome==='REJECTED');
});

test('tampered saved payload cannot hide beneath an unchanged local request fingerprint',async()=>{
 const f=fixture({lost:true});await assert.rejects(submit(f.s,runtime,f.storage,key,input));
 const k=[...f.values.keys()][0],saved=JSON.parse(f.values.get(k));saved.request.amount_requested=1;f.values.set(k,JSON.stringify(saved));
 await assert.rejects(submit(f.s,runtime,f.storage,key,input),/conflict/);assert.equal(f.calls.length,1);
});

test('existing falsy or malformed durable records are preserved and rejected, never treated as a new operation',async()=>{
 for(const raw of ['null','false','0','""','','[]','{}']){
  const f=fixture(),k='reaper.qemjnekgcbuddayzhdtr.funding-operation.v1.'+u(1)+'.'+key;f.values.set(k,raw);
  await assert.rejects(submit(f.s,runtime,f.storage,key,input));assert.equal(f.calls.length,0);assert.equal(f.values.get(k),raw);
 }
});
