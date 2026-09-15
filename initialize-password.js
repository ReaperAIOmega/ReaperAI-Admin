const form = document.getElementById('initialize-password-form');
const passwordInput = document.getElementById('new-password');
const confirmInput = document.getElementById('confirm-password');
const submitButton = document.getElementById('initialize-password-submit');
const status = document.getElementById('initialize-password-status');
const token = new URLSearchParams(window.location.search).get('token') ?? '';

const strongPassword = (value) =>
  value.length >= 14 &&
  /[a-z]/.test(value) &&
  /[A-Z]/.test(value) &&
  /\d/.test(value) &&
  /[^A-Za-z0-9]/.test(value);

if (token.length < 40) {
  status.textContent = 'This initialization link is invalid or incomplete.';
  submitButton.disabled = true;
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = passwordInput?.value ?? '';
  const confirmation = confirmInput?.value ?? '';

  if (!strongPassword(password)) {
    status.textContent = 'Password must be at least 14 characters and include uppercase, lowercase, a number, and a symbol.';
    return;
  }

  if (password !== confirmation) {
    status.textContent = 'The passwords do not match.';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Securing account...';
  status.textContent = '';

  try {
    const response = await fetch('https://itswbmjvuxumfjqkkqgx.supabase.co/functions/v1/initialize-admin-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true) {
      status.textContent = body.error === 'weak_password'
        ? 'Password does not meet the security requirements.'
        : body.error === 'invalid_or_expired_token'
          ? 'This one-time link has expired or was already used.'
          : 'Password initialization failed. The account was not changed.';
      submitButton.disabled = false;
      submitButton.textContent = 'Set permanent password';
      return;
    }

    status.textContent = 'Password initialized. Redirecting to secure sign in...';
    window.setTimeout(() => {
      window.location.replace('/login.html?initialized=1&email=reaperomegaai%40gmail.com');
    }, 800);
  } catch (error) {
    console.error('Password initialization error:', error);
    status.textContent = 'Could not reach the secure initialization service. Try again.';
    submitButton.disabled = false;
    submitButton.textContent = 'Set permanent password';
  }
});
