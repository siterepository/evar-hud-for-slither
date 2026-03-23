(function () {
  "use strict";

  var HISTORY_KEY = "slitherScoreLog.history.v1";
  var SETTINGS_KEY = "evarHud.settings.v1";

  // ── DOM refs ──
  var qsGames = document.getElementById("qsGames");
  var qsBest = document.getElementById("qsBest");
  var qsKills = document.getElementById("qsKills");
  var opacitySlider = document.getElementById("opacitySlider");
  var opacityLabel = document.getElementById("opacityLabel");
  var scaleSlider = document.getElementById("scaleSlider");
  var scaleLabel = document.getElementById("scaleLabel");
  var openStatsButton = document.getElementById("openStats");
  var themeBtns = document.querySelectorAll(".theme-swatch");
  var toggleInputs = document.querySelectorAll("#toggleGrid input[type=checkbox]");

  // ── Defaults ──
  var defaults = {
    opacity: 0.92,
    scale: 1.0,
    theme: "neon",
    metrics: { chart: true, kills: true, score: true, timer: true, notifications: true }
  };

  var currentSettings = JSON.parse(JSON.stringify(defaults));

  // ── Helpers ──
  function fmtCompact(v) {
    var n = Number(v);
    if (!Number.isFinite(n)) return "0";
    var a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "m";
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "k";
    return String(Math.round(n));
  }

  function updateFill(slider) {
    var pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty("--fill", pct + "%");
  }

  function save() {
    var p = {};
    p[SETTINGS_KEY] = currentSettings;
    chrome.storage.local.set(p);
  }

  // ── Quick Stats ──
  function loadQuickStats() {
    chrome.storage.local.get([HISTORY_KEY], function (r) {
      var h = Array.isArray(r[HISTORY_KEY]) ? r[HISTORY_KEY] : [];
      var tK = 0, best = 0;
      for (var i = 0; i < h.length; i++) {
        tK += Number(h[i].kills) || 0;
        var s = Number(h[i].maxScore);
        if (s > best) best = s;
      }
      qsGames.textContent = String(h.length);
      qsBest.textContent = fmtCompact(best);
      qsKills.textContent = fmtCompact(tK);
    });
  }

  // ── Load Settings ──
  function loadSettings() {
    chrome.storage.local.get([SETTINGS_KEY], function (r) {
      var s = r[SETTINGS_KEY];
      if (s && typeof s === "object") {
        currentSettings.opacity = s.opacity != null ? s.opacity : defaults.opacity;
        currentSettings.scale = s.scale != null ? s.scale : defaults.scale;
        currentSettings.theme = s.theme || defaults.theme;
        if (s.metrics && typeof s.metrics === "object") {
          for (var k in defaults.metrics) {
            currentSettings.metrics[k] = s.metrics[k] != null ? s.metrics[k] : defaults.metrics[k];
          }
        }
      }

      // Opacity
      var pct = Math.round(currentSettings.opacity * 100);
      opacitySlider.value = String(pct);
      opacityLabel.textContent = pct + "%";
      updateFill(opacitySlider);

      // Scale
      var sPct = Math.round(currentSettings.scale * 100);
      scaleSlider.value = String(sPct);
      scaleLabel.textContent = sPct + "%";
      updateFill(scaleSlider);

      // Theme
      setActiveTheme(currentSettings.theme);

      // Toggles
      toggleInputs.forEach(function (inp) {
        var key = inp.getAttribute("data-metric");
        if (key && currentSettings.metrics[key] != null) {
          inp.checked = currentSettings.metrics[key];
        }
      });
    });
  }

  // ── Theme ──
  function setActiveTheme(theme) {
    themeBtns.forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-theme") === theme);
    });
  }

  themeBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      currentSettings.theme = btn.getAttribute("data-theme");
      setActiveTheme(currentSettings.theme);
      save();
    });
  });

  // ── Toggles ──
  toggleInputs.forEach(function (inp) {
    inp.addEventListener("change", function () {
      var key = inp.getAttribute("data-metric");
      if (key) {
        currentSettings.metrics[key] = inp.checked;
        save();
      }
    });
  });

  // ── Sliders ──
  opacitySlider.addEventListener("input", function () {
    var pct = Number(opacitySlider.value);
    opacityLabel.textContent = pct + "%";
    currentSettings.opacity = pct / 100;
    updateFill(opacitySlider);
    save();
  });

  scaleSlider.addEventListener("input", function () {
    var pct = Number(scaleSlider.value);
    scaleLabel.textContent = pct + "%";
    currentSettings.scale = pct / 100;
    updateFill(scaleSlider);
    save();
  });

  // ── Dashboard ──
  openStatsButton.addEventListener("click", function () {
    chrome.tabs.create({ url: chrome.runtime.getURL("stats.html") }, function () {
      window.close();
    });
  });

  // ── Init ──
  loadSettings();
  loadQuickStats();
})();
