const ready = window.reaperAdmin
  ? Promise.resolve(window.reaperAdmin)
  : new Promise((resolve) => document.addEventListener('reaper:admin-ready', (event) => resolve(event.detail), { once: true }));

const form = document.getElementById('mfa-challenge-form');
const code = document.getElementById('mfa-code');
const submit = document.getElementById('mfa-challenge-submit');
const status = document.getElementById('mfa-challenge-status');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  submit.disabled = true;
  submit.textContent = 'Verifying…';
  status.textContent = '';
  const { supabase, factors, aal } = await ready;
  if (aal?.currentLevel === 'aal2') {
    window.location.replace('index.html');
    return;
  }
  const factor = (factors?.totp || []).find((item) => item.status === 'verified');
  if (!factor) {
    window.location.replace('mfa-enroll.html');
    return;
  }
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challengeError || !challenge?.id) {
    status.textContent = 'Authenticator challenge could not be created. Sign in again and retry.';
    submit.disabled = false;
    submit.textContent = 'Verify';
    return;
  }
  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: code.value.trim(),
  });
  if (verifyError) {
    status.textContent = 'That authenticator code was not accepted.';
    submit.disabled = false;
    submit.textContent = 'Verify';
    return;
  }
  window.location.replace('index.html');
});
