import {normalizedRequest} from './funding-transaction.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function sorted(v){return Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;}
const unknown=key=>Object.assign(Error('Outcome unknown. Recover this intake with the original operation key and frozen request.'),{outcome:'UNKNOWN',idempotencyKey:key});
export async function linkExistingIntake(s,runtime,storage,key,intake,input,{signal}={}){
 if(!runtime.staging||runtime.url!=='https://qemjnekgcbuddayzhdtr.supabase.co')throw Error('Isolated staging only');
 if(!uuid.test(intake??''))throw Error('Canonical intake UUID required');
 const who=await s.auth.getUser(),aal=await s.auth.mfa.getAuthenticatorAssuranceLevel();
 if(who.error||!uuid.test(who.data?.user?.id??'')||aal.error||aal.data?.currentLevel!=='aal2')throw Error('Signed AAL2 administrator required');
 key=key.toLowerCase();intake=intake.toLowerCase();
 const request=normalizedRequest(key,input),principal=who.data.user.id.toLowerCase();
 const wire=JSON.stringify(sorted({intake,request})),slot='reaper.existing-intake.v1.'+principal+'.'+key;
 const raw=storage.getItem(slot);let saved;
 try{saved=raw===null?null:JSON.parse(raw);}catch{throw Error('Stored operation corrupt; preserve original key');}
 if(raw!==null&&(!saved||saved.schema!==1||saved.principal!==principal||saved.key!==key||saved.wire!==wire||!['PENDING','COMMITTED'].includes(saved.state)||JSON.stringify(sorted({intake:saved.intake,request:normalizedRequest(saved.key,saved.request)}))!==wire))throw Error('Stored operation conflict; preserve original request');
 if(raw===null){saved={schema:1,principal,key,intake,request,wire,state:'PENDING'};storage.setItem(slot,JSON.stringify(saved));}
 let response;
 try{let call=s.rpc('link_existing_funding_intake',{p_key:key,p_intake_id:saved.intake,p_funding_request:saved.request});if(signal)call=call.abortSignal(signal);response=await call;}catch{throw unknown(key);}
 if(response.error)throw Object.assign(Error(response.error.message),{outcome:/^(?:(?:22|23|42)[A-Z0-9]{3}|40001|40P01)$/.test(response.error.code??'')?'REJECTED':'UNKNOWN',idempotencyKey:key,code:response.error.code});
 const r=response.data,f=r?.funding_result;
 if(!r||r.intake_id!==intake||r.client_id!==request.client_id||r.business_entity_id!==request.business_entity_id||!uuid.test(r.operation_id??'')||!/^[a-f0-9]{64}$/.test(r.fingerprint??'')||r.workflow_state!=='READINESS_ONLY'||r.identity_evidence_verified!==false||r.new_auth_identity_created!==false||r.payment_initiated!==false||r.association_basis!=='ADMIN_SELECTED_EXISTING_ACCOUNT_WITH_VERIFIED_AUTH_EMAIL_MATCH'
 ||!f||f.client_id!==request.client_id||f.business_entity_id!==request.business_entity_id||(request.case_id&&f.case_id!==request.case_id)||!['operation_id','case_id','assessment_id','task_action_id'].every(k=>uuid.test(f[k]??''))||!Number.isSafeInteger(f.case_revision)||f.case_revision<1||!/^[a-f0-9]{64}$/.test(f.fingerprint??'')||f.qualification!=='READINESS_ONLY'||f.approval_status!=='DRAFT'||f.delivery_eligible!==false||!Array.isArray(f.missing)||f.missing.some(v=>typeof v!=='string'))throw unknown(key);
 try{const latest=JSON.parse(storage.getItem(slot));if(!latest||latest.wire!==wire||latest.key!==key||latest.principal!==principal)throw unknown(key);storage.setItem(slot,JSON.stringify({...saved,state:'COMMITTED',result:r}));}catch{throw unknown(key);}
 return r;
}
export async function checkExistingIntakeConflicts(s,runtime,storage,key,intake,input){
 // Never let a negative probe become the first valid write for this operation.
 await linkExistingIntake(s,runtime,storage,key,intake,input);
 const checks=[];
 for(const [name,probeKey,request]of[['changed_payload',key,{...input,amount_requested:1}],['duplicate_intake',crypto.randomUUID(),input]]){
  const r=await s.rpc('link_existing_funding_intake',{p_key:probeKey,p_intake_id:intake,p_funding_request:request});
  if(!(name==='changed_payload'?['22023','23505']:['23505']).includes(r.error?.code))throw Error('Canonical conflict rejection not established: '+name+' '+(r.error?.code||'no error'));
  checks.push({name,code:r.error.code,rejected:true});
 }
 return{checks};
}
