import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://itswbmjvuxumfjqkkqgx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lgBKt5K8CQCPSC-MaC7s6g_M2iTdWEN';
const LOGIN_URL = 'https://admin.reaperai.com/login.html';
const PASSWORD_URL = 'https://admin.reaperai.com/change-password.html';
const MFA_ENROLL_URL = 'https://admin.reaperai.com/mfa-enroll.html';
const MFA_CHALLENGE_URL = 'https://admin.reaperai.com/mfa-challenge.html';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const path = window.location.pathname;
const onPasswordPage = path.endsWith('/change-password.html');
const onMfaEnrollPage = path.endsWith('/mfa-enroll.html');
const onMfaChallengePage = path.endsWith('/mfa-challenge.html');
const redirectToLogin = () => window.location.replace(LOGIN_URL);

try {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    redirectToLogin();
  } else {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,email,role,full_name,status')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profile || profile.role !== 'admin' || profile.status !== 'active') {
      await supabase.auth.signOut();
      redirectToLogin();
    } else {
      const { data: security, error: securityError } = await supabase
        .from('account_security')
        .select('password_initialized')
        .eq('profile_id', session.user.id)
        .single();

      if (securityError || !security) {
        await supabase.auth.signOut();
        redirectToLogin();
      } else if (!security.password_initialized && !onPasswordPage) {
        window.location.replace(PASSWORD_URL);
      } else if (security.password_initialized) {
        const [{ data: factors, error: factorError }, { data: aal, error: aalError }] = await Promise.all([
          supabase.auth.mfa.listFactors(),
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        ]);
        if (factorError || aalError) throw factorError || aalError;
        const verifiedTotp = (factors?.totp || []).filter((factor) => factor.status === 'verified');
        const currentLevel = aal?.currentLevel || 'aal1';

        if (!verifiedTotp.length && !onMfaEnrollPage) {
          window.location.replace(MFA_ENROLL_URL);
        } else if (verifiedTotp.length && currentLevel !== 'aal2' && !onMfaChallengePage) {
          window.location.replace(MFA_CHALLENGE_URL);
        } else if (!verifiedTotp.length && onMfaChallengePage) {
          window.location.replace(MFA_ENROLL_URL);
        } else {
          if (window.location.hash) window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          window.reaperAdmin = Object.freeze({ supabase, session, profile, security, factors, aal });
          document.documentElement.style.visibility = 'visible';
          document.dispatchEvent(new CustomEvent('reaper:admin-ready', { detail: window.reaperAdmin }));
          document.addEventListener('click', async (event) => {
            const target = event.target.closest?.('[data-signout]');
            if (!target) return;
            event.preventDefault();
            await supabase.auth.signOut();
            redirectToLogin();
          });
        }
      } else {
        window.reaperAdmin = Object.freeze({ supabase, session, profile, security });
        document.documentElement.style.visibility = 'visible';
        document.dispatchEvent(new CustomEvent('reaper:admin-ready', { detail: window.reaperAdmin }));
      }
    }
  }
} catch (error) {
  console.error('Admin authentication error:', error);
  redirectToLogin();
}
