import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://itswbmjvuxumfjqkkqgx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lgBKt5K8CQCPSC-MaC7s6g_M2iTdWEN';
const LOGIN_URL = 'https://reaperai.com/login.html?next=admin';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

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
      if (window.location.hash) {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      }

      window.reaperAdmin = Object.freeze({ supabase, session, profile });
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
  }
} catch (error) {
  console.error('Admin authentication error:', error);
  redirectToLogin();
}
