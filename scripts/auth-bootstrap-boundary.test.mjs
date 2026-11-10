// Exhaustive state matrix for the administrator guard. Executes the real auth-guard.js source
// against a mocked Supabase client; this is a unit-level check, not a signed browser session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { resolveRuntime } from '../runtime-config.mjs';

const root = new URL('../', import.meta.url);
const source = (await readFile(new URL('auth-guard.js', root), 'utf8')).replace(/^import [^\r\n]*\r?\n/gm, '');
const EMAIL = 'reaper-synthetic-admin-20261028@example.invalid';
const BOOTSTRAP_PAGES = ['/change-password.html', '/mfa-enroll.html', '/mfa-challenge.html'];
const PRIVILEGED_PAGES = ['/index.html', '/clients.html', '/documents.html', '/payments.html', '/site-settings.html'];

async function boot({ pathname, initialized, verified, aal, status = 'active', role = 'admin' }) {
  const events = [];
  const redirects = [];
  const session = { user: { id: 'fixture-id', email: EMAIL } };
  const document = {
    title: 'Synthetic',
    documentElement: { style: { visibility: 'hidden' } },
    dispatchEvent(event) { events.push(event.type); },
    addEventListener() {},
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
      signOut: async () => { events.push('signOut'); },
      mfa: {
        listFactors: async () => ({ data: { totp: verified ? [{ status: 'verified' }] : [{ status: 'unverified' }] } }),
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: aal } }),
      },
    },
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        single: async () => (table === 'profiles'
          ? { data: { id: 'fixture-id', email: EMAIL, role, status } }
          : { data: { password_initialized: initialized } }),
      };
    },
  };
  const window = {
    location: { href: 'http://127.0.0.1:4185' + pathname, pathname, search: '', hash: '', replace(url) { redirects.push(url); } },
    history: { replaceState() {} },
    reaperAdmin: null,
    reaperAdminBootstrap: null,
  };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  await vm.runInNewContext('(async()=>{' + source + '})()', {
    window, document, resolveRuntime, createClient: () => client, CustomEvent, console: { error() {} },
  });
  return { events, redirects, window, document };
}

const matrix = [];
for (const pathname of [...BOOTSTRAP_PAGES, ...PRIVILEGED_PAGES])
  for (const initialized of [false, true])
    for (const verified of [false, true])
      for (const aal of ['aal1', 'aal2'])
        matrix.push({ pathname, initialized, verified, aal });

test('admin-ready is published only for an initialized, TOTP-verified AAL2 administrator', async () => {
  let readyCount = 0;
  for (const state of matrix) {
    const r = await boot(state);
    const label = JSON.stringify(state);
    const fullyAuthenticated = state.initialized && state.verified && state.aal === 'aal2';
    assert.equal(r.events.includes('reaper:admin-ready'), fullyAuthenticated, label);
    assert.equal(Boolean(r.window.reaperAdmin), fullyAuthenticated, label);
    if (r.window.reaperAdmin) assert.equal(r.window.reaperAdmin.aal.currentLevel, 'aal2', label);
    if (fullyAuthenticated) readyCount++;
  }
  assert.equal(readyCount, BOOTSTRAP_PAGES.length + PRIVILEGED_PAGES.length);
});

test('privileged pages below full assurance stay hidden and redirect to setup', async () => {
  for (const state of matrix.filter((s) => PRIVILEGED_PAGES.includes(s.pathname))) {
    if (state.initialized && state.verified && state.aal === 'aal2') continue;
    const r = await boot(state);
    const label = JSON.stringify(state);
    assert.equal(r.document.documentElement.style.visibility, 'hidden', label);
    assert.ok(!r.events.includes('reaper:admin-bootstrap'), label);
    assert.equal(r.redirects.length, 1, label);
    const expected = !state.initialized ? 'change-password' : !state.verified ? 'mfa-enroll' : 'mfa-challenge';
    assert.match(r.redirects[0], new RegExp(expected + '\\.html$'), label);
  }
});

test('bootstrap context exists only on account-setup pages and records its assurance level', async () => {
  for (const state of matrix) {
    const r = await boot(state);
    const label = JSON.stringify(state);
    if (!BOOTSTRAP_PAGES.includes(state.pathname)) {
      assert.equal(r.window.reaperAdminBootstrap, null, label);
      continue;
    }
    if (r.window.reaperAdminBootstrap) {
      assert.ok(r.events.includes('reaper:admin-bootstrap'), label);
      assert.equal(r.window.reaperAdminBootstrap.assurance, state.initialized ? state.aal : 'aal1', label);
    }
  }
});

test('the exact AAL1 states the setup pages need still receive bootstrap context', async () => {
  const cases = [
    { pathname: '/change-password.html', initialized: false, verified: false, aal: 'aal1' },
    { pathname: '/mfa-enroll.html', initialized: true, verified: false, aal: 'aal1' },
    { pathname: '/mfa-challenge.html', initialized: true, verified: true, aal: 'aal1' },
  ];
  for (const state of cases) {
    const r = await boot(state);
    assert.ok(r.events.includes('reaper:admin-bootstrap'), JSON.stringify(state));
    assert.ok(!r.events.includes('reaper:admin-ready'), JSON.stringify(state));
    assert.equal(r.redirects.length, 0, JSON.stringify(state));
  }
});

test('inactive or non-administrator profiles never receive any context', async () => {
  for (const pathname of [...BOOTSTRAP_PAGES, ...PRIVILEGED_PAGES])
    for (const override of [{ status: 'suspended' }, { role: 'client' }]) {
      const r = await boot({ pathname, initialized: true, verified: true, aal: 'aal2', ...override });
      assert.ok(r.events.includes('signOut'), pathname);
      assert.ok(!r.events.some((e) => e.startsWith('reaper:')), pathname);
      assert.equal(r.window.reaperAdmin, null);
      assert.equal(r.window.reaperAdminBootstrap, null);
    }
});

test('setup pages consume only bootstrap context and perform no table, RPC or storage access', async () => {
  for (const file of ['change-password.js', 'mfa-enroll.js', 'mfa-challenge.js']) {
    const text = await readFile(new URL(file, root), 'utf8');
    assert.ok(text.includes("'reaper:admin-bootstrap'"), file);
    assert.ok(!text.includes('reaper:admin-ready'), file);
    assert.ok(!text.includes('window.reaperAdmin\n') && !/window\.reaperAdmin(?!Bootstrap)/.test(text), file);
    assert.ok(!/\.(from|rpc)\(|\.storage\b/.test(text), file);
  }
});

test('no privileged page script can be started by the bootstrap signal', async () => {
  const { readdir } = await import('node:fs/promises');
  const setup = new Set(['auth-guard.js', 'change-password.js', 'mfa-enroll.js', 'mfa-challenge.js']);
  for (const file of (await readdir(root)).filter((f) => /\.(m?js)$/.test(f) && !setup.has(f))) {
    const text = await readFile(new URL(file, root), 'utf8');
    assert.ok(!text.includes('admin-bootstrap') && !text.includes('reaperAdminBootstrap'), file);
  }
});
