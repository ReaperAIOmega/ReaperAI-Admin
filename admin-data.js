const setText = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

const loadAdmin = async ({ supabase, profile }) => {
  setText('admin-name', profile.full_name || profile.email || 'Administrator');

  const [intakesResult, clientsResult, casesResult] = await Promise.all([
    supabase.from('intakes').select('id,status', { count: 'exact' }),
    supabase.from('clients').select('id,status', { count: 'exact' }),
    supabase.from('cases').select('id,status', { count: 'exact' }),
  ]);

  if (intakesResult.error || clientsResult.error || casesResult.error) {
    console.error('Admin dashboard load error:', {
      intakes: intakesResult.error,
      clients: clientsResult.error,
      cases: casesResult.error,
    });
    return;
  }

  const newIntakes = (intakesResult.data || []).filter((item) => String(item.status).toLowerCase() === 'new').length;
  const activeClients = (clientsResult.data || []).filter((item) => String(item.status).toLowerCase() === 'active').length;
  const openCases = (casesResult.data || []).filter((item) => !['closed', 'complete', 'completed'].includes(String(item.status).toLowerCase())).length;

  setText('new-leads', String(newIntakes));
  setText('active-clients', String(activeClients));
  setText('open-cases', String(openCases));
};

if (window.reaperAdmin) loadAdmin(window.reaperAdmin);
document.addEventListener('reaper:admin-ready', (event) => loadAdmin(event.detail), { once: true });
