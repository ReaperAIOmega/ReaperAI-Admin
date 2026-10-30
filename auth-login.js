import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Only the dedicated loopback :4174 development server may use the synthetic staging project.
// Production hostnames, other localhost ports, and all HTTPS production deployments keep production.
const STAGING_LOOPBACK = window.location.protocol === 'http:'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  && window.location.port === '4174';
const SUPABASE_URL = STAGING_LOOPBACK
  ? 'https://qemjnekgcbuddayzhdtr.supabase.co'
  : 'https://itswbmjvuxumfjqkkqgx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = STAGING_LOOPBACK
  ? 'sb_publishable_x_XtO1UU9SwfqhyPNyArDA_N5f_eQyK'
  : 'sb_publishable_lgBKt5K8CQCPSC-MaC7s6g_M2iTdWEN';

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
const PASSWORD_RECOVERY_URL = STAGING_LOOPBACK ? null : 'https://admin.reaperai.com/reset-password.html';
// Synthetic staging identities are fictional; do not trigger real recovery emails from localhost.
if (STAGING_LOOPBACK && resetButton) {
  resetButton.disabled = true;
  resetButton.hidden = true;
}

resetButton?.addEventListener('click', async () => {
  if (STAGING_LOOPBACK) return;
  const email = emailInput?.value.trim().toLowerCase();
  if (!email) {
    status.textContent = 'Enter your administrator email address first.';
    return;
  }
  resetButton.disabled = true;
  status.textContent = 'Requesting password recovery…';
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
  window.location.replace('/');
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = emailInput?.value.trim().toLowerCase();
  const password = passwordInput?.value ?? '';
  if (!email || !password) return;

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

  window.location.replace('/');
});
