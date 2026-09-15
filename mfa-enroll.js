const ready = window.reaperAdmin
  ? Promise.resolve(window.reaperAdmin)
  : new Promise((resolve) => document.addEventListener('reaper:admin-ready', (event) => resolve(event.detail), { once: true }));

const setup = document.getElementById('mfa-setup');
const form = document.getElementById('mfa-enroll-form');
const code = document.getElementById('mfa-code');
const submit = document.getElementById('mfa-enroll-submit');
const status = document.getElementById('mfa-enroll-status');
let factorId = null;

ready.then(async ({ supabase, factors, profile }) => {
  const verified = (factors?.totp || []).filter((factor) => factor.status === 'verified');
  if (verified.length) {
    window.location.replace('mfa-challenge.html');
    return;
  }

  for (const factor of (factors?.totp || []).filter((item) => item.status !== 'verified')) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => undefined);
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `JSS Admin ${profile.email}`,
  });
  if (error || !data?.id || !data?.totp?.qr_code) throw error || new Error('MFA enrollment data missing');
  factorId = data.id;

  setup.replaceChildren();
  const qr = document.createElement('img');
  qr.src = data.totp.qr_code;
  qr.alt = 'Authenticator QR code';
  qr.style.maxWidth = '260px';
  qr.style.display = 'block';
  qr.style.margin = '20px auto';
  const fallback = document.createElement('p');
  fallback.textContent = `Manual setup key: ${data.totp.secret}`;
  fallback.style.wordBreak = 'break-all';
  setup.append(qr, fallback);
  form.hidden = false;
}).catch((error) => {
  console.error('MFA enrollment preparation failed', error);
  setup.textContent = 'Authenticator setup could not be started. Sign out and try again.';
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!factorId) return;
  submit.disabled = true;
  submit.textContent = 'Verifying…';
  status.textContent = '';
  const { supabase } = await ready;
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge?.id) {
    status.textContent = 'Authenticator challenge could not be created.';
    submit.disabled = false;
    submit.textContent = 'Verify & secure account';
    return;
  }
  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.value.trim(),
  });
  if (verifyError) {
    status.textContent = 'That authenticator code was not accepted. Enter the current code and try again.';
    submit.disabled = false;
    submit.textContent = 'Verify & secure account';
    return;
  }
  status.textContent = 'Administrator MFA enabled.';
  window.location.replace('index.html');
});
