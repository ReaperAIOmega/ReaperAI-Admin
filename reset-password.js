import { createClient } from './vendor/supabase-2.117.2.js';

const SUPABASE_URL = 'https://itswbmjvuxumfjqkkqgx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lgBKt5K8CQCPSC-MaC7s6g_M2iTdWEN';
const status = document.getElementById('recovery-status');
const form = document.getElementById('recovery-form');
const submitButton = document.getElementById('recovery-submit');
const passwordField = document.getElementById('recovery-password');
const confirmField = document.getElementById('recovery-confirm');

// Keep recovery credentials out of history on every path, including failures.
// Never log the callback or pass it to another page.
const fragment = new URLSearchParams(window.location.hash.slice(1));
const search = new URLSearchParams(window.location.search);
window.history.replaceState(null, document.title, window.location.pathname);

// Recovery must not reuse or replace the administrator site's stored session.
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: 'reaper-password-recovery',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

let recoverySessionValidated = false;
let submitting = false;
const strongPassword = (value) =>
  value.length >= 14 && /[a-z]/.test(value) && /[A-Z]/.test(value) &&
  /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

async function initialize() {
  try {
    let result;
    if (search.has('error') || fragment.has('error')) throw new Error('Invalid callback');
    if (search.has('code')) {
      status.textContent = 'This link requires the browser that requested it. Request a new recovery email and use its supported recovery link.';
      return;
    }
    if (search.get('type') === 'recovery' && search.get('token_hash') &&
        !fragment.has('access_token') && !fragment.has('refresh_token')) {
      result = await supabase.auth.verifyOtp({
        type: 'recovery', token_hash: search.get('token_hash'),
      });
    } else if (fragment.get('type') === 'recovery' &&
               fragment.get('access_token') && fragment.get('refresh_token') &&
               !search.has('token_hash')) {
      result = await supabase.auth.setSession({
        access_token: fragment.get('access_token'),
        refresh_token: fragment.get('refresh_token'),
      });
    } else {
      throw new Error('No recovery credentials');
    }
    if (result.error || !result.data?.session?.user) throw new Error('Invalid session');
    // Confirm the user with Auth; never authorize based only on local storage.
    const verified = await supabase.auth.getUser();
    if (verified.error || !verified.data?.user ||
        verified.data.user.id !== result.data.session.user.id) throw new Error('Invalid user');
    recoverySessionValidated = true;
    form.hidden = false;
    status.textContent = 'Recovery link verified. Choose a new administrator password.';
  } catch {
    recoverySessionValidated = false;
    form.hidden = true;
    status.textContent = 'The recovery link is invalid or expired. Request a new recovery email.';
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  } finally {
    // Drop callback values once they have been consumed.
    for (const key of [...fragment.keys()]) fragment.delete(key);
    for (const key of [...search.keys()]) search.delete(key);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!recoverySessionValidated || submitting) return;
  const password = passwordField.value;
  if (!strongPassword(password)) {
    status.textContent = 'Use at least 14 characters with uppercase, lowercase, a number, and a symbol.';
    return;
  }
  if (password !== confirmField.value) {
    status.textContent = 'The confirmation does not match.';
    return;
  }
  submitting = true;
  submitButton.disabled = true;
  status.textContent = 'Updating your password securely…';
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  } catch {
    status.textContent = 'Password update could not be completed. Request a fresh recovery email or try a different password.';
    submitButton.disabled = false;
    submitting = false;
    return;
  }

  recoverySessionValidated = false;
  passwordField.value = '';
  confirmField.value = '';
  form.hidden = true;
  // A logout error must never re-enable password submission after success.
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    window.location.replace('/login.html?password=reset');
  } catch {
    status.textContent = 'Password updated. Session sign-out could not be confirmed. Close this page and sign in again.';
  }
});

void initialize();
