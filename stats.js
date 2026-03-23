(function () {
  "use strict";

  // ─── Supabase ─────────────────────────────────────────────────────────────
  var SUPABASE_URL = "https://lsnaoljlluiidmrooalm.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzbmFvbGpsbHVpaWRtcm9vYWxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzg1MTYsImV4cCI6MjA4OTYxNDUxNn0.juIiIBpMfNv876PXnAmwlbcL38zqPx5ocBKWzI-636A";

  var HISTORY_KEY = "slitherScoreLog.history.v1";
  var SETTINGS_KEY = "evarHud.settings.v1";
  var PLAYER_UUID_KEY = "evarHud.playerUuid.v1";

  // ─── DOM ──────────────────────────────────────────────────────────────────
  var summaryCards = document.getElementById("summaryCards");
  var avgDashboard = document.getElementById("avgDashboard");
  var pbDashboard = document.getElementById("pbDashboard");
  var historyRows = document.getElementById("historyRows");
  var emptyState = document.getElementById("emptyState");
  var refreshButton = document.getElementById("refreshButton");
  var exportButton = document.getElementById("exportButton");
  var scoreTrendChart = document.getElementById("scoreTrendChart");
  var killsDurationChart = document.getElementById("killsDurationChart");
  var radarChart = document.getElementById("radarChart");
  var scoreDistChart = document.getElementById("scoreDistChart");
  var tabBtns = document.querySelectorAll(".tab-btn");
  var displayNameInput = document.getElementById("displayName");
  var submitScoreBtn = document.getElementById("submitScoreBtn");
  var submitStatus = document.getElementById("submitStatus");
  var globalLoading = document.getElementById("globalLoading");
  var globalTableWrap = document.getElementById("globalTableWrap");
  var globalRows = document.getElementById("globalRows");
  var globalEmpty = document.getElementById("globalEmpty");
  var setupNotice = document.getElementById("setupNotice");

  var currentHistory = [];

  // ─── UUID ─────────────────────────────────────────────────────────────────
  function generateUuid() {
    var hex = "0123456789abcdef";
    var u = "";
    for (var i = 0; i < 36; i += 1) {
      if (i === 8 || i === 13 || i === 18 || i === 23) u += "-";
      else if (i === 14) u += "4";
      else if (i === 19) u += hex[((Math.random() * 4) | 0) + 8];
      else u += hex[(Math.random() * 16) | 0];
    }
    return u;
  }

  function getOrCreatePlayerId(cb) {
    chrome.storage.local.get([PLAYER_UUID_KEY], function (r) {
      var id = r[PLAYER_UUID_KEY];
      if (typeof id === "string" && id.length > 0) { cb(id); return; }
      var nid = generateUuid();
      var p = {};
      p[PLAYER_UUID_KEY] = nid;
      chrome.storage.local.set(p, function () { cb(nid); });
    });
  }

  // ─── Utility ──────────────────────────────────────────────────────────────
  function toNumber(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function toFiniteOrNull(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }

  function fmtCompact(v) {
    var n = toNumber(v); var a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "m";
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "k";
    return String(Math.round(n));
  }

  function fmtDec(v, d) { return toNumber(v).toFixed(d); }

  function fmtDur(s) {
    if (!Number.isFinite(s) || s < 0) return "-";
    var t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
    if (h > 0) return h + "h " + m + "m " + sec + "s";
    if (m > 0) return m + "m " + sec + "s";
    return sec + "s";
  }

  function fmtDate(d) { var dt = new Date(d); return Number.isNaN(dt.getTime()) ? "Unknown" : dt.toLocaleString(); }
  function fmtDateShort(d) { var dt = new Date(d); return Number.isNaN(dt.getTime()) ? "Unknown" : dt.toLocaleDateString(); }

  function fmtRelative(iso) {
    var d = new Date(iso); if (Number.isNaN(d.getTime())) return "—";
    var m = Math.floor((Date.now() - d.getTime()) / 60000);
    if (m < 2) return "just now"; if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60); if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }

  // ─── Metrics ──────────────────────────────────────────────────────────────
  function getMilestoneSec(item, size) {
    if (!item || !item.milestoneSec || typeof item.milestoneSec !== "object") return null;
    var v = item.milestoneSec[String(size)];
    return Number.isFinite(Number(v)) ? Number(v) : null;
  }

  function pickBest(cur, next, field, higher) {
    if (!next) return cur; if (!cur) return next;
    return (higher ? toNumber(next[field]) > toNumber(cur[field]) : toNumber(next[field]) < toNumber(cur[field])) ? next : cur;
  }

  function pickFastestMs(cur, item, size) {
    var s = getMilestoneSec(item, size);
    if (s === null) return cur;
    if (!cur || s < cur.seconds) return { item: item, seconds: s };
    return cur;
  }

  function computeMetrics(hist) {
    var g = hist.length, tK = 0, tG = 0, tD = 0, tM = 0, tF = 0, tP = 0;
    var bS = null, bK = null, bD = null, bG = null, bP = null, f1 = null, f5 = null;
    for (var i = 0; i < g; i += 1) {
      var it = hist[i];
      tK += toNumber(it.kills); tG += toNumber(it.totalGain); tD += toNumber(it.durationSec);
      tM += toNumber(it.maxScore); tF += toNumber(it.finalScore); tP += toNumber(it.peakGrowth);
      bS = pickBest(bS, it, "maxScore", true); bK = pickBest(bK, it, "kills", true);
      bD = pickBest(bD, it, "durationSec", true); bG = pickBest(bG, it, "totalGain", true);
      bP = pickBest(bP, it, "peakGrowth", true);
      f1 = pickFastestMs(f1, it, 1000); f5 = pickFastestMs(f5, it, 5000);
    }
    return {
      games: g, totalKills: tK, totalGain: tG, totalDuration: tD,
      avgDuration: g ? tD / g : 0, avgKills: g ? tK / g : 0,
      avgMaxScore: g ? tM / g : 0, avgFinalScore: g ? tF / g : 0,
      avgPeakSpike: g ? tP / g : 0, avgGainPerMin: tD > 0 ? tG / (tD / 60) : 0,
      bestByScore: bS, bestByKills: bK, bestByDuration: bD, bestByGain: bG, bestBySpike: bP,
      pbTimeToMax: bS ? toFiniteOrNull(bS.timeToMaxSec) : null, fastest1000: f1, fastest5000: f5
    };
  }

  // ─── Card Rendering ───────────────────────────────────────────────────────
  function buildCard(label, value) {
    var a = document.createElement("article"); a.className = "card";
    var l = document.createElement("div"); l.className = "label"; l.textContent = label;
    var v = document.createElement("div"); v.className = "value"; v.textContent = value;
    a.appendChild(l); a.appendChild(v); return a;
  }

  function renderSummaryCards(m) {
    var cards = [
      { l: "Games", v: String(m.games) }, { l: "Total Play Time", v: fmtDur(m.totalDuration) },
      { l: "Avg Size", v: fmtCompact(m.avgMaxScore) }, { l: "Avg Kills", v: fmtDec(m.avgKills, 1) },
      { l: "Avg Duration", v: fmtDur(m.avgDuration) }, { l: "Total Kills", v: fmtCompact(m.totalKills) },
      { l: "Total Gain", v: fmtCompact(m.totalGain) }, { l: "Gain / Min", v: fmtCompact(m.avgGainPerMin) }
    ];
    summaryCards.textContent = "";
    for (var i = 0; i < cards.length; i++) summaryCards.appendChild(buildCard(cards[i].l, cards[i].v));
  }

  // ─── Stat Lists ───────────────────────────────────────────────────────────
  function renderStatList(ctr, items) {
    ctr.textContent = "";
    for (var i = 0; i < items.length; i++) {
      var it = items[i], a = document.createElement("article"); a.className = "stat-item";
      var n = document.createElement("div"); n.className = "name"; n.textContent = it.name;
      var v = document.createElement("div"); v.className = "value"; v.textContent = it.value;
      a.appendChild(n); a.appendChild(v);
      if (it.meta) { var mt = document.createElement("div"); mt.className = "meta"; mt.textContent = it.meta; a.appendChild(mt); }
      ctr.appendChild(a);
    }
  }

  function renderDashboards(m) {
    renderStatList(avgDashboard, [
      { name: "Avg Size / Game", value: fmtCompact(m.avgMaxScore) },
      { name: "Avg Final Score", value: fmtCompact(m.avgFinalScore) },
      { name: "Avg Time", value: fmtDur(m.avgDuration) },
      { name: "Avg Kills", value: fmtDec(m.avgKills, 1) },
      { name: "Avg Gain / Min", value: fmtCompact(m.avgGainPerMin) },
      { name: "Avg Peak Spike", value: fmtCompact(m.avgPeakSpike) }
    ]);
    var pb = [];
    function addPB(name, item, field, fmt, higher) {
      if (item) pb.push({ name: name, value: fmt(toNumber(item[field])), meta: fmtDateShort(item.startedAt) });
      else pb.push({ name: name, value: "-" });
    }
    addPB("Best Size", m.bestByScore, "maxScore", fmtCompact); addPB("Best Kills", m.bestByKills, "kills", function (v) { return String(Math.round(v)); });
    addPB("Longest Alive", m.bestByDuration, "durationSec", fmtDur); addPB("Highest Gain", m.bestByGain, "totalGain", fmtCompact);
    addPB("Peak Spike", m.bestBySpike, "peakGrowth", fmtCompact);
    if (m.pbTimeToMax !== null) pb.push({ name: "Time to Best", value: fmtDur(m.pbTimeToMax), meta: m.bestByScore ? fmtDateShort(m.bestByScore.startedAt) : "" });
    if (m.fastest1000) pb.push({ name: "Fastest to 1k", value: fmtDur(m.fastest1000.seconds), meta: fmtDateShort(m.fastest1000.item.startedAt) });
    if (m.fastest5000) pb.push({ name: "Fastest to 5k", value: fmtDur(m.fastest5000.seconds), meta: fmtDateShort(m.fastest5000.item.startedAt) });
    renderStatList(pbDashboard, pb);
  }

  // ─── Canvas Helpers ───────────────────────────────────────────────────────
  function getCCtx(c) {
    var dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect();
    var w = Math.max(1, Math.floor(r.width * dpr)), h = Math.max(1, Math.floor(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    var ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: r.width, h: r.height };
  }

  function drawEmpty(c, msg) {
    var s = getCCtx(c); s.ctx.clearRect(0, 0, s.w, s.h);
    s.ctx.fillStyle = "rgba(100,130,170,0.6)"; s.ctx.font = "13px Segoe UI, system-ui, sans-serif";
    s.ctx.textAlign = "center"; s.ctx.textBaseline = "middle"; s.ctx.fillText(msg, s.w / 2, s.h / 2);
  }

  function drawGrid(ctx, p, rows) {
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1;
    for (var i = 0; i <= rows; i++) { var y = p.top + (i / rows) * p.height; ctx.beginPath(); ctx.moveTo(p.left, y); ctx.lineTo(p.left + p.width, y); ctx.stroke(); }
  }

  function drawLine(ctx, pts, color, lw, p, maxY) {
    if (!pts.length || maxY <= 0) return;
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var x = p.left + (i / Math.max(1, pts.length - 1)) * p.width;
      var y = p.top + p.height - (pts[i] / maxY) * p.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: RADAR CHART — Player Strengths
  // ═══════════════════════════════════════════════════════════════════════════
  function computeConsistency(hist) {
    if (hist.length < 2) return 0;
    var sum = 0, count = 0;
    for (var i = 0; i < hist.length; i++) {
      var mx = toNumber(hist[i].maxScore), fn = toNumber(hist[i].finalScore);
      if (mx > 10) { sum += fn / mx; count++; }
    }
    return count > 0 ? sum / count : 0;
  }

  function drawRadarChartFn(metrics, hist) {
    if (!hist.length) { drawEmpty(radarChart, "Play some games to see your strengths."); return; }
    var s = getCCtx(radarChart), ctx = s.ctx, W = s.w, H = s.h;
    ctx.clearRect(0, 0, W, H);

    var cx = W / 2, cy = H / 2 + 8;
    var radius = Math.min(W, H) * 0.34;
    var dims = [
      { label: "Survival", value: Math.min(1, metrics.avgDuration / 600) },
      { label: "Growth", value: Math.min(1, metrics.avgGainPerMin / 400) },
      { label: "Aggression", value: Math.min(1, metrics.avgKills / 5) },
      { label: "Peak Power", value: Math.min(1, (metrics.bestByScore ? toNumber(metrics.bestByScore.maxScore) : 0) / 30000) },
      { label: "Consistency", value: computeConsistency(hist) }
    ];
    var n = dims.length, step = (Math.PI * 2) / n, start = -Math.PI / 2;

    function pt(i, r) { var a = start + i * step; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; }

    // Concentric rings
    var rings = [0.25, 0.5, 0.75, 1.0];
    for (var ri = 0; ri < rings.length; ri++) {
      ctx.strokeStyle = ri === rings.length - 1 ? "rgba(0,212,245,0.14)" : "rgba(0,212,245,0.06)";
      ctx.lineWidth = 1; ctx.beginPath();
      for (var pi = 0; pi <= n; pi++) { var pp = pt(pi % n, radius * rings[ri]); if (pi === 0) ctx.moveTo(pp.x, pp.y); else ctx.lineTo(pp.x, pp.y); }
      ctx.stroke();
    }

    // Axis lines
    ctx.strokeStyle = "rgba(0,212,245,0.08)"; ctx.lineWidth = 1;
    for (var ai = 0; ai < n; ai++) { var ap = pt(ai, radius); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ap.x, ap.y); ctx.stroke(); }

    // Player area — fill
    ctx.beginPath();
    for (var di = 0; di <= n; di++) { var dp = pt(di % n, radius * Math.max(0.04, dims[di % n].value)); if (di === 0) ctx.moveTo(dp.x, dp.y); else ctx.lineTo(dp.x, dp.y); }
    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, "rgba(0,212,245,0.22)"); grad.addColorStop(1, "rgba(0,212,245,0.04)");
    ctx.fillStyle = grad; ctx.fill();

    // Player area — stroke with glow
    ctx.beginPath();
    for (var si = 0; si <= n; si++) { var sp = pt(si % n, radius * Math.max(0.04, dims[si % n].value)); if (si === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y); }
    ctx.save(); ctx.shadowColor = "rgba(0,212,245,0.4)"; ctx.shadowBlur = 8;
    ctx.strokeStyle = "rgba(0,220,250,0.85)"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();

    // Vertex dots
    for (var vi = 0; vi < n; vi++) {
      var vp = pt(vi, radius * Math.max(0.04, dims[vi].value));
      ctx.save(); ctx.shadowColor = "rgba(0,212,245,0.6)"; ctx.shadowBlur = 6;
      ctx.fillStyle = "#00d4f5"; ctx.beginPath(); ctx.arc(vp.x, vp.y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    // Labels + percentages
    for (var li = 0; li < n; li++) {
      var lp = pt(li, radius + 22), angle = start + li * step;
      ctx.textAlign = Math.abs(Math.cos(angle)) < 0.15 ? "center" : (Math.cos(angle) > 0 ? "left" : "right");
      ctx.textBaseline = Math.abs(Math.sin(angle)) < 0.15 ? "middle" : (Math.sin(angle) > 0 ? "top" : "bottom");

      ctx.font = "11px Segoe UI, system-ui, sans-serif";
      ctx.fillStyle = "rgba(200,215,240,0.8)";
      ctx.fillText(dims[li].label, lp.x, lp.y);

      var pctPt = pt(li, radius + 36);
      ctx.font = "bold 11px Cascadia Code, SF Mono, Consolas, monospace";
      ctx.fillStyle = "rgba(0,212,245,0.7)";
      ctx.fillText(Math.round(dims[li].value * 100) + "%", pctPt.x, pctPt.y);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: SCORE DISTRIBUTION HISTOGRAM
  // ═══════════════════════════════════════════════════════════════════════════
  function drawScoreDistFn(hist) {
    if (!hist.length) { drawEmpty(scoreDistChart, "Play some games to see distribution."); return; }
    var s = getCCtx(scoreDistChart), ctx = s.ctx, W = s.w, H = s.h;
    ctx.clearRect(0, 0, W, H);

    var buckets = [
      { label: "0–100", min: 0, max: 100, c: 0 }, { label: "100–500", min: 100, max: 500, c: 0 },
      { label: "500–1k", min: 500, max: 1000, c: 0 }, { label: "1k–5k", min: 1000, max: 5000, c: 0 },
      { label: "5k–10k", min: 5000, max: 10000, c: 0 }, { label: "10k–25k", min: 10000, max: 25000, c: 0 },
      { label: "25k+", min: 25000, max: Infinity, c: 0 }
    ];
    for (var i = 0; i < hist.length; i++) {
      var sc = toNumber(hist[i].maxScore);
      for (var b = 0; b < buckets.length; b++) { if (sc >= buckets[b].min && sc < buckets[b].max) { buckets[b].c++; break; } }
    }

    var maxC = 1;
    for (var mc = 0; mc < buckets.length; mc++) { if (buckets[mc].c > maxC) maxC = buckets[mc].c; }

    var p = { left: 36, top: 14, width: W - 48, height: H - 42 };
    drawGrid(ctx, p, 4);

    // Y-axis
    ctx.fillStyle = "rgba(100,140,190,0.45)"; ctx.font = "9px Cascadia Code, Consolas, monospace";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (var yr = 0; yr <= 4; yr++) ctx.fillText(String(Math.round(maxC * (4 - yr) / 4)), p.left - 6, p.top + (yr / 4) * p.height);

    // Bars
    var gap = 6, bw = (p.width - gap * (buckets.length - 1)) / buckets.length;
    for (var bi = 0; bi < buckets.length; bi++) {
      var bx = p.left + bi * (bw + gap), bh = (buckets[bi].c / maxC) * p.height, by = p.top + p.height - bh;
      if (bh > 0) {
        var bg = ctx.createLinearGradient(0, by, 0, p.top + p.height);
        bg.addColorStop(0, "rgba(0,212,245,0.8)"); bg.addColorStop(1, "rgba(0,140,190,0.25)");
        ctx.fillStyle = bg;
        var r = Math.min(3, bw / 2, bh / 2);
        ctx.beginPath(); ctx.moveTo(bx + r, by); ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
        ctx.lineTo(bx + bw, p.top + p.height); ctx.lineTo(bx, p.top + p.height);
        ctx.lineTo(bx, by + r); ctx.arcTo(bx, by, bx + r, by, r); ctx.fill();
      }
      if (buckets[bi].c > 0) {
        ctx.fillStyle = "rgba(0,212,245,0.85)"; ctx.font = "bold 9px Cascadia Code, Consolas, monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(String(buckets[bi].c), bx + bw / 2, by - 3);
      }
      ctx.fillStyle = "rgba(100,140,190,0.5)"; ctx.font = "8px Segoe UI, system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(buckets[bi].label, bx + bw / 2, p.top + p.height + 4);
    }
  }

  // ─── Existing Charts ──────────────────────────────────────────────────────
  function drawScoreTrend(hist) {
    if (!hist.length) { drawEmpty(scoreTrendChart, "No game history yet."); return; }
    var h = hist.slice(0, 80).reverse(), s = getCCtx(scoreTrendChart), ctx = s.ctx, W = s.w, H = s.h;
    ctx.clearRect(0, 0, W, H);
    var p = { left: 44, top: 16, width: W - 62, height: H - 40 }; drawGrid(ctx, p, 4);
    var mx = 1; for (var i = 0; i < h.length; i++) mx = Math.max(mx, toNumber(h[i].maxScore), toNumber(h[i].finalScore));
    var mxS = h.map(function (it) { return toNumber(it.maxScore); });
    var fnS = h.map(function (it) { return toNumber(it.finalScore); });

    // Gradient fill under max series
    if (mxS.length > 1) {
      ctx.beginPath();
      for (var fi = 0; fi < mxS.length; fi++) {
        var fx = p.left + (fi / Math.max(1, mxS.length - 1)) * p.width;
        var fy = p.top + p.height - (mxS[fi] / mx) * p.height;
        if (fi === 0) ctx.moveTo(fx, fy); else ctx.lineTo(fx, fy);
      }
      ctx.lineTo(p.left + p.width, p.top + p.height); ctx.lineTo(p.left, p.top + p.height); ctx.closePath();
      var fg = ctx.createLinearGradient(0, p.top, 0, p.top + p.height);
      fg.addColorStop(0, "rgba(255,170,50,0.15)"); fg.addColorStop(1, "rgba(255,170,50,0.0)");
      ctx.fillStyle = fg; ctx.fill();
    }

    drawLine(ctx, mxS, "rgba(255,170,50,0.9)", 2, p, mx);
    ctx.save(); ctx.shadowColor = "rgba(0,200,245,0.35)"; ctx.shadowBlur = 4;
    drawLine(ctx, fnS, "rgba(0,200,245,0.9)", 2, p, mx); ctx.restore();

    ctx.fillStyle = "rgba(130,155,195,0.6)"; ctx.font = "10px Cascadia Code, Consolas, monospace";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (var r = 0; r <= 4; r++) ctx.fillText(fmtCompact(Math.round(mx * (4 - r) / 4)), p.left - 8, p.top + (r / 4) * p.height);

    ctx.fillStyle = "rgba(160,180,210,0.6)"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("Game #", p.left, H - 8); ctx.textAlign = "right"; ctx.fillText(String(h.length), p.left + p.width, H - 8);

    // Legend
    ctx.fillStyle = "rgba(255,170,50,0.9)"; ctx.fillRect(p.left, 4, 10, 2);
    ctx.fillStyle = "rgba(200,215,240,0.7)"; ctx.textAlign = "left"; ctx.fillText("Max Size", p.left + 14, 1);
    ctx.fillStyle = "rgba(0,200,245,0.9)"; ctx.fillRect(p.left + 90, 4, 10, 2);
    ctx.fillStyle = "rgba(200,215,240,0.7)"; ctx.fillText("Final", p.left + 104, 1);
  }

  function drawKillsDur(hist) {
    if (!hist.length) { drawEmpty(killsDurationChart, "No game history yet."); return; }
    var h = hist.slice(0, 30).reverse(), s = getCCtx(killsDurationChart), ctx = s.ctx, W = s.w, H = s.h;
    ctx.clearRect(0, 0, W, H);
    var p = { left: 44, top: 16, width: W - 62, height: H - 40 }; drawGrid(ctx, p, 4);
    var mK = 1, mD = 1;
    for (var i = 0; i < h.length; i++) { mK = Math.max(mK, toNumber(h[i].kills)); mD = Math.max(mD, toNumber(h[i].durationSec) / 60); }

    var bw = Math.max(3, (p.width / Math.max(1, h.length)) * 0.6);
    for (var idx = 0; idx < h.length; idx++) {
      var cx = p.left + (idx / Math.max(1, h.length - 1)) * p.width;
      var bh = (toNumber(h[idx].kills) / mK) * p.height;
      var bg = ctx.createLinearGradient(0, p.top + p.height - bh, 0, p.top + p.height);
      bg.addColorStop(0, "rgba(255,100,60,0.8)"); bg.addColorStop(1, "rgba(255,100,60,0.25)");
      ctx.fillStyle = bg; ctx.fillRect(cx - bw / 2, p.top + p.height - bh, bw, bh);
    }

    var durS = h.map(function (it) { return toNumber(it.durationSec) / 60; });
    ctx.save(); ctx.shadowColor = "rgba(0,200,245,0.3)"; ctx.shadowBlur = 3;
    drawLine(ctx, durS, "rgba(0,200,245,0.9)", 2, p, mD); ctx.restore();

    ctx.fillStyle = "rgba(130,155,195,0.6)"; ctx.font = "10px Cascadia Code, Consolas, monospace";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (var r = 0; r <= 4; r++) ctx.fillText(String(Math.round(mK * (4 - r) / 4)), p.left - 8, p.top + (r / 4) * p.height);
    ctx.textAlign = "left";
    for (var rr = 0; rr <= 4; rr++) ctx.fillText((mD * (4 - rr) / 4).toFixed(1) + "m", p.left + p.width + 6, p.top + (rr / 4) * p.height);

    ctx.fillStyle = "rgba(255,100,60,0.9)"; ctx.fillRect(p.left, 4, 10, 8);
    ctx.fillStyle = "rgba(200,215,240,0.7)"; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("Kills", p.left + 14, 1);
    ctx.strokeStyle = "rgba(0,200,245,0.9)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.left + 60, 8); ctx.lineTo(p.left + 72, 8); ctx.stroke();
    ctx.fillStyle = "rgba(200,215,240,0.7)"; ctx.fillText("Duration", p.left + 76, 1);
  }

  // ─── History Table ────────────────────────────────────────────────────────
  function renderTable(hist) {
    historyRows.textContent = "";
    if (!hist.length) { emptyState.style.display = "block"; return; }
    emptyState.style.display = "none";
    for (var i = 0; i < hist.length; i++) {
      var it = hist[i], ttm = toFiniteOrNull(it.timeToMaxSec);
      var cells = [fmtDate(it.startedAt), it.inGameName || "-", fmtDur(toNumber(it.durationSec)),
        String(Math.round(toNumber(it.kills))), fmtCompact(toNumber(it.finalScore)), fmtCompact(toNumber(it.maxScore)),
        fmtCompact(toNumber(it.totalGain)), fmtCompact(toNumber(it.peakGrowth)), ttm !== null ? fmtDur(ttm) : "-", it.host || "-"];
      var tr = document.createElement("tr");
      for (var j = 0; j < cells.length; j++) { var td = document.createElement("td"); td.textContent = cells[j]; tr.appendChild(td); }
      historyRows.appendChild(tr);
    }
  }

  // ─── Render All ───────────────────────────────────────────────────────────
  function renderAll(hist) {
    var m = computeMetrics(hist);
    renderSummaryCards(m);
    renderDashboards(m);
    drawRadarChartFn(m, hist);
    drawScoreDistFn(hist);
    drawScoreTrend(hist);
    drawKillsDur(hist);
    renderTable(hist);
  }

  function loadAndRender() {
    chrome.storage.local.get([HISTORY_KEY], function (r) {
      var h = Array.isArray(r[HISTORY_KEY]) ? r[HISTORY_KEY] : [];
      h.sort(function (a, b) { return new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime(); });
      currentHistory = h; renderAll(h);
    });
  }

  // ─── Tabs ─────────────────────────────────────────────────────────────────
  tabBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var t = b.getAttribute("data-tab");
      tabBtns.forEach(function (x) { x.classList.remove("active"); }); b.classList.add("active");
      document.querySelectorAll(".tab-content").forEach(function (el) { el.classList.remove("active"); });
      var panel = document.getElementById("tab-" + t); if (panel) panel.classList.add("active");
      if (t === "global") loadGlobalLeaderboard();
    });
  });

  // ─── Export ───────────────────────────────────────────────────────────────
  exportButton.addEventListener("click", function () {
    if (!currentHistory.length) return;
    var blob = new Blob([JSON.stringify(currentHistory, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url;
    a.download = "slither-history-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  });

  // ─── Display Name ─────────────────────────────────────────────────────────
  function loadDisplayName() {
    chrome.storage.local.get([SETTINGS_KEY], function (r) {
      var s = r[SETTINGS_KEY]; if (s && typeof s.displayName === "string") displayNameInput.value = s.displayName;
    });
  }
  displayNameInput.addEventListener("input", function () {
    chrome.storage.local.get([SETTINGS_KEY], function (r) {
      var s = r[SETTINGS_KEY] || {}; s.displayName = displayNameInput.value.trim();
      var p = {}; p[SETTINGS_KEY] = s; chrome.storage.local.set(p, function () {});
    });
  });

  // ─── Supabase ─────────────────────────────────────────────────────────────
  function isSBReady() {
    return SUPABASE_URL !== "YOUR_SUPABASE_URL" && SUPABASE_URL.length > 10 && SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY" && SUPABASE_ANON_KEY.length > 10;
  }
  function sbHeaders() { return { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" }; }

  function loadGlobalLeaderboard() {
    if (!isSBReady()) { setupNotice.style.display = "block"; globalLoading.style.display = "none"; globalEmpty.style.display = "none"; globalTableWrap.style.display = "none"; return; }
    setupNotice.style.display = "none"; globalLoading.style.display = "block"; globalTableWrap.style.display = "none"; globalEmpty.style.display = "none";
    fetch(SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/leaderboard?select=*&order=best_score.desc&limit=50", { headers: sbHeaders() })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (rows) {
        globalLoading.style.display = "none";
        if (!Array.isArray(rows) || !rows.length) { globalEmpty.style.display = "block"; globalEmpty.textContent = "No scores yet. Be the first!"; return; }
        renderGlobalTable(rows); globalTableWrap.style.display = "block";
      })
      .catch(function () { globalLoading.style.display = "none"; globalEmpty.textContent = "Could not load leaderboard."; globalEmpty.style.display = "block"; });
  }

  function renderGlobalTable(entries) {
    globalRows.textContent = "";
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i], tr = document.createElement("tr");
      if (i === 0) tr.className = "rank-gold"; else if (i === 1) tr.className = "rank-silver"; else if (i === 2) tr.className = "rank-bronze";
      var cells = [String(i + 1), e.display_name || "Anonymous Snake", fmtCompact(toNumber(e.best_score)), String(Math.round(toNumber(e.kills))), fmtDur(toNumber(e.duration_sec)), fmtRelative(e.submitted_at || "")];
      for (var j = 0; j < cells.length; j++) { var td = document.createElement("td"); td.textContent = cells[j]; tr.appendChild(td); }
      globalRows.appendChild(tr);
    }
  }

  function setSubmitStatus(msg, err) { submitStatus.textContent = msg; submitStatus.className = "submit-status" + (err ? " error" : " success"); }

  submitScoreBtn.addEventListener("click", function () {
    if (!isSBReady()) { setSubmitStatus("Supabase not configured.", true); return; }
    if (!currentHistory.length) { setSubmitStatus("No game history yet.", true); return; }
    var best = currentHistory[0];
    for (var i = 1; i < currentHistory.length; i++) { if (toNumber(currentHistory[i].maxScore) > toNumber(best.maxScore)) best = currentHistory[i]; }
    var dn = displayNameInput.value.trim() || "Anonymous Snake";
    submitScoreBtn.disabled = true; setSubmitStatus("Submitting…", false);
    getOrCreatePlayerId(function (pid) {
      var payload = { player_id: pid, display_name: dn, best_score: toNumber(best.maxScore), kills: toNumber(best.kills), duration_sec: toNumber(best.durationSec), submitted_at: new Date().toISOString() };
      var hdrs = sbHeaders(); hdrs.Prefer = "resolution=merge-duplicates";
      fetch(SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/leaderboard", { method: "POST", headers: hdrs, body: JSON.stringify(payload) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); submitScoreBtn.disabled = false; setSubmitStatus("Submitted! Best: " + fmtCompact(payload.best_score), false); loadGlobalLeaderboard(); })
        .catch(function () { submitScoreBtn.disabled = false; setSubmitStatus("Submission failed.", true); });
    });
  });

  // ─── Events ───────────────────────────────────────────────────────────────
  refreshButton.addEventListener("click", loadAndRender);
  window.addEventListener("resize", loadAndRender);
  chrome.storage.onChanged.addListener(function (c, a) { if (a === "local" && c[HISTORY_KEY]) loadAndRender(); });

  loadDisplayName();
  loadAndRender();
})();
