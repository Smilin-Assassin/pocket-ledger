// Sets light or dark and the text size before the page is drawn (loaded first, from index.html, as a plain script).
(function () {
  var d = document.documentElement, g = function (k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  window.plApplyTheme = function () {
    // one look, Coral Dusk (v50), in light or dark, chosen by hand in Settings › Appearance (default light;
    // the old "Automatic" and every older theme choice simply land on light)
    // Arcade (v71) is a second look, dark only, picked in Settings › Appearance (pl-look); anything else is Coral Dusk
    var arcade = g("pl-look") === "arcade";
    d.setAttribute("data-look", arcade ? "arcade" : "coral");
    d.setAttribute("data-theme", arcade || g("pl-mode") === "dark" ? "dark" : "light");
    d.setAttribute("data-preset", "coral");
    // text size: a smooth slider (v45) stores a number like 1.07; the older Small/Large/Extra large letters still work
    var fs = g("pl-fs") || "m", FSN = { s: .92, m: 1, l: 1.12, xl: 1.25 }, fz = FSN[fs] || parseFloat(fs);
    if (!(fz >= .8 && fz <= 1.4)) { fz = 1; fs = "m"; }
    d.setAttribute("data-fs", FSN[fs] ? fs : "custom"); d.style.setProperty("--fs-zoom", String(fz)); d.setAttribute("data-fs-z", String(fz));
    var m = document.querySelector('meta[name="theme-color"]');
    if (m && document.body) m.setAttribute("content", getComputedStyle(document.body).backgroundColor);
  };
  window.plApplyTheme();
  document.addEventListener("DOMContentLoaded", window.plApplyTheme);
})();
