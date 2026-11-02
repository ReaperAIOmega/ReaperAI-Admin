// Prepared adapter only. No canonical write UI is activated in this release.
export const canonicalFundingUiEnabled=false;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function normalizedRequest(key,request){
 if(!uuid.test(key??''))throw new Error('Original canonical operation UUID required.');
 const r=structuredClone(request);
 for(const k of ['client_id','business_entity_id','case_id']){
  if(k==='case_id'&&r[k]===null)continue;
  if(!uuid.test(r[k]??''))throw new Error('Canonical client, entity and case UUIDs required.');
  r[k]=r[k].toLowerCase();
 }
 for(const k of ['expected_entity_revision','expected_case_revision'])if(!Number.isSafeInteger(r[k])||r[k]<0)throw new Error('Canonical revisions required.');
 return r;
}
export async function submitCanonicalFundingDraft(supabase,key,request){
 const snapshot=normalizedRequest(key,request);
 let response;
 try{response=await supabase.rpc('submit_funding_intake',{p_key:key,p_request:snapshot});}
 catch{throw Object.assign(new Error('Commit outcome unknown. Retry the same request and operation key.'),{outcome:'UNKNOWN',idempotencyKey:key});}
 if(response.error)throw Object.assign(new Error(response.error.message),{outcome:/^(?:(?:22|23|42)[A-Z0-9]{3}|40001|40P01)$/.test(response.error.code??'')?'REJECTED':'UNKNOWN',idempotencyKey:key});
 const r=response.data;
 if(!r||r.client_id!==snapshot.client_id||r.business_entity_id!==snapshot.business_entity_id||(snapshot.case_id&&r.case_id!==snapshot.case_id)||r.approval_status!=='DRAFT'||r.qualification!=='READINESS_ONLY'||r.delivery_eligible!==false
 ||!['operation_id','case_id','assessment_id','task_action_id'].every(k=>uuid.test(r[k]??''))
 ||!Number.isSafeInteger(r.case_revision)||r.case_revision<1||!/^[0-9a-f]{64}$/.test(r.fingerprint??'')
 ||!Array.isArray(r.missing)||r.missing.some(x=>typeof x!=='string'))throw Object.assign(new Error('Commit response could not be verified. Retry the same operation key.'),{outcome:'UNKNOWN',idempotencyKey:key});
 return r;
}


// Staging integration adapter. Public interest is not proof of client/entity identity.
// Persist BEFORE sending; never invent a replacement key or serve cached authority.
function sorted(value){if(Array.isArray(value))return value.map(sorted);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])]));return value;}
export async function submitRecoverableFundingDraft(s,runtime,storage,key,input){
 if(!runtime.staging||runtime.url!=='https://qemjnekgcbuddayzhdtr.supabase.co')throw Error('Isolated funding handoff only');
 const who=await s.auth.getUser(),aal=await s.auth.mfa.getAuthenticatorAssuranceLevel();
 if(who.error||!uuid.test(who.data?.user?.id??'')||aal.error||aal.data?.currentLevel!=='aal2')throw Error('Signed AAL2 administrator required; server confirms role and ownership');
 const principal=who.data.user.id.toLowerCase(),request=normalizedRequest(key,input),wire=JSON.stringify(sorted(request));
 const storageKey='reaper.qemjnekgcbuddayzhdtr.funding-operation.v1.'+principal+'.'+key.toLowerCase();
 const raw=storage.getItem(storageKey);let saved;
 try{saved=raw!==null?JSON.parse(raw):null;}catch{throw Error('Stored operation corrupt; preserve its original identity');}
 if(raw!==null&&(!saved||typeof saved!=='object'||Array.isArray(saved)||!['PENDING','COMMITTED'].includes(saved.state)||saved.schema!==1||saved.principal!==principal||saved.key!==key.toLowerCase()||saved.wire!==wire||JSON.stringify(sorted(normalizedRequest(saved.key,saved.request)))!==saved.wire))throw Error('Stored operation conflict; recover the original request before changing payload');
 if(raw===null){saved={schema:1,principal,key:key.toLowerCase(),wire,request,state:'PENDING'};storage.setItem(storageKey,JSON.stringify(saved));}
 const result=await submitCanonicalFundingDraft(s,saved.key,saved.request);
 const latest=JSON.parse(storage.getItem(storageKey)||'null');
 if(!latest||latest.principal!==principal||latest.key!==saved.key||latest.wire!==wire)throw Object.assign(Error('Saved operation changed; canonical commit outcome must be recovered with original key'),{outcome:'UNKNOWN',idempotencyKey:saved.key});
 storage.setItem(storageKey,JSON.stringify({...saved,state:'COMMITTED',result}));
 return result;
}
