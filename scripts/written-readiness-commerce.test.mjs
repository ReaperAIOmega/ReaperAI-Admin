// Unit tests with an injected client and fetch. Not a signed browser session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildEvidence, previewQuote, publishQuote, recordReconciliation, storeEvidence, validateExpiry, STAGING_URL } from '../written-readiness-commerce.mjs';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DRAFT = U(1), QUOTE = U(2), PAY = U(3), EV = U(4), ADMIN = U(5);
const staging = { staging: true, url: STAGING_URL };
function client({ aal = 'aal2', responses = {} } = {}) {
  const calls = [];
  return { calls,
    auth: { getUser: async () => ({ data: { user: { id: ADMIN } } }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: aal } }) } },
    rpc: async (name, args) => { calls.push([name, args]); const r = responses[name]; return typeof r === 'function' ? r(args) : r ?? { error: { code: 'XX000' } }; } };
}
const preview = { quote_id: QUOTE, status: 'draft', title: 'Written Business Funding Readiness Blueprint', scope: 'Written readiness only.', amount: 250, currency: 'USD', terms_sha256: 'a'.repeat(64) };
const inDays = (d) => new Date(Date.now() + d * 86400000).toISOString();

test('production, non-staging and AAL1 sessions are refused before any RPC', async () => {
  for (const [runtime, aal] of [[{ staging: false, url: 'https://itswbmjvuxumfjqkkqgx.supabase.co' }, 'aal2'], [staging, 'aal1']]) {
    const c = client({ aal });
    await assert.rejects(previewQuote(c, runtime, DRAFT), /staging|AAL2/);
    await assert.rejects(publishQuote(c, runtime, DRAFT, preview, inDays(7)), /staging|AAL2/);
    await assert.rejects(recordReconciliation(c, runtime, PAY, 'unknown', {}, 'notes long enough'), /staging|AAL2/);
    assert.equal(c.calls.length, 0);
  }
});

test('publish sends exactly the previewed terms digest and a bounded expiry; validates the receipt', async () => {
  const receipt = { quote_id: QUOTE, terms_sha256: preview.terms_sha256, offer_sha256: 'b'.repeat(64) };
  const c = client({ responses: { publish_written_readiness_quote: { data: receipt } } });
  const exp = inDays(7);
  assert.deepEqual(await publishQuote(c, staging, DRAFT, preview, exp), receipt);
  assert.deepEqual(c.calls[0], ['publish_written_readiness_quote', { p_draft_id: DRAFT, p_terms_sha256: preview.terms_sha256, p_expires_at: new Date(exp).toISOString() }]);
  await assert.rejects(publishQuote(c, staging, DRAFT, { ...preview, status: 'sent' }, exp), /unpublished draft/);
  for (const e of [inDays(0.01), inDays(31), 'not a date']) assert.throws(() => validateExpiry(e), /between 1 hour and 30 days/);
  const bad = client({ responses: { publish_written_readiness_quote: { data: { ...receipt, terms_sha256: 'c'.repeat(64) } } } });
  await assert.rejects(publishQuote(bad, staging, DRAFT, preview, exp), (e) => e.outcome === 'UNKNOWN');
  const refused = client({ responses: { publish_written_readiness_quote: { error: { code: '22023', message: 'Quote terms differ from the reviewed version' } } } });
  await assert.rejects(publishQuote(refused, staging, DRAFT, preview, exp), (e) => e.outcome === 'REJECTED' && /differ/.test(e.message));
});

test('evidence: PDF only, local digest prepared, bytes uploaded to the staging function, server digest must match', async () => {
  const pdf = new TextEncoder().encode('%PDF-1.7 synthetic fiverr order list');
  const sha = createHash('sha256').update(pdf).digest('hex');
  const c = client({ responses: { prepare_written_readiness_evidence: (a) => ({ data: { evidence_id: EV, sha256: a.p_sha256, committed: false } }) } });
  const requests = [];
  const fetchImpl = async (url, init) => { requests.push([url, init]); return new Response(JSON.stringify({ evidence_id: EV, sha256: sha, committed_at: 'x', replayed: false }), { status: 200 }); };
  const r = await storeEvidence(c, staging, { paymentId: PAY, purpose: 'no_prior_payment_check', bytes: pdf, accessToken: 'tok', fetchImpl });
  assert.equal(r.sha256, sha);
  assert.deepEqual(c.calls[0][1], { p_payment_id: PAY, p_purpose: 'no_prior_payment_check', p_sha256: sha, p_bytes: pdf.length });
  assert.equal(requests[0][0], `${STAGING_URL}/functions/v1/verify-reconciliation-evidence`);
  assert.equal(requests[0][1].headers['x-evidence-id'], EV);
  await assert.rejects(storeEvidence(c, staging, { paymentId: PAY, purpose: 'no_prior_payment_check', bytes: new TextEncoder().encode('PNG...'), accessToken: 't', fetchImpl }), /PDF/);
  const mismatch = async () => new Response(JSON.stringify({ evidence_id: EV, sha256: 'f'.repeat(64) }), { status: 200 });
  await assert.rejects(storeEvidence(c, staging, { paymentId: PAY, purpose: 'no_prior_payment_check', bytes: pdf, accessToken: 't', fetchImpl: mismatch }), (e) => e.outcome === 'UNKNOWN');
  const lost = async () => { throw new Error('network'); };
  await assert.rejects(storeEvidence(c, staging, { paymentId: PAY, purpose: 'no_prior_payment_check', bytes: pdf, accessToken: 't', fetchImpl: lost }), (e) => e.outcome === 'UNKNOWN' && e.evidenceId === EV);
});

test('buildEvidence mirrors the database rules and never accepts a typed digest', () => {
  const now = new Date().toISOString();
  assert.deepEqual(buildEvidence('unknown', { sourcesChecked: ['fiverr'], checkedAt: now }), { sources_checked: ['fiverr'], checked_at: now });
  assert.throws(() => buildEvidence('no_prior_payment_verified', { sourcesChecked: ['fiverr'], checkedAt: now }), /stored evidence/);
  assert.throws(() => buildEvidence('no_prior_payment_verified', { sourcesChecked: [], checkedAt: now, evidenceIds: [EV] }), /source/);
  assert.throws(() => buildEvidence('no_prior_payment_verified', { sourcesChecked: ['fiverr'], checkedAt: new Date(Date.now() - 8 * 86400000).toISOString(), evidenceIds: [EV] }), /7 days/);
  const paid = buildEvidence('previously_paid_verified', { sourcesChecked: ['fiverr'], checkedAt: now, evidenceIds: [EV],
    marketplace: { externalReference: 'FO1234ABCD', grossAmount: '250.00', verifiedAt: now } });
  assert.equal(paid.provider_state, 'paid');
  assert.ok(!('evidence_sha256' in paid));
  assert.throws(() => buildEvidence('previously_paid_verified', { sourcesChecked: ['direct_invoice'], checkedAt: now, evidenceIds: [EV], marketplace: { externalReference: 'FO1234ABCD', grossAmount: '250', verifiedAt: now } }), /Fiverr check/);
  assert.throws(() => buildEvidence('disputed_or_refunded', { sourcesChecked: ['fiverr'], checkedAt: now, evidenceIds: [EV], marketplace: { externalReference: 'FO1234ABCD', providerState: 'paid', grossAmount: '250', verifiedAt: now } }), /Provider state/);
});

test('recordReconciliation validates notes and that only no-prior-payment opens checkout', async () => {
  const ok = (decision) => client({ responses: { record_written_readiness_prior_payment_reconciliation: { data: { payment_id: PAY, decision, checkout_permitted: decision === 'no_prior_payment_verified' } } } });
  assert.equal((await recordReconciliation(ok('no_prior_payment_verified'), staging, PAY, 'no_prior_payment_verified', {}, 'Checked Fiverr and invoices.')).checkout_permitted, true);
  await assert.rejects(recordReconciliation(ok('unknown'), staging, PAY, 'unknown', {}, 'short'), /notes/);
  const lying = client({ responses: { record_written_readiness_prior_payment_reconciliation: { data: { payment_id: PAY, decision: 'previously_paid_verified', checkout_permitted: true } } } });
  await assert.rejects(recordReconciliation(lying, staging, PAY, 'previously_paid_verified', {}, 'Checked the Fiverr order.'), (e) => e.outcome === 'UNKNOWN');
});

test('privileged page starts only on admin-ready, uses textContent, and change-password sends the password to the server function', async () => {
  const ui = await readFile(new URL('../written-readiness-commerce-ui.mjs', import.meta.url), 'utf8');
  assert.match(ui, /'reaper:admin-ready'/);
  assert.ok(!/admin-bootstrap|reaperAdminBootstrap|innerHTML/.test(ui));
  const cp = await readFile(new URL('../change-password.js', import.meta.url), 'utf8');
  assert.match(cp, /invoke\('initialize-admin-password-v2', \{ body: \{ password \} \}\)/);
  assert.doesNotMatch(cp, /auth\.updateUser/);
});


test('password setup confirms the password separately from sign out and prevents a second submission', async () => {
  const { runInNewContext } = await import('node:vm');
  const cp = await readFile(new URL('../change-password.js', import.meta.url), 'utf8');
  for (const accepted of [true, false]) {
    let submit;
    let requests = 0;
    let signOuts = 0;
    const nodes = Object.fromEntries(['password-form','new-password','confirm-password','password-submit','password-status']
      .map(id => [id, { value: 'Synthetic-Passw0rd!', textContent: '', disabled: false }]));
    nodes['password-form'].addEventListener = (_, handler) => { submit = handler; };
    const supabase = {
      functions: { invoke: async () => { requests++; return { data: { ok: accepted } }; } },
      auth: { signOut: async () => { signOuts++; return { error: new Error('offline') }; } },
    };
    runInNewContext(cp, {
      window: { reaperAdminBootstrap: { supabase } },
      document: { getElementById: id => nodes[id] },
    });
    await submit({ preventDefault() {} });
    nodes['new-password'].value = nodes['confirm-password'].value = 'Synthetic-Passw0rd!';
    await submit({ preventDefault() {} });
    assert.equal(requests, 1);
    assert.equal(signOuts, accepted ? 1 : 0);
    assert.equal(nodes['password-submit'].disabled, true);
    assert.match(nodes['password-status'].textContent, accepted ? /Password updated, but sign-out/ : /setup could not be confirmed/);
  }
});
