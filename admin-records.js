const fmtDate = (value) => value ? new Date(value).toLocaleString() : '—';
const fmtMoney = (value, currency = 'USD') => {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: String(currency || 'USD').toUpperCase() }).format(amount);
};
const statusClass = (value) => {
  const v = String(value || '').toLowerCase();
  if (['active','paid','approved','complete','completed'].includes(v)) return 'status-active';
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
      const value = column.render ? column.render(row) : row[column.key];
      if (column.status) {
        const badge = document.createElement('span');
        badge.className = `status ${statusClass(value)}`;
        badge.textContent = text(value);
        td.appendChild(badge);
      } else {
        td.textContent = text(value);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

async function loadView({ supabase }) {
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
    ];
  } else if (view === 'documents') {
    query = supabase.from('documents').select('id,client_id,file_name,category,review_status,file_size_bytes,uploaded_at').order('uploaded_at', { ascending: false });
    columns = [
      { label: 'File', key: 'file_name' },
      { label: 'Category', key: 'category' },
      { label: 'Client ID', key: 'client_id' },
      { label: 'Review', key: 'review_status', status: true },
      { label: 'Size', render: (r) => r.file_size_bytes ? `${Math.max(1, Math.round(Number(r.file_size_bytes) / 1024))} KB` : '—' },
      { label: 'Uploaded', render: (r) => fmtDate(r.uploaded_at) },
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
