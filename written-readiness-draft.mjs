// Internal staging drafts only. No legal approval, acceptance, settlement or delivery.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields=['client_id','business_entity_id','case_id','case_revision','assessment_id','template_id','template_sha256','amount'];
function canonical(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k)))throw Error('Canonical draft request required; caller approval fields prohibited');
 const r=structuredClone(input);
 for(const k of ['client_id','business_entity_id','case_id','assessment_id','template_id']){if(!uuid.test(r[k]??''))throw Error('Canonical draft identifiers required');r[k]=r[k].toLowerCase();}
 if(!Number.isSafeInteger(r.case_revision)||r.case_revision<1||!/^[a-f0-9]{64}$/.test(r.template_sha256??'')||!Number.isFinite(r.amount)||r.amount<=0||r.amount>9999999999.99||Math.abs(r.amount*100-Math.round(r.amount*100))>0.00001)throw Error('Exact template digest, case revision and monetary amount required');
 return Object.fromEntries(fields.map(k=>[k,r[k]]));
}
const unknown=key=>Object.assign(Error('Service draft outcome unknown. Retry the original key and immutable request.'),{outcome:'UNKNOWN',idempotencyKey:key});
export async function prepareRecoverableWrittenDraft(s,runtime,storage,key,input){
 if(!runtime.staging||runtime.url!=='https://qemjnekgcbuddayzhdtr.supabase.co')throw Error('Internal isolated staging draft only');
 if(!uuid.test(key??''))throw Error('Original operation UUID required');key=key.toLowerCase();const request=canonical(input),wire=JSON.stringify(request);
 const who=await s.auth.getUser(),aal=await s.auth.mfa.getAuthenticatorAssuranceLevel(),principal=who.data?.user?.id;
 if(who.error||!uuid.test(principal??'')||aal.error||aal.data?.currentLevel!=='aal2')throw Error('Signed AAL2 administrator required');
 const slot='reaper.written-service-draft.v1.'+principal+'.'+key,raw=storage.getItem(slot);let saved;
 try{saved=raw===null?null:JSON.parse(raw);}catch{throw Error('Stored draft corrupt; preserve original operation');}
 if(raw!==null&&(!saved||saved.schema!==1||saved.key!==key||saved.principal!==principal||saved.wire!==wire||!['PENDING','COMMITTED'].includes(saved.state)||JSON.stringify(canonical(saved.request))!==wire))throw Error('Stored draft conflicts; preserve original request');
 if(raw===null){saved={schema:1,key,principal,request,wire,state:'PENDING'};storage.setItem(slot,JSON.stringify(saved));}
 let response;try{response=await s.rpc('prepare_written_readiness_draft',{p_key:key,p_request:saved.request});}catch{throw unknown(key);}
 if(response.error)throw Object.assign(Error(response.error.message),{outcome:/^(?:(?:22|23|42)[A-Z0-9]{3}|40001|40P01)$/.test(response.error.code??'')?'REJECTED':'UNKNOWN',idempotencyKey:key,code:response.error.code});
 const r=response.data;
 if(!r||!['operation_id','quote_id','agreement_id','payment_id'].every(k=>uuid.test(r[k]??''))||!['client_id','business_entity_id','case_id','assessment_id'].every(k=>r[k]===request[k])||!/^[a-f0-9]{64}$/.test(r.fingerprint??'')||!/^[a-f0-9]{64}$/.test(r.source_sha256??'')||r.agreement_status!=='draft'||r.payment_status!=='draft'||r.delivery_enabled!==false)throw unknown(key);
 try{const latest=JSON.parse(storage.getItem(slot));if(!latest||latest.key!==key||latest.principal!==principal||latest.wire!==wire)throw unknown(key);storage.setItem(slot,JSON.stringify({...saved,state:'COMMITTED',result:r}));}catch{throw unknown(key);}
 return r;
}
