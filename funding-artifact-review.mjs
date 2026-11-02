// Narrow synthetic fixture integration. Canonical RPCs, not these local constants, grant authority.
export const blueprintArtifacts=Object.freeze({pdf:{artifact_id:'d321cdb9-2a06-4da0-99f1-6b07b1f27f54',name:'REAPER_250K_SYNTHETIC_FUNDING_BLUEPRINT.pdf',bytes:12338,sha256:'28c02f037421ef4836c9ac6fae074edcfdcc409a049f8a9f2952132049bf1969'},xlsx:{artifact_id:'ae5853e8-cabd-47e6-9383-671fa3a73c17',name:'REAPER_250K_SYNTHETIC_FUNDING_MODEL.xlsx',bytes:15861,sha256:'bec75fc56ccba2eb907c13d1aa385e8a67dcd26750666ecec42ca25995a32596'}});
export const blueprintContext=Object.freeze({client_id:'b886bc64-e931-46df-8451-e8ae08de46e8',business_entity_id:'30b59eb5-2d35-4616-86a1-4addbad18473',funding_case_id:'676f5bf7-2ae8-4c6c-b618-a6f0465f984f',task_action_id:'b345dbc7-7946-4475-81c4-7edfd2725f08',source_version:'funding-v1:26c20b8e-8bae-4586-b31a-7e7a51a37d5f',source_sha256:'bf3b2ca803ffdd821d8939685dacc97633d22e96ba743250b9496cb99378b97d'});
const principal='ab89e54c-bf1f-4572-bc01-493b476687b9',recipient='78dfaec9-27a6-48c3-a1cf-a1a63ecabb71',uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const keyFor=kind=>'reaper.qemjnekgcbuddayzhdtr.blueprint-artifact.v1.'+kind+'.'+blueprintArtifacts[kind].sha256;
// A UX receipt only. Never substitutes for authenticated canonical reads or human approval.
const verificationKeyFor=kind=>keyFor(kind)+'.local-byte-verification';
const verificationFields=['artifact_id','request_key','kind','sha256','bytes','document_id','verified_at','source_version','source_sha256'];
function verificationBinding(a){return Object.fromEntries(verificationFields.map(k=>[k,k.startsWith('source_')?a.source_context?.[k]:a[k]]));}
export function clearLocalVerification(storage,kind){storage.removeItem(verificationKeyFor(kind));}
export function localVerificationMatches(storage,kind,a){
 const f=blueprintArtifacts[kind];if(!f||!validMetadata(a,kind,f.artifact_id)||a.storage_current!==true||a.verified_sha256!==f.sha256||!uuid.test(a.document_id??'')||!Number.isFinite(Date.parse(a.verified_at??'')))return false;
 try{const receipt=JSON.parse(storage.getItem(verificationKeyFor(kind))||'null'),current=verificationBinding(a);return receipt?.version===1&&verificationFields.every(k=>receipt[k]===current[k]);}catch{return false;}
}

const held=r=>{if(!r.staging||r.url!=='https://qemjnekgcbuddayzhdtr.supabase.co')throw Error('Isolated staging only');};
const unknown=message=>Object.assign(Error(message),{outcome:'UNKNOWN'});
async function rpc(s,name,args){let r;try{r=await s.rpc(name,args);}catch{throw unknown('Canonical response unavailable; preserve operation identity.');}if(r.error)throw Object.assign(Error(r.error.message??'Canonical request failed'),{code:r.error.code,outcome:/^(?:(?:22|23|42)[A-Z0-9]{3}|40001|40P01)$/.test(r.error.code??'')?'REJECTED':'UNKNOWN'});return r.data;}
function sameContext(c){return c&&Object.entries(blueprintContext).every(([k,v])=>c[k]===v)&&Array.isArray(c.evidence_refs)&&c.evidence_refs.length===0;}
export async function checkLocalArtifact(kind,file){
 const f=blueprintArtifacts[kind];if(!f||!file||file.name!==f.name||file.size!==f.bytes)throw Error('Choose the exact independently generated version.');
 const buffer=await file.arrayBuffer();if(buffer.byteLength!==f.bytes)throw Error('Local byte length changed');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==f.sha256)throw Error('Local bytes do not match this version');return buffer;
}
function validMetadata(a,kind,id){const f=blueprintArtifacts[kind];return !!f&&! (!a||a.artifact_id!==id||id!==f.artifact_id||a.created_by!==principal||a.kind!==kind||a.file_name!==f.name||a.bytes!==f.bytes||a.sha256!==f.sha256||a.client_id!==blueprintContext.client_id||a.business_entity_id!==blueprintContext.business_entity_id||a.funding_case_id!==blueprintContext.funding_case_id||a.recipient_id!==recipient||a.scope!=='SYNTHETIC_READINESS'||a.calculation_version!=='independent-corrected-v1'||!Number.isInteger(a.revision)||a.revision<1||!sameContext(a.source_context))&&['DRAFT','REVIEW_REQUESTED','REVIEWED','APPROVED','DELIVERY_ELIGIBLE','CLIENT_ACKNOWLEDGED'].includes(a.state);}
export async function readArtifact(s,runtime,storage,kind,expectedSaved=null){
 held(runtime);const f=blueprintArtifacts[kind];if(!f)throw Error('Unknown artifact kind');
 const raw=storage.getItem(keyFor(kind)),saved=JSON.parse(raw||'null');
 if(expectedSaved&&(!saved||saved.key!==expectedSaved.key||saved.artifact_id!==expectedSaved.artifact_id))throw unknown('Saved artifact operation changed before validation');
 if(saved&&(!uuid.test(saved.key??'')||(saved.artifact_id&&saved.artifact_id!==f.artifact_id)||(saved.principal_id&&saved.principal_id!==principal)))throw unknown('Saved identity does not match the named v5 artifact');
 const a=await rpc(s,'read_funding_artifact_upload',{p_artifact:f.artifact_id});
 if(!validMetadata(a,kind,f.artifact_id)||!uuid.test(a.request_key??'')||(saved&&a.request_key!==saved.key))throw unknown('Canonical artifact metadata could not be verified');
 if(!saved?.artifact_id){
  if(storage.getItem(keyFor(kind))!==raw)throw unknown('Saved artifact operation changed during recovery');
  storage.setItem(keyFor(kind),JSON.stringify({key:a.request_key,artifact_id:a.artifact_id,principal_id:principal}));
 }
 return a;
}
export async function prepareAndVerifyArtifact(s,runtime,storage,kind,file){
 held(runtime);const bytes=await checkLocalArtifact(kind,file),f=blueprintArtifacts[kind];
 const who=await s.auth.getUser();if(who.error||who.data?.user?.id!==principal)throw Error('Designated signed administrator required');
 const ctx=await rpc(s,'read_funding_task_context',{p_task_id:blueprintContext.task_action_id});if(!sameContext(ctx))throw Error('Authenticated canonical context differs from generated package');
 let saved=JSON.parse(storage.getItem(keyFor(kind))||'null');if(!saved?.artifact_id){await readArtifact(s,runtime,storage,kind);saved=JSON.parse(storage.getItem(keyFor(kind))||'null');}
 if(!saved||!uuid.test(saved.key??'')||saved.principal_id!==principal||saved.artifact_id!==f.artifact_id)throw Error('Stored prepare identity invalid; do not invent a replacement key');
 if(saved.artifact_id)await readArtifact(s,runtime,storage,kind,saved);
 const a=await rpc(s,'prepare_funding_artifact',{p_key:saved.key,p_task:ctx.task_action_id,p_kind:kind,p_file_name:f.name,p_sha256:f.sha256,p_bytes:f.bytes,p_source_sha256:ctx.source_sha256,p_calculation_version:'independent-corrected-v1',p_scope:'SYNTHETIC_READINESS'});
 if(!a||!uuid.test(a.artifact_id??'')||(saved.artifact_id&&saved.artifact_id!==a.artifact_id)||a.delivery_eligible!==false)throw unknown('Prepare outcome unverified; retry original key');
 saved.artifact_id=a.artifact_id;storage.setItem(keyFor(kind),JSON.stringify(saved));
 const verified=await s.functions.invoke('verify-funding-artifact',{body:bytes,headers:{'Content-Type':'application/octet-stream','x-artifact-id':a.artifact_id}});
 if(verified.error){let detail=null;try{detail=await verified.error.context?.json();}catch{}throw unknown('Hosted verification unavailable: '+(detail?.error??detail?.message??verified.error.name??'unknown'));}
 if(verified.data?.verified!==true||verified.data.artifact_id!==a.artifact_id||!uuid.test(verified.data.document_id??'')||verified.data.delivery_eligible!==false)throw unknown('Hosted verification outcome unverified');
 const current=await readArtifact(s,runtime,storage,kind);if(current.verified_sha256!==f.sha256||current.storage_current!==true||current.document_id!==verified.data.document_id)throw unknown('Current stored object or digest could not be verified');
 storage.setItem(verificationKeyFor(kind),JSON.stringify({version:1,...verificationBinding(current)}));
 return current;
}
export async function transitionArtifact(s,runtime,snapshot,next,notes,{humanConfirmed=false}={}){
 held(runtime);const nextByState={DRAFT:'REVIEW_REQUESTED',REVIEW_REQUESTED:'REVIEWED',REVIEWED:'APPROVED',APPROVED:'DELIVERY_ELIGIBLE'};
 if(!snapshot||!uuid.test(snapshot.artifact_id??'')||nextByState[snapshot.state]!==next||snapshot.storage_current!==true||snapshot.verified_sha256!==snapshot.sha256||!Number.isInteger(snapshot.revision)||snapshot.revision<1||!sameContext(snapshot.source_context)||typeof notes!=='string'||!notes.trim()||notes.length>4000)throw Error('Current verified version and explicit review notes required');
 if(next!=='REVIEW_REQUESTED'&&humanConfirmed!==true)throw Error('Specific human administrator review required');
 const canonical=await rpc(s,'read_funding_artifact_upload',{p_artifact:snapshot.artifact_id});
 if(!validMetadata(canonical,snapshot.kind,snapshot.artifact_id)||canonical.state!==snapshot.state||canonical.revision!==snapshot.revision||canonical.sha256!==snapshot.sha256||canonical.storage_current!==true||canonical.verified_sha256!==canonical.sha256)throw Error('Canonical review version changed; refresh before approval');
 const r=await rpc(s,'transition_funding_artifact',{p_artifact:snapshot.artifact_id,p_expected_revision:snapshot.revision,p_expected_sha256:snapshot.sha256,p_next:next,p_notes:notes.trim()});
 if(!r||r.artifact_id!==snapshot.artifact_id||r.state!==next||r.revision!==snapshot.revision+1||r.sha256!==snapshot.sha256)throw unknown('Transition result unverified; refresh canonical state before any retry');
 return r;
}

/** Narrow hosted checks. Truncated bodies are not claimed as transport interruption. */
export async function checkArtifactByteRetries(s,runtime,storage,file){
 held(runtime);const bytes=await checkLocalArtifact('pdf',file),f=blueprintArtifacts.pdf;
 const before=await readArtifact(s,runtime,storage,'pdf');
 if(before.storage_current!==true||before.verified_sha256!==f.sha256)throw Error('Existing verified synthetic PDF required');
 const checks=[];
 for(const [name,body,expected] of [['truncated_body',bytes.slice(0,-1),'artifact_size_mismatch'],['altered_bytes',(()=>{const b=bytes.slice(0);new Uint8Array(b)[0]^=1;return b;})(),'artifact_digest_mismatch']]){
  const r=await s.functions.invoke('verify-funding-artifact',{body,headers:{'Content-Type':'application/octet-stream','x-artifact-id':before.artifact_id}});
  let detail;try{detail=await r.error?.context?.json();}catch{}
  if(!r.error||r.error.context?.status!==422||detail?.error!==expected)throw unknown('Hosted negative check unverified: '+name);
  checks.push({name,passed:true,status:422,error:detail.error});
 }
 const conflict=await s.rpc('prepare_funding_artifact',{p_key:before.request_key,p_task:blueprintContext.task_action_id,p_kind:'pdf',p_file_name:f.name,p_sha256:'0'.repeat(64),p_bytes:f.bytes,p_source_sha256:blueprintContext.source_sha256,p_calculation_version:'independent-corrected-v1',p_scope:'SYNTHETIC_READINESS'});
 if(conflict.error?.code!=='22023')throw unknown('Changed-payload conflict rejection unverified');
 checks.push({name:'same_key_changed_payload',passed:true,code:conflict.error.code});
 for(let i=0;i<2;i++){
  const a=await prepareAndVerifyArtifact(s,runtime,storage,'pdf',file);
  if(a.artifact_id!==before.artifact_id||a.document_id!==before.document_id||a.verified_at!==before.verified_at||a.verified_sha256!==f.sha256||a.storage_current!==true)throw unknown('Immutable same-artifact retry changed identity or verification');
  checks.push({name:i===0?'saved_identity_recovery':'duplicate_upload_retry',passed:true,artifact_id:a.artifact_id,document_id:a.document_id,verified_at:a.verified_at});
 }
 return {observed_at:new Date().toISOString(),signed_http:true,artifact_id:before.artifact_id,sha256:f.sha256,checks,transport_interruption_tested:false,unknown_database_outcome_hosted_tested:false,approval_granted:false};
}
