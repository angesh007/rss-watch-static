/* ═══════════════════════════════════════════════════════════════
   RSS Watch — index.js
   Populates the home page: overall stats, analysis table, and
   report cards grid, sourced from reports/index.json.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  const { escapeHtml, fetchJson, formatDate, severityClass } = window.RSSWatch;

  const el = {
    loading: document.getElementById("loading-state"),
    error: document.getElementById("error-state"),
    errorText: document.getElementById("error-text"),
    empty: document.getElementById("empty-state"),
    tableSection: document.getElementById("table-section"),
    tableBody: document.getElementById("table-body"),
    tableCount: document.getElementById("table-count"),
    reportsSection: document.getElementById("reports-section"),
    reportsGrid: document.getElementById("reports-grid"),
    reportsCount: document.getElementById("reports-count"),
    statReports: document.getElementById("stat-reports"),
    statEditors: document.getElementById("stat-editors"),
    statHits: document.getElementById("stat-hits"),
    statSevere: document.getElementById("stat-severe"),
  };

  function scoreClass(score) {
    const s = Number(score) || 0;
    if (s >= 7) return "high";
    if (s >= 4) return "medium";
    return "low";
  }

  function renderStats(reports) {
    const totalReports = reports.length;
    const editorSet = new Set();
    let totalHits = 0;
    let totalSevere = 0;

    reports.forEach((r) => {
      (r.editors || []).forEach((e) => editorSet.add(e));
      totalHits += r.total_detections || 0;
      totalSevere += r.severe_count || 0;
    });

    el.statReports.textContent = totalReports;
    el.statEditors.textContent = editorSet.size;
    el.statHits.textContent = totalHits;
    el.statSevere.textContent = totalSevere;
  }

  function renderTable(reports) {
    const sorted = [...reports].sort(
      (a, b) => (b.final_score || 0) - (a.final_score || 0)
    );

    el.tableBody.innerHTML = sorted
      .map((r) => {
        const cls = scoreClass(r.final_score);
        return `
          <tr onclick="window.location.href='report.html?report=${encodeURIComponent(r.id)}'">
            <td>
              <div class="dt-title-cell">
                <span class="dt-title">${escapeHtml(r.title)}</span>
                <span class="dt-url">${escapeHtml(r.source_url || "")}</span>
              </div>
            </td>
            <td>${r.total_detections ?? "—"}</td>
            <td>${r.severe_count ?? 0}</td>
            <td>${r.editor_count ?? (r.editors || []).length}</td>
            <td>${formatDate(r.latest_rev_timestamp)}</td>
            <td><span class="dt-score ${cls}">${(r.final_score ?? 0).toFixed ? r.final_score.toFixed(2) : r.final_score}</span></td>
            <td>
              <a class="dt-link" href="report.html?report=${encodeURIComponent(r.id)}" onclick="event.stopPropagation()">
                View
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M5 11L9 7L5 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </a>
            </td>
          </tr>
        `;
      })
      .join("");

    el.tableCount.textContent = `${reports.length} Report${reports.length !== 1 ? "s" : ""}`;
  }

  function renderCards(reports) {
    el.reportsGrid.innerHTML = reports
      .map((r) => {
        const cls = scoreClass(r.final_score);
        return `
          <a class="page-card" href="report.html?report=${encodeURIComponent(r.id)}">
            <div class="page-card__top">
              <div class="page-card__icon">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M8 11H16M8 14H13M19 19H5C3.895 19 3 18.105 3 17V5C3 3.895 3.895 3 5 3H12.59C13.12 3 13.63 3.21 14.01 3.59L19.41 8.99C19.79 9.37 20 9.88 20 10.41V17C20 18.105 19.105 19 19 19Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </div>
              <div class="page-card__title-block">
                <span class="page-card__title">${escapeHtml(r.title)}</span>
                <span class="page-card__url">${escapeHtml((r.source_url || "").replace(/^https?:\/\//, ""))}</span>
              </div>
              <div class="editor-score ${cls}">
                <span class="editor-score__num">${(r.final_score ?? 0).toFixed ? r.final_score.toFixed(1) : r.final_score}</span>
                <span class="editor-score__max">/10</span>
              </div>
            </div>
            <div class="page-card__stats">
              <div class="ec-stat">
                <span class="ec-stat__num">${r.total_detections ?? 0}</span>
                <span class="ec-stat__label">Detections</span>
              </div>
              <div class="ec-stat">
                <span class="ec-stat__num">${r.severe_count ?? 0}</span>
                <span class="ec-stat__label">Severe</span>
              </div>
              <div class="ec-stat">
                <span class="ec-stat__num">${r.editor_count ?? (r.editors || []).length}</span>
                <span class="ec-stat__label">Editors</span>
              </div>
              <div class="ec-stat">
                <span class="ec-stat__num ec-stat__num--text">${formatDate(r.latest_rev_timestamp)}</span>
                <span class="ec-stat__label">Last Edit</span>
              </div>
            </div>
            <div class="page-card__footer">
              <span class="view-profile">
                View Full Report
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M5 11L9 7L5 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
            </div>
          </a>
        `;
      })
      .join("");

    el.reportsCount.textContent = `${reports.length} Report${reports.length !== 1 ? "s" : ""}`;
  }

  async function init() {
    try {
      const manifest = await fetchJson("reports/index.json");
      const reports = manifest.reports || [];

      el.loading.style.display = "none";

      if (!reports.length) {
        el.empty.style.display = "flex";
        return;
      }

      renderStats(reports);
      renderTable(reports);
      renderCards(reports);

      el.tableSection.style.display = "block";
      el.reportsSection.style.display = "block";
    } catch (err) {
      console.error(err);
      el.loading.style.display = "none";
      el.error.style.display = "flex";
      el.errorText.textContent = err.message || "Could not load reports/index.json.";
    }
  }

  init();
})();
