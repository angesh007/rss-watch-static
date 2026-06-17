/* ═══════════════════════════════════════════════════════════════
   RSS Watch — editor.js
   Renders an editor's profile, scoped to one report (the JSON
   schema attributes detections to an editor_name/editor_id within
   a single article report, not a cross-report account).
   ═══════════════════════════════════════════════════════════════ */

(function () {
  const {
    escapeHtml,
    getParam,
    fetchJson,
    severityClass,
    fmtEditorName,
    editorInitial,
    isIpEditor,
    truncate,
  } = window.RSSWatch;

  const el = {
    loading: document.getElementById("loading-state"),
    error: document.getElementById("error-state"),
    errorText: document.getElementById("error-text"),
    errorBackLink: document.getElementById("error-back-link"),
    content: document.getElementById("profile-content"),
    backLink: document.getElementById("profile-back-link"),

    infoAvatar: document.getElementById("info-avatar"),
    editorName: document.getElementById("editor-name"),
    infoPills: document.getElementById("info-pills"),
    infoItems: document.getElementById("info-items"),

    profileStats: document.getElementById("profile-stats"),
    reportLink: document.getElementById("report-link"),

    breakdownSection: document.getElementById("breakdown-section"),
    breakdownGrid: document.getElementById("breakdown-grid"),
    breakdownCount: document.getElementById("breakdown-count"),
    breakdownCount2: document.getElementById("breakdown-count2"),

    evidenceSection: document.getElementById("evidence-section"),
    evReportTitle: document.getElementById("ev-report-title"),
    evReportScore: document.getElementById("ev-report-score"),
    evReportHits: document.getElementById("ev-report-hits"),
    evReportView: document.getElementById("ev-report-view"),
    evReportCats: document.getElementById("ev-report-cats"),
  };

  let report = null;
  let reportId = null;
  let editorKey = null;
  let editorDetections = [];

  function computeFinalScore(detections) {
    if (!detections.length) return 0;
    const scores = detections.map((d) => Math.abs(d.score || 0));
    const max = Math.max(...scores);
    const remaining = detections.length - 1;
    const bonus = Math.round(remaining * 0.25 * 100) / 100;
    return Math.min(Math.round((max + bonus) * 100) / 100, 10);
  }

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
          groups[name] = { name, count: 0, maxScore: topScore, severity: severityClass(topScore) };
        }
        groups[name].count++;
      });
    });
    return Object.values(groups).sort((a, b) => b.maxScore - a.maxScore || b.count - a.count);
  }

  function renderInfoCard(displayName, ip, rawName) {
    el.editorName.textContent = displayName;
    el.infoAvatar.textContent = editorInitial(rawName);
    el.infoAvatar.className = "info-avatar" + (ip ? " info-avatar--ip" : "");

    const pills = [];
    if (ip) pills.push(`<span class="info-pill info-pill--muted">IP Editor</span>`);
    if (rawName === "__unattributed__") pills.push(`<span class="info-pill">Unattributed</span>`);
    if (!ip && rawName !== "__unattributed__") pills.push(`<span class="info-pill info-pill--green">Registered Editor</span>`);
    el.infoPills.innerHTML = pills.join("");

    const article = report.article || {};
    el.infoItems.innerHTML = `
      <div class="info-row">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4" stroke="currentColor" stroke-width="1.5"/></svg>
        <span class="info-label">Article:</span>
        <span class="info-value">${escapeHtml(article.resolved_title || "Unknown")}</span>
      </div>
      <div class="info-row">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5C5.51 1.5 3.5 3.51 3.5 6C3.5 9.25 8 14.5 8 14.5C8 14.5 12.5 9.25 12.5 6C12.5 3.51 10.49 1.5 8 1.5ZM8 7.75C7.03 7.75 6.25 6.97 6.25 6C6.25 5.03 7.03 4.25 8 4.25C8.97 4.25 9.75 5.03 9.75 6C9.75 6.97 8.97 7.75 8 7.75Z" fill="currentColor" opacity="0.5"/></svg>
        <span class="info-label">Source:</span>
        <span class="info-value"><a href="${escapeHtml(article.source_url || "#")}" target="_blank" rel="noopener noreferrer">View on Wikipedia</a></span>
      </div>
    `;
  }

  function renderStatsCard() {
    const finalScore = computeFinalScore(editorDetections);
    const maxScore = editorDetections.length
      ? Math.max(...editorDetections.map((d) => Math.abs(d.score || 0)))
      : 0;

    el.profileStats.innerHTML = `
      <div class="stat-box danger">
        <div class="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>
        <div class="stat-content">
          <span class="stat-label">Highest Score</span>
          <strong class="stat-number">${maxScore}<span class="stat-max">/10</span></strong>
        </div>
      </div>
      <div class="stat-box info">
        <div class="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>
        <div class="stat-content">
          <span class="stat-label">Flagged Detections</span>
          <strong class="stat-number">${editorDetections.length}</strong>
        </div>
      </div>
      <div class="stat-box warning">
        <div class="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 8V12M12 16H12.01M3 12L12 3L21 12L12 21L3 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="stat-content">
          <span class="stat-label">Composite Score</span>
          <strong class="stat-number">${finalScore.toFixed ? finalScore.toFixed(2) : finalScore}<span class="stat-max">/10</span></strong>
        </div>
      </div>
    `;

    el.reportLink.href = `report.html?report=${encodeURIComponent(reportId)}`;
  }

  function renderBreakdown() {
    const groups = getCatGroups(editorDetections);
    if (!groups.length) {
      el.breakdownSection.style.display = "none";
      return;
    }
    el.breakdownSection.style.display = "block";
    el.breakdownCount.textContent = `${groups.length} Categor${groups.length !== 1 ? "ies" : "y"}`;
    el.breakdownCount2.textContent = `${editorDetections.length} detection${editorDetections.length !== 1 ? "s" : ""} across ${groups.length} categor${groups.length !== 1 ? "ies" : "y"}`;

    el.breakdownGrid.innerHTML = groups
      .map((g) => {
        const share = Math.round((g.count / editorDetections.length) * 100);
        const example = editorDetections.find((d) => {
          const names = d.main_category_names && d.main_category_names.length ? d.main_category_names : ["Uncategorized"];
          return names.includes(g.name);
        });
        return `
          <div class="breakdown-card">
            <div class="card-body">
              <div class="card-title-row">
                <h3 class="card-category">${escapeHtml(g.name)}</h3>
                <span class="severity-badge ${g.severity}">${g.maxScore}/10</span>
              </div>
              <div class="card-stats-row">
                <span class="offense-count">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5L8.09 4.71L11.65 5.24L9.07 7.75L9.67 11.3L6.5 9.63L3.33 11.3L3.93 7.75L1.35 5.24L4.91 4.71L6.5 1.5Z" fill="currentColor" opacity="0.5"/></svg>
                  ${g.count} of ${editorDetections.length} refs
                </span>
                <span class="avg-score-label">Highest score: ${g.maxScore}</span>
              </div>
              <div class="progress-bar-wrap">
                <div class="progress-bar">
                  <div class="progress-fill ${g.severity}" style="width:${share}%"></div>
                </div>
                <div class="progress-labels">
                  <span class="progress-pct ${g.severity}">${share}% of this editor's refs</span>
                  <span class="progress-track-label">${g.count} hit${g.count !== 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>
            ${
              example
                ? `<div class="bkd-examples"><p class="bkd-ex-text">"${escapeHtml(truncate(example.text, 160))}"</p></div>`
                : ""
            }
          </div>
        `;
      })
      .join("");
  }

  function renderEvidence() {
    const article = report.article || {};
    const finalScore = computeFinalScore(editorDetections);

    el.evidenceSection.style.display = "block";
    el.evReportTitle.textContent = article.resolved_title || "Untitled Article";
    el.evReportScore.textContent = `Score: ${finalScore.toFixed ? finalScore.toFixed(2) : finalScore}`;
    el.evReportHits.textContent = `${editorDetections.length} detection${editorDetections.length !== 1 ? "s" : ""}`;
    el.evReportView.href = `report.html?report=${encodeURIComponent(reportId)}`;

    const groups = getCatGroups(editorDetections);
    el.evReportCats.innerHTML = groups
      .slice(0, 6)
      .map((g) => `<span class="ev-cat-pill">${escapeHtml(g.name)}</span>`)
      .join("");
  }

  async function init() {
    reportId = getParam("report");
    editorKey = getParam("editor");

    el.backLink.href = reportId ? `report.html?report=${encodeURIComponent(reportId)}` : "index.html";
    el.errorBackLink.href = reportId ? `report.html?report=${encodeURIComponent(reportId)}` : "index.html";

    if (!reportId || !editorKey) {
      el.loading.style.display = "none";
      el.error.style.display = "flex";
      el.errorText.textContent = "Missing report or editor reference. Use ?report=<id>&editor=<name>.";
      return;
    }

    try {
      const manifest = await fetchJson("reports/index.json");
      const entry = (manifest.reports || []).find((r) => r.id === reportId);
      if (!entry) throw new Error(`Report "${reportId}" not found in reports/index.json.`);

      report = await fetchJson(entry.file);

      editorDetections = (report.detections || []).filter((d) => {
        const key = d.editor_id != null ? String(d.editor_id) : d.editor_name;
        return key === editorKey || d.editor_name === editorKey;
      });

      if (!editorDetections.length) {
        throw new Error(`No detections found for editor "${editorKey}" in this report.`);
      }

      const rawName = editorDetections[0].editor_name || editorKey;
      const displayName = fmtEditorName(rawName);
      const ip = isIpEditor(rawName);

      el.loading.style.display = "none";
      el.content.style.display = "block";

      renderInfoCard(displayName, ip, rawName);
      renderStatsCard();
      renderBreakdown();
      renderEvidence();
    } catch (err) {
      console.error(err);
      el.loading.style.display = "none";
      el.error.style.display = "flex";
      el.errorText.textContent = err.message || "Editor not found.";
    }
  }

  init();
})();
