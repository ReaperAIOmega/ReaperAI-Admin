const ready = window.reaperAdmin
  ? Promise.resolve(window.reaperAdmin)
  : new Promise((resolve) => document.addEventListener('reaper:admin-ready', (event) => resolve(event.detail), { once: true }));

const threadList = document.getElementById('thread-list');
const clientSelect = document.getElementById('thread-client');
const conversation = document.getElementById('conversation');
const conversationTitle = document.getElementById('conversation-title');
const newForm = document.getElementById('new-thread-form');
const newSubject = document.getElementById('thread-subject');
const newMessage = document.getElementById('thread-message');
const newSubmit = document.getElementById('thread-submit');
const newStatus = document.getElementById('thread-status');
const replyForm = document.getElementById('reply-form');
const replyMessage = document.getElementById('reply-message');
const replySubmit = document.getElementById('reply-submit');
const replyStatus = document.getElementById('reply-status');
const closeButton = document.getElementById('close-thread');
let context = null;
let clients = [];
let activeThread = null;
const fmt = (value) => value ? new Date(value).toLocaleString() : '—';

async function openThread(thread) {
  activeThread = thread;
  const client = clients.find((c) => c.id === thread.client_id);
  conversationTitle.textContent = `${thread.subject} · ${client?.full_name || client?.email || thread.client_id}`;
  replyForm.hidden = false;
  replySubmit.disabled = thread.status === 'closed';
  replyMessage.disabled = thread.status === 'closed';
  closeButton.textContent = thread.status === 'closed' ? 'Reopen conversation' : 'Close conversation';
  const { data, error } = await context.supabase.from('messages').select('id,sender_profile_id,body,created_at').eq('thread_id',thread.id).order('created_at');
  conversation.replaceChildren();
  if (error) { conversation.textContent = 'Messages could not be loaded.'; return; }
  for (const row of data || []) {
    const box = document.createElement('div');
    box.className = 'panel'; box.style.marginBottom = '12px';
    const meta = document.createElement('strong');
    meta.textContent = `${row.sender_profile_id === context.profile.id ? 'Administrator' : 'Client'} · ${fmt(row.created_at)}`;
    const body = document.createElement('p'); body.style.whiteSpace = 'pre-wrap'; body.textContent = row.body;
    box.append(meta,body); conversation.appendChild(box);
  }
  if (!(data || []).length) conversation.textContent = 'No messages yet.';
}

async function loadThreads() {
  const { data, error } = await context.supabase.from('message_threads').select('id,client_id,case_id,subject,status,created_by,created_at,updated_at').order('updated_at',{ascending:false});
  threadList.replaceChildren();
  if (error) { threadList.textContent = 'Conversations could not be loaded.'; return; }
  if (!(data || []).length) { threadList.textContent = 'No conversations yet.'; return; }
  for (const row of data) {
    const client = clients.find((c) => c.id === row.client_id);
    const button = document.createElement('button');
    button.type='button'; button.className='btn-secondary'; button.style.display='block'; button.style.width='100%'; button.style.marginBottom='8px';
    button.textContent = `${client?.full_name || client?.email || 'Client'} · ${row.subject} · ${row.status} · ${fmt(row.updated_at)}`;
    button.addEventListener('click',()=>openThread(row));
    threadList.appendChild(button);
  }
}

newForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const { supabase, profile } = context;
  newSubmit.disabled = true; newStatus.textContent='';
  const { data:thread,error:threadError } = await supabase.from('message_threads').insert({client_id:clientSelect.value,subject:newSubject.value.trim(),created_by:profile.id}).select('id,client_id,case_id,subject,status,created_by,created_at,updated_at').single();
  if (threadError || !thread) { newStatus.textContent='Conversation could not be created.'; newSubmit.disabled=false; return; }
  const { error:messageError } = await supabase.from('messages').insert({thread_id:thread.id,sender_profile_id:profile.id,body:newMessage.value.trim()});
  if (messageError) { newStatus.textContent='Conversation was created but the first message failed.'; newSubmit.disabled=false; return; }
  newForm.reset(); newStatus.textContent='Message sent securely.'; newSubmit.disabled=false;
  await loadThreads(); await openThread(thread);
});

replyForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeThread || activeThread.status === 'closed') return;
  const { supabase, profile } = context;
  replySubmit.disabled=true; replyStatus.textContent='';
  const { error } = await supabase.from('messages').insert({thread_id:activeThread.id,sender_profile_id:profile.id,body:replyMessage.value.trim()});
  replySubmit.disabled=false;
  if (error) { replyStatus.textContent='Reply could not be sent.'; return; }
  replyForm.reset(); await loadThreads();
  const { data:thread } = await supabase.from('message_threads').select('id,client_id,case_id,subject,status,created_by,created_at,updated_at').eq('id',activeThread.id).single();
  if (thread) await openThread(thread);
});

closeButton?.addEventListener('click', async () => {
  if (!activeThread) return;
  const next = activeThread.status === 'closed' ? 'open' : 'closed';
  closeButton.disabled=true;
  const { error } = await context.supabase.from('message_threads').update({status:next,updated_at:new Date().toISOString()}).eq('id',activeThread.id);
  closeButton.disabled=false;
  if (error) { replyStatus.textContent='Conversation status could not be changed.'; return; }
  const { data:thread } = await context.supabase.from('message_threads').select('id,client_id,case_id,subject,status,created_by,created_at,updated_at').eq('id',activeThread.id).single();
  if (thread) await openThread(thread);
  await loadThreads();
});

ready.then(async (value) => {
  context=value;
  const { data,error } = await value.supabase.from('clients').select('id,full_name,email,status').order('full_name');
  if (error) throw error;
  clients=data || [];
  clientSelect.innerHTML='<option value="">Select client</option>';
  for (const client of clients) {
    const option=document.createElement('option'); option.value=client.id; option.textContent=`${client.full_name || client.email} (${client.email})`; clientSelect.appendChild(option);
  }
  await loadThreads();
}).catch((error)=>{console.error('Admin messaging error',error);threadList.textContent='Messaging is unavailable.';});
