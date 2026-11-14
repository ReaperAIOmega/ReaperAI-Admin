// Account-setup page: consumes the bootstrap context, never the privileged admin-ready signal.
const ready = window.reaperAdminBootstrap
  ? Promise.resolve(window.reaperAdminBootstrap)
  : new Promise((resolve) => {
      document.addEventListener('reaper:admin-bootstrap', (event) => resolve(event.detail), { once: true });
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

let setupLocked = false;
form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (setupLocked) return;
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

  setupLocked = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Updating password...';
  let supabase;
  try {
    ({ supabase } = await ready);
    const { data, error } = await supabase.functions.invoke('initialize-admin-password-v2', { body: { password } });
    if (error || data?.ok !== true) throw new Error('Initialization not confirmed');
  } catch {
    status.textContent = 'Password setup could not be confirmed. Contact the administrator before retrying.';
    return;
  } finally {
    passwordInput.value = '';
    confirmInput.value = '';
    submitButton.textContent = 'Password setup submitted';
  }

  status.textContent = 'Password updated. Signing out…';
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.location.replace('/login.html?password=updated');
  } catch {
    status.textContent = 'Password updated, but sign-out could not be confirmed. Close this page and use the login page before continuing.';
  }
});
