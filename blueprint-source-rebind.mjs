// Update the existing synthetic case for exact verified repository bytes. No new entity/case fallback.
export const repositoryModelSha256='b1806e8856a75947006ad7f78d132b7f33e1524a027c194b864e33b475dda279';
export const sourceRebindKey='reaper.qemjnekgcbuddayzhdtr.blueprint-source.549fd254.v1';
const admin='ab89e54c-bf1f-4572-bc01-493b476687b9',client='b886bc64-e931-46df-8451-e8ae08de46e8',entity='30b59eb5-2d35-4616-86a1-4addbad18473',caseId='676f5bf7-2ae8-4c6c-b618-a6f0465f984f';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function rpc(s,name,args){let r;try{r=await s.rpc(name,args);}catch{throw Object.assign(Error('Outcome unknown; retain the saved operation key'),{outcome:'UNKNOWN'});}if(r.error)throw Object.assign(Error(r.error.message??'Canonical operation rejected'),{code:r.error.code,outcome:/^(?:(?:22|23|42)[A-Z0-9]{3}|40001|40P01)$/.test(r.error.code??'')?'REJECTED':'UNKNOWN'});return r.data;}
export async function rebindBlueprintSource(s,runtime,storage){
 if(!runtime.staging||runtime.url!=='https://qemjnekgcbuddayzhdtr.supabase.co')throw Error('Approved staging only');
 const who=await s.auth.getUser(),aal=await s.auth.mfa.getAuthenticatorAssuranceLevel();
 if(who.error||who.data?.user?.id!==admin||aal.error||aal.data?.currentLevel!=='aal2')throw Error('Designated administrator and genuine AAL2 required');
 const request={client_id:client,business_entity_id:entity,case_id:caseId,expected_entity_revision:1,expected_case_revision:1,use_of_funds:'Fictional equipment/buildout/working-capital/reserve model REAPER-FUNDING-250K-001 independent-corrected-v1; model_sha256='+repositoryModelSha256,amount_requested:250000,time_horizon:'Synthetic model dates as of 2026-10-25; no application timeline',repayment_source:null,underwriting:{annual_revenue:2640000,average_monthly_revenue:220000,existing_monthly_debt:1657}};
 let saved=JSON.parse(storage.getItem(sourceRebindKey)||'null');
 if(!saved){
  const prior=await rpc(s,'read_funding_task_context',{p_task_id:'3caf446b-1d5e-4549-ae6a-35df98743a4e'});
  if(prior?.funding_case_id!==caseId||prior.client_id!==client||prior.business_entity_id!==entity||prior.source_sha256!=='f98bb0edf0268fa7ee43b8df92a01775fdaaf00e4c0c2d5494c63574627fcb5c')throw Error('Existing source version differs; do not recreate the case');
  saved={schema:'reaper.blueprint-source-rebind/1',principal_id:admin,key:crypto.randomUUID(),request};storage.setItem(sourceRebindKey,JSON.stringify(saved));
 }
 if(saved.schema!=='reaper.blueprint-source-rebind/1'||saved.principal_id!==admin||!uuid.test(saved.key??'')||JSON.stringify(saved.request)!==JSON.stringify(request))throw Error('Saved operation identity differs; do not replace it');
 // Retry the canonical operation before reading the old context: a committed update makes the old context stale.
 const operation=await rpc(s,'submit_funding_intake',{p_key:saved.key,p_request:request});
 if(!operation||operation.case_id!==caseId||operation.client_id!==client||operation.business_entity_id!==entity||operation.case_revision!==2||operation.qualification!=='READINESS_ONLY'||operation.approval_status!=='DRAFT'||operation.delivery_eligible!==false||!uuid.test(operation.task_action_id??'')||!uuid.test(operation.assessment_id??'')||!uuid.test(operation.operation_id??'')||!/^[0-9a-f]{64}$/.test(operation.fingerprint??''))throw Object.assign(Error('Canonical result unverified; retry the same saved key'),{outcome:'UNKNOWN'});
 const context=await rpc(s,'read_funding_task_context',{p_task_id:operation.task_action_id});
 if(context?.funding_case_id!==caseId||context.client_id!==client||context.business_entity_id!==entity||context.task_action_id!==operation.task_action_id||context.source_sha256!==operation.fingerprint||context.source_version!=='funding-v1:'+operation.assessment_id)throw Error('Canonical context mismatch');
 const report={kind:'SIGNED_HTTP_SYNTHETIC_FUNDING',scenario:'blueprint',model_sha256:repositoryModelSha256,principal_id:admin,operation,canonical_context:context,reported_request:request,passed:true,observed_at:new Date().toISOString(),limitations:['Source byte revision only; financial values unchanged.','No evidence verification, financing approval, artifact approval or delivery authority.']};storage.setItem(sourceRebindKey+'.result',JSON.stringify(report));return report;
}
