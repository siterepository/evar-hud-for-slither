(function () {
  "use strict";

  if (window.__slitherScoreLogPageBridgeInstalled) {
    return;
  }
  window.__slitherScoreLogPageBridgeInstalled = true;

  function numberOrNull(value) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return parsed;
  }

  function normalizeInt(value) {
    var parsed = numberOrNull(value);
    if (parsed === null) {
      return null;
    }
    return Math.max(0, Math.round(parsed));
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

  function findSnakeRef() {
    var snakeRef = null;

    if (typeof snake !== "undefined" && snake) {
      snakeRef = snake;
    } else if (window.snake) {
      snakeRef = window.snake;
    }

    return snakeRef || null;
  }

  function findFpslsRef() {
    if (typeof fpsls !== "undefined" && fpsls) {
      return fpsls;
    }
    return window.fpsls || null;
  }

  function findFmltsRef() {
    if (typeof fmlts !== "undefined" && fmlts) {
      return fmlts;
    }
    return window.fmlts || null;
  }

  function formulaScoreFromGameInternals(snakeRef) {
    if (!snakeRef) {
      return null;
    }

    var fpslsRef = findFpslsRef();
    var fmltsRef = findFmltsRef();
    var sct = numberOrNull(snakeRef.sct);
    var fam = numberOrNull(snakeRef.fam) || 0;

    if (!fpslsRef || !fmltsRef || sct === null) {
      return null;
    }

    var sctIndex = Math.floor(sct);
    var base = numberOrNull(fpslsRef[sctIndex]);
    var scale = numberOrNull(fmltsRef[sctIndex]);
    if (base === null || scale === null || scale === 0) {
      return null;
    }

    // Legacy length formula. Keep as fallback only.
    var score = 15 * (base + fam / scale - 1) - 5;
    var normalized = normalizeInt(score);
    if (normalized === null || normalized > 500000) {
      return null;
    }
    return normalized;
  }

  function scoreFromSnakeSc(snakeRef) {
    if (!snakeRef) {
      return null;
    }
    var directScore = normalizeInt(snakeRef.sc);
    if (directScore !== null && directScore > 0) {
      return directScore;
    }
    return null;
  }

  function scoreFromGameInternals() {
    var snakeRef = findSnakeRef();
    if (!snakeRef) {
      return null;
    }
    return scoreFromSnakeSc(snakeRef) || formulaScoreFromGameInternals(snakeRef);
  }

  function parseBestScoreFromText(text) {
    if (!text) {
      return null;
    }

    var best = null;
    var patterns = [/Your\s+length\s*:?\s*([0-9][0-9,]*)/ig];

    for (var p = 0; p < patterns.length; p += 1) {
      var pattern = patterns[p];
      var match = null;
      while ((match = pattern.exec(text)) !== null) {
        var parsed = normalizeInt((match[1] || "").replace(/,/g, ""));
        if (parsed === null) {
          continue;
        }
        if (best === null || parsed > best) {
          best = parsed;
        }
      }
    }

    return best;
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
      var parsed = normalizeInt((match[1] || "").replace(/,/g, ""));
      if (parsed !== null) {
        return parsed;
      }
    }
    return null;
  }

  function scoreFromDom() {
    var bodyText = document.body ? document.body.innerText : "";
    return parseBestScoreFromText(bodyText);
  }

  function killsFromDom() {
    var bodyText = document.body ? document.body.innerText : "";
    return parseKillsFromText(bodyText);
  }

  function getSnakeId(snakeRef) {
    if (!snakeRef) {
      return null;
    }

    var candidates = [snakeRef.id, snakeRef.sid, snakeRef.nk, snakeRef.nsi];
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i];
      if (candidate === null || candidate === undefined) {
        continue;
      }
      if (typeof candidate === "string" || typeof candidate === "number") {
        return String(candidate);
      }
    }
    return null;
  }

  function readInGameName(snakeRef) {
    if (snakeRef) {
      var snakeCandidates = [snakeRef.nk, snakeRef.name, snakeRef.nick, snakeRef.nickname];
      for (var i = 0; i < snakeCandidates.length; i += 1) {
        var snakeName = normalizeInGameName(snakeCandidates[i]);
        if (snakeName) {
          return snakeName;
        }
      }
    }

    var nickRef = null;
    if (typeof nick !== "undefined") {
      nickRef = nick;
    } else if (typeof window.nick !== "undefined") {
      nickRef = window.nick;
    }

    if (nickRef !== null && nickRef !== undefined) {
      if (typeof nickRef === "string") {
        var nickString = normalizeInGameName(nickRef);
        if (nickString) {
          return nickString;
        }
      }
      if (nickRef && typeof nickRef.value === "string") {
        var nickValue = normalizeInGameName(nickRef.value);
        if (nickValue) {
          return nickValue;
        }
      }
    }

    var bodyText = document.body ? document.body.innerText : "";
    var domMatch = bodyText.match(/\bNick\s*:\s*([^\n\r]+)/i);
    if (!domMatch) {
      return null;
    }

    var raw = domMatch[1] || "";
    raw = raw.split(/\bTeam\s*:/i)[0];
    return normalizeInGameName(raw);
  }

  function postMetrics() {
    var snakeRef = findSnakeRef();
    var domScore = scoreFromDom();
    var internalScore = scoreFromGameInternals();
    var score = domScore !== null ? domScore : internalScore;
    if (domScore !== null && internalScore !== null && internalScore > domScore * 3 && internalScore - domScore > 5000) {
      score = domScore;
    }

    var kills = killsFromDom();
    var snakeId = getSnakeId(snakeRef);
    var inGameName = readInGameName(snakeRef);

    window.postMessage(
      {
        __slitherScoreLog: true,
        type: "metrics",
        ts: Date.now(),
        score: score,
        kills: kills,
        snakeId: snakeId,
        inGameName: inGameName
      },
      window.location.origin
    );
  }

  postMetrics();
  window.setInterval(postMetrics, 500);
})();
