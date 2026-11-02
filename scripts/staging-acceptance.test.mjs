import {test} from 'node:test';import assert from 'node:assert/strict';import {runFundingAcceptance,recordAal1Denial,identities,acceptanceRecordKey} from '../staging-acceptance.mjs';
const runtime={staging:true,url:'https://qemjnekgcbuddayzhdtr.supabase.co'};
function fixture({aal='aal2',lose=false,wrong=false,profileStatus='active',wrongContext=false}={}){
 const saved=new Map(),entities=new Map(),operations=new Map(),calls=[];let lost=lose;
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
 const supabase={auth:{getUser:async()=>({data:{user:{id:identities.admin}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:aal}})}},from(table){let id;const q={select(){return q;},eq(_,value){id=value;return q;},single:async()=>({data:table==='clients'?{id,profile_id:id===identities.clientA?identities.ownerA:identities.ownerB,status:'active'}:{role:'admin',status:profileStatus}}),maybeSingle:async()=>({data:entities.get(id)||null}),insert:async row=>{calls.push('insert');entities.set(row.id,{...row,status:'active',identity_revision:1});return{error:null};}};return q;},async rpc(name,args){
 calls.push({name,args:structuredClone(args)});
 if(name==='read_funding_task_context'){
 if(aal==='aal1')return{error:{code:'42501',message:'Active administrator with AAL2 required'}};
 const op=[...operations.values()].find(v=>v.data.task_action_id===args.p_task_id)?.data;
 return{data:op?{funding_case_id:op.case_id,client_id:wrongContext?identities.clientB:op.client_id,business_entity_id:op.business_entity_id,task_action_id:op.task_action_id,source_version:'funding-v1:'+op.assessment_id,source_sha256:op.fingerprint}:null};
 }
 const r=args.p_request;
 if(r.approval_status)return{error:{code:'22023'}};
 if(r.client_id!==identities.clientA)return{error:{code:'42501'}};
 const old=operations.get(args.p_key);if(old&&JSON.stringify(old.request)!==JSON.stringify(r))return{error:{code:'22023'}};
 const data=old?.data??{operation_id:crypto.randomUUID(),client_id:wrong?identities.clientB:r.client_id,business_entity_id:r.business_entity_id,case_id:crypto.randomUUID(),assessment_id:crypto.randomUUID(),task_action_id:crypto.randomUUID(),fingerprint:'a'.repeat(64),case_revision:1,qualification:'READINESS_ONLY',approval_status:'DRAFT',delivery_eligible:false,missing:['repayment_source']};
 operations.set(args.p_key,{request:structuredClone(r),data});if(lost){lost=false;throw Error('lost response');}return{data};
 }};return{supabase,storage,saved,calls,operations};
}
test('production, AAL1 and inactive administrator cannot create synthetic records',async()=>{
 for(const [options,config]of [[{}, {...runtime,staging:false}],[{aal:'aal1'},runtime],[{profileStatus:'suspended'},runtime]]){const f=fixture(options);await assert.rejects(runFundingAcceptance(f.supabase,config,f.storage));assert.equal(f.calls.length,0);}
});
test('durable operation identity is written before any entity or case mutation',async()=>{const f=fixture();f.storage.setItem=()=>{throw Error('storage unavailable');};await assert.rejects(runFundingAcceptance(f.supabase,runtime,f.storage));assert.equal(f.calls.length,0);});
test('interrupted signed transaction retries the same entity and operation; original result and holds retained',async()=>{
 const f=fixture({lose:true});await assert.rejects(runFundingAcceptance(f.supabase,runtime,f.storage));const before=f.saved.get(acceptanceRecordKey);const reopenedStorage={getItem:k=>f.saved.get(k)||null,setItem:(k,v)=>f.saved.set(k,v)};const r=await runFundingAcceptance(f.supabase,runtime,reopenedStorage);assert.equal(r.passed,true);assert.equal(f.saved.get(acceptanceRecordKey),before);assert.equal(f.operations.size,1);assert.equal(f.calls.filter(x=>x==='insert').length,1);assert.equal(r.operation.approval_status,'DRAFT');assert.equal(r.operation.delivery_eligible,false);
});
test('a mismatched successful canonical response cannot be reported as accepted',async()=>{const f=fixture({wrong:true});await assert.rejects(runFundingAcceptance(f.supabase,runtime,f.storage));assert.ok(!f.saved.has(acceptanceRecordKey+'.result'));});
test('AAL1 evidence requires the actual canonical AAL2 authorization error, not generic rejection',async()=>{
 const f=fixture({aal:'aal1'});assert.equal((await recordAal1Denial(f.supabase,runtime,f.storage)).passed,true);
 f.supabase.rpc=async()=>({error:{code:'42501',message:'Unknown case'}});assert.equal((await recordAal1Denial(f.supabase,runtime,f.storage)).passed,false);
 await assert.rejects(recordAal1Denial(f.supabase,{...runtime,staging:false},f.storage));
});

test('mismatched canonical source authority cannot pass the acceptance report',async()=>{const f=fixture({wrongContext:true});const r=await runFundingAcceptance(f.supabase,runtime,f.storage);assert.equal(r.passed,false);assert.equal(r.checks.canonical_context_read,false);});
test('browser driver persists operation identities across tab closure without touching credential storage',async()=>{
 const {readFile}=await import('node:fs/promises');const ui=await readFile(new URL('../staging-acceptance-ui.js',import.meta.url),'utf8');assert.match(ui,/localStorage/);assert.doesNotMatch(ui,/sessionStorage|access_token|refresh_token/);
});

test('independent blueprint uses its own persistent entity/key and exact model input reference',async()=>{
 const f=fixture();const inventory=await runFundingAcceptance(f.supabase,runtime,f.storage);const original=f.saved.get(acceptanceRecordKey);
 const blueprint=await runFundingAcceptance(f.supabase,runtime,f.storage,'blueprint');assert.equal(blueprint.passed,true);assert.notEqual(blueprint.operation.case_id,inventory.operation.case_id);assert.notEqual(blueprint.operation.business_entity_id,inventory.operation.business_entity_id);assert.equal(f.saved.get(acceptanceRecordKey),original);assert.equal(blueprint.reported_request.amount_requested,250000);assert.equal(blueprint.reported_request.underwriting.annual_revenue,2640000);assert.ok(blueprint.reported_request.use_of_funds.includes(blueprint.model_sha256));assert.equal(blueprint.operation.approval_status,'DRAFT');assert.equal(blueprint.operation.delivery_eligible,false);
 const again=await runFundingAcceptance(f.supabase,runtime,f.storage,'blueprint');assert.equal(again.operation.case_id,blueprint.operation.case_id);assert.equal(f.operations.size,2);
});
