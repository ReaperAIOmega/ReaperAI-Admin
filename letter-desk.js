import { buildCraAccuracyStarter, reviewLetterDraft } from './omega-letter-governance.mjs';
const ready = window.reaperAdmin ? Promise.resolve(window.reaperAdmin)
  : new Promise(resolve => document.addEventListener('reaper:admin-ready',e=>resolve(e.detail),{once:true}));
const el=id=>document.getElementById(id);
let supabase,admin,clients=[],cases=[],issues=[],rounds=[],authorizations=[],letters=[],requests=[];
const fmt=v=>v?new Date(v).toLocaleString():'—';
const option=(v,label)=>{const o=document.createElement('option');o.value=v;o.textContent=label;return o;};
const setOptions=(id,data,label,placeholder='Select')=>{
  const target=el(id);target.replaceChildren(option('',placeholder));
  for(const row of data)target.append(option(row.id,label(row)));
};
function makeButton(label,callback) {
  const b=document.createElement('button');b.type='button';b.className='button';b.textContent=label;
  b.addEventListener('click',async()=>{b.disabled=true;try{await callback();}catch(e){el('letter-admin-status').textContent=e.message||'Operation failed.';}finally{b.disabled=false;}});
  return b;
}
async function reload() {
  const queries=[
    supabase.from('clients').select('id,full_name,email,status').order('full_name'),
    supabase.from('cases').select('id,client_id,case_type,title,status').order('created_at',{ascending:false}),
    supabase.from('credit_issues').select('id,client_id,case_id,description,issue_type,evidence_notes,issue_code').order('created_at',{ascending:false}),
    supabase.from('dispute_rounds').select('id,client_id,case_id,target_name,round_number').order('created_at',{ascending:false}),
    supabase.from('letter_authorizations').select('id,client_id,case_id,subject,recipient_name,approved_at,status').order('approved_at',{ascending:false}),
    supabase.from('client_letters').select('id,client_id,subject,body_snapshot,content_hash,created_at').order('created_at',{ascending:false}),
    supabase.from('letter_mail_requests').select('id,letter_id,client_id,recipient_name,recipient_address,mail_class,status,requested_at,provider_job_id,tracking_reference').order('requested_at',{ascending:false})
  ];
  const res=await Promise.all(queries);for(const q of res)if(q.error)throw q.error;
  [clients,cases,issues,rounds,authorizations,letters,requests]=res.map(x=>x.data||[]);
  renderSelectors();renderAuthorizations();renderQueue();
}
function renderSelectors(){
  const selectedClient=el('letter-client').value;
  setOptions('letter-client',clients.filter(c=>c.status==='active'),c=>c.full_name||c.email);
  if(clients.some(c=>c.id===selectedClient))el('letter-client').value=selectedClient;
  const selectedCase=el('letter-case').value;
  const clientCases=cases.filter(c=>c.client_id===el('letter-client').value &&
      ['credit repair','credit audit'].includes(String(c.case_type).toLowerCase()));
  setOptions('letter-case',clientCases,c=>c.title||c.case_type);
  if(clientCases.some(c=>c.id===selectedCase))el('letter-case').value=selectedCase;
  renderIssueSelectors();
}
function renderIssueSelectors(){
  const caseId=el('letter-case').value;
  setOptions('letter-issue',issues.filter(i=>i.case_id===caseId),i=>i.issue_type+' — '+i.description.slice(0,75));
  setOptions('letter-round',rounds.filter(r=>r.case_id===caseId),r=>`R${r.round_number} — ${r.target_name}`,'No round selected');
}
function renderAuthorizations() {
  const wrap=el('letter-authorizations-list');wrap.replaceChildren();
  if(!authorizations.length){wrap.textContent='No authorized letters.';return;}
  for(const item of authorizations){
    const row=document.createElement('div');row.className='card';row.style.padding='16px';row.style.margin='12px 0';
    const label=document.createElement('p');
    label.textContent=`${clients.find(c=>c.id===item.client_id)?.full_name||'Client'} · ${item.subject} · ${item.recipient_name} · ${item.status} · ${fmt(item.approved_at)}`;
    row.appendChild(label);
    if(item.status==='approved')row.append(makeButton('Revoke authorization',async()=>{
      if(!window.confirm('Revoke the client’s ability to generate or request mailing for this letter?'))return;
      const {error}=await supabase.from('letter_authorizations').update({status:'revoked'}).eq('id',item.id);
      if(error)throw error;
      await reload();
    }));
    wrap.appendChild(row);
  }
}
function pdfDownload(letter){
  if(!window.pdfMake)throw new Error('PDF library unavailable.');
  window.pdfMake.createPdf({
    pageSize:'LETTER',pageMargins:[54,54,54,54],
    content:[{text:letter.body_snapshot,fontSize:11,lineHeight:1.23}],
    defaultStyle:{font:'Roboto'},info:{title:letter.subject}
  }).download('LetterStream-'+letter.content_hash.slice(0,12)+'.pdf');
}
function renderQueue(){
  const wrap=el('letter-mail-queue');wrap.replaceChildren();
  if(!requests.length){wrap.textContent='No LetterStream requests.';return;}
  for(const req of requests){
    const letter=letters.find(l=>l.id===req.letter_id);
    const row=document.createElement('div');row.className='card';row.style.padding='16px';row.style.margin='12px 0';
    const h=document.createElement('h3');h.textContent=clients.find(c=>c.id===req.client_id)?.full_name||'Client';
    const d=document.createElement('p');d.textContent=`${req.mail_class.replaceAll('_',' ')} · ${req.status.replaceAll('_',' ')} · ${fmt(req.requested_at)}`;
    const a=document.createElement('pre');a.textContent=req.recipient_name+'\n'+req.recipient_address;a.style.whiteSpace='pre-wrap';
    row.append(h,d,a);
    if(letter){
      row.append(makeButton('Download exact PDF for LetterStream',()=>pdfDownload(letter)));
    }
    if(req.status==='requested'){
      row.append(makeButton('Mark under review',async()=>{
        const {error}=await supabase.from('letter_mail_requests').update({status:'under_review'}).eq('id',req.id);
        if(error)throw error;await reload();
      }));
    }
    if(['requested','under_review'].includes(req.status)){
      const providerInput=document.createElement('input');
      providerInput.placeholder='Actual LetterStream job ID';
      providerInput.setAttribute('aria-label','LetterStream job ID');
      const tracking=document.createElement('input');
      tracking.placeholder='Optional USPS tracking';
      tracking.setAttribute('aria-label','USPS tracking reference');
      row.append(providerInput,tracking);
      row.append(makeButton('Record confirmed LetterStream submission',async()=>{
        const jobId=providerInput.value.trim();
        if(!jobId)throw new Error('Enter the actual LetterStream job ID.');
        if(!window.confirm('Confirm this exact PDF was accepted by LetterStream under job '+jobId+'?'))return;
        const {error}=await supabase.from('letter_mail_requests').update({
          status:'submitted_to_letterstream',provider_job_id:jobId,
          provider_confirmed_at:new Date().toISOString(),tracking_reference:tracking.value.trim()||null
        }).eq('id',req.id);
        if(error)throw error;await reload();
      }));
    }
    wrap.appendChild(row);
  }
}
el('letter-client').addEventListener('change',renderSelectors);
el('letter-case').addEventListener('change',renderIssueSelectors);
el('letter-fill-template').addEventListener('click',()=>{
  if (el('letter-route').value !== 'cra_accuracy' || el('letter-actor').value !== 'cra') {
    el('letter-admin-status').textContent='Only a CRA accuracy-dispute starter is enabled. Other routes require separately vetted content.';
    return;
  }
  const issue=issues.find(x=>x.id===el('letter-issue').value);
  const prepared=buildCraAccuracyStarter({
    issue, evidenceReference:el('letter-evidence-reference').value
  });
  if (!prepared.ok) {
    el('letter-admin-status').textContent=prepared.error;
    return;
  }
  el('letter-subject').value='Dispute of specifically inaccurate or incomplete report information';
  el('letter-body').value=prepared.text;
  el('letter-admin-status').textContent='OMEGA starter prepared. Inspect the source documents, current law, recipient, and every final statement before approval.';
});
el('letter-authorization-form').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const button=el('letter-approve');button.disabled=true;
  try{
    const issue=issues.find(x=>x.id===el('letter-issue').value);
    const review=reviewLetterDraft({
      route:el('letter-route').value,
      actor:el('letter-actor').value,
      authorityStatus:el('letter-authority-status').value,
      evidenceReference:el('letter-evidence-reference').value,
      issue,
      recipientName:el('letter-recipient').value,
      recipientAddress:el('letter-recipient-address').value,
      subject:el('letter-subject').value,
      body:el('letter-body').value,
      factsReviewed:el('letter-facts-reviewed').checked,
      authorityReviewed:el('letter-authority-reviewed').checked,
      recipientVerified:el('letter-recipient-verified').checked,
      exactTextReviewed:el('letter-exact-text-reviewed').checked
    });
    if (!review.ok) {
      el('letter-admin-status').textContent='Approval blocked: '+review.errors.join(' ');
      return;
    }
    if(!window.confirm('Authorize this exact letter for the selected client? It will become immutable.'))return;
    const payload={
      client_id:el('letter-client').value,case_id:el('letter-case').value,
      issue_id:el('letter-issue').value,round_id:el('letter-round').value||null,
      recipient_name:el('letter-recipient').value.trim(),
      recipient_address:el('letter-recipient-address').value.trim(),
      subject:el('letter-subject').value.trim(),
      body_template:el('letter-body').value.trim(),
      approved_by:admin.id,status:'approved',
      governance_snapshot:{
        authority:review.authority,
        version:review.governanceVersion,
        route:review.route,
        actor:el('letter-actor').value,
        authority_status:el('letter-authority-status').value,
        issue_id:el('letter-issue').value,
        case_id:el('letter-case').value,
        client_id:el('letter-client').value,
        evidence_reference:el('letter-evidence-reference').value.trim(),
        disputed_fact:issue.description.trim(),
        evidence_notes:String(issue.evidence_notes||'').trim(),
        recipient_name:el('letter-recipient').value.trim(),
        recipient_address:el('letter-recipient-address').value.trim(),
        facts_reviewed:el('letter-facts-reviewed').checked,
        authority_reviewed:el('letter-authority-reviewed').checked,
        recipient_verified:el('letter-recipient-verified').checked,
        exact_text_reviewed:el('letter-exact-text-reviewed').checked
      }
    };
    const {error}=await supabase.from('letter_authorizations').insert(payload);
    if(error)throw error;
    el('letter-admin-status').textContent='Letter authorized. The client may now generate and download it.';
    await reload();
  }catch(e){el('letter-admin-status').textContent=e.message||'Unable to authorize letter.';}
  finally{button.disabled=false;}
});
ready.then(async({supabase:client,profile})=>{
  if(profile.role!=='admin')throw new Error('Administrator access required.');
  supabase=client;admin=profile;await reload();
}).catch(e=>{
  console.error('Letter Desk failed',e);
  el('letter-admin-status').textContent='Letter Desk unavailable.';
  el('letter-mail-queue').textContent='Unavailable.';
});
