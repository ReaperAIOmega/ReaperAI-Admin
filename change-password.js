const ready = window.reaperAdmin
  ? Promise.resolve(window.reaperAdmin)
  : new Promise((resolve) => {
      document.addEventListener('reaper:admin-ready', (event) => resolve(event.detail), { once: true });
    });

const form = document.getElementById('password-form');
const passwordInput = document.getElementById('new-password');
const confirmInput = document.getElementById('confirm-password');
const submitButton = document.getElementById('password-submit');
const status = document.getElementById('password-status');

const strongEnough = (value) =>
  value.length >= 14 &&
  /[a-z]/.test(value) &&
  /[A-Z]/.test(value) &&
  /\d/.test(value) &&
  /[^A-Za-z0-9]/.test(value);

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const { supabase, session } = await ready;
  const password = passwordInput?.value ?? '';
  const confirm = confirmInput?.value ?? '';

  status.textContent = '';
  if (!strongEnough(password)) {
    status.textContent = 'Password must be at least 14 characters and include uppercase, lowercase, a number, and a symbol.';
    return;
  }
  if (password !== confirm) {
    status.textContent = 'The password confirmation does not match.';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Updating password...';

  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) {
    status.textContent = 'Password update failed. Choose a different strong password and try again.';
    submitButton.disabled = false;
    submitButton.textContent = 'Set new password';
    return;
  }

  const { error: securityError } = await supabase
    .from('account_security')
    .update({ password_initialized: true, updated_at: new Date().toISOString() })
    .eq('profile_id', session.user.id);

  if (securityError) {
    status.textContent = 'Password changed, but account initialization could not be completed. Sign out and contact the administrator.';
    submitButton.disabled = false;
    submitButton.textContent = 'Set new password';
    return;
  }

  await supabase.auth.signOut();
  window.location.replace('/login.html?password=updated');
});
