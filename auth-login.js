import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://itswbmjvuxumfjqkkqgx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lgBKt5K8CQCPSC-MaC7s6g_M2iTdWEN';

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
