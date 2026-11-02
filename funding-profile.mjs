// Omission means unknown/unmodified, never erase an existing business fact.
// Server ownership, evidence verification and multi-entity mapping remain separate gates.
const fields = {
  legal_name: 'business-name', entity_type: 'business-entity', formation_state: 'business-state',
  formation_date: 'business-date', naics_code: 'business-naics', annual_revenue: 'business-annual',
  average_monthly_revenue: 'business-monthly', time_in_business_months: 'business-months', existing_business_debt: 'business-debt',
};
const numeric = new Set(['annual_revenue', 'average_monthly_revenue', 'time_in_business_months', 'existing_business_debt']);
export function businessProfilePatch(clientId, values) {
  if (!clientId) throw new Error('Select a client before saving.');
  const patch = { client_id: clientId };
  for (const key of Object.keys(fields)) {
    const text = String(values[key] ?? '').trim();
    if (!text) continue;
    if (numeric.has(key)) {
      if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error('Financial fields require a nonnegative number.');
      const number = Number(text);
      if (!Number.isFinite(number) || number > Number.MAX_SAFE_INTEGER) throw new Error('Financial value is outside the supported range.');
      if (key === 'time_in_business_months' && !Number.isSafeInteger(number)) throw new Error('Time in business requires whole months.');
      if (key !== 'time_in_business_months' && !/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Money fields support at most two decimal places.');
      if (key !== 'time_in_business_months') {
        const [whole, fraction = ''] = text.split('.');
        const canonical = `${BigInt(whole)}.${fraction.padEnd(2, '0')}`;
        const [wireWhole, wireFraction = ''] = JSON.stringify(number).split('.');
        if (`${BigInt(wireWhole)}.${wireFraction.padEnd(2, '0')}` !== canonical) throw new Error('Money value cannot be represented without losing cents.');
      }
      patch[key] = number;
    } else if (key === 'formation_state') {
      if (!/^[A-Za-z]{2}$/.test(text)) throw new Error('Formation state requires a two-letter code.');
      patch[key] = text.toUpperCase();
    } else if (key === 'formation_date') {
      const date = new Date(`${text}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error('Formation date must be a valid calendar date.');
      patch[key] = text;
    } else {
      if (text.length > (key === 'legal_name' ? 200 : key === 'entity_type' ? 100 : 12)) throw new Error('Business profile text exceeds its allowed length.');
      patch[key] = text;
    }
  }
  if (Object.keys(patch).length === 1) throw new Error('Enter a business fact. Blank fields leave stored values unchanged.');
  return patch;
}

export function bindBusinessProfileForm({ document, supabase, isKnownClient, writesEnabled=true }) {
  const select = document.getElementById('business-client'), form = document.getElementById('business-form');
  const status = document.getElementById('business-status'), button = form.querySelector('button[type="submit"]');
  const inputs = Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, document.getElementById(id)]));
  let generation = 0, loadedClient = null, saving = false, originalValues = {};
  function lock(value) { button.disabled = value; for (const input of Object.values(inputs)) input.disabled = value; }
  lock(true);
  select.addEventListener('change', async () => {
    const request = ++generation, clientId = select.value;
    loadedClient = null; originalValues = {};
    for (const input of Object.values(inputs)) input.value = '';
    lock(true); status.textContent = '';
    if (!clientId || !isKnownClient(clientId)) return;
    status.textContent = 'Loading business profile…';
    try {
      const { data, error } = await supabase.from('business_profiles').select('*').eq('client_id', clientId).maybeSingle();
      if (request !== generation || select.value !== clientId) return;
      if (error || (data && data.client_id !== clientId)) throw new Error('profile_unavailable');
      for (const [key, input] of Object.entries(inputs)) input.value = data?.[key] ?? '';
      originalValues = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, String(input.value)]));
      loadedClient = clientId; lock(!writesEnabled);
      status.textContent = data ? '' : 'No business profile yet. Enter the business entity’s own facts.';
    } catch { if (request === generation) status.textContent = 'Business profile could not be loaded. Select the client again to retry.'; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!writesEnabled) { status.textContent='Profile saves are paused pending the entity-bound funding workflow.'; return; }
    if (saving) return;
    const clientId = select.value;
    if (!clientId || clientId !== loadedClient || !isKnownClient(clientId)) { status.textContent = 'Load the selected client’s business profile before saving.'; return; }
    let patch;
    try { patch = businessProfilePatch(clientId, Object.fromEntries(Object.entries(inputs).filter(([key, input]) => String(input.value) !== originalValues[key]).map(([key, input]) => [key, input.value]))); }
    catch (error) { status.textContent = error.message; return; }
    saving = true; select.disabled = true; lock(true); status.textContent = 'Saving business profile…';
    try {
      const { error } = await supabase.from('business_profiles').upsert({ ...patch, updated_at: new Date().toISOString() }, { onConflict: 'client_id' });
      if (!error) for (const key of Object.keys(patch)) if (key in inputs) originalValues[key] = String(inputs[key].value);
      status.textContent = error ? 'Business profile could not be saved. Your entries remain available to retry.' : 'Business profile saved. Blank fields left stored values unchanged.';
    } catch { status.textContent = 'Save could not be confirmed. Reload the profile before retrying.'; loadedClient = null; }
    finally { saving = false; select.disabled = false; lock(loadedClient !== select.value); }
  });
}
