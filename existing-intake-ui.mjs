import {prepareRecoverableWrittenDraft} from './written-readiness-draft.mjs';
import {resolveRuntime} from './runtime-config.mjs';
import {linkExistingIntake,checkExistingIntakeConflicts} from './existing-intake.mjs';
const runtime=resolveRuntime(location,'admin'),$=id=>document.getElementById(id);
const stage=runtime.staging&&runtime.url==='https://qemjnekgcbuddayzhdtr.supabase.co';
let context,entities=[],principal,busy=false,activeFunding=null;
function options(node,rows,label){node.replaceChildren(new Option('Select explicitly',''),...rows.map(r=>new Option(label(r),r.id)));}
function clearService(){activeFunding=null;$('service-draft').disabled=true;$('service-result').textContent='Recover the selected intake before preparing its internal service draft.';}
function selectEntity(){clearService();const rows=entities.filter(r=>r.client_id===$('client').value&&r.status==='active');options($('entity'),rows,r=>r.legal_name+' — '+r.id);$('operation-key').value='';}
function prepare(){
 const intake=$('intake').value,entity=entities.find(r=>r.id===$('entity').value&&r.client_id===$('client').value);
 if(!intake||!entity)throw Error('Select an intake, existing client and owned business');
 const slot='reaper.existing-intake.selection.v1.'+principal+'.'+intake;
 let raw=localStorage.getItem(slot),entry;
 if(raw===null){entry={key:crypto.randomUUID(),intake,request:{client_id:entity.client_id,business_entity_id:entity.id,case_id:null,expected_entity_revision:entity.identity_revision,expected_case_revision:0,use_of_funds:'Synthetic existing-account funding intake acceptance; financial facts not supplied',amount_requested:null,time_horizon:'',repayment_source:null,underwriting:{}}};localStorage.setItem(slot,JSON.stringify(entry));}
 else{try{entry=JSON.parse(raw);}catch{throw Error('Saved selection corrupt; preserve original operation');}}
 if(!entry||entry.intake!==intake||entry.request?.client_id!==entity.client_id||entry.request?.business_entity_id!==entity.id||!entry.key)throw Error('Saved association differs; recover the original selection');
 $('operation-key').value=entry.key;return entry;
}
async function run(mode){if(busy)return;busy=true;clearService();for(const id of['intake','client','entity'])$(id).disabled=true;for(const id of['submit','overlap','interrupt','conflicts'])$(id).disabled=true;
 try{const entry=prepare(),call=opts=>linkExistingIntake(context.supabase,runtime,localStorage,entry.key,entry.intake,entry.request,opts);
 let result,transport;
 if(mode==='conflicts'){result=await checkExistingIntakeConflicts(context.supabase,runtime,localStorage,entry.key,entry.intake,entry.request);}
 else if(mode==='overlap'){const pair=await Promise.all([call(),call()]);if(JSON.stringify(pair[0])!==JSON.stringify(pair[1]))throw Error('Concurrent results differ');result=pair[0];transport='Two signed HTTP requests returned the identical canonical result';}
 else if(mode==='interrupt'){const abort=new AbortController();const pending=call({signal:abort.signal});const timer=setTimeout(()=>abort.abort(),1);let initial;
 try{await pending;initial='initial response completed before interruption';}catch(e){initial=e.outcome||'local preflight rejected';if(e.outcome!=='UNKNOWN')throw e;}finally{clearTimeout(timer);}
 result=await call();transport={initial,recovery:'original key and frozen request replayed; no assumed initial commit'};}
 else result=await call();
 if(result?.funding_result){activeFunding=result.funding_result;$('service-draft').disabled=false;}
 $('status').textContent=mode==='conflicts'?'Canonical conflicts rejected. No duplicate association.':'Canonical readiness-only association committed and verified. No approval or payment.';
 $('result').textContent=JSON.stringify({kind:'SIGNED_HTTP_EXISTING_INTAKE',mode,observed_at:new Date().toISOString(),transport,result},null,2);
 }catch(e){$('status').textContent=e.message;$('result').textContent=JSON.stringify({outcome:e.outcome||'LOCAL_REJECTION',code:e.code,key:e.idempotencyKey||$('operation-key').value},null,2);}
 finally{busy=false;for(const id of['intake','client','entity'])$(id).disabled=false;for(const id of['submit','overlap','interrupt','conflicts'])$(id).disabled=false;}
}
async function ready(c){if(context)return;context=c;
 try{if(!stage)throw Error('This existing-account integration is held outside isolated staging');
 const s=c.supabase,who=await s.auth.getUser(),aal=await s.auth.mfa.getAuthenticatorAssuranceLevel();
 if(who.error||aal.error||aal.data.currentLevel!=='aal2')throw Error('Signed AAL2 required');principal=who.data.user.id;
 const [intakes,clients,businesses]=await Promise.all([s.rpc('read_existing_funding_intakes'),s.from('clients').select('id,full_name,status').eq('status','active'),s.from('business_entities').select('id,client_id,legal_name,status,identity_revision')]);
 for(const r of[intakes,clients,businesses])if(r.error)throw Error(r.error.message);
 entities=businesses.data;options($('intake'),intakes.data,r=>r.full_name+' — '+r.status+' — '+r.id);options($('client'),clients.data,r=>r.full_name+' — '+r.id);
 $('client').addEventListener('change',selectEntity);$('intake').addEventListener('change',()=>{clearService();$('operation-key').value='';});$('entity').addEventListener('change',clearService);
 $('link-form').addEventListener('submit',e=>{e.preventDefault();run('normal');});$('overlap').addEventListener('click',()=>run('overlap'));$('interrupt').addEventListener('click',()=>run('interrupt'));$('conflicts').addEventListener('click',()=>run('conflicts'));
 for(const id of['submit','overlap','interrupt','conflicts'])$(id).disabled=false;$('status').textContent='Signed AAL2 staging session. Server enforces administrator, account and entity authority.';
 }catch(e){$('status').textContent=e.message;}}
if(window.reaperAdmin)ready(window.reaperAdmin);document.addEventListener('reaper:admin-ready',e=>ready(e.detail),{once:true});

$('service-draft').addEventListener('click',async()=>{
 if(busy)return;busy=true;
 const button=$('service-draft'),selection=activeFunding;button.disabled=true;
 for(const id of['intake','client','entity','submit','overlap','interrupt','conflicts'])$(id).disabled=true;
 try{
  if(!stage||!activeFunding)throw Error('Recover a canonical existing-account intake first');
  const f=activeFunding,request={client_id:f.client_id,business_entity_id:f.business_entity_id,case_id:f.case_id,case_revision:f.case_revision,assessment_id:f.assessment_id,template_id:'ba150755-cf90-4c4b-8530-14283bf57d07',template_sha256:'b7b3099dc2b2769651067cacf484d060a81e39ab93bb0648b4e0dc1ffe4a8073',amount:1};
  const slot='reaper.written-service.selection.v1.'+principal+'.'+f.case_id;
  let raw=localStorage.getItem(slot),saved;
  if(raw===null){saved={key:crypto.randomUUID(),request};localStorage.setItem(slot,JSON.stringify(saved));}
  else{try{saved=JSON.parse(raw);}catch{throw Error('Stored service selection corrupt; preserve original key');}}
  if(!saved||!saved.key||JSON.stringify(saved.request)!==JSON.stringify(request))throw Error('Service selection changed; recover original request');
  const result=await prepareRecoverableWrittenDraft(context.supabase,runtime,localStorage,saved.key,saved.request);
  if(activeFunding!==selection)return;
  $('service-result').textContent=JSON.stringify({kind:'SIGNED_HTTP_INTERNAL_SERVICE_DRAFT',observed_at:new Date().toISOString(),key:saved.key,result,limits:['Nonbinding fictional draft only; no legal clearance, agreement acceptance, charge, settlement or delivery.']},null,2);
 }catch(e){if(activeFunding===selection)$('service-result').textContent=JSON.stringify({outcome:e.outcome||'HELD',key:e.idempotencyKey,error:e.message},null,2);}
 finally{busy=false;for(const id of['intake','client','entity','submit','overlap','interrupt','conflicts'])$(id).disabled=false;button.disabled=!activeFunding;}
});
