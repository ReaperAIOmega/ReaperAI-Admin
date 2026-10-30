// Named synthetic $250K fixture only. No production artifact selection, client delivery, or auto-approval.
const STAGING_URL = 'https://qemjnekgcbuddayzhdtr.supabase.co';
const TARGETS = Object.freeze([
  { name: 'Funding Blueprint PDF', kind: 'pdf', id: '7abc1508-9508-452f-995f-f5870fd32a06' },
  { name: 'Financial Model XLSX', kind: 'xlsx', id: '82b109c6-1fb2-49a9-a179-e9aea8ab8807' },
]);
const matches = new Map(); // local hash matches; never persisted or treated as personal review
const $ = (id) => document.getElementById(id);
const status = (message) => { $('artifact-review-status').textContent = message; };
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = String(text);
  if (className) el.className = className;
  return el;
};
const readContext = () => window.reaperAdmin
  ? Promise.resolve(window.reaperAdmin)
  : new Promise((resolve) => document.addEventListener('reaper:admin-ready', (event) => resolve(event.detail), { once: true }));
const stagingOnly = (ctx) =>
  ['127.0.0.1', 'localhost'].includes(location.hostname)
  && ctx.supabase?.supabaseUrl === STAGING_URL
  && ctx.profile?.role === 'admin' && ctx.profile.status === 'active';
async function requireAal2(ctx) {
  const [{ data: aal, error }, { data: userData, error: userError }] = await Promise.all([
    ctx.supabase.auth.mfa.getAuthenticatorAssuranceLevel(), ctx.supabase.auth.getUser(),
  ]);
  if (error || userError || aal?.currentLevel !== 'aal2' || userData?.user?.id !== ctx.profile.id)
    throw new Error('Current authenticated staging administrator MFA AAL2 session is required.');
}
async function loadArtifact(ctx, target) {
  const { data, error } = await ctx.supabase.rpc('read_funding_artifact_upload', { p_artifact: target.id });
  if (error) throw new Error('Canonical review metadata unavailable; check staging/AAL2 permissions.');
  if (data?.artifact_id !== target.id || data.kind !== target.kind
      || !Number.isSafeInteger(data.revision) || data.revision < 1
      || !/^[0-9a-f]{64}$/.test(data.sha256 || '')
      || !Number.isSafeInteger(data.bytes) || data.bytes < 1
      || data.verified_sha256 !== data.sha256 || data.storage_current !== true
      || data.source_context?.client_id !== data.client_id
      || data.storage_path !== `funding-artifacts/${data.client_id}/${target.id}.${target.kind}`)
    throw new Error('Current canonical artifact binding or storage verification failed. No review allowed.');
  return data;
}
function makeCard(ctx, target, data) {
  const card = node('section', undefined, 'card');
  card.append(node('h2', target.name));
  const summary = node('p', `State: ${data.state} | Revision: ${data.revision} | Size: ${data.bytes} bytes`);
  card.append(summary, node('p', `Artifact: ${data.artifact_id}`));
  card.append(node('p', `SHA-256 (immutable): ${data.sha256}`));
  card.append(node('p', `File: ${data.file_name} | Calculation version: ${data.calculation_version}`));
  const info = node('p', 'Select the matching downloaded file to verify its SHA-256 locally.');
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = target.kind === 'pdf' ? '.pdf,application/pdf' : '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  picker.setAttribute('aria-label', `Select ${target.name} for local hash verification`);
  const verify = node('button', 'Verify file SHA-256', 'btn-secondary');
  verify.type = 'button';
  const checked = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  checked.append(box, document.createTextNode(' I personally opened and inspected this exact file. I understand it is a synthetic readiness-only draft.'));
  const notes = document.createElement('textarea');
  notes.rows = 3;
  notes.maxLength = 4000;
  notes.placeholder = 'Required: concise personal review / approval rationale for this exact version';
  notes.setAttribute('aria-label', `Administrator notes for ${target.name}`);
  const action = node('button', data.state === 'REVIEWED' ? 'Approve exact version' : 'Mark personally reviewed', 'button');
  action.type = 'button';
  action.disabled = true;
  const result = node('p', '', '');
  result.setAttribute('role', 'status');
  const same = () => matches.get(target.id) === data.sha256;
  const updateReady = () => {
    action.disabled = !same() || !box.checked || !notes.value.trim()
      || !['REVIEW_REQUESTED', 'REVIEWED'].includes(data.state);
  };
  verify.addEventListener('click', async () => {
    const selected = picker.files?.[0];
    if (!selected) { result.textContent = 'Choose the file first.'; return; }
    matches.delete(target.id); updateReady(); verify.disabled = true;
    try {
      if (selected.size !== data.bytes) throw new Error('Size mismatch');
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await selected.arrayBuffer())),
        byte => byte.toString(16).padStart(2, '0')).join('');
      if (digest !== data.sha256) throw new Error('SHA-256 mismatch — do not review or approve this version');
      matches.set(target.id, digest);
      result.textContent = 'Local SHA-256 and byte length match the verified canonical record. Inspect the contents before checking the box.';
    } catch (error) {
      result.textContent = String(error.message || error);
    } finally { verify.disabled = false; updateReady(); }
  });
  box.addEventListener('change', updateReady);
  notes.addEventListener('input', updateReady);
  if (!['REVIEW_REQUESTED', 'REVIEWED'].includes(data.state)) {
    action.disabled = true;
    result.textContent = data.state === 'APPROVED'
      ? 'Canonical approval already recorded. This page cannot authorize delivery.'
      : 'This artifact is not in a personal-review transition state.';
  }
  action.addEventListener('click', async () => {
    if (!same() || !box.checked || !notes.value.trim() || action.disabled) return;
    const expectedNext = data.state === 'REVIEWED' ? 'APPROVED' : 'REVIEWED';
    if (!confirm(`Record ${expectedNext} for ${target.name}?\nID: ${target.id}\nSHA-256: ${data.sha256}\nThis does not authorize customer delivery.`)) return;
    action.disabled = true;
    try {
      await requireAal2(ctx);
      const { data: response, error } = await ctx.supabase.rpc('transition_funding_artifact', {
        p_artifact: target.id,
        p_expected_revision: data.revision,
        p_expected_sha256: data.sha256,
        p_next: expectedNext,
        p_notes: notes.value.trim(),
      });
      if (error || response?.state !== expectedNext || response?.sha256 !== data.sha256
          || response.revision !== data.revision + 1) throw new Error('Canonical transition not confirmed; do not retry blindly.');
      const current = await loadArtifact(ctx, target);
      if (current.state !== expectedNext || current.sha256 !== data.sha256)
        throw new Error('Transition returned but current canonical state could not be confirmed.');
      matches.delete(target.id);
      card.replaceWith(makeCard(ctx, target, current));
      status(`Canonical ${expectedNext} recorded for ${target.name}; customer delivery remains disabled.`);
    } catch (error) {
      result.textContent = error.message || 'Canonical approval transaction failed. Verify current state before retrying.';
      matches.delete(target.id); box.checked = false; updateReady();
    }
  });
  const controls = node('div', undefined, 'button-row');
  controls.append(picker, verify);
  card.append(info, controls, checked, notes, action, result);
  return card;
}
async function start() {
  const ctx = await readContext();
  if (!stagingOnly(ctx)) {
    status('BLOCKED: this page is available only to the synthetic staging Admin on localhost. Production was not modified.');
    return;
  }
  try {
    await requireAal2(ctx);
    const container = $('artifact-review-items');
    for (const target of TARGETS) {
      try { container.append(makeCard(ctx, target, await loadArtifact(ctx, target))); }
      catch (error) { const card = node('section', undefined, 'card'); card.append(node('h2', target.name), node('p', error.message)); container.append(card); }
    }
    status('Staging-only exact-version review. Complete each document independently; no client delivery will be enabled.');
  } catch (error) {
    status(error.message || 'Authentication gate unavailable.');
  }
}
start().catch(() => status('Review interface unavailable; no approval recorded.'));
