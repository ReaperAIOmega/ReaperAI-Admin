import { buildEvidence, previewQuote, publishQuote, recordReconciliation, storeEvidence } from './written-readiness-commerce.mjs';
import { resolveRuntime } from './runtime-config.mjs';

// Privileged page: starts only on the AAL2 admin-ready signal (never on the bootstrap signal).
const ready = window.reaperAdmin ? Promise.resolve(window.reaperAdmin)
  : new Promise((resolve) => document.addEventListener('reaper:admin-ready', (e) => resolve(e.detail), { once: true }));
const $ = (id) => document.getElementById(id);
const show = (id, value) => { $(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); };
const fail = (id, e) => show(id, `${e.outcome === 'UNKNOWN' ? 'UNKNOWN OUTCOME — reload and check before retrying. ' : ''}${e.message}`);

ready.then(async ({ supabase }) => {
  let runtime;
  try { runtime = resolveRuntime(window.location, 'admin'); } catch (e) { show('status', e.message); return; }
  if (!runtime.staging) { show('status', 'This page operates only against isolated staging.'); return; }
  show('status', 'Signed AAL2 administrator (staging).');
  ['preview', 'publish', 'reconcile'].forEach((id) => { $(id).disabled = false; });
  let preview = null;

  $('preview').addEventListener('click', async () => {
    try { preview = await previewQuote(supabase, runtime, $('draft-id').value.trim().toLowerCase()); show('preview-result', preview); }
    catch (e) { preview = null; fail('preview-result', e); }
  });
  $('publish-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!preview) { show('publish-result', 'Preview the exact terms first.'); return; }
    $('publish').disabled = true;
    try { show('publish-result', await publishQuote(supabase, runtime, $('draft-id').value.trim().toLowerCase(), preview, new Date($('expires').value).toISOString())); }
    catch (e) { fail('publish-result', e); }
    finally { $('publish').disabled = false; }
  });
  $('reconcile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('reconcile').disabled = true;
    try {
      const decision = $('decision').value;
      const paymentId = $('payment-id').value.trim().toLowerCase();
      const marketplace = decision === 'previously_paid_verified' || decision === 'disputed_or_refunded';
      const evidenceIds = [];
      if (decision !== 'unknown') {
        const { data: { session } } = await supabase.auth.getSession();
        for (const file of $('evidence-files').files) {
          const stored = await storeEvidence(supabase, runtime, { paymentId, purpose: marketplace ? 'marketplace_order' : 'no_prior_payment_check',
            bytes: new Uint8Array(await file.arrayBuffer()), accessToken: session?.access_token });
          evidenceIds.push(stored.evidence_id);
        }
      }
      const evidence = buildEvidence(decision, {
        sourcesChecked: [...document.querySelectorAll('input[name="source"]:checked')].map((n) => n.value),
        checkedAt: new Date($('checked-at').value).toISOString(), evidenceIds,
        marketplace: marketplace ? { externalReference: $('order-ref').value.trim(), providerState: $('provider-state').value,
          grossAmount: $('gross-amount').value.trim(), verifiedAt: new Date($('verified-at').value).toISOString() } : null,
      });
      show('reconcile-result', await recordReconciliation(supabase, runtime, paymentId, decision, evidence, $('notes').value));
    } catch (e) { fail('reconcile-result', e); }
    finally { $('reconcile').disabled = false; }
  });
});
