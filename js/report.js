/* ═══════════════════════════════════════════════════════════════
   RSS Watch — report.js
   Renders a single report (neutrality_check.py output schema) as
   one scrolling page: Hero, Executive Summary, Scoring Breakdown,
   Editors, Qualitative Insights, Appendix.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  const {
    escapeHtml,
    getParam,
    fetchJson,
    formatDateTime,
    severityClass,
    severityLabel,
    fmtEditorName,
    editorInitial,
    isIpEditor,
    truncate,
  } = window.RSSWatch;

  const el = {
    loading: document.getElementById("loading-state"),
    error: document.getElementById("error-state"),
    errorText: document.getElementById("error-text"),
    content: document.getElementById("report-content"),

    title: document.getElementById("report-title"),
    generatedAt: document.getElementById("generated-at"),
    editorCount: document.getElementById("editor-count"),
    detectionCount: document.getElementById("detection-count"),
    urlLink: document.getElementById("report-url-link"),
    urlText: document.getElementById("report-url-text"),

    execScore: document.getElementById("exec-score"),
    execSummaryText: document.getElementById("exec-summary-text"),

    editorsTabGrid: document.getElementById("editors-tab-grid"),
    editorsTabCount: document.getElementById("editors-tab-count"),
    editorsEmpty: document.getElementById("editors-empty"),

    qualitativeText: document.getElementById("qualitative-text"),

    scoreVisual: document.getElementById("score-visual"),
    formulaPillText: document.getElementById("formula-pill-text"),
    topHitCallout: document.getElementById("top-hit-callout"),
    catRowsBody: document.getElementById("cat-rows-body"),

    catFilterBar: document.getElementById("cat-filter-bar"),
    hitsGrid: document.getElementById("hits-grid"),
    hitsCount: document.getElementById("hits-count"),
    hitsEmpty: document.getElementById("hits-empty"),
  };

  let report = null;
  let reportId = null;
  let activeCatFilter = null;

  // ── Scoring formula: max + 0.25 × remaining hits, capped at 10 ─
  function computeFinalScore(detections) {
    if (!detections.length) return { final: 0, max: 0, remaining: 0, bonus: 0 };
    const scores = detections.map((d) => Math.abs(d.score || 0));
    const max = Math.max(...scores);
    const remaining = detections.length - 1;
    const bonus = Math.round(remaining * 0.25 * 100) / 100;
    const final = Math.min(Math.round((max + bonus) * 100) / 100, 10);
    return { final, max, remaining, bonus };
  }

  function scorePlainClass(score) {
    const s = Number(score) || 0;
    return s >= 7 ? "score-plain--danger" : s >= 4 ? "score-plain--med" : "score-plain--low";
  }

  // ── Render hero ───────────────────────────────────────────────
  function renderHero() {
    const article = report.article || {};
    const editorNames = new Set(
      (report.detections || []).map((d) => d.editor_name).filter(Boolean)
    );

    el.title.textContent = article.resolved_title || article.requested_title || "Untitled Article";
    el.generatedAt.textContent = formatDateTime(article.latest_rev_timestamp);
    el.editorCount.textContent = editorNames.size;
    el.detectionCount.textContent = (report.summary || {}).total_detections ?? (report.detections || []).length;

    if (article.source_url) {
      el.urlLink.href = article.source_url;
      el.urlText.textContent = article.source_url;
      el.urlLink.style.display = "inline-flex";
    }
  }

  // ── Render Summary ───────────────────────────────────────────
  function renderSummary() {
    const computed = computeFinalScore(report.detections || []);
    const finalScore = computed.final;

    el.execScore.textContent = finalScore.toFixed ? finalScore.toFixed(2) : finalScore;
    el.execScore.className = "score-value" + (finalScore >= 7 ? "" : finalScore >= 4 ? " med" : " low");

    const summaryText =
      (report.executive_summary && report.executive_summary.text) ||
      "No executive summary provided.";
    el.execSummaryText.textContent = summaryText;
  }

  // ── Render Editors tab (new) ────────────────────────────────
  function buildEditorAggregates() {
    const detections = report.detections || [];
    const map = new Map();

    detections.forEach((d) => {
      const key = d.editor_id || d.editor_name || "__unattributed__";
      if (!map.has(key)) {
        map.set(key, {
          editor_id: d.editor_id || null,
          editor_name: d.editor_name || "__unattributed__",
          detections: [],
          categories: new Set(),
        });
      }
      const entry = map.get(key);
      entry.detections.push(d);
      const names = d.main_category_names && d.main_category_names.length ? d.main_category_names : ["Uncategorized"];
      names.forEach((c) => entry.categories.add(c));
    });

    return [...map.values()]
      .map((e) => {
        const scores = e.detections.map((d) => Math.abs(d.score || 0));
        return {
          ...e,
          count: e.detections.length,
          maxScore: scores.length ? Math.max(...scores) : 0,
          categories: [...e.categories],
        };
      })
      .sort((a, b) => b.maxScore - a.maxScore || b.count - a.count);
  }

  function renderEditorsTab() {
    const editors = buildEditorAggregates();

    el.editorsTabCount.textContent = `${editors.length} Editor${editors.length !== 1 ? "s" : ""}`;

    if (!editors.length) {
      el.editorsTabGrid.innerHTML = "";
      el.editorsEmpty.style.display = "flex";
      return;
    }
    el.editorsEmpty.style.display = "none";

    el.editorsTabGrid.innerHTML = editors
      .map((e) => {
        const displayName = fmtEditorName(e.editor_name);
        const ip = isIpEditor(e.editor_name);
        const sevCls = severityClass(e.maxScore);
        const catsHtml = e.categories
          .slice(0, 3)
          .map((c) => `<span class="category-label">${escapeHtml(c)}</span>`)
          .join("");
        const href = `editor.html?report=${encodeURIComponent(reportId)}&editor=${encodeURIComponent(e.editor_id || e.editor_name)}`;

        return `
          <a class="report-editor-card" href="${href}">
            <div class="report-editor-card__avatar${ip ? " report-editor-card__avatar--ip" : ""}">
              ${escapeHtml(editorInitial(e.editor_name))}
            </div>
            <div class="report-editor-card__body">
              <span class="report-editor-card__name">${escapeHtml(displayName)}</span>
              <span class="report-editor-card__meta">
                <span class="score-pill score-pill--${sevCls === "high" ? "high" : sevCls === "medium" ? "medium" : "low"}">Max ${e.maxScore}</span>
                <span>${e.count} detection${e.count !== 1 ? "s" : ""}</span>
              </span>
              <span class="report-editor-card__cats">${catsHtml}</span>
            </div>
            <svg class="report-editor-card__chevron" width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 4L13 9L7 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
        `;
      })
      .join("");
  }

  // ── Render Insight tab ──────────────────────────────────────
  function renderInsight() {
    const text =
      (report.qualitative_insight && report.qualitative_insight.text) ||
      "No qualitative insights provided.";
    el.qualitativeText.textContent = text;
  }

  // ── Render Scoring tab ──────────────────────────────────────
  function renderScoring() {
    const detections = report.detections || [];
    const computed = computeFinalScore(detections);
    const finalScore = computed.final;
    const plainCls = scorePlainClass(finalScore);

    if (el.formulaPillText) {
      el.formulaPillText.textContent = "max + 0.25 × (hits − 1), capped at 10";
    }

    el.scoreVisual.innerHTML = `
      <div class="score-visual-row">
        <div class="score-plain-block">
          <span class="score-plain-num ${plainCls}">${finalScore.toFixed ? finalScore.toFixed(2) : finalScore}</span>
          <span class="score-plain-denom">/10</span>
        </div>
        <div class="calc-row">
          <div class="calc-step">
            <div class="step-icon step-icon--max">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L8.44 3.92L11.68 4.38L9.34 6.66L9.92 9.89L7 8.35L4.08 9.89L4.66 6.66L2.32 4.38L5.56 3.92L7 1Z" fill="currentColor"/></svg>
            </div>
            <div class="step-body">
              <span class="step-label">Highest hit score</span>
              <span class="step-val">${computed.max}</span>
            </div>
          </div>
          <span class="calc-op">+</span>
          <div class="calc-step">
            <div class="step-icon step-icon--add">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V12M2 7H12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </div>
            <div class="step-body">
              <span class="step-label">${computed.remaining} remaining × 0.25</span>
              <span class="step-val">+${computed.bonus}</span>
            </div>
          </div>
          <span class="calc-op">=</span>
          <div class="calc-step calc-step--result">
            <div class="step-icon step-icon--result">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L5.5 10.5L12 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="step-body">
              <span class="step-label">Final score (cap 10)</span>
              <span class="step-val step-val--final">${finalScore.toFixed ? finalScore.toFixed(2) : finalScore}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Top hit callout — show ALL detections tied for the highest score,
    // not just one, since multiple hits can share the same max score.
    if (detections.length) {
      const maxScore = computed.max;
      const topHits = detections.filter((d) => Math.abs(d.score || 0) === maxScore);
      el.topHitCallout.innerHTML = topHits
        .map(
          (top) => `
        <div class="top-hit-card">
          <div class="top-hit-header">
            <span class="top-hit-badge">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1L6.66 3.36L9.26 3.73L7.38 5.56L7.85 8.15L5.5 6.9L3.15 8.15L3.62 5.56L1.74 3.73L4.34 3.36L5.5 1Z" fill="currentColor"/></svg>
              Highest Scoring Hit
            </span>
            <span class="top-hit-score-pill">Score: ${top.score}</span>
            <span class="top-hit-cats">${(top.main_category_names || []).join(", ")}</span>
          </div>
          <blockquote class="top-hit-quote">
            <span class="qmark">"</span>${escapeHtml(top.text)}<span class="qmark">"</span>
          </blockquote>
          <div class="top-hit-method">
            <span class="method-name-sm">${escapeHtml(top.method_name || "")}</span>
          </div>
        </div>
      `
        )
        .join("");
    }

    // Category rows
    const catSummary = report.category_summary || {};
    const entries = Object.entries(catSummary).filter(([, v]) => (v.count || 0) > 0);
    const totalDetections = (report.summary || {}).total_detections || detections.length || 1;

    el.catRowsBody.innerHTML = entries
      .map(([catId, cat]) => {
        const pct = Math.round(((cat.count || 0) / totalDetections) * 1000) / 10;
        const sevCls =
          severityClass(cat.max_score) === "high"
            ? "sev-high"
            : severityClass(cat.max_score) === "medium"
            ? "sev-med"
            : "sev-low";
        return `
          <div class="cat-row ${sevCls}">
            <span class="cat-row-name"><span class="cat-row-dot"></span>${escapeHtml(cat.name)}</span>
            <span class="cat-row-count">${cat.count}</span>
            <span class="cat-row-score">${cat.max_score ?? 0}</span>
            <div class="cat-row-bar-wrap">
              <div class="cat-row-bar" style="width:${Math.min(pct, 100)}%"></div>
              <span class="cat-row-pct">${pct}%</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // ── Render Appendix tab ──────────────────────────────────────
  function getCatGroups(detections) {
    const groups = {};
    detections.forEach((d) => {
      const names = d.main_category_names && d.main_category_names.length ? d.main_category_names : ["Uncategorized"];
      names.forEach((name) => {
        if (!groups[name]) {
          const topScore = Math.max(
            ...detections
              .filter((x) => {
                const xNames = x.main_category_names && x.main_category_names.length ? x.main_category_names : ["Uncategorized"];
                return xNames.includes(name);
              })
              .map((x) => Math.abs(x.score || 0)),
            0
          );
          groups[name] = { name, count: 0, severity: severityClass(topScore) };
        }
        groups[name].count++;
      });
    });
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }

  function renderAppendix() {
    const detections = [...(report.detections || [])];

    const groups = getCatGroups(detections);
    el.catFilterBar.innerHTML = `
      <button class="cat-chip ${activeCatFilter === null ? "cat-chip--active" : ""}" data-cat="">
        <span class="chip-dot chip-dot--all"></span> All
        <span class="chip-count">${detections.length}</span>
      </button>
      ${groups
        .map(
          (g) => `
        <button class="cat-chip ${activeCatFilter === g.name ? "cat-chip--active" : ""}" data-cat="${escapeHtml(g.name)}">
          <span class="chip-dot chip-dot--${g.severity}"></span> ${escapeHtml(g.name)}
          <span class="chip-count">${g.count}</span>
        </button>
      `
        )
        .join("")}
    `;

    el.catFilterBar.querySelectorAll(".cat-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.dataset.cat;
        activeCatFilter = activeCatFilter === cat ? null : cat || null;
        renderAppendix();
      });
    });

    const filtered = activeCatFilter
      ? detections.filter((d) => {
          const names = d.main_category_names && d.main_category_names.length ? d.main_category_names : ["Uncategorized"];
          return names.includes(activeCatFilter);
        })
      : detections;

    el.hitsCount.textContent = `${filtered.length} / ${detections.length} Detections`;

    if (!filtered.length) {
      el.hitsGrid.innerHTML = "";
      el.hitsEmpty.style.display = "flex";
      return;
    }
    el.hitsEmpty.style.display = "none";

    el.hitsGrid.innerHTML = filtered
      .map((d) => {
        const sevCls =
          severityClass(d.score) === "high"
            ? "sev-high"
            : severityClass(d.score) === "medium"
            ? "sev-medium"
            : "sev-low";
        const catNames = d.main_category_names && d.main_category_names.length ? d.main_category_names : ["Uncategorized"];
        const catTags = catNames
          .map((c) => `<span class="category-label">${escapeHtml(c)}</span>`)
          .join("");
        const editorHref = `editor.html?report=${encodeURIComponent(reportId)}&editor=${encodeURIComponent(d.editor_id || d.editor_name || "")}`;

        return `
          <div class="appendix-item ${sevCls}">
            <div class="appendix-head">
              <div class="appendix-head-left">
                <span class="ref-id">${escapeHtml(d.id ? d.id.slice(0, 8) : "—")}</span>
                <span class="top-score-method"><strong>Score: ${d.score}</strong></span>
                <span class="category-label method-code">${escapeHtml(d.method_code || "")}</span>
                <a class="htag htag--ed" href="${editorHref}">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 6C7.65685 6 9 4.65685 9 3C9 1.34315 7.65685 0 6 0C4.34315 0 3 1.34315 3 3C3 4.65685 4.34315 6 6 6Z" fill="currentColor"/></svg>
                  ${escapeHtml(fmtEditorName(d.editor_name))}
                </a>
              </div>
              <div class="category-tags">${catTags}</div>
            </div>

            <p class="ref-text">${escapeHtml(d.text)}</p>

            ${
              d.reasoning
                ? `<div class="reasoning-box">
                    <div class="reasoning-header">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M7 5v3M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                      <strong>Reasoning</strong>
                    </div>
                    <p>${escapeHtml(d.reasoning)}</p>
                  </div>`
                : ""
            }

            <div class="rebuttal-box">
              <div class="rebuttal-header">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2V8L11 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/></svg>
                <strong>Rebuttal</strong>
              </div>
              <p>${escapeHtml(d.rebuttal || "No rebuttal available.")}</p>
              ${
                d.rebuttal_source_url
                  ? `<div class="source">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M6 8L10 4M10 4H7M10 4V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10 9V11C10 11.5523 9.55228 12 9 12H3C2.44772 12 2 11.5523 2 11V5C2 4.44772 2.44772 4 3 4H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                      <strong>Source:</strong>
                      <a href="${escapeHtml(d.rebuttal_source_url)}" target="_blank" rel="noopener noreferrer" class="source-link">${escapeHtml(d.rebuttal_source_title || d.rebuttal_source_url)}</a>
                    </div>`
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");
  }

  // ── Init ──────────────────────────────────────────────────────
  async function init() {
    reportId = getParam("report");
    if (!reportId) {
      el.loading.style.display = "none";
      el.error.style.display = "flex";
      el.errorText.textContent = "No report specified. Use ?report=<id>.";
      return;
    }

    try {
      const manifest = await fetchJson("reports/index.json");
      const entry = (manifest.reports || []).find((r) => r.id === reportId);
      if (!entry) throw new Error(`Report "${reportId}" not found in reports/index.json.`);

      report = await fetchJson(entry.file);

      el.loading.style.display = "none";
      el.content.style.display = "block";

      renderHero();
      renderSummary();
      renderEditorsTab();
      renderInsight();
      renderScoring();
      renderAppendix();
    } catch (err) {
      console.error(err);
      el.loading.style.display = "none";
      el.error.style.display = "flex";
      el.errorText.textContent = err.message || "Report not found.";
    }
  }

  init();
})();
