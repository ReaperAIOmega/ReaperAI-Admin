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
const policyNote = document.getElementById('quote-policy-note');
const list = document.getElementById('quote-list');

let clients = [];
let cases = [];

const fmtMoney = (value, currency = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0));
const fmtDate = (value) => value ? new Date(value).toLocaleString() : '—';
const policyLabel = (policy) => ({
  standard: 'Standard',
  deferred_until_service_complete: 'Deferred until service complete',
  no_charge_georgia_consumer_credit: 'Georgia consumer credit · no charge',
  jurisdiction_review_required: 'Jurisdiction required',
}[policy] || policy || 'Standard');

function selectedCase() {
  return cases.find((row) => row.id === caseSelect.value) || null;
}

function populateClients() {
  clientSelect.innerHTML = '<option value="">Select client</option>';
  for (const client of clients) {
    const option = document.createElement('option');
    option.value = client.id;
    option.textContent = `${client.full_name || client.email} (${client.email})${client.state ? ` · ${client.state}` : ' · state missing'}`;
    clientSelect.appendChild(option);
  }
}

function populateCases() {
  const clientId = clientSelect.value;
  caseSelect.innerHTML = '<option value="">No case selected</option>';
  for (const item of cases.filter((row) => row.client_id === clientId)) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.title || item.case_type || item.id} · ${policyLabel(item.billing_policy)}`;
    caseSelect.appendChild(option);
  }
  applyPolicyControls();
}

function applyPolicyControls() {
  const caseRow = selectedCase();
  amountInput.disabled = false;
  amountInput.min = '0.01';
  submitButton.disabled = false;
  submitButton.textContent = 'Create & send quote';

  if (!caseRow) {
    policyNote.textContent = 'Unlinked credit-repair or credit-audit quotes are blocked by the backend. Use a classified case for credit-related services.';
    return;
  }

  if (caseRow.billing_policy === 'no_charge_georgia_consumer_credit') {
    amountInput.value = '0';
    amountInput.min = '0';
    amountInput.disabled = true;
    submitButton.textContent = 'Create & send no-charge authorization';
    policyNote.textContent = 'Georgia consumer credit case: this engagement can only be issued as a $0 service authorization. The system will not create a payment for it.';
    return;
  }

  if (caseRow.billing_policy === 'jurisdiction_review_required') {
    amountInput.value = '';
    amountInput.disabled = true;
    submitButton.disabled = true;
    policyNote.textContent = 'Credit-service jurisdiction is missing. Add the client state before any quote or authorization can be issued.';
    return;
  }

  if (caseRow.billing_policy === 'deferred_until_service_complete') {
    policyNote.textContent = 'Credit-service billing is deferred. The client may accept the scope/price now, but payment cannot be released until the service is completed.';
    return;
  }

  policyNote.textContent = 'Standard service pricing applies to this engagement.';
}

async function loadReferenceData(supabase) {
  const [{ data: clientRows, error: clientError }, { data: caseRows, error: caseError }] = await Promise.all([
    supabase.from('clients').select('id,full_name,email,state,status').order('created_at', { ascending: false }),
    supabase.from('cases').select('id,client_id,title,case_type,status,stage,billing_policy').order('created_at', { ascending: false }),
  ]);
  if (clientError || caseError) throw clientError || caseError;
  clients = clientRows || [];
  cases = caseRows || [];
  populateClients();
  populateCases();
}

async function releaseDeferredBilling(supabase, quote, button) {
  button.disabled = true;
  button.textContent = 'Releasing…';
  const { data, error } = await supabase.functions.invoke('release-deferred-payment', {
    body: { quote_id: quote.id },
  });
  if (error || !data?.ok) {
    console.error('Deferred billing release failed', error, data);
    button.disabled = false;
    button.textContent = 'Release billing';
    window.alert('Billing could not be released. Confirm the linked case is completed before retrying.');
    return;
  }
  window.alert(data.already_released ? 'Billing was already released.' : 'Deferred billing released. A pending payment record was created.');
  await loadReferenceData(supabase);
  await loadQuotes(supabase);
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
    list.textContent = 'No quotes or service authorizations issued yet.';
    return;
  }

  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const caseMap = new Map(cases.map((c) => [c.id, c]));
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Client</th><th>Quote / authorization</th><th>Amount</th><th>Status</th><th>Billing policy</th><th>Sent</th><th>Expires</th><th>Action</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const quote of data) {
    const tr = document.createElement('tr');
    const client = clientMap.get(quote.client_id);
    const caseRow = quote.case_id ? caseMap.get(quote.case_id) : null;
    const billingPolicy = policyLabel(caseRow?.billing_policy || 'standard');
    const values = [
      client?.full_name || client?.email || quote.client_id,
      quote.title,
      Number(quote.amount) === 0 ? 'No charge' : fmtMoney(quote.amount, quote.currency || 'USD'),
      quote.status,
      billingPolicy,
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
    const deferredAccepted = quote.status === 'accepted' && caseRow?.billing_policy === 'deferred_until_service_complete';
    const noChargeAccepted = quote.status === 'accepted' && caseRow?.billing_policy === 'no_charge_georgia_consumer_credit';
    const serviceComplete = deferredAccepted && ['completed','closed'].includes(String(caseRow?.status || '').toLowerCase());

    if (canSupersede) {
      button.textContent = 'Supersede';
      button.addEventListener('click', async () => {
        if (!window.confirm('Supersede this quote or authorization? The client will no longer be able to accept it.')) return;
        button.disabled = true;
        const { error: updateError } = await supabase.from('quotes').update({ status: 'superseded' }).eq('id', quote.id).in('status', ['draft','sent']);
        if (updateError) {
          window.alert('Quote or authorization could not be superseded.');
          button.disabled = false;
          return;
        }
        await loadQuotes(supabase);
      });
    } else if (deferredAccepted) {
      button.textContent = serviceComplete ? 'Release billing' : 'Billing deferred';
      button.disabled = !serviceComplete;
      if (serviceComplete) button.addEventListener('click', () => releaseDeferredBilling(supabase, quote, button));
    } else if (noChargeAccepted) {
      button.textContent = 'No-charge accepted';
      button.disabled = true;
    } else {
      button.textContent = 'Locked';
      button.disabled = true;
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
  const caseRow = selectedCase();
  const title = titleInput.value.trim();
  const scope = scopeInput.value.trim();
  const noCharge = caseRow?.billing_policy === 'no_charge_georgia_consumer_credit';
  const amount = noCharge ? 0 : Number(amountInput.value);
  const expiryDays = Number(expirySelect.value || 0);

  if (caseRow?.billing_policy === 'jurisdiction_review_required') {
    status.textContent = 'Client jurisdiction must be completed before issuing this credit-service quote.';
    return;
  }
  if (!clientId || !title || !scope || !Number.isFinite(amount) || (!noCharge && amount <= 0)) {
    status.textContent = 'Complete the client, scope, and valid amount fields.';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = noCharge ? 'Creating authorization…' : 'Creating quote...';
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
  applyPolicyControls();
  if (error) {
    console.error('Quote creation error', error);
    const message = String(error.message || '');
    if (String(error.code) === '23505') {
      status.textContent = 'A sent quote already exists for this case. Supersede it before issuing a replacement.';
    } else if (message.includes('georgia_consumer_credit_service_must_be_no_charge')) {
      status.textContent = 'Georgia consumer credit cases are restricted to a $0 service authorization.';
    } else if (message.includes('credit_service_jurisdiction_required')) {
      status.textContent = 'Client jurisdiction is required before a credit-service quote can be issued.';
    } else if (message.includes('credit_service_quote_requires_classified_case') || message.includes('credit_service_quote_case_classification_mismatch')) {
      status.textContent = 'Credit-related pricing must be tied to the correctly classified credit-service case.';
    } else {
      status.textContent = 'Quote or authorization could not be created.';
    }
    return;
  }

  status.textContent = noCharge
    ? 'No-charge service authorization issued to the client portal.'
    : 'Quote issued to the client portal.';
  form.reset();
  populateCases();
  await loadReferenceData(supabase);
  await loadQuotes(supabase);
});

clientSelect?.addEventListener('change', populateCases);
caseSelect?.addEventListener('change', applyPolicyControls);

ready.then(async ({ supabase }) => {
  await loadReferenceData(supabase);
  await loadQuotes(supabase);
}).catch((error) => {
  console.error('Quote workspace error', error);
  if (list) list.textContent = 'Quote workspace is unavailable.';
});
