(function () {
  "use strict";

  var HISTORY_KEY = "slitherScoreLog.history.v1";
  var SETTINGS_KEY = "evarHud.settings.v1";
  var DEFAULT_SETTINGS = { position: "bottom-left", opacity: 0.92, scale: 1.0 };

  var openStatsButton = document.getElementById("openStats");
  var statusLabel = document.getElementById("status");
  var opacitySlider = document.getElementById("opacitySlider");
  var opacityLabel = document.getElementById("opacityLabel");
  var scaleSlider = document.getElementById("scaleSlider");
  var scaleLabel = document.getElementById("scaleLabel");
  var qsGames = document.getElementById("qsGames");
  var qsBest = document.getElementById("qsBest");
  var qsKills = document.getElementById("qsKills");
  var posBtns = document.querySelectorAll(".pos-btn");

  var currentSettings = { position: "bottom-left", opacity: 0.92, scale: 1.0 };

  function formatCompact(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) { return "0"; }
    var abs = Math.abs(n);
    if (abs >= 1000000) { return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "m"; }
    if (abs >= 1000) { return (n / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k"; }
    return String(Math.round(n));
  }

  function setActivePosBtn(pos) {
    posBtns.forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-pos") === pos);
    });
  }

  function saveSettings(settings) {
    var p = {};
    p[SETTINGS_KEY] = settings;
    chrome.storage.local.set(p);
  }

  function loadQuickStats() {
    chrome.storage.local.get([HISTORY_KEY], function (result) {
      var history = Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
      var totalKills = 0;
      var best = 0;
      for (var i = 0; i < history.length; i += 1) {
        totalKills += Number(history[i].kills) || 0;
        var s = Number(history[i].maxScore);
        if (s > best) { best = s; }
      }
      qsGames.textContent = String(history.length);
      qsBest.textContent = formatCompact(best);
      qsKills.textContent = formatCompact(totalKills);
    });
  }

  function loadSettings() {
    chrome.storage.local.get([SETTINGS_KEY], function (result) {
      var saved = result[SETTINGS_KEY];
      if (saved && typeof saved === "object") {
        currentSettings = {
          position: saved.position || DEFAULT_SETTINGS.position,
          opacity: saved.opacity != null ? saved.opacity : DEFAULT_SETTINGS.opacity,
          scale: saved.scale != null ? saved.scale : DEFAULT_SETTINGS.scale
        };
      }
      setActivePosBtn(currentSettings.position);

      var pct = Math.round(currentSettings.opacity * 100);
      opacitySlider.value = String(pct);
      opacityLabel.textContent = pct + "%";

      var scalePct = Math.round(currentSettings.scale * 100);
      scaleSlider.value = String(scalePct);
      scaleLabel.textContent = scalePct + "%";
    });
  }

  posBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      currentSettings.position = btn.getAttribute("data-pos");
      setActivePosBtn(currentSettings.position);
      saveSettings(currentSettings);
    });
  });

  opacitySlider.addEventListener("input", function () {
    var pct = Number(opacitySlider.value);
    opacityLabel.textContent = pct + "%";
    currentSettings.opacity = pct / 100;
    saveSettings(currentSettings);
  });

  scaleSlider.addEventListener("input", function () {
    var pct = Number(scaleSlider.value);
    scaleLabel.textContent = pct + "%";
    currentSettings.scale = pct / 100;
    saveSettings(currentSettings);
  });

  openStatsButton.addEventListener("click", function () {
    chrome.tabs.create({ url: chrome.runtime.getURL("stats.html") }, function () {
      statusLabel.textContent = "Opening dashboard...";
      window.close();
    });
  });

  loadSettings();
  loadQuickStats();
})();
