const ready = window.reaperAdmin
  ? Promise.resolve(window.reaperAdmin)
  : new Promise((resolve) => document.addEventListener('reaper:admin-ready', (event) => resolve(event.detail), { once: true }));

const form = document.getElementById('payment-link-form');
const paymentSelect = document.getElementById('payment-link-payment');
const urlInput = document.getElementById('payment-link-url');
const submitButton = document.getElementById('payment-link-submit');
const status = document.getElementById('payment-link-status');

const fmtMoney = (value, currency = 'USD') => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: String(currency || 'USD').toUpperCase(),
}).format(Number(value || 0));

const validHttps = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

async function loadPendingPayments(supabase) {
  const { data, error } = await supabase
    .from('payments')
    .select('id,client_id,description,amount,currency,status,payment_url,created_at')
    .neq('status', 'paid')
    .order('created_at', { ascending: false });

  paymentSelect.innerHTML = '<option value="">Select payment record</option>';
  if (error) {
    console.error('Payment-link load error', error);
    status.textContent = 'Payment records could not be loaded.';
    return;
  }

  for (const payment of data || []) {
    const option = document.createElement('option');
    option.value = payment.id;
    option.dataset.url = payment.payment_url || '';
    option.textContent = `${payment.description || 'Service payment'} — ${fmtMoney(payment.amount, payment.currency)} — ${payment.status}`;
    paymentSelect.appendChild(option);
  }
}

paymentSelect?.addEventListener('change', () => {
  const option = paymentSelect.selectedOptions?.[0];
  urlInput.value = option?.dataset?.url || '';
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const { supabase } = await ready;
  const paymentId = paymentSelect.value;
  const paymentUrl = urlInput.value.trim();

  if (!paymentId) {
    status.textContent = 'Select a payment record.';
    return;
  }
  if (!validHttps(paymentUrl)) {
    status.textContent = 'Enter a valid HTTPS checkout URL.';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Saving…';
  status.textContent = '';

  const { error } = await supabase
    .from('payments')
    .update({ payment_url: paymentUrl })
    .eq('id', paymentId)
    .neq('status', 'paid');

  submitButton.disabled = false;
  submitButton.textContent = 'Save secure checkout link';

  if (error) {
    console.error('Payment-link save error', error);
    status.textContent = 'Checkout link could not be saved.';
    return;
  }

  status.textContent = 'Secure checkout link attached to the client billing record.';
  await loadPendingPayments(supabase);
  document.dispatchEvent(new CustomEvent('reaper:refresh-payments'));
});

ready.then(({ supabase }) => loadPendingPayments(supabase)).catch((error) => {
  console.error('Payment-link workspace error', error);
  status.textContent = 'Payment-link workspace is unavailable.';
});
