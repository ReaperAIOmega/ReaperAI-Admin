// Administrator side of the written-readiness offer (isolated staging only):
// preview/publish the EXISTING draft quote, store server-hashed reconciliation evidence, record reconciliation.
// Pure functions with an injected client; Core #45 re-enforces every rule in the database.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64 = /^[a-f0-9]{64}$/;
export const STAGING_URL = 'https://qemjnekgcbuddayzhdtr.supabase.co';
export const DECISIONS = ['no_prior_payment_verified', 'previously_paid_verified', 'disputed_or_refunded', 'unknown'];
export const SOURCES = ['fiverr', 'direct_invoice', 'other_marketplace'];
const MAX_EVIDENCE_BYTES = 20971520;

function outcome(error, fallback) {
  const rejected = /^(?:22|23|42|54|55)[A-Z0-9]{3}$/.test(error?.code ?? '');
  return Object.assign(new Error(rejected ? (error.message || fallback) : 'Outcome unknown. Reload and check the record before retrying.'),
    { outcome: rejected ? 'REJECTED' : 'UNKNOWN', code: error?.code });
}

export async function requireAal2Staging(supabase, runtime) {
  if (!runtime?.staging || runtime.url !== STAGING_URL) throw new Error('Isolated staging administrator only');
  const [who, aal] = await Promise.all([supabase.auth.getUser(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
  if (who.error || !UUID.test(who.data?.user?.id ?? '') || aal.error || aal.data?.currentLevel !== 'aal2') {
    throw new Error('Signed AAL2 administrator required');
  }
  return who.data.user.id;
}

export async function previewQuote(supabase, runtime, draftOperationId) {
  await requireAal2Staging(supabase, runtime);
  if (!UUID.test(draftOperationId ?? '')) throw new Error('Draft operation required');
  const { data, error } = await supabase.rpc('preview_written_readiness_quote', { p_draft_id: draftOperationId });
  if (error) throw outcome(error, 'Draft unavailable');
  if (!data || !UUID.test(data.quote_id ?? '') || !HEX64.test(data.terms_sha256 ?? '') || data.currency !== 'USD' || !(Number(data.amount) > 0)) {
    throw Object.assign(new Error('Preview response invalid'), { outcome: 'UNKNOWN' });
  }
  return data;
}

export function validateExpiry(expiresAt, now = Date.now()) {
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t) || t < now + 3600000 || t > now + 30 * 86400000) throw new Error('Expiry must be between 1 hour and 30 days ahead');
  return new Date(t).toISOString();
}

// Publishes exactly the terms the administrator previewed. A changed quote fails in the database.
export async function publishQuote(supabase, runtime, draftOperationId, preview, expiresAt) {
  await requireAal2Staging(supabase, runtime);
  if (!preview || preview.status !== 'draft') throw new Error('Only an unpublished draft quote can be published');
  const expires = validateExpiry(expiresAt);
  const { data, error } = await supabase.rpc('publish_written_readiness_quote',
    { p_draft_id: draftOperationId, p_terms_sha256: preview.terms_sha256, p_expires_at: expires });
  if (error) throw outcome(error, 'Quote could not be published');
  if (!data || data.quote_id !== preview.quote_id || data.terms_sha256 !== preview.terms_sha256 || !HEX64.test(data.offer_sha256 ?? '')) {
    throw Object.assign(new Error('Publication receipt invalid'), { outcome: 'UNKNOWN' });
  }
  return data;
}

async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Prepare -> upload through verify-reconciliation-evidence (server stores without overwrite, re-hashes) -> committed.
export async function storeEvidence(supabase, runtime, { paymentId, purpose, bytes, accessToken, fetchImpl = fetch }) {
  await requireAal2Staging(supabase, runtime);
  if (!UUID.test(paymentId ?? '') || !['no_prior_payment_check', 'marketplace_order'].includes(purpose)) throw new Error('Obligation and purpose required');
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (view.length < 5 || view.length > MAX_EVIDENCE_BYTES || String.fromCharCode(...view.slice(0, 5)) !== '%PDF-') throw new Error('Evidence must be a PDF up to 20 MB');
  const digest = await sha256(view);
  const { data: prepared, error } = await supabase.rpc('prepare_written_readiness_evidence',
    { p_payment_id: paymentId, p_purpose: purpose, p_sha256: digest, p_bytes: view.length });
  if (error) throw outcome(error, 'Evidence could not be prepared');
  if (!prepared || !UUID.test(prepared.evidence_id ?? '') || prepared.sha256 !== digest) throw Object.assign(new Error('Prepared evidence invalid'), { outcome: 'UNKNOWN' });
  if (prepared.committed) return { evidence_id: prepared.evidence_id, sha256: digest, replayed: true };
  let response;
  try {
    response = await fetchImpl(`${STAGING_URL}/functions/v1/verify-reconciliation-evidence`, {
      method: 'POST', body: view,
      headers: { authorization: `Bearer ${accessToken}`, 'x-evidence-id': prepared.evidence_id, 'content-type': 'application/pdf' },
    });
  } catch {
    throw Object.assign(new Error('Upload outcome unknown. Retry with the same file.'), { outcome: 'UNKNOWN', evidenceId: prepared.evidence_id });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || 'Evidence upload failed'), { outcome: response.status >= 500 ? 'UNKNOWN' : 'REJECTED', evidenceId: prepared.evidence_id });
  if (body.evidence_id !== prepared.evidence_id || body.sha256 !== digest) throw Object.assign(new Error('Stored evidence receipt invalid'), { outcome: 'UNKNOWN' });
  return body;
}

export function buildEvidence(decision, { sourcesChecked, checkedAt, evidenceIds = [], marketplace = null }) {
  if (!DECISIONS.includes(decision)) throw new Error('Decision required');
  const sources = [...new Set(sourcesChecked ?? [])];
  if (!sources.length || sources.some((s) => !SOURCES.includes(s))) throw new Error('Name every source you checked');
  const checked = Date.parse(checkedAt);
  if (!Number.isFinite(checked) || checked > Date.now() || checked < Date.now() - 7 * 86400000) throw new Error('Check time must be within the last 7 days');
  const evidence = { sources_checked: sources, checked_at: new Date(checked).toISOString() };
  if (decision !== 'unknown') {
    if (!evidenceIds.length || evidenceIds.length > 10 || evidenceIds.some((id) => !UUID.test(id))) throw new Error('Attach 1 to 10 stored evidence documents');
    evidence.evidence_ids = evidenceIds;
  }
  if (decision === 'previously_paid_verified' || decision === 'disputed_or_refunded') {
    if (!sources.includes('fiverr')) throw new Error('A marketplace finding requires the Fiverr check');
    const m = marketplace ?? {};
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(m.externalReference ?? '')) throw new Error('Exact Fiverr order reference required');
    const state = decision === 'previously_paid_verified' ? 'paid' : m.providerState;
    if (!(decision === 'previously_paid_verified' ? state === 'paid' : ['refunded', 'disputed'].includes(state))) throw new Error('Provider state required');
    if (!/^[0-9]{1,10}(\.[0-9]{1,2})?$/.test(String(m.grossAmount ?? ''))) throw new Error('Gross amount required');
    const verified = Date.parse(m.verifiedAt);
    if (!Number.isFinite(verified) || verified > Date.now() || verified < Date.now() - 7 * 86400000) throw new Error('Verification time must be within the last 7 days');
    Object.assign(evidence, { provider: 'fiverr', external_reference: m.externalReference, provider_state: state,
      gross_amount: String(m.grossAmount), currency: 'USD', verified_at: new Date(verified).toISOString() });
  }
  return evidence;
}

export async function recordReconciliation(supabase, runtime, paymentId, decision, evidence, notes) {
  await requireAal2Staging(supabase, runtime);
  const text = String(notes ?? '').trim();
  if (text.length < 10 || text.length > 2000) throw new Error('Review notes of 10 to 2000 characters required');
  const { data, error } = await supabase.rpc('record_written_readiness_prior_payment_reconciliation',
    { p_payment_id: paymentId, p_decision: decision, p_evidence: evidence, p_review_notes: text });
  if (error) throw outcome(error, 'Reconciliation could not be recorded');
  if (!data || data.payment_id !== paymentId || data.decision !== decision
      || data.checkout_permitted !== (decision === 'no_prior_payment_verified')) {
    throw Object.assign(new Error('Reconciliation receipt invalid'), { outcome: 'UNKNOWN' });
  }
  return data;
}
