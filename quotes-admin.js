const ready = window.reaperAdmin
  ? Promise.resolve(window.reaperAdmin)
  : new Promise((resolve) => document.addEventListener('reaper:admin-ready', (event) => resolve(event.detail), { once: true }));

const form = document.getElementById('quote-form');
const clientSelect = document.getElementById('quote-client');
const caseSelect = document.getElementById('quote-case');
const titleInput = document.getElementById('quote-title');
const scopeInput = document.getElementById('quote-scope');
const amountInput = document.getElementById('quote-amount');
const expirySelect = document.getElementById('quote-expiry');
const submitButton = document.getElementById('quote-submit');
const status = document.getElementById('quote-status');
const list = document.getElementById('quote-list');

let clients = [];
let cases = [];

const fmtMoney = (value, currency = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0));
const fmtDate = (value) => value ? new Date(value).toLocaleString() : '—';

function populateClients() {
  clientSelect.innerHTML = '<option value="">Select client</option>';
  for (const client of clients) {
    const option = document.createElement('option');
    option.value = client.id;
    option.textContent = `${client.full_name || client.email} (${client.email})`;
    clientSelect.appendChild(option);
  }
}

function populateCases() {
  const clientId = clientSelect.value;
  caseSelect.innerHTML = '<option value="">No case selected</option>';
  for (const item of cases.filter((row) => row.client_id === clientId)) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.title || item.case_type || item.id;
    caseSelect.appendChild(option);
  }
}

async function loadReferenceData(supabase) {
  const [{ data: clientRows, error: clientError }, { data: caseRows, error: caseError }] = await Promise.all([
    supabase.from('clients').select('id,full_name,email,status').order('created_at', { ascending: false }),
    supabase.from('cases').select('id,client_id,title,case_type,status').order('created_at', { ascending: false }),
  ]);
  if (clientError || caseError) throw clientError || caseError;
  clients = clientRows || [];
  cases = caseRows || [];
  populateClients();
  populateCases();
}

async function loadQuotes(supabase) {
  const { data, error } = await supabase
    .from('quotes')
    .select('id,client_id,case_id,title,scope,amount,currency,status,sent_at,accepted_at,declined_at,expires_at,created_at')
    .order('created_at', { ascending: false });
  list.replaceChildren();
  if (error) {
    console.error('Quote load error', error);
    list.textContent = 'Quotes could not be loaded.';
    return;
  }
  if (!data?.length) {
    list.textContent = 'No quotes issued yet.';
    return;
  }

  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Client</th><th>Quote</th><th>Amount</th><th>Status</th><th>Sent</th><th>Expires</th><th>Action</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const quote of data) {
    const tr = document.createElement('tr');
    const client = clientMap.get(quote.client_id);
    const values = [
      client?.full_name || client?.email || quote.client_id,
      quote.title,
      fmtMoney(quote.amount, quote.currency || 'USD'),
      quote.status,
      fmtDate(quote.sent_at),
      fmtDate(quote.expires_at),
    ];
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    }
    const action = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-secondary';
    const canSupersede = ['draft','sent'].includes(quote.status);
    button.textContent = canSupersede ? 'Supersede' : 'Locked';
    button.disabled = !canSupersede;
    if (canSupersede) {
      button.addEventListener('click', async () => {
        if (!window.confirm('Supersede this quote? The client will no longer be able to accept it.')) return;
        button.disabled = true;
        const { error: updateError } = await supabase.from('quotes').update({ status: 'superseded' }).eq('id', quote.id).in('status', ['draft','sent']);
        if (updateError) {
          window.alert('Quote could not be superseded.');
          button.disabled = false;
          return;
        }
        await loadQuotes(supabase);
      });
    }
    action.appendChild(button);
    tr.appendChild(action);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  list.appendChild(table);
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const { supabase, profile } = await ready;
  const clientId = clientSelect.value;
  const caseId = caseSelect.value || null;
  const title = titleInput.value.trim();
  const scope = scopeInput.value.trim();
  const amount = Number(amountInput.value);
  const expiryDays = Number(expirySelect.value || 0);

  if (!clientId || !title || !scope || !Number.isFinite(amount) || amount <= 0) {
    status.textContent = 'Complete the client, scope, and valid amount fields.';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Creating quote...';
  status.textContent = '';
  const now = new Date();
  const expiresAt = expiryDays > 0 ? new Date(now.getTime() + expiryDays * 86400000).toISOString() : null;

  const { error } = await supabase.from('quotes').insert({
    client_id: clientId,
    case_id: caseId,
    title,
    scope,
    amount,
    currency: 'USD',
    status: 'sent',
    created_by: profile.id,
    sent_at: now.toISOString(),
    expires_at: expiresAt,
  });

  submitButton.disabled = false;
  submitButton.textContent = 'Create & send quote';
  if (error) {
    console.error('Quote creation error', error);
    status.textContent = 'Quote could not be created.';
    return;
  }

  status.textContent = 'Quote issued to the client portal.';
  form.reset();
  populateCases();
  await loadQuotes(supabase);
});

clientSelect?.addEventListener('change', populateCases);

ready.then(async ({ supabase }) => {
  await loadReferenceData(supabase);
  await loadQuotes(supabase);
}).catch((error) => {
  console.error('Quote workspace error', error);
  if (list) list.textContent = 'Quote workspace is unavailable.';
});
