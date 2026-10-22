import { createClient } from './vendor/supabase-2.117.2.js';

const SUPABASE_URL = 'https://itswbmjvuxumfjqkkqgx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lgBKt5K8CQCPSC-MaC7s6g_M2iTdWEN';
const status = document.getElementById('recovery-status');
const form = document.getElementById('recovery-form');
const submitButton = document.getElementById('recovery-submit');
const passwordField = document.getElementById('recovery-password');
const confirmField = document.getElementById('recovery-confirm');
const mfaForm = document.getElementById('recovery-mfa-form');
const factorField = document.getElementById('recovery-factor');
const codeField = document.getElementById('recovery-code');
const verifyButton = document.getElementById('recovery-verify');

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
let verifying = false;
let recoveryUserId = null;
let verifiedFactors = [];
const strongPassword = (value) =>
  value.length >= 14 && /[a-z]/.test(value) && /[A-Z]/.test(value) &&
  /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

async function preparePasswordEntry() {
  recoverySessionValidated = false;
  form.hidden = true;
  mfaForm.hidden = true;
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || !assurance.data?.currentLevel) throw new Error('Session unavailable');
  if (assurance.data.nextLevel === 'aal2' && assurance.data.currentLevel !== 'aal2') {
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) throw new Error('Factors unavailable');
    verifiedFactors = (factors.data?.totp || []).filter(f => f.status === 'verified');
    if (!verifiedFactors.length) {
      status.textContent = 'This account requires an authentication method not supported on this recovery page. Contact your administrator; do not remove your security protection.';
      return;
    }
    factorField.replaceChildren();
    verifiedFactors.forEach((factor, index) => {
      const option = document.createElement('option');
      option.value = factor.id;
      option.textContent = factor.friendly_name || `Authenticator ${index + 1}`;
      factorField.appendChild(option);
    });
    mfaForm.hidden = false;
    status.textContent = 'Recovery link verified. Enter the code from your authenticator app.';
    return;
  }
  recoverySessionValidated = true;
  form.hidden = false;
  status.textContent = 'Recovery verified. Choose a new administrator password.';
}

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
    recoveryUserId = verified.data.user.id;
    await preparePasswordEntry();
  } catch {
    recoverySessionValidated = false;
    form.hidden = true;
    mfaForm.hidden = true;
    status.textContent = 'The recovery link is invalid or expired. Request a new recovery email.';
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  } finally {
    // Drop callback values once they have been consumed.
    for (const key of [...fragment.keys()]) fragment.delete(key);
    for (const key of [...search.keys()]) search.delete(key);
  }
}

mfaForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (verifying || mfaForm.hidden || !recoveryUserId) return;
  const code = codeField.value.trim();
  if (!/^[0-9]{6}$/.test(code) || !verifiedFactors.some(f => f.id === factorField.value)) {
    status.textContent = 'Choose your authenticator and enter its current six-digit code.';
    return;
  }
  verifying = true;
  verifyButton.disabled = true;
  try {
    const result = await supabase.auth.mfa.challengeAndVerify({ factorId: factorField.value, code });
    if (result.error) throw result.error;
    const user = await supabase.auth.getUser();
    const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (user.error || user.data?.user?.id !== recoveryUserId ||
        assurance.error || assurance.data?.currentLevel !== 'aal2') throw new Error('Verification incomplete');
    mfaForm.hidden = true;
    recoverySessionValidated = true;
    form.hidden = false;
    status.textContent = 'Authenticator verified. Choose a new administrator password.';
  } catch (error) {
    status.textContent = error?.status === 429
      ? 'Too many verification attempts. Wait before trying another authenticator code.'
      : 'Authenticator verification failed. Check the current code and your device clock, then try again. A new recovery email is not normally needed.';
  } finally {
    codeField.value = '';
    verifying = false;
    verifyButton.disabled = false;
  }
});

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
  } catch (error) {
    const messages = {
      same_password: 'Choose a password different from your existing password. You can retry on this page.',
      weak_password: 'This password does not meet the account security policy. Choose a stronger password and retry here.',
      over_request_rate_limit: 'Too many requests. Wait before retrying on this page.',
      over_email_send_rate_limit: 'The email limit has been reached. Wait before retrying; do not request more recovery emails.',
      session_not_found: 'Your recovery session expired. Request a new recovery email once the email limit has cleared.',
      refresh_token_not_found: 'Your recovery session expired. Request a new recovery email once the email limit has cleared.',
    };
    if (error?.code === 'insufficient_aal') {
      passwordField.value = '';
      confirmField.value = '';
      try { await preparePasswordEntry(); } catch {
        recoverySessionValidated = false;
        form.hidden = true;
        status.textContent = 'Unable to verify your authentication level. Try recovery again when available.';
      }
    } else {
      status.textContent = messages[error?.code] || 'Password update could not be completed. Check your connection and retry on this page. If you already submitted successfully, try signing in. Do not request repeated recovery emails.';
    }
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
