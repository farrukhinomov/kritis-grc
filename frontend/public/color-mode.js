// Applies the light or dark mode before the first paint, so a dark preference never
// flashes a light page while the app loads. It is a separate file because the Content
// Security Policy allows no inline scripts. Keep the key and logic in sync with
// src/shared/theme/colorMode.ts; a test runs this file against that module.
(function () {
  var preference = null;
  try {
    preference = localStorage.getItem("grc.colorMode");
  } catch (error) {
    // Storage blocked: the default applies.
  }
  // Light unless the user chose dark, or chose to follow the system and it is dark.
  var dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  var mode = dark ? "dark" : "light";
  document.documentElement.dataset.colorMode = mode;
  document.documentElement.style.colorScheme = mode;
})();
