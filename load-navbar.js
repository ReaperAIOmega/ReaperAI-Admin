document.addEventListener("DOMContentLoaded", () => {
  const navbarTarget = document.getElementById("navbar");
  if (!navbarTarget) return;

  const navbarFile = navbarTarget.dataset.navbar;
  if (!navbarFile) return;

  fetch(navbarFile)
    .then(response => response.text())
    .then(data => {
      navbarTarget.innerHTML = data;
    })
    .catch(error => {
      navbarTarget.innerHTML = "<div style='padding:20px;color:white;'>Navbar failed to load.</div>";
      console.error("Navbar load error:", error);
    });
});
