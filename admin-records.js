const fmtDate = (value) => value ? new Date(value).toLocaleString() : '—';
const fmtMoney = (value, currency = 'USD') => {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: String(currency || 'USD').toUpperCase() }).format(amount);
};
const statusClass = (value) => {
  const v = String(value || '').toLowerCase();
  if (['active','paid','approved','complete','completed','converted'].includes(v)) return 'status-active';
  if (['new','open'].includes(v)) return 'status-new';
  return 'status-pending';
};
const text = (value) => value === null || value === undefined || value === '' ? '—' : String(value);

function renderTable(container, columns, rows) {
  container.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No records yet.';
    container.appendChild(empty);
    return;
  }
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const column of columns) {
    const th = document.createElement('th');
    th.textContent = column.label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const column of columns) {
      const td = document.createElement('td');
      if (column.node) {
        const node = column.node(row);
        if (node) td.appendChild(node);
      } else {
        const value = column.render ? column.render(row) : row[column.key];
        if (column.status) {
          const badge = document.createElement('span');
          badge.className = `status ${statusClass(value)}`;
          badge.textContent = text(value);
          td.appendChild(badge);
        } else {
          td.textContent = text(value);
        }
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

function bindCopy(button, input) {
  button?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy activation link'; }, 1200);
    } catch {
      input.select();
    }
  }, { once: true });
}

function showConversionResult(result) {
  const box = document.getElementById('conversion-result');
  const message = document.getElementById('conversion-message');
  const url = document.getElementById('conversion-url');
  const copy = document.getElementById('copy-conversion-url');
  if (!box || !message || !url) return;
  message.textContent = `${result.full_name || result.email || 'Client'} was converted successfully. Send the activation link through an approved communication channel. It expires in 48 hours.`;
  url.value = result.onboarding_url || '';
  box.hidden = false;
  bindCopy(copy, url);
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showOnboardingResult(result) {
  const box = document.getElementById('onboarding-result');
  const message = document.getElementById('onboarding-message');
  const url = document.getElementById('onboarding-url');
  const copy = document.getElementById('copy-onboarding-url');
  if (!box || !message || !url) return;
  message.textContent = `${result.full_name || result.email || 'Client'} received a replacement activation link. Any prior unused onboarding link was expired.`;
  url.value = result.onboarding_url || '';
  box.hidden = false;
  bindCopy(copy, url);
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function convertIntake(supabase, row, button) {
  const ok = window.confirm(`Approve ${row.full_name || row.email} and create the client account, onboarding case, task, and secure portal activation link?`);
  if (!ok) return;
  button.disabled = true;
  button.textContent = 'Creating…';
  const { data, error } = await supabase.functions.invoke('convert-intake', { body: { intake_id: row.id } });
  if (error || !data?.ok) {
    console.error('Intake conversion failed', error, data);
    button.disabled = false;
    button.textContent = 'Approve & create client';
    window.alert('Client conversion could not be completed. Review the backend error before retrying.');
    return;
  }
  button.textContent = 'Converted';
  showConversionResult(data);
  await loadView(window.reaperAdmin);
}

async function reissueOnboarding(supabase, row, button) {
  button.disabled = true;
  button.textContent = 'Reissuing…';
  const { data, error } = await supabase.functions.invoke('reissue-client-onboarding', { body: { client_id: row.id } });
  if (error || !data?.ok) {
    console.error('Onboarding reissue failed', error, data);
    button.disabled = false;
    button.textContent = 'Reissue activation';
    window.alert('Activation link could not be reissued. The client may already have completed setup.');
    return;
  }
  button.textContent = 'Link reissued';
  showOnboardingResult(data);
}

async function openDocument(supabase, row, button) {
  button.disabled = true;
  const { data, error } = await supabase.storage.from('client-documents').createSignedUrl(row.storage_path, 120);
  button.disabled = false;
  if (error || !data?.signedUrl) {
    window.alert('Secure document link could not be created.');
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

async function reviewDocument(supabase, profile, row, reviewStatus, note, button) {
  button.disabled = true;
  const { error } = await supabase.from('documents').update({
    review_status: reviewStatus,
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
    review_notes: note || null,
  }).eq('id', row.id);
  if (error) {
    console.error('Document review update failed', error);
    button.disabled = false;
    window.alert('Document review status could not be updated.');
    return;
  }
  await loadView(window.reaperAdmin);
}

async function loadView({ supabase, profile }) {
  const view = document.body.dataset.adminView;
  const container = document.getElementById('records-table');
  const summary = document.getElementById('records-summary');
  if (!view || !container) return;

  let query;
  let columns;
  if (view === 'clients') {
    query = supabase.from('clients').select('id,full_name,email,phone,status,created_at').order('created_at', { ascending: false });
    columns = [
      { label: 'Client', key: 'full_name' },
      { label: 'Email', key: 'email' },
      { label: 'Phone', key: 'phone' },
      { label: 'Status', key: 'status', status: true },
      { label: 'Created', render: (r) => fmtDate(r.created_at) },
      {
        label: 'Onboarding',
        node: (r) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn-secondary';
          const canReissue = String(r.status || '').toLowerCase() === 'onboarding';
          button.textContent = canReissue ? 'Reissue activation' : 'Setup complete';
          button.disabled = !canReissue;
          if (canReissue) button.addEventListener('click', () => reissueOnboarding(supabase, r, button));
          return button;
        },
      },
    ];
  } else if (view === 'intakes') {
    query = supabase.from('intakes').select('id,full_name,email,phone,service_type,funding_amount_needed,status,submitted_at').order('submitted_at', { ascending: false });
    columns = [
      { label: 'Lead', key: 'full_name' },
      { label: 'Email', key: 'email' },
      { label: 'Service', key: 'service_type' },
      { label: 'Funding Need', render: (r) => fmtMoney(r.funding_amount_needed) },
      { label: 'Status', key: 'status', status: true },
      { label: 'Submitted', render: (r) => fmtDate(r.submitted_at) },
      {
        label: 'Action',
        node: (r) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'button';
          const isNew = String(r.status || '').toLowerCase() === 'new';
          button.textContent = isNew ? 'Approve & create client' : 'Converted';
          button.disabled = !isNew;
          if (isNew) button.addEventListener('click', () => convertIntake(supabase, r, button));
          return button;
        },
      },
    ];
  } else if (view === 'documents') {
    query = supabase.from('documents').select('id,client_id,file_name,category,review_status,review_notes,file_size_bytes,storage_path,uploaded_at').order('uploaded_at', { ascending: false });
    columns = [
      { label: 'File', key: 'file_name' },
      { label: 'Category', key: 'category' },
      { label: 'Client ID', key: 'client_id' },
      { label: 'Review', key: 'review_status', status: true },
      { label: 'Size', render: (r) => r.file_size_bytes ? `${Math.max(1, Math.round(Number(r.file_size_bytes) / 1024))} KB` : '—' },
      { label: 'Uploaded', render: (r) => fmtDate(r.uploaded_at) },
      {
        label: 'Actions',
        node: (r) => {
          const wrap = document.createElement('div');
          wrap.className = 'button-row';
          wrap.style.marginTop = '0';
          const open = document.createElement('button');
          open.type = 'button'; open.className = 'btn-secondary'; open.textContent = 'Open';
          open.addEventListener('click', () => openDocument(supabase, r, open));
          const approve = document.createElement('button');
          approve.type = 'button'; approve.className = 'button'; approve.textContent = 'Approve';
          approve.addEventListener('click', () => reviewDocument(supabase, profile, r, 'approved', null, approve));
          const changes = document.createElement('button');
          changes.type = 'button'; changes.className = 'btn-secondary'; changes.textContent = 'Request changes';
          changes.addEventListener('click', () => {
            const reason = window.prompt('What needs to be corrected or replaced?');
            if (reason === null) return;
            reviewDocument(supabase, profile, r, 'changes_requested', reason.trim(), changes);
          });
          wrap.append(open, approve, changes);
          return wrap;
        },
      },
    ];
  } else if (view === 'payments') {
    query = supabase.from('payments').select('id,client_id,description,amount,currency,status,due_date,paid_at,created_at').order('created_at', { ascending: false });
    columns = [
      { label: 'Description', key: 'description' },
      { label: 'Client ID', key: 'client_id' },
      { label: 'Amount', render: (r) => fmtMoney(r.amount, r.currency) },
      { label: 'Status', key: 'status', status: true },
      { label: 'Due', key: 'due_date' },
      { label: 'Paid', render: (r) => fmtDate(r.paid_at) },
    ];
  } else return;

  const { data, error } = await query;
  if (error) {
    console.error(`Admin ${view} load error`, error);
    container.replaceChildren();
    const failure = document.createElement('p');
    failure.textContent = 'Records could not be loaded. Access has been denied or the data service is unavailable.';
    container.appendChild(failure);
    if (summary) summary.textContent = 'Unavailable';
    return;
  }

  const rows = data || [];
  if (summary) summary.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
  renderTable(container, columns, rows);
}

if (window.reaperAdmin) loadView(window.reaperAdmin);
document.addEventListener('reaper:admin-ready', (event) => loadView(event.detail), { once: true });
