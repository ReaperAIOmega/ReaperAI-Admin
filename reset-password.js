import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

const SUPABASE_URL = 'https://itswbmjvuxumfjqkkqgx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lgBKt5K8CQCPSC-MaC7s6g_M2iTdWEN';
const status = document.getElementById('recovery-status');
const form = document.getElementById('recovery-form');
const submitButton = document.getElementById('recovery-submit');
const passwordField = document.getElementById('recovery-password');
const confirmField = document.getElementById('recovery-confirm');

// Inspect only link *metadata*. Never log access tokens, fragments or recovery codes.
const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const search = new URLSearchParams(window.location.search);
const callbackType = fragment.get('type') || search.get('type');
const hasRecoveryCallback = callbackType === 'recovery';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: true },
});

let recoverySessionValidated = false;
let submitting = false;

const strongPassword = (value) =>
  value.length >= 14 &&
  /[a-z]/.test(value) &&
  /[A-Z]/.test(value) &&
  /\d/.test(value) &&
  /[^A-Za-z0-9]/.test(value);

function showRecoveryReady() {
  recoverySessionValidated = true;
  form.hidden = false;
  status.textContent = 'Recovery link verified. Choose a new administrator password.';
  // Remove recovery tokens from visible URL/history, without sharing them anywhere.
  window.history.replaceState(null, document.title, window.location.pathname);
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session?.user) {
    showRecoveryReady();
  }
});

async function initialize() {
  try {
    if (search.get('token_hash') && callbackType === 'recovery') {
      const { error } = await supabase.auth.verifyOtp({
        type: 'recovery',
        token_hash: search.get('token_hash'),
      });
      if (error) throw error;
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user && hasRecoveryCallback) {
      showRecoveryReady();
    } else if (!recoverySessionValidated) {
      form.hidden = true;
      status.textContent = 'No valid recovery session was found. Request a new password email from the administrator login page.';
    }
  } catch {
    form.hidden = true;
    status.textContent = 'The recovery link is invalid or expired. Please request a new one.';
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!recoverySessionValidated || submitting) {
    status.textContent = 'You must verify a fresh recovery link before resetting your password.';
    return;
  }
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

    passwordField.value = '';
    confirmField.value = '';
    form.hidden = true;
    status.textContent = 'Password updated. Returning to administrator sign-in…';
    await supabase.auth.signOut();
    window.location.replace('/login.html?password=reset');
  } catch {
    status.textContent = 'Password update could not be completed. Please request a fresh recovery email or try a different password.';
    submitButton.disabled = false;
    submitting = false;
  }
});

void initialize();
