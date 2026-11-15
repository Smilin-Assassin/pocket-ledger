// The logo opening, once per app opening (loaded from index.html right after the splash markup, as a plain script).
(function () {
  var s = document.getElementById("splash"), seen = false;
  try { seen = sessionStorage.getItem("pl-splashed") === "1"; sessionStorage.setItem("pl-splashed", "1"); } catch (e) {}
  if (seen) { s.remove(); window.plSplashUntil = 0; return; }
  var calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches, stay = calm ? 450 : 1350;
  window.plSplashUntil = performance.now() + stay + 300;
  setTimeout(function () { s.classList.add("bye"); setTimeout(function () { s.remove(); }, 320); }, stay);
})();
