const setText=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value;};
const currency=(value)=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(value||0));
const sum=(rows,key)=>rows.reduce((total,row)=>total+Number(row[key]||0),0);
const openStatus=(value,closed=['closed','complete','completed','cancelled'])=>!closed.includes(String(value||'').toLowerCase());

async function loadAdmin({supabase,profile}){
 setText('admin-name',profile.full_name||profile.email||'Administrator');
 const queries=await Promise.all([
  supabase.from('intakes').select('id,status'),
  supabase.from('contact_messages').select('id,status'),
  supabase.from('clients').select('id,status'),
  supabase.from('cases').select('id,status'),
  supabase.from('documents').select('id,review_status'),
  supabase.from('message_threads').select('id,status'),
  supabase.from('service_agreements').select('id,status'),
  supabase.from('quotes').select('id,status'),
  supabase.from('payments').select('id,status,amount'),
  supabase.from('credit_issues').select('id,status'),
  supabase.from('funding_applications').select('id,status,amount_approved'),
 ]);
 if(queries.some((r)=>r.error)){console.error('Admin metric query failure',queries.map(r=>r.error));return;}
 const [intakes,contacts,clients,cases,documents,threads,agreements,quotes,payments,issues,applications]=queries.map(r=>r.data||[]);
 const converted=intakes.filter(r=>String(r.status).toLowerCase()==='converted').length;
 const conversion=intakes.length?Math.round((converted/intakes.length)*100):0;
 setText('new-leads',String(intakes.filter(r=>String(r.status).toLowerCase()==='new').length));
 setText('new-contacts',String(contacts.filter(r=>String(r.status).toLowerCase()==='new').length));
 setText('active-clients',String(clients.filter(r=>String(r.status).toLowerCase()==='active').length));
 setText('open-cases',String(cases.filter(r=>openStatus(r.status)).length));
 setText('pending-documents',String(documents.filter(r=>String(r.review_status).toLowerCase()==='pending').length));
 setText('open-threads',String(threads.filter(r=>String(r.status).toLowerCase()==='open').length));
 setText('pending-agreements',String(agreements.filter(r=>String(r.status).toLowerCase()==='sent').length));
 setText('sent-quotes',String(quotes.filter(r=>String(r.status).toLowerCase()==='sent').length));
 setText('pending-payments',String(payments.filter(r=>String(r.status).toLowerCase()==='pending').length));
 setText('credit-issues',String(issues.filter(r=>openStatus(r.status,['resolved','closed','not_actionable'])).length));
 setText('funding-applications',String(applications.filter(r=>openStatus(r.status,['funded','denied','withdrawn','expired'])).length));
 setText('conversion-rate',`${conversion}%`);
 setText('paid-total',currency(sum(payments.filter(r=>String(r.status).toLowerCase()==='paid'),'amount')));
 setText('outstanding-total',currency(sum(payments.filter(r=>String(r.status).toLowerCase()==='pending'),'amount')));
 setText('funded-total',currency(sum(applications.filter(r=>String(r.status).toLowerCase()==='funded'),'amount_approved')));
}
if(window.reaperAdmin)loadAdmin(window.reaperAdmin);
document.addEventListener('reaper:admin-ready',(event)=>loadAdmin(event.detail),{once:true});
