import {submitRecoverableFundingDraft} from './funding-transaction.mjs';
// Synthetic development driver over genuine signed SDK requests. Never receives or exports credentials.
// admin/ownerA/ownerB are genuine Auth IDs; clientA/clientB are distinct canonical clients.id values.
export const identities=Object.freeze({admin:'ab89e54c-bf1f-4572-bc01-493b476687b9',clientA:'b886bc64-e931-46df-8451-e8ae08de46e8',clientB:'3df735ac-2756-492d-8042-73bfe06ae1ab',ownerA:'78dfaec9-27a6-48c3-a1cf-a1a63ecabb71',ownerB:'b4dd0968-e4f5-4ffc-812d-1f6f824d26cf'});
export const syntheticProfileMutationEnabled=false;
export const acceptanceRecordKey='reaper.qemjnekgcbuddayzhdtr.funding-acceptance.v1';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function held(runtime){if(!runtime.staging||runtime.url!=='https://qemjnekgcbuddayzhdtr.supabase.co')throw Error('Synthetic staging only');}
export async function recordAal1Denial(supabase,runtime,storage){
 held(runtime);
 const {data:who,error:userError}=await supabase.auth.getUser();if(userError||who?.user?.id!==identities.admin)throw Error('Genuine designated administrator required');
 const {data:assurance,error:aalError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(aalError||assurance?.currentLevel!=='aal1')throw Error('AAL1 session required for this denial check');
 const r=await supabase.rpc('read_funding_task_context',{p_task_id:'fb8d8792-b977-4300-95e1-e3e66d032a13'});
 const report={kind:'SIGNED_HTTP_AAL1_DENIAL',principal_id:who.user.id,expected_aal:'aal1',passed:r.error?.code==='42501'&&/AAL2/.test(r.error?.message??''),code:r.error?.code??null,observed_at:new Date().toISOString()};
 storage.setItem(acceptanceRecordKey+'.aal1',JSON.stringify(report));return report;
}
export const independentBlueprintModelSha256='0c52d642a9e9c5bb30bf8f3b872e35b682d92dc958c33b0ea22ddde7b612c07f';
export async function runFundingAcceptance(supabase,runtime,storage,scenario='inventory'){
 held(runtime);if(!['inventory','blueprint'].includes(scenario))throw Error('Unknown synthetic scenario');
 const blueprint=scenario==='blueprint',recordKey=acceptanceRecordKey+(blueprint?'.blueprint':'');
 const {data:who,error:userError}=await supabase.auth.getUser();if(userError||who?.user?.id!==identities.admin)throw Error('Genuine designated administrator required');
 const {data:assurance,error:aalError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(aalError||assurance?.currentLevel!=='aal2')throw Error('Actual administrator MFA required');
 const profile=await supabase.from('profiles').select('id,role,status').eq('id',identities.admin).single();if(profile.error||profile.data?.role!=='admin'||profile.data?.status!=='active')throw Error('Active designated administrator required');
 for (const [id,owner] of [[identities.clientA,identities.ownerA],[identities.clientB,identities.ownerB]]) {
  const c=await supabase.from('clients').select('id,profile_id,status').eq('id',id).single();
  if(c.error||c.data?.id!==id||c.data?.profile_id!==owner||c.data?.status!=='active')throw Error('Canonical synthetic client ownership differs from approved mapping');
 }
 let state=JSON.parse(storage.getItem(recordKey)||'null');
 if(!state){state={schema:'reaper.synthetic-funding-operation/1',scenario,principal_id:identities.admin,entity_id:crypto.randomUUID(),operation_key:crypto.randomUUID(),negative_key:crypto.randomUUID(),ownership_key:crypto.randomUUID()};storage.setItem(recordKey,JSON.stringify(state));}
 if((state.scenario??'inventory')!==scenario||state.schema!=='reaper.synthetic-funding-operation/1'||state.principal_id!==identities.admin||!['entity_id','operation_key','negative_key','ownership_key'].every(k=>typeof state[k]==='string'&&uuid.test(state[k])))throw Error('Stored synthetic operation identity is invalid; do not invent a retry key');
 const entity={id:state.entity_id,client_id:identities.clientA,legal_name:blueprint?'Kestrel Mill Foods LLC (SYNTHETIC)':'Fictional Signed Acceptance A LLC',entity_type:'LLC',formation_state:'GA',created_by:identities.admin};
 const readEntity=()=>supabase.from('business_entities').select('id,client_id,legal_name,status,identity_revision,created_by').eq('id',state.entity_id).maybeSingle();
 let found=await readEntity();if(found.error)throw Error('Entity lookup unavailable; retry same saved identity');
 if(!found.data){await supabase.from('business_entities').insert(entity);found=await readEntity();}
 if(found.error||!found.data||found.data.id!==entity.id||found.data.client_id!==entity.client_id||found.data.created_by!==entity.created_by||found.data.legal_name!==entity.legal_name||found.data.status!=='active'||found.data.identity_revision!==1)throw Error('Entity outcome unverified; preserve saved operation identity');
 const request={client_id:identities.clientA,business_entity_id:state.entity_id,case_id:null,expected_entity_revision:1,expected_case_revision:0,use_of_funds:blueprint?'Fictional equipment/buildout/working-capital/reserve model REAPER-FUNDING-250K-001 independent-corrected-v1; model_sha256='+independentBlueprintModelSha256:'Fictional inventory for signed staging acceptance',amount_requested:blueprint?250000:20000,time_horizon:blueprint?'Synthetic model dates as of 2026-10-25; no application timeline':'90 days',repayment_source:null,underwriting:blueprint?{annual_revenue:2640000,average_monthly_revenue:220000,existing_monthly_debt:1657}:{}};
 const submit=payload=>supabase.rpc('submit_funding_intake',{p_key:state.operation_key,p_request:payload});
 const recover=async()=>({data:await submitRecoverableFundingDraft(supabase,runtime,storage,state.operation_key,request),error:null});
 const [a,b]=await Promise.all([recover(),recover()]);
 const valid=r=>!r.error&&r.data?.client_id===identities.clientA&&r.data?.business_entity_id===state.entity_id&&r.data?.qualification==='READINESS_ONLY'&&r.data?.approval_status==='DRAFT'&&r.data?.delivery_eligible===false&&Number.isInteger(r.data?.case_revision)&&r.data.case_revision>0&&/^[0-9a-f]{64}$/.test(r.data?.fingerprint??'')&&['operation_id','case_id','assessment_id','task_action_id'].every(k=>uuid.test(r.data[k]??''));
 if(!valid(a)||!valid(b)||JSON.stringify(a.data)!==JSON.stringify(b.data))throw Error('Transaction outcomes not verified. Retry using the saved operation key.');
 const conflict=await submit({...request,amount_requested:request.amount_requested+1000});
 const forged=await supabase.rpc('submit_funding_intake',{p_key:state.negative_key,p_request:{...request,approval_status:'APPROVED'}});
 const ownership=await supabase.rpc('submit_funding_intake',{p_key:state.ownership_key,p_request:{...request,client_id:identities.clientB}});
 const context=await supabase.rpc('read_funding_task_context',{p_task_id:a.data.task_action_id});
 const checks={parallel_signed_same_key_replay:true,changed_payload_rejected:conflict.error?.code==='22023',caller_approval_rejected:forged.error?.code==='22023',wrong_client_entity_rejected:ownership.error?.code==='42501',missing_repayment_identified:Array.isArray(a.data.missing)&&a.data.missing.includes('repayment_source'),canonical_context_read:!context.error&&context.data?.funding_case_id===a.data.case_id&&context.data?.client_id===a.data.client_id&&context.data?.business_entity_id===a.data.business_entity_id&&context.data?.task_action_id===a.data.task_action_id&&context.data?.source_version==='funding-v1:'+a.data.assessment_id&&context.data?.source_sha256===a.data.fingerprint};
 const report={kind:'SIGNED_HTTP_SYNTHETIC_FUNDING',scenario,canonical_context:context.error?null:context.data,reported_request:request,model_sha256:blueprint?independentBlueprintModelSha256:null,principal_id:identities.admin,operation:a.data,checks,passed:Object.values(checks).every(Boolean),observed_at:new Date().toISOString(),limitations:['No document approval, storage, delivery or client sign-in acceptance is implied.','Parallel signed HTTP replay is distinct from native SQL session-blocking evidence.']};
 storage.setItem(recordKey+'.result',JSON.stringify(report));return report;
}

export async function setSyntheticClientSuspension(supabase,runtime,suspended){
 held(runtime);if(typeof suspended!=='boolean')throw Error('Explicit suspension state required');
 const {data:who,error}=await supabase.auth.getUser();const aal=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
 if(error||who?.user?.id!==identities.admin||aal.error||aal.data?.currentLevel!=='aal2')throw Error('Designated signed AAL2 administrator required');
 const p=await supabase.from('profiles').select('id,role,status').eq('id',identities.admin).single();if(p.error||p.data?.role!=='admin'||p.data?.status!=='active')throw Error('Active administrator required');
 const c=await supabase.from('clients').select('id,profile_id').eq('id',identities.clientA).single();if(c.error||c.data?.id!==identities.clientA||c.data?.profile_id!==identities.ownerA)throw Error('Approved ownership mapping required');
 const status=suspended?'suspended':'active';
 const result=await supabase.from('profiles').update({status}).eq('id',identities.ownerA).eq('role','client').select('id,role,status').single();
 if(result.error||result.data?.id!==identities.ownerA||result.data?.role!=='client'||result.data?.status!==status)throw Object.assign(Error('Suspension outcome unverified: '+(result.error?.message??'canonical response mismatch')),{code:result.error?.code??'UNVERIFIED'});
 return {kind:'SIGNED_HTTP_SYNTHETIC_SUSPENSION',principal_id:identities.admin,target_profile_id:identities.ownerA,status,observed_at:new Date().toISOString()};
}
