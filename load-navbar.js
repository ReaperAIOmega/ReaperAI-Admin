(async () => {
  try {
    await import('./auth-guard.js');
  } catch (error) {
    console.error('Admin authentication bootstrap failed:', error);
    window.location.replace('https://reaperai.com/login.html?next=admin');
    return;
  }

  const placeholder = document.getElementById('navbar');
  if (!placeholder) return;

  const file = placeholder.dataset.navbar;
  if (!file) return;

  try {
    const response = await fetch(file, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Navbar request failed: ${response.status}`);
    placeholder.innerHTML = await response.text();
  } catch (error) {
    console.error('Navbar load failed:', error);
  }
})();
