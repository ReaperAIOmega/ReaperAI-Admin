import { createClient } from './vendor/supabase-2.117.2.js';

import { resolveRuntime } from './runtime-config.mjs';
import { recordAal1Denial } from './staging-acceptance.mjs';
const runtime = resolveRuntime(window.location, 'admin');
const SUPABASE_URL = runtime.url;
const SUPABASE_PUBLISHABLE_KEY = runtime.key;

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const form = document.getElementById('admin-login-form');
const emailInput = document.getElementById('admin-email');
const passwordInput = document.getElementById('admin-password');
const submitButton = document.getElementById('admin-login-submit');
const status = document.getElementById('admin-login-status');
const resetButton = document.getElementById('admin-reset-password');
const PASSWORD_RECOVERY_URL = runtime.page('/reset-password.html');
if (runtime.staging && resetButton) { resetButton.disabled = true; resetButton.hidden = true; }

resetButton?.addEventListener('click', async () => {
  if (runtime.staging) { status.textContent = 'Email recovery is disabled in synthetic staging.'; return; }
  const email = emailInput?.value.trim().toLowerCase();
  if (!email) {
    status.textContent = 'Enter your administrator email address first.';
    return;
  }
  resetButton.disabled = true;
  status.textContent = 'Requesting password recovery...';
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RECOVERY_URL,
    });
    if (error) throw error;
    status.textContent = 'If this email is eligible, a password reset link has been sent. Open the latest email only.';
  } catch {
    status.textContent = 'Unable to send recovery email. Please retry after verifying the recovery URL is configured.';
  } finally {
    resetButton.disabled = false;
  }
});

const params = new URLSearchParams(window.location.search);

if (emailInput && params.get('email')) emailInput.value = params.get('email');
if (params.get('initialized') === '1' && status) {
  status.textContent = 'Permanent password set. Sign in with your new password.';
}

const existing = await supabase.auth.getSession();
if (existing.data?.session) {
  if (runtime.emailAllowed(existing.data.session.user?.email)) window.location.replace('/');
  else await supabase.auth.signOut({ scope: 'local' });
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = emailInput?.value.trim().toLowerCase();
  const password = passwordInput?.value ?? '';
  if (!email || !password) return;
  if (!runtime.emailAllowed(email)) {
    status.textContent = 'This identity is not permitted in this environment.';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Signing in...';
  status.textContent = '';

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data?.session) {
    status.textContent = 'Sign-in failed. Check your administrator email and password.';
    submitButton.disabled = false;
    submitButton.textContent = 'Sign in securely';
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role,status')
    .eq('id', data.session.user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin' || profile.status !== 'active') {
    await supabase.auth.signOut();
    status.textContent = 'This account is not authorized for administrative access.';
    submitButton.disabled = false;
    submitButton.textContent = 'Sign in securely';
    return;
  }

  if (runtime.staging) {
    try { await recordAal1Denial(supabase, runtime, localStorage); }
    catch { /* Absence of genuine AAL1 evidence must never be reported as a pass. */ }
  }
  window.location.replace('/');
});
