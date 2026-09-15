const ready = window.reaperAdmin
  ? Promise.resolve(window.reaperAdmin)
  : new Promise((resolve) => document.addEventListener('reaper:admin-ready', (event) => resolve(event.detail), { once: true }));

const els = {
  deviceName: document.getElementById('device-name'),
  create: document.getElementById('create-pairing'),
  pairingResult: document.getElementById('pairing-result'),
  pairingMessage: document.getElementById('pairing-message'),
  pairingCode: document.getElementById('pairing-code'),
  copy: document.getElementById('copy-pairing'),
  status: document.getElementById('pairing-status'),
  list: document.getElementById('device-list'),
};

const fmt = (value) => value ? new Date(value).toLocaleString() : '—';
let context;

function setStatus(message) {
  if (els.status) els.status.textContent = message || '';
}

async function loadDevices() {
  const { supabase } = context;
  const { data, error } = await supabase
    .from('jarvis_devices')
    .select('id,device_name,status,created_at,last_used_at,revoked_at')
    .order('created_at', { ascending: false });

  els.list.replaceChildren();
  if (error) {
    console.error('JARVIS device load failed', error);
    els.list.textContent = 'Paired devices could not be loaded.';
    return;
  }

  const rows = data || [];
  if (!rows.length) {
    els.list.textContent = 'No JARVIS devices have been paired yet.';
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Device</th><th>Status</th><th>Created</th><th>Last used</th><th>Action</th></tr></thead>';
  const tbody = document.createElement('tbody');

  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const value of [row.device_name, row.status, fmt(row.created_at), fmt(row.last_used_at)]) {
      const td = document.createElement('td');
      td.textContent = value || '—';
      tr.appendChild(td);
    }

    const action = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = row.status === 'active' ? 'btn-secondary' : 'button';
    button.textContent = row.status === 'active' ? 'Revoke device' : 'Revoked';
    button.disabled = row.status !== 'active';
    if (!button.disabled) {
      button.addEventListener('click', async () => {
        if (!window.confirm(`Revoke ${row.device_name}? JARVIS will lose production access immediately.`)) return;
        button.disabled = true;
        button.textContent = 'Revoking…';
        const { data: result, error: invokeError } = await supabase.functions.invoke('revoke-jarvis-device', {
          body: { device_id: row.id },
        });
        if (invokeError || !result?.ok) {
          console.error('Device revocation failed', invokeError, result);
          button.disabled = false;
          button.textContent = 'Revoke device';
          setStatus('Device revocation failed. Refresh your administrator session and try again.');
          return;
        }
        setStatus(`${row.device_name} was revoked.`);
        await loadDevices();
      });
    }
    action.appendChild(button);
    tr.appendChild(action);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  els.list.appendChild(table);
}

els.create?.addEventListener('click', async () => {
  setStatus('');
  els.create.disabled = true;
  els.create.textContent = 'Generating…';
  const deviceName = String(els.deviceName?.value || 'REAPER JARVIS').trim().slice(0, 120);
  const { data, error } = await context.supabase.functions.invoke('create-jarvis-pairing', {
    body: { device_name: deviceName },
  });
  els.create.disabled = false;
  els.create.textContent = 'Generate 10-minute pairing code';

  if (error || !data?.ok || !data?.pairing_code) {
    console.error('Pairing creation failed', error, data);
    setStatus(data?.error === 'mfa_required'
      ? 'MFA verification is required before a JARVIS pairing code can be created.'
      : 'Pairing code could not be created.');
    return;
  }

  els.pairingCode.value = data.pairing_code;
  els.pairingMessage.textContent = `Use this code once in REAPER JARVIS before ${fmt(data.expires_at)}. Treat it like a temporary credential.`;
  els.pairingResult.hidden = false;
  setStatus('Pairing code created. It expires automatically and cannot be reused.');
});

els.copy?.addEventListener('click', async () => {
  const value = els.pairingCode?.value || '';
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    els.copy.textContent = 'Copied';
    setTimeout(() => { els.copy.textContent = 'Copy pairing code'; }, 1200);
  } catch {
    els.pairingCode.select();
  }
});

ready.then(async (value) => {
  context = value;
  await loadDevices();
}).catch((error) => {
  console.error('Platform settings initialization failed', error);
  if (els.list) els.list.textContent = 'Platform settings are unavailable.';
});
