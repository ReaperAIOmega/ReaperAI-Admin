const ready = window.reaperAdmin
  ? Promise.resolve(window.reaperAdmin)
  : new Promise((resolve) => document.addEventListener('reaper:admin-ready', (event) => resolve(event.detail), { once: true }));

const container = document.getElementById('records-table');
const summary = document.getElementById('records-summary');
const fmtDate = (value) => value ? new Date(value).toLocaleString() : '—';

async function setStatus(supabase, profile, row, nextStatus, button) {
  button.disabled = true;
  const now = new Date().toISOString();
  const patch = {
    status: nextStatus,
    handled_by: profile.id,
    handled_at: nextStatus === 'new' ? null : now,
    updated_at: now,
  };
  const { error } = await supabase.from('contact_messages').update(patch).eq('id', row.id);
  if (error) {
    console.error('Contact status update failed', error);
    window.alert('Contact status could not be updated.');
    button.disabled = false;
    return;
  }
  await loadContacts({ supabase, profile });
}

async function loadContacts({ supabase, profile }) {
  const { data, error } = await supabase
    .from('contact_messages')
    .select('id,full_name,email,phone,subject,message,status,submitted_at,handled_at')
    .order('submitted_at', { ascending: false });
  container.replaceChildren();
  if (error) {
    console.error('Contact inbox load failed', error);
    container.textContent = 'Contact messages could not be loaded.';
    summary.textContent = 'Unavailable';
    return;
  }
  const rows = data || [];
  summary.textContent = `${rows.length} message${rows.length === 1 ? '' : 's'} · ${rows.filter((r) => r.status === 'new').length} new`;
  if (!rows.length) {
    container.textContent = 'No contact messages yet.';
    return;
  }
  for (const row of rows) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '18px';
    const title = document.createElement('h3');
    title.textContent = row.subject || 'General inquiry';
    const meta = document.createElement('p');
    meta.textContent = `${row.full_name} · ${row.email}${row.phone ? ` · ${row.phone}` : ''} · ${fmtDate(row.submitted_at)} · ${row.status}`;
    const message = document.createElement('p');
    message.style.whiteSpace = 'pre-wrap';
    message.textContent = row.message;
    const actions = document.createElement('div');
    actions.className = 'button-row';
    for (const [label, value] of [['Open','open'],['Close','closed'],['Spam','spam']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = value === 'open' ? 'button' : 'btn-secondary';
      button.textContent = label;
      button.disabled = row.status === value;
      button.addEventListener('click', () => setStatus(supabase, profile, row, value, button));
      actions.appendChild(button);
    }
    const reply = document.createElement('a');
    reply.className = 'btn-secondary';
    reply.href = `mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent(`Re: ${row.subject || 'Johnson Strategic Solutions inquiry'}`)}`;
    reply.textContent = 'Reply by email';
    actions.appendChild(reply);
    card.append(title, meta, message, actions);
    container.appendChild(card);
  }
}

ready.then(loadContacts).catch((error) => {
  console.error('Contact inbox error', error);
  if (container) container.textContent = 'Contact inbox is unavailable.';
});
