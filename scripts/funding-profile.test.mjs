import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessProfilePatch, bindBusinessProfileForm } from '../funding-profile.mjs';

test('partial financial update preserves entity identity and distinguishes unknown from zero', () => {
  const stored = { legal_name: 'Synthetic Business LLC', formation_state: 'OH', entity_type: 'LLC', annual_revenue: 75000 };
  const patch = businessProfilePatch('synthetic-a', { annual_revenue: '', existing_business_debt: '0', legal_name: '  ', full_name: 'Person Is Not An Entity' });
  assert.deepEqual(patch, { client_id: 'synthetic-a', existing_business_debt: 0 });
  assert.deepEqual({ ...stored, ...patch }, { ...stored, client_id: 'synthetic-a', existing_business_debt: 0 });
});
test('malformed, negative, nonfinite and excessively precise financial values fail closed', () => {
  for (const value of ['NaN', 'Infinity', '-1', '12oops', '1,000', '1e309', '0x10', '1.001', '9007199254740992', '90071992547409.91']) {
    assert.throws(() => businessProfilePatch('synthetic-a', { annual_revenue: value }), undefined, value);
  }
  assert.throws(() => businessProfilePatch('synthetic-a', { time_in_business_months: '3.5' }));
  assert.throws(() => businessProfilePatch('', { legal_name: 'A' }));
  assert.throws(() => businessProfilePatch('synthetic-a', {}));
});
test('explicit scoped identity corrections do not clear other facts; invalid dates are rejected', () => {
  assert.deepEqual(businessProfilePatch('synthetic-a', { legal_name: ' Correct LLC ', formation_state: 'ga' }), { client_id: 'synthetic-a', legal_name: 'Correct LLC', formation_state: 'GA' });
  assert.throws(() => businessProfilePatch('synthetic-a', { formation_date: '2026-02-30' }));
  assert.throws(() => businessProfilePatch('synthetic-a', { formation_state: 'Georgia' }));
});
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function harness(writesEnabled=true) {
  const elements = {}, reads = [], writes = [], button = { disabled: false };
  const ids = ['business-client', 'business-form', 'business-status', 'business-name', 'business-entity', 'business-state', 'business-date', 'business-naics', 'business-annual', 'business-monthly', 'business-months', 'business-debt'];
  for (const id of ids) elements[id] = { value: '', disabled: false, textContent: '', handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; }, querySelector() { return button; } };
  const supabase = { from(table) {
    assert.equal(table, 'business_profiles');
    return { select() { return { eq(key, id) { assert.equal(key, 'client_id'); return { maybeSingle() { const task = deferred(); reads.push({ id, task }); return task.promise; } }; } }; },
      upsert(payload, options) { const task = deferred(); writes.push({ payload, options, task }); return task.promise; } };
  } };
  bindBusinessProfileForm({ document: { getElementById: id => elements[id] }, supabase, isKnownClient: id => ['synthetic-a', 'synthetic-b'].includes(id), writesEnabled });
  function change(id) { elements['business-client'].value = id; return elements['business-client'].handlers.change(); }
  function submit() { return elements['business-form'].handlers.submit({ preventDefault() {} }); }
  return { elements, reads, writes, button, change, submit };
}
test('client switching clears prior facts immediately and ignores an out-of-order response', async () => {
  const h = harness();
  const a = h.change('synthetic-a');
  h.elements['business-name'].value = 'Old unsaved facts';
  const b = h.change('synthetic-b');
  assert.equal(h.elements['business-name'].value, '');
  assert.equal(h.button.disabled, true);
  await h.submit(); assert.equal(h.writes.length, 0);
  h.reads[1].task.resolve({ data: { client_id: 'synthetic-b', legal_name: 'Business B LLC' }, error: null }); await b;
  h.reads[0].task.resolve({ data: { client_id: 'synthetic-a', legal_name: 'Business A LLC' }, error: null }); await a;
  assert.equal(h.elements['business-name'].value, 'Business B LLC');
  h.elements['business-debt'].value = '0';
  const saving = h.submit();
  assert.deepEqual(Object.keys(h.writes[0].payload).sort(), ['client_id', 'existing_business_debt', 'updated_at']);
  assert.equal(h.writes[0].payload.client_id, 'synthetic-b');
  h.writes[0].task.resolve({ error: null }); await saving;
});
test('a client with no profile starts blank and failed loads cannot be saved', async () => {
  const h = harness(); const a = h.change('synthetic-a');
  h.reads[0].task.resolve({ data: { client_id: 'synthetic-a', legal_name: 'A LLC' }, error: null }); await a;
  const b = h.change('synthetic-b'); h.reads[1].task.resolve({ data: null, error: null }); await b;
  assert.equal(h.elements['business-name'].value, ''); assert.equal(h.button.disabled, false);
  const failed = h.change('synthetic-a'); h.reads[2].task.reject(new Error('network failure')); await failed;
  await h.submit(); assert.equal(h.writes.length, 0); assert.equal(h.button.disabled, true);
});
test('a mismatched profile response or an unknown selection cannot enable saving', async () => {
  const h = harness(); const a = h.change('synthetic-a');
  h.reads[0].task.resolve({ data: { client_id: 'synthetic-b', legal_name: 'B LLC' }, error: null }); await a;
  assert.equal(h.elements['business-name'].value, ''); assert.equal(h.button.disabled, true);
  await h.change('not-in-client-list'); await h.submit(); assert.equal(h.writes.length, 0);
});
test('duplicate submit is suppressed; an unconfirmed save requires reload before retry', async () => {
  const h = harness(); const a = h.change('synthetic-a');
  h.reads[0].task.resolve({ data: { client_id: 'synthetic-a', legal_name: 'A LLC', formation_state: 'OH' }, error: null }); await a;
  h.elements['business-annual'].value = '120000'; const saving = h.submit();
  await h.submit(); assert.equal(h.writes.length, 1); assert.equal(h.elements['business-client'].disabled, true);
  assert.equal('legal_name' in h.writes[0].payload, false); assert.equal('formation_state' in h.writes[0].payload, false);
  h.writes[0].task.reject(new Error('response lost')); await saving;
  await h.submit(); assert.equal(h.writes.length, 1); assert.equal(h.button.disabled, true);
});
test('server rejection preserves entered facts and never reports a successful save', async () => {
  const h = harness(); const load = h.change('synthetic-a'); h.reads[0].task.resolve({ data: null, error: null }); await load;
  h.elements['business-name'].value = 'Synthetic Entity LLC'; const saving = h.submit();
  h.writes[0].task.resolve({ error: { message: 'permission denied' } }); await saving;
  assert.equal(h.elements['business-name'].value, 'Synthetic Entity LLC');
  assert.match(h.elements['business-status'].textContent, /could not be saved/); assert.equal(h.button.disabled, false);
});

test('disabled canonical rollout preserves legacy reads and denies programmatic profile writes',async()=>{
 const h=harness(false);const load=h.change('synthetic-a');h.reads[0].task.resolve({data:{client_id:'synthetic-a',legal_name:'Existing LLC',annual_revenue:50000},error:null});await load;
 assert.equal(h.elements['business-name'].value,'Existing LLC');assert.equal(h.button.disabled,true);
 h.elements['business-annual'].value='90000';await h.submit();assert.equal(h.writes.length,0);assert.match(h.elements['business-status'].textContent,/paused/);
});
