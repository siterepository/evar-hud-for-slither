(function () {
  "use strict";

  if (window.__slitherScoreLogOverlayInstalled) {
    return;
  }
  window.__slitherScoreLogOverlayInstalled = true;

  var SAMPLE_INTERVAL_MS = 1000;
  var OVERLAY_REATTACH_MS = 1500;
  var OVERLAY_ID = "slither-score-log-overlay";
  var OVERLAY_BOTTOM_PX = 80;
  var OVERLAY_WIDTH_PX = 270;
  var OVERLAY_HEIGHT_PX = 120;

  // Theme color palettes
  var THEMES = {
    neon:   { accent: "0,212,245",   line: "#00d4f5", fill: "rgba(0,212,245,0.18)",  glow: "rgba(0,212,245,0.5)",  kill: "#ff4545", border: "rgba(0,212,245,0.18)" },
    ember:  { accent: "255,107,53",  line: "#ff6b35", fill: "rgba(255,107,53,0.18)", glow: "rgba(255,107,53,0.5)", kill: "#ffab40", border: "rgba(255,107,53,0.18)" },
    ghost:  { accent: "176,190,197", line: "#b0bec5", fill: "rgba(176,190,197,0.14)",glow: "rgba(176,190,197,0.4)",kill: "#e0e0e0", border: "rgba(176,190,197,0.12)" },
    matrix: { accent: "0,255,65",    line: "#00ff41", fill: "rgba(0,255,65,0.16)",   glow: "rgba(0,255,65,0.45)",  kill: "#76ff03", border: "rgba(0,255,65,0.15)" },
    royal:  { accent: "179,136,255", line: "#b388ff", fill: "rgba(179,136,255,0.18)",glow: "rgba(179,136,255,0.5)",kill: "#ea80fc", border: "rgba(179,136,255,0.18)" }
  };

  function getTheme() { return THEMES[hudSettings.theme] || THEMES.neon; }
  function metricOn(key) { return !hudSettings.metrics || hudSettings.metrics[key] !== false; }
  var HISTORY_KEY = "slitherScoreLog.history.v1";
  var SETTINGS_KEY = "evarHud.settings.v1";
  var DEFAULT_SETTINGS = { opacity: 0.92, scale: 1.0, theme: "neon", metrics: { chart: true, kills: true, score: true, timer: true, notifications: true } };
  var MAX_HISTORY_GAMES = 3000;

  var MIN_TIME_SPAN_SECONDS = 4 * 60;
  var ONE_MINUTE_SECONDS = 60;
  var FIVE_MINUTES_SECONDS = 5 * 60;
  var ONE_MINUTE_TICK_LIMIT_SECONDS = 12 * 60;

  var SCORE_RESET_FROM_HIGH = 80;
  var SCORE_RESET_TO_HIGH = 35;
  var SCORE_RESET_FROM_LOW = 35;
  var SCORE_RESET_TO_LOW = 12;
  var SCORE_MISSING_END_FRAMES = 2;
  var MIN_LOG_DURATION_SECONDS = 8;
  var SIZE_MILESTONES = [1000, 5000, 10000];

  var hudElement = null;
  var container = null;
  var canvas = null;
  var ctx = null;
  // controlsBar removed — settings live in popup only
  var booted = false;
  var domObserver = null;
  var drawPending = false;

  var waitingForNewGame = true;
  var currentGame = createGameState(Date.now(), 0, null, null);
  var bridgeMetrics = {
    score: null,
    kills: null,
    snakeId: null,
    inGameName: null,
    updatedAt: 0
  };
  var bridgeListenerAttached = false;
  var hudSettings = { position: "bottom-left", opacity: 0.92, scale: 1.0 };
  var notification = { text: "", color: "rgba(255,255,255,0.95)", alpha: 0, endMs: 0 };
  var allTimeBest = 0;
  var recentKillTimes = [];

  function createGameState(startedAtMs, initialScore, initialKillsRaw, initialSnakeId, initialInGameName) {
    var safeScore = Number.isFinite(initialScore) ? Math.max(0, Math.round(initialScore)) : 0;
    var safeKills = Number.isFinite(initialKillsRaw) ? Math.max(0, Math.round(initialKillsRaw)) : null;
    var safeInGameName = normalizeInGameName(initialInGameName);
    var milestoneSec = {};
    for (var i = 0; i < SIZE_MILESTONES.length; i += 1) {
      var marker = SIZE_MILESTONES[i];
      milestoneSec[String(marker)] = safeScore >= marker ? 0 : null;
    }

    return {
      id: "game_" + startedAtMs + "_" + Math.floor(Math.random() * 100000),
      startedAtMs: startedAtMs,
      startedAtIso: new Date(startedAtMs).toISOString(),
      lastActiveAtMs: safeScore > 0 ? startedAtMs : null,
      samples: [{ t: 0, value: 0 }],
      currentScore: safeScore,
      previousScore: safeScore,
      maxScore: safeScore,
      totalGain: 0,
      timeToMaxSec: safeScore > 0 ? 0 : null,
      milestoneSec: milestoneSec,
      currentKills: safeKills !== null ? safeKills : 0,
      maxKills: safeKills !== null ? safeKills : 0,
      previousKillsRaw: safeKills,
      currentSnakeId: initialSnakeId !== undefined ? initialSnakeId : null,
      inGameName: safeInGameName,
      missingScoreFrames: 0,
      liveTicks: safeScore > 0 ? 1 : 0
    };
  }

  function setStyleImportant(element, name, value) {
    element.style.setProperty(name, value, "important");
  }

  function applyOverlayStyles() {
    var bgOpacity = hudSettings.opacity != null ? hudSettings.opacity : 0.92;
    var scale = hudSettings.scale != null ? hudSettings.scale : 1.0;
    var r = 8, g = 14, b = 28;
    var bgAlpha = Math.max(0, Math.min(1, bgOpacity)).toFixed(2);

    setStyleImportant(container, "position", "fixed");
    setStyleImportant(container, "width", OVERLAY_WIDTH_PX + "px");
    setStyleImportant(container, "height", OVERLAY_HEIGHT_PX + "px");
    setStyleImportant(container, "z-index", "2147483647");
    setStyleImportant(container, "pointer-events", "none");
    setStyleImportant(container, "user-select", "none");
    setStyleImportant(container, "display", "block");
    setStyleImportant(container, "visibility", "visible");
    setStyleImportant(container, "opacity", "1");
    setStyleImportant(container, "background", "rgba(" + r + "," + g + "," + b + "," + bgAlpha + ")");
    setStyleImportant(container, "border-radius", "14px");
    setStyleImportant(container, "border", "1px solid " + getTheme().border);
    setStyleImportant(container, "box-shadow", "0 4px 20px rgba(0,0,0,0.4)");
    var blurPx = Math.round(bgOpacity * 14);
    var blurVal = blurPx > 0 ? "blur(" + blurPx + "px)" : "none";
    setStyleImportant(container, "backdrop-filter", blurVal);
    setStyleImportant(container, "-webkit-backdrop-filter", blurVal);
    setStyleImportant(container, "overflow", "hidden");
    setStyleImportant(container, "margin", "0");
    setStyleImportant(container, "padding", "0");
    // Always bottom-left
    setStyleImportant(container, "transform-origin", "left bottom");
    setStyleImportant(container, "transform", "scale(" + scale + ")");
    setStyleImportant(container, "bottom", OVERLAY_BOTTOM_PX + "px");
    setStyleImportant(container, "top", "auto");
    setStyleImportant(container, "left", "14px");
    setStyleImportant(container, "right", "auto");
  }

  function attachOverlay() {
    var parent = document.body || document.documentElement;
    if (!parent || !container) {
      return false;
    }
    if (!container.isConnected || container.parentNode !== parent) {
      parent.appendChild(container);
    }
    return true;
  }

  function createOverlay() {
    var existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      container = existing;
      canvas = container.querySelector("canvas");
      if (!canvas) {
        canvas = document.createElement("canvas");
        setStyleImportant(canvas, "width", "100%");
        setStyleImportant(canvas, "height", "100%");
        canvas.width = OVERLAY_WIDTH_PX;
        canvas.height = OVERLAY_HEIGHT_PX;
        container.appendChild(canvas);
      }
      applyOverlayStyles();
      attachOverlay();
      ctx = canvas.getContext("2d");
      resizeCanvas();
      return;
    }

    container = document.createElement("div");
    container.id = OVERLAY_ID;
    applyOverlayStyles();

    canvas = document.createElement("canvas");
    setStyleImportant(canvas, "all", "initial");
    setStyleImportant(canvas, "display", "block");
    setStyleImportant(canvas, "width", "100%");
    setStyleImportant(canvas, "height", "100%");
    setStyleImportant(canvas, "border", "none");
    setStyleImportant(canvas, "margin", "0");
    setStyleImportant(canvas, "padding", "0");
    setStyleImportant(canvas, "background", "transparent");
    canvas.width = OVERLAY_WIDTH_PX;
    canvas.height = OVERLAY_HEIGHT_PX;
    container.appendChild(canvas);

    attachOverlay();
    ctx = canvas.getContext("2d");
    resizeCanvas();
  }

  function saveHudSettings() {
    if (chrome && chrome.storage && chrome.storage.local) {
      var data = {};
      data[SETTINGS_KEY] = { opacity: hudSettings.opacity, scale: hudSettings.scale };
      chrome.storage.local.set(data, function () {
        if (chrome.runtime.lastError) { /* ignore */ }
      });
    }
  }

  function resizeCanvas() {
    if (!canvas || !ctx || !container) {
      return;
    }
    var rect = container.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function normalizeInGameName(value) {
    if (value === null || value === undefined) {
      return null;
    }
    var normalized = String(value)
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) {
      return null;
    }
    if (normalized.length > 36) {
      normalized = normalized.slice(0, 36).trim();
    }
    return normalized || null;
  }

  function formatCompactNumber(value) {
    var rounded = Number.isFinite(value) ? value : 0;
    var abs = Math.abs(rounded);
    if (abs >= 1000000) {
      return (rounded / 1000000).toFixed(abs >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "m";
    }
    if (abs >= 1000) {
      return (rounded / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
    }
    return String(Math.round(rounded));
  }

  function attachBridgeListener() {
    if (bridgeListenerAttached) {
      return;
    }
    bridgeListenerAttached = true;

    window.addEventListener("message", function (event) {
      if (event.source !== window) {
        return;
      }
      var data = event.data;
      if (!data || data.__slitherScoreLog !== true || data.type !== "metrics") {
        return;
      }

      var parsedScore = Number(data.score);
      var parsedKills = Number(data.kills);
      bridgeMetrics.score = Number.isFinite(parsedScore) ? Math.max(0, Math.round(parsedScore)) : null;
      bridgeMetrics.kills = Number.isFinite(parsedKills) ? Math.max(0, Math.round(parsedKills)) : null;
      bridgeMetrics.snakeId = data.snakeId !== undefined && data.snakeId !== null ? String(data.snakeId) : null;
      bridgeMetrics.inGameName = normalizeInGameName(data.inGameName);
      bridgeMetrics.updatedAt = Date.now();
      if (!window.__slitherScoreLogBridgeConnected) {
        window.__slitherScoreLogBridgeConnected = true;
        console.info("[EVAR HUD for Slither] Bridge metrics connected.");
      }
    });
  }

  function loadSettings(cb) {
    if (!chrome || !chrome.storage || !chrome.storage.local) { cb(DEFAULT_SETTINGS); return; }
    chrome.storage.local.get([SETTINGS_KEY], function (result) {
      var saved = result[SETTINGS_KEY];
      if (!saved || typeof saved !== "object") { cb(DEFAULT_SETTINGS); return; }
      var m = saved.metrics && typeof saved.metrics === "object" ? saved.metrics : {};
      var dm = DEFAULT_SETTINGS.metrics;
      cb({
        opacity: saved.opacity != null ? saved.opacity : DEFAULT_SETTINGS.opacity,
        scale: saved.scale != null ? saved.scale : DEFAULT_SETTINGS.scale,
        theme: saved.theme || DEFAULT_SETTINGS.theme,
        metrics: { chart: m.chart != null ? m.chart : dm.chart, kills: m.kills != null ? m.kills : dm.kills, score: m.score != null ? m.score : dm.score, timer: m.timer != null ? m.timer : dm.timer, notifications: m.notifications != null ? m.notifications : dm.notifications }
      });
    });
  }

  function loadPersonalBest(cb) {
    if (!chrome || !chrome.storage || !chrome.storage.local) { cb(0); return; }
    chrome.storage.local.get([HISTORY_KEY], function (result) {
      var history = Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
      var best = 0;
      for (var i = 0; i < history.length; i += 1) {
        var s = Number(history[i].maxScore);
        if (Number.isFinite(s) && s > best) { best = s; }
      }
      cb(best);
    });
  }

  function triggerNotification(text, color) {
    notification.text = text;
    notification.color = color || "rgba(255,255,255,0.95)";
    notification.alpha = 1;
    notification.endMs = Date.now() + 2800;
  }

  function checkNotifications(prevMaxScore, newMaxScore, killDelta) {
    if (!metricOn("notifications")) return;
    var milestones = [1000, 5000, 10000, 25000, 50000, 100000];
    for (var m = 0; m < milestones.length; m += 1) {
      if (prevMaxScore < milestones[m] && newMaxScore >= milestones[m]) {
        triggerNotification(formatCompactNumber(milestones[m]) + " SIZE!", "rgba(255, 200, 60, 0.98)");
        break;
      }
    }
    if (allTimeBest >= 60 && prevMaxScore < allTimeBest && newMaxScore >= allTimeBest) {
      triggerNotification("NEW PERSONAL BEST!", "rgba(255, 215, 50, 0.98)");
    }
    if (newMaxScore > allTimeBest) {
      allTimeBest = newMaxScore;
    }
    if (killDelta > 0) {
      var now = Date.now();
      recentKillTimes.push(now);
      var cutoff = now - 25000;
      var trimmed = [];
      for (var k = 0; k < recentKillTimes.length; k += 1) {
        if (recentKillTimes[k] >= cutoff) { trimmed.push(recentKillTimes[k]); }
      }
      recentKillTimes = trimmed;
      if (recentKillTimes.length >= 3) {
        triggerNotification(recentKillTimes.length + " KILL STREAK!", "rgba(255, 80, 80, 0.98)");
      }
    }
  }

  function getFreshBridgeMetrics() {
    if (Date.now() - bridgeMetrics.updatedAt > 6000) {
      return null;
    }
    return bridgeMetrics;
  }

  function shouldSkipThisFrame() {
    // Never skip — with all_frames enabled we want the overlay to appear
    // in whichever frame actually hosts the game canvas.
    return false;
  }

  function findHudElement() {
    var divs = document.querySelectorAll("div");
    var bestElement = null;
    var bestScore = -1;

    for (var i = 0; i < divs.length; i += 1) {
      var text = divs[i].textContent || "";
      if (text.indexOf("Your length") === -1) {
        continue;
      }

      var parsed = parseBestScoreFromText(text);
      if (parsed !== null && parsed >= bestScore) {
        bestScore = parsed;
        bestElement = divs[i];
      } else if (!bestElement) {
        bestElement = divs[i];
      }
    }
    return bestElement;
  }

  function parseScoreFromText(text) {
    if (!text) {
      return null;
    }
    var match = text.match(/Your\s+length:\s*([0-9][0-9,]*)/i);
    if (!match) {
      return null;
    }
    var score = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(score)) {
      return null;
    }
    return Math.max(0, Math.round(score));
  }

  function parseBestScoreFromText(text) {
    if (!text) {
      return null;
    }

    var best = null;
    var pattern = /Your\s+length:\s*([0-9][0-9,]*)/ig;
    var match = null;
    while ((match = pattern.exec(text)) !== null) {
      var parsed = Number(match[1].replace(/,/g, ""));
      if (!Number.isFinite(parsed)) {
        continue;
      }
      var normalized = Math.max(0, Math.round(parsed));
      if (best === null || normalized > best) {
        best = normalized;
      }
    }

    if (best !== null) {
      return best;
    }
    return parseScoreFromText(text);
  }

  function chooseScore(domScore, bridgeScore) {
    var hasDom = Number.isFinite(domScore);
    var hasBridge = Number.isFinite(bridgeScore);

    if (hasDom && hasBridge) {
      if (bridgeScore > domScore * 3 && bridgeScore - domScore > 5000) {
        return domScore;
      }
      return domScore;
    }
    if (hasDom) {
      return domScore;
    }
    if (hasBridge) {
      return bridgeScore;
    }
    return null;
  }

  function parseKillsFromText(text) {
    if (!text) {
      return null;
    }

    var patterns = [
      /\bkills?\s*[:=]\s*([0-9][0-9,]*)\b/i,
      /\bkill\s*count\s*[:=]\s*([0-9][0-9,]*)\b/i,
      /\b([0-9][0-9,]*)\s*\/\s*kill\b/i,
      /\b([0-9][0-9,]*)\s*kills?\b/i
    ];

    for (var i = 0; i < patterns.length; i += 1) {
      var match = text.match(patterns[i]);
      if (!match) {
        continue;
      }
      var kills = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(kills) && kills >= 0 && kills <= 5000) {
        return Math.round(kills);
      }
    }
    return null;
  }

  function parseInGameNameFromText(text) {
    if (!text) {
      return null;
    }
    var match = text.match(/\bNick\s*:\s*([^\n\r]+)/i);
    if (!match) {
      return null;
    }
    var candidate = (match[1] || "").split(/\bTeam\s*:/i)[0];
    return normalizeInGameName(candidate);
  }

  function readCurrentScore() {
    if (hudElement && (!hudElement.isConnected || (hudElement.textContent || "").indexOf("Your length") === -1)) {
      hudElement = null;
    }

    var domScore = null;
    if (hudElement) {
      var hudScore = parseBestScoreFromText(hudElement.textContent || "");
      if (hudScore !== null) {
        domScore = hudScore;
      }
    }

    if (domScore === null) {
      hudElement = findHudElement();
      if (hudElement) {
        var bestHudScore = parseBestScoreFromText(hudElement.textContent || "");
        if (bestHudScore !== null) {
          domScore = bestHudScore;
        }
      }
    }

    if (domScore === null) {
      domScore = parseBestScoreFromText(document.body ? document.body.innerText : "");
    }

    var bridge = getFreshBridgeMetrics();
    var bridgeScore = bridge && Number.isFinite(bridge.score) ? bridge.score : null;
    return chooseScore(domScore, bridgeScore);
  }

  function readCurrentKills() {
    var bridge = getFreshBridgeMetrics();
    if (bridge && Number.isFinite(bridge.kills)) {
      return bridge.kills;
    }

    if (hudElement) {
      var hudKills = parseKillsFromText(hudElement.textContent || "");
      if (hudKills !== null) {
        return hudKills;
      }
    }
    return parseKillsFromText(document.body ? document.body.innerText : "");
  }

  function readCurrentInGameName() {
    var bridge = getFreshBridgeMetrics();
    if (bridge) {
      var bridgeName = normalizeInGameName(bridge.inGameName);
      if (bridgeName) {
        return bridgeName;
      }
    }

    if (hudElement) {
      var hudName = parseInGameNameFromText(hudElement.textContent || "");
      if (hudName) {
        return hudName;
      }
    }

    return parseInGameNameFromText(document.body ? document.body.innerText : "");
  }

  function readCurrentSnakeId() {
    var bridge = getFreshBridgeMetrics();
    if (bridge && bridge.snakeId) {
      return bridge.snakeId;
    }
    return null;
  }

  function queueHistoryAppend(entry) {
    if (!entry || !chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }
    chrome.storage.local.get([HISTORY_KEY], function (result) {
      var history = Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
      var duplicate = false;
      for (var i = 0; i < history.length; i += 1) {
        if (history[i] && history[i].id === entry.id) {
          duplicate = true;
          break;
        }
      }
      if (duplicate) {
        return;
      }
      history.push(entry);
      if (history.length > MAX_HISTORY_GAMES) {
        history = history.slice(history.length - MAX_HISTORY_GAMES);
      }
      var payload = {};
      payload[HISTORY_KEY] = history;
      chrome.storage.local.set(payload, function () {
        if (chrome.runtime.lastError) {
          console.warn("[EVAR HUD for Slither] Failed to save history:", chrome.runtime.lastError.message);
        }
      });
    });
  }

  function serializeCurrentGame(endReason) {
    var endedAtMs = Date.now();
    var activityEndMs = currentGame.lastActiveAtMs || endedAtMs;
    var durationSeconds = Math.max(0, Math.round((activityEndMs - currentGame.startedAtMs) / 1000));
    var peakGrowth = 0;
    for (var i = 0; i < currentGame.samples.length; i += 1) {
      if (currentGame.samples[i].value > peakGrowth) {
        peakGrowth = currentGame.samples[i].value;
      }
    }

    return {
      id: currentGame.id,
      startedAt: currentGame.startedAtIso,
      endedAt: new Date(endedAtMs).toISOString(),
      inGameName: currentGame.inGameName || null,
      durationSec: durationSeconds,
      kills: currentGame.maxKills,
      finalScore: currentGame.currentScore,
      maxScore: currentGame.maxScore,
      totalGain: currentGame.totalGain,
      peakGrowth: peakGrowth,
      timeToMaxSec: currentGame.timeToMaxSec,
      milestoneSec: currentGame.milestoneSec,
      endReason: endReason || "unknown",
      host: location.host
    };
  }

  function shouldLogCurrentGame() {
    var durationSec = (Date.now() - currentGame.startedAtMs) / 1000;
    if (durationSec < MIN_LOG_DURATION_SECONDS) {
      return false;
    }
    if (currentGame.maxScore >= 60) {
      return true;
    }
    if (currentGame.maxKills >= 1) {
      return true;
    }
    if (currentGame.totalGain >= 120) {
      return true;
    }
    return false;
  }

  function finalizeCurrentGame(reason) {
    if (!shouldLogCurrentGame()) {
      return;
    }
    queueHistoryAppend(serializeCurrentGame(reason));
  }

  function resetWaitingState() {
    waitingForNewGame = true;
    currentGame = createGameState(Date.now(), 0, null, null);
  }

  function startNewGame(initialScore, killsRaw, snakeId, inGameName) {
    waitingForNewGame = false;
    currentGame = createGameState(Date.now(), initialScore, killsRaw, snakeId, inGameName);
  }

  function addGrowthSample(value) {
    var elapsed = Math.max(0, (Date.now() - currentGame.startedAtMs) / 1000);
    currentGame.samples.push({
      t: elapsed,
      value: Math.max(0, Number.isFinite(value) ? value : 0)
    });
  }

  function updateMilestones(score, elapsedSec) {
    var safeScore = Number.isFinite(score) ? score : 0;
    var safeElapsed = Math.max(0, Math.round(elapsedSec || 0));
    for (var i = 0; i < SIZE_MILESTONES.length; i += 1) {
      var marker = SIZE_MILESTONES[i];
      var key = String(marker);
      if (safeScore >= marker && currentGame.milestoneSec[key] === null) {
        currentGame.milestoneSec[key] = safeElapsed;
      }
    }
  }

  function sampleData() {
    if (shouldSkipThisFrame()) {
      return;
    }

    var score = readCurrentScore();
    var killsRaw = readCurrentKills();
    var snakeId = readCurrentSnakeId();
    var inGameName = readCurrentInGameName();
    var hasScore = Number.isFinite(score) && score > 0;

    if (waitingForNewGame) {
      if (hasScore) {
        startNewGame(score, killsRaw, snakeId, inGameName);
      } else {
        scheduleRedraw();
        return;
      }
    }

    var normalizedScore = hasScore ? Math.max(0, Math.round(score)) : 0;
    var growthThisSecond = 0;
    var shouldAddSample = true;

    if (hasScore) {
      var elapsedSec = Math.max(0, (Date.now() - currentGame.startedAtMs) / 1000);
      var scoreResetHigh = currentGame.previousScore >= SCORE_RESET_FROM_HIGH && normalizedScore <= SCORE_RESET_TO_HIGH;
      var scoreResetLow = currentGame.previousScore >= SCORE_RESET_FROM_LOW &&
        normalizedScore <= SCORE_RESET_TO_LOW &&
        currentGame.liveTicks >= 5;
      var scoreLargeDrop = currentGame.previousScore >= 100 &&
        normalizedScore <= 50 &&
        normalizedScore <= currentGame.previousScore * 0.25;

      var killsReset = currentGame.previousKillsRaw !== null &&
        killsRaw !== null &&
        currentGame.previousKillsRaw >= 1 &&
        killsRaw === 0 &&
        currentGame.liveTicks > 3 &&
        normalizedScore <= 60;
      var snakeChanged = currentGame.currentSnakeId !== null &&
        snakeId !== null &&
        currentGame.currentSnakeId !== snakeId &&
        currentGame.liveTicks >= 2;

      if (scoreResetHigh || scoreResetLow || scoreLargeDrop || killsReset || snakeChanged) {
        var reason = "score_reset";
        if (killsReset) {
          reason = "kills_reset";
        } else if (scoreLargeDrop) {
          reason = "score_large_drop";
        } else if (snakeChanged) {
          reason = "snake_changed";
        }
        finalizeCurrentGame(reason);
        startNewGame(normalizedScore, killsRaw, snakeId, inGameName);
      }

      if (currentGame.previousScore !== null) {
        var delta = normalizedScore - currentGame.previousScore;
        if (delta > 0) {
          growthThisSecond = delta;
          currentGame.totalGain += delta;
        }
      }

      var prevMaxScore = currentGame.maxScore;
      currentGame.currentScore = normalizedScore;
      currentGame.lastActiveAtMs = Date.now();
      if (normalizedScore > currentGame.maxScore) {
        currentGame.maxScore = normalizedScore;
        currentGame.timeToMaxSec = Math.max(0, Math.round(elapsedSec));
      }
      updateMilestones(normalizedScore, elapsedSec);
      currentGame.previousScore = normalizedScore;
      currentGame.liveTicks += 1;
      currentGame.missingScoreFrames = 0;

      var killDelta = 0;
      if (killsRaw !== null) {
        var safeKills = Math.max(0, Math.round(killsRaw));
        killDelta = Math.max(0, safeKills - currentGame.currentKills);
        currentGame.currentKills = safeKills;
        if (safeKills > currentGame.maxKills) {
          currentGame.maxKills = safeKills;
        }
        currentGame.previousKillsRaw = safeKills;
      }
      if (snakeId !== null) {
        currentGame.currentSnakeId = snakeId;
      }
      if (inGameName) {
        currentGame.inGameName = inGameName;
      }
      checkNotifications(prevMaxScore, currentGame.maxScore, killDelta);
    } else {
      currentGame.missingScoreFrames += 1;
      if (currentGame.missingScoreFrames >= SCORE_MISSING_END_FRAMES) {
        finalizeCurrentGame("score_missing");
        resetWaitingState();
        shouldAddSample = false;
      } else {
        shouldAddSample = false;
      }
    }

    if (shouldAddSample) {
      addGrowthSample(growthThisSecond);
    }
    scheduleRedraw();
  }

  function getTickSizeSeconds(spanSeconds) {
    if (spanSeconds <= ONE_MINUTE_TICK_LIMIT_SECONDS) {
      return ONE_MINUTE_SECONDS;
    }
    return FIVE_MINUTES_SECONDS;
  }

  function buildSmoothedSeries(samples, windowSize) {
    var output = [];
    var queue = [];
    var sum = 0;

    for (var i = 0; i < samples.length; i += 1) {
      sum += samples[i].value;
      queue.push(samples[i].value);
      if (queue.length > windowSize) {
        sum -= queue.shift();
      }
      output.push({
        t: samples[i].t,
        value: sum / queue.length
      });
    }
    return output;
  }

  function formatOverlayTime(seconds) {
    var total = Math.max(0, Math.round(Number(seconds) || 0));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var secs = total % 60;
    var minutePart = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
    var secondPart = String(secs).padStart(2, "0");
    if (hours > 0) {
      return String(hours) + ":" + minutePart + ":" + secondPart;
    }
    return minutePart + ":" + secondPart;
  }

  function drawSeries(samples, color, lineWidth, plot) {
    if (!samples.length) {
      return;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    for (var i = 0; i < samples.length; i += 1) {
      var point = samples[i];
      var x = plot.left + (point.t / plot.span) * plot.width;
      var y = plot.top + plot.height - (point.value / plot.maxValue) * plot.height;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  function drawSeriesArea(samples, color, plot) {
    if (!samples.length) {
      return;
    }
    var baseY = plot.top + plot.height;
    ctx.fillStyle = color;
    ctx.beginPath();

    for (var i = 0; i < samples.length; i += 1) {
      var point = samples[i];
      var x = plot.left + (point.t / plot.span) * plot.width;
      var y = plot.top + plot.height - (point.value / plot.maxValue) * plot.height;
      if (i === 0) {
        ctx.moveTo(x, baseY);
      }
      ctx.lineTo(x, y);
    }

    var last = samples[samples.length - 1];
    var lastX = plot.left + (last.t / plot.span) * plot.width;
    ctx.lineTo(lastX, baseY);
    ctx.closePath();
    ctx.fill();
  }

  function scheduleRedraw() {
    if (!drawPending) {
      drawPending = true;
      requestAnimationFrame(function () {
        drawPending = false;
        drawOverlay();
      });
    }
  }

  function drawOverlay() {
    if (!ctx || !canvas || !container) {
      return;
    }

    var W = canvas.width / (window.devicePixelRatio || 1);
    var H = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, W, H);

    // Layout
    var chartL = 26;
    var chartT = 6;
    var chartB = H - 42;
    var chartW = W - chartL - 4;
    var chartH = chartB - chartT;
    var divY = chartB + 4;
    var statsY = H - 18;
    var labelY = H - 7;

    // Chart data
    var plot = {
      left: chartL, top: chartT,
      width: chartW, height: chartH,
      span: MIN_TIME_SPAN_SECONDS, maxValue: 20
    };

    var latestSample = currentGame.samples[currentGame.samples.length - 1];
    var elapsed = Math.max(1, latestSample ? latestSample.t : 1);
    plot.span = Math.max(MIN_TIME_SPAN_SECONDS, elapsed);

    var maxValue = 0;
    for (var i = 0; i < currentGame.samples.length; i += 1) {
      if (currentGame.samples[i].value > maxValue) { maxValue = currentGame.samples[i].value; }
    }
    plot.maxValue = Math.max(20, maxValue * 1.25);

    var T = getTheme();

    // ── Grid (dot-style) ──
    ctx.fillStyle = "rgba(" + T.accent + ", 0.06)";
    for (var gRow = 1; gRow <= 3; gRow += 1) {
      var gy = chartT + (gRow / 4) * chartH;
      for (var gx = chartL; gx <= chartL + chartW; gx += 12) {
        ctx.fillRect(gx, gy, 1, 1);
      }
    }

    // Y-axis labels
    ctx.fillStyle = "rgba(120, 160, 210, 0.4)";
    ctx.font = "7.5px Consolas, SF Mono, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (var yr = 0; yr <= 2; yr += 1) {
      ctx.fillText(
        formatCompactNumber(Math.round(plot.maxValue * (2 - yr) / 2)),
        chartL - 3, chartT + (yr / 2) * chartH
      );
    }

    // Time ticks
    var tickSec = getTickSizeSeconds(plot.span);
    ctx.font = "7px Consolas, SF Mono, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (var tick = tickSec; tick <= plot.span; tick += tickSec) {
      var tickX = chartL + (tick / plot.span) * chartW;
      ctx.strokeStyle = "rgba(" + T.accent + ", 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tickX, chartT);
      ctx.lineTo(tickX, chartB);
      ctx.stroke();
      ctx.fillStyle = "rgba(120, 160, 210, 0.35)";
      ctx.fillText(Math.round(tick / 60) + "m", tickX, chartB + 2);
    }

    // Baseline
    var baseGrad = ctx.createLinearGradient(chartL, 0, chartL + chartW, 0);
    baseGrad.addColorStop(0, "rgba(" + T.accent + ", 0.0)");
    baseGrad.addColorStop(0.3, "rgba(" + T.accent + ", 0.25)");
    baseGrad.addColorStop(0.7, "rgba(" + T.accent + ", 0.25)");
    baseGrad.addColorStop(1, "rgba(" + T.accent + ", 0.0)");
    ctx.strokeStyle = baseGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartL, chartB);
    ctx.lineTo(chartL + chartW, chartB);
    ctx.stroke();

    // ── Data series ──
    var fastTrend = buildSmoothedSeries(currentGame.samples, 6);
    var slowTrend = buildSmoothedSeries(currentGame.samples, 18);

    // ── Chart data series (respects chart toggle) ──
    if (metricOn("chart")) {
      if (fastTrend.length > 1) {
        var fillGrad = ctx.createLinearGradient(0, chartT, 0, chartB);
        fillGrad.addColorStop(0, "rgba(" + T.accent + ", 0.18)");
        fillGrad.addColorStop(0.6, "rgba(" + T.accent + ", 0.06)");
        fillGrad.addColorStop(1, "rgba(" + T.accent + ", 0.0)");
        drawSeriesArea(fastTrend, fillGrad, plot);
      }

      drawSeries(currentGame.samples, "rgba(255,255,255,0.5)", 1, plot);
      drawSeries(slowTrend, "rgba(255, 170, 64, 0.75)", 1.3, plot);

      ctx.save();
      ctx.shadowColor = T.glow;
      ctx.shadowBlur = 6;
      drawSeries(fastTrend, T.line, 1.8, plot);
      ctx.restore();

      if (latestSample && latestSample.value > 0) {
        var lx = chartL + (latestSample.t / plot.span) * chartW;
        var ly = chartT + chartH - (latestSample.value / plot.maxValue) * chartH;

        ctx.save();
        ctx.shadowColor = T.glow;
        ctx.shadowBlur = 8;
        ctx.fillStyle = T.line;
        ctx.beginPath();
        ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = "rgba(" + T.accent + ", 0.7)";
        ctx.font = "bold 8px Consolas, SF Mono, monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText("+" + formatCompactNumber(latestSample.value), W - 3, chartT);
      }
    }

    // ── Notification flash ──
    if (notification.endMs > 0) {
      var nowMs = Date.now();
      var frac = Math.max(0, (notification.endMs - nowMs) / 2800);
      notification.alpha = Math.min(1, frac);
      if (notification.alpha > 0) {
        ctx.save();
        ctx.globalAlpha = notification.alpha;
        ctx.shadowColor = notification.color;
        ctx.shadowBlur = 22;
        ctx.fillStyle = notification.color;
        ctx.font = "bold 13px Segoe UI, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(notification.text, W / 2, (chartT + chartB) / 2);
        ctx.restore();
      }
    }

    // ── Divider ──
    var showKills = metricOn("kills"), showTimer = metricOn("timer"), showScore = metricOn("score");
    if (showKills || showTimer || showScore) {
      var divGrad = ctx.createLinearGradient(10, 0, W - 10, 0);
      divGrad.addColorStop(0, "rgba(" + T.accent + ", 0.0)");
      divGrad.addColorStop(0.3, "rgba(" + T.accent + ", 0.12)");
      divGrad.addColorStop(0.7, "rgba(" + T.accent + ", 0.12)");
      divGrad.addColorStop(1, "rgba(" + T.accent + ", 0.0)");
      ctx.strokeStyle = divGrad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, divY);
      ctx.lineTo(W - 10, divY);
      ctx.stroke();
    }

    // ── Stats row (respects toggles) ──
    var statCols = [];
    if (showKills) statCols.push("kills");
    if (showTimer) statCols.push("timer");
    if (showScore) statCols.push("score");
    var bigFont = "bold 16px Consolas, SF Mono, Fira Code, monospace";
    var smallFont = "7px Segoe UI, system-ui, sans-serif";

    var elapsedSec = 0;
    if (!waitingForNewGame) {
      var timerEndMs = currentGame.lastActiveAtMs || Date.now();
      elapsedSec = Math.max(0, Math.round((timerEndMs - currentGame.startedAtMs) / 1000));
    }

    var isPB = allTimeBest >= 60 && currentGame.currentScore > 0 && currentGame.currentScore >= allTimeBest;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    for (var si = 0; si < statCols.length; si++) {
      var cx = W * ((si + 0.5) / statCols.length);
      var col = statCols[si];
      if (col === "kills") {
        ctx.save();
        ctx.shadowColor = "rgba(255,70,70,0.7)"; ctx.shadowBlur = 8;
        ctx.fillStyle = T.kill; ctx.font = bigFont;
        ctx.fillText(String(currentGame.currentKills || 0), cx, statsY);
        ctx.restore();
        ctx.fillStyle = "rgba(255,100,80,0.55)"; ctx.font = smallFont;
        ctx.fillText("KILLS", cx, labelY);
      } else if (col === "timer") {
        ctx.fillStyle = "rgba(210,225,250,0.92)"; ctx.font = bigFont;
        ctx.fillText(formatOverlayTime(elapsedSec), cx, statsY);
        ctx.fillStyle = "rgba(120,150,200,0.4)"; ctx.font = smallFont;
        ctx.fillText("TIME", cx, labelY);
      } else if (col === "score") {
        ctx.save();
        if (isPB) { ctx.shadowColor = "rgba(255,215,0,0.5)"; ctx.shadowBlur = 10; ctx.fillStyle = "#ffd740"; }
        else { ctx.shadowColor = "rgba(255,170,64,0.3)"; ctx.shadowBlur = 4; ctx.fillStyle = "#ffab40"; }
        ctx.font = bigFont;
        ctx.fillText(formatCompactNumber(currentGame.currentScore), cx, statsY);
        ctx.restore();
        ctx.fillStyle = isPB ? "rgba(255,200,50,0.5)" : "rgba(200,140,50,0.4)";
        ctx.font = smallFont;
        ctx.fillText(isPB ? "PB!" : "SCORE", cx, labelY);
      }
    }
  }

  function startDomObserver() {
    if (domObserver || !window.MutationObserver) {
      return;
    }
    var target = document.body || document.documentElement;
    if (!target) {
      return;
    }
    domObserver = new MutationObserver(function () {
      if (!container || !container.isConnected) {
        createOverlay();
        scheduleRedraw();
      }
    });
    domObserver.observe(target, { childList: true });
  }

  function ensureOverlayPresence() {
    if (shouldSkipThisFrame()) {
      if (container && container.isConnected) {
        container.remove();
      }
      return;
    }

    if (!container || !canvas || !ctx || !container.isConnected) {
      createOverlay();
      scheduleRedraw();
    } else {
      attachOverlay();
    }
    startDomObserver();
  }

  function startIntervals() {
    window.setInterval(sampleData, SAMPLE_INTERVAL_MS);
    window.setInterval(ensureOverlayPresence, OVERLAY_REATTACH_MS);
    window.addEventListener("resize", function () { resizeCanvas(); scheduleRedraw(); });
    window.addEventListener("pageshow", ensureOverlayPresence);
    if (chrome && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes) {
        if (changes[SETTINGS_KEY] && changes[SETTINGS_KEY].newValue) {
          var ns = changes[SETTINGS_KEY].newValue;
          var m = ns.metrics && typeof ns.metrics === "object" ? ns.metrics : {};
          var dm = DEFAULT_SETTINGS.metrics;
          hudSettings = {
            opacity: ns.opacity != null ? ns.opacity : DEFAULT_SETTINGS.opacity,
            scale: ns.scale != null ? ns.scale : DEFAULT_SETTINGS.scale,
            theme: ns.theme || DEFAULT_SETTINGS.theme,
            metrics: { chart: m.chart != null ? m.chart : dm.chart, kills: m.kills != null ? m.kills : dm.kills, score: m.score != null ? m.score : dm.score, timer: m.timer != null ? m.timer : dm.timer, notifications: m.notifications != null ? m.notifications : dm.notifications }
          };
          applyOverlayStyles();
          scheduleRedraw();
        }
      });
    }
  }

  function boot() {
    if (booted) {
      return;
    }
    booted = true;

    try {
      attachBridgeListener();
    } catch (e) {
      console.error("[EVAR HUD] Bridge listener error:", e);
    }

    try {
      loadSettings(function (settings) {
        hudSettings = settings;
        loadPersonalBest(function (best) {
          allTimeBest = best;
          try {
            ensureOverlayPresence();
            sampleData();
            startIntervals();
            console.info("[EVAR HUD] Overlay ready. PB=" + best + " pos=" + settings.position);
          } catch (e) {
            console.error("[EVAR HUD] Start error:", e);
          }
        });
      });
    } catch (e) {
      console.error("[EVAR HUD] Settings error:", e);
    }

    // Fallback: if the async chain above fails silently, force-create
    // the overlay after 3 seconds regardless.
    setTimeout(function () {
      try {
        if (!container || !container.isConnected) {
          console.warn("[EVAR HUD] Fallback overlay creation triggered.");
          ensureOverlayPresence();
          sampleData();
          startIntervals();
        }
      } catch (e) {
        console.error("[EVAR HUD] Fallback error:", e);
      }
    }, 3000);
  }

  // Run boot when DOM is ready
  if (document.body) {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot);
  }
})();
