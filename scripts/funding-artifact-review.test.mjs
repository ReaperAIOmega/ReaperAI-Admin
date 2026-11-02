import {test} from 'node:test';import assert from 'node:assert/strict';import {blueprintArtifacts as files,blueprintContext as ctx,readArtifact,transitionArtifact,prepareAndVerifyArtifact,localVerificationMatches} from '../funding-artifact-review.mjs';
const runtime={staging:true,url:'https://qemjnekgcbuddayzhdtr.supabase.co'},id=files.pdf.artifact_id;
function metadata(state='REVIEWED'){return{artifact_id:id,request_key:id,created_by:'ab89e54c-bf1f-4572-bc01-493b476687b9',document_id:id,verified_at:'2026-10-31T04:13:37.729833Z',kind:'pdf',file_name:files.pdf.name,bytes:files.pdf.bytes,sha256:files.pdf.sha256,client_id:ctx.client_id,business_entity_id:ctx.business_entity_id,funding_case_id:ctx.funding_case_id,recipient_id:'78dfaec9-27a6-48c3-a1cf-a1a63ecabb71',scope:'SYNTHETIC_READINESS',calculation_version:'independent-corrected-v1',revision:3,source_context:{...ctx,evidence_refs:[]},state,storage_current:true,verified_sha256:files.pdf.sha256};}
const store={getItem:()=>JSON.stringify({artifact_id:id,key:id})};
test('wrong environment and altered local bytes stop before canonical writes',async()=>{let calls=0;const s={rpc:async()=>{calls++;}};await assert.rejects(prepareAndVerifyArtifact(s,{...runtime,staging:false},store,'pdf',null));await assert.rejects(prepareAndVerifyArtifact(s,runtime,store,'pdf',{name:files.pdf.name,size:files.pdf.bytes,arrayBuffer:async()=>new ArrayBuffer(files.pdf.bytes)}),/bytes do not match/);assert.equal(calls,0);});
test('matching local claims cannot replace authenticated current artifact authority',async()=>{const a=metadata();a.source_context.source_sha256='f'.repeat(64);await assert.rejects(readArtifact({rpc:async()=>({data:a})},runtime,store,'pdf'),/could not be verified/);});
test('approval requires explicit human confirmation before any RPC',async()=>{let calls=0;await assert.rejects(transitionArtifact({rpc:async()=>{calls++;}},runtime,metadata(),'APPROVED','Synthetic review'),/human/);assert.equal(calls,0);});
test('canonical reread rejects stale revisions or wrong identity before a transition',async()=>{for(const change of [a=>a.revision++,a=>a.client_id='other']){let writes=0;const a=metadata();change(a);const s={rpc:async name=>{if(name==='transition_funding_artifact')writes++;return{data:a};}};await assert.rejects(transitionArtifact(s,runtime,metadata(),'APPROVED','Exact synthetic review',{humanConfirmed:true}),/Canonical review version changed/);assert.equal(writes,0);}});
test('exact version/hash is passed only after canonical reread; unknown commit stays unknown',async()=>{const calls=[];const a=metadata('DRAFT');const s={rpc:async(name,args)=>{calls.push({name,args});return name==='read_funding_artifact_upload'?{data:a}:{data:{artifact_id:id,state:'REVIEW_REQUESTED',revision:4,sha256:a.sha256}};}};await transitionArtifact(s,runtime,a,'REVIEW_REQUESTED','Technical checks complete; human review pending');assert.equal(calls[1].args.p_expected_revision,3);assert.equal(calls[1].args.p_expected_sha256,a.sha256);
 s.rpc=async name=>name==='read_funding_artifact_upload'?{data:a}:{error:{code:'08007',message:'Commit unknown'}};await assert.rejects(transitionArtifact(s,runtime,a,'REVIEW_REQUESTED','Technical review'),e=>e.outcome==='UNKNOWN');});

test('wrong valid saved key cannot become a changed-payload creation probe',async()=>{
 const calls=[],a=metadata('DRAFT'),wrongStore={getItem:()=>JSON.stringify({artifact_id:id,key:'22222222-2222-4222-8222-222222222222'})};
 const s={rpc:async name=>{calls.push(name);return{data:a};}};
 await assert.rejects(readArtifact(s,runtime,wrongStore,'pdf'),/could not be verified/);
 assert.deepEqual(calls,['read_funding_artifact_upload']);
});

test('changed storage snapshot cannot validate a different captured mutation key',async()=>{
 let calls=0;const captured={artifact_id:id,key:'22222222-2222-4222-8222-222222222222'};
 await assert.rejects(readArtifact({rpc:async()=>{calls++;return{data:metadata()};}},runtime,store,'pdf',captured),/operation changed/);
 assert.equal(calls,0);
});

test('missing tab identity recovers only named v5 authority and original request key without preparation',async()=>{
 for(const kind of ['pdf','xlsx']){
  let raw=null;const calls=[],file=files[kind],a={...metadata('REVIEW_REQUESTED'),artifact_id:file.artifact_id,kind,file_name:file.name,bytes:file.bytes,sha256:file.sha256,verified_sha256:file.sha256};
  const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
  const result=await readArtifact({rpc:async(name,args)=>{calls.push({name,args});return{data:a};}},runtime,storage,kind);
  assert.equal(result.artifact_id,file.artifact_id);assert.deepEqual(calls.map(x=>x.name),['read_funding_artifact_upload']);
  assert.equal(calls[0].args.p_artifact,file.artifact_id);
  assert.equal(JSON.parse(raw).key,a.request_key);assert.equal(JSON.parse(raw).artifact_id,file.artifact_id);
 }
});
test('valid wrong artifact identity cannot be substituted or prepared',async()=>{
 let calls=0;const storage={getItem:()=>JSON.stringify({artifact_id:'22222222-2222-4222-8222-222222222222',key:id})};
 await assert.rejects(readArtifact({rpc:async()=>{calls++;}},runtime,storage,'pdf'),/named v5 artifact/);assert.equal(calls,0);
});
test('canonical source mismatch cannot seed recovered local authority',async()=>{
 let writes=0;const a=metadata();a.source_context={...a.source_context,source_sha256:'f'.repeat(64)};
 await assert.rejects(readArtifact({rpc:async()=>({data:a})},runtime,{getItem:()=>null,setItem:()=>{writes++;}},'pdf'),/could not be verified/);assert.equal(writes,0);
});
test('concurrent local operation is never overwritten during canonical recovery',async()=>{
 let raw=null,writes=0;
 const storage={getItem:()=>raw,setItem:()=>{writes++;}};
 await assert.rejects(readArtifact({rpc:async()=>{raw=JSON.stringify({artifact_id:id,key:id});return{data:metadata()};}},runtime,storage,'pdf'),/changed during recovery/);assert.equal(writes,0);
});

test('technical receipt survives refresh only against matching fresh canonical metadata',()=>{
 const a=metadata('REVIEW_REQUESTED'),fields=['artifact_id','request_key','kind','sha256','bytes','document_id','verified_at','source_version','source_sha256'];
 const receipt={version:1,...Object.fromEntries(fields.map(k=>[k,k.startsWith('source_')?a.source_context[k]:a[k]]))};
 const storage={getItem:()=>JSON.stringify(receipt)};
 assert.equal(localVerificationMatches(storage,'pdf',a),true);
 for(const change of [b=>b.storage_current=false,b=>b.sha256='f'.repeat(64),b=>b.document_id='22222222-2222-4222-8222-222222222222',b=>b.request_key='22222222-2222-4222-8222-222222222222',b=>b.source_context={...b.source_context,source_sha256:'f'.repeat(64)}]){
  const b={...a};change(b);assert.equal(localVerificationMatches(storage,'pdf',b),false);
 }
});
