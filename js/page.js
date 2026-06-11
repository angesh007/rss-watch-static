/* ═══════════════════════════════════════════════════════════════
   page.js — Per-page editor overview
   Reads ?page=<page_slug> from the URL and renders
   data/pages/<page_slug>/index.json
   ═══════════════════════════════════════════════════════════════ */

(async function () {
  const els = {
    loading:        document.getElementById("loading-state"),
    error:          document.getElementById("error-state"),
    errorText:      document.getElementById("error-text"),
    content:        document.getElementById("page-content"),

    pageTitle:      document.getElementById("page-title"),
    pageUrlLink:    document.getElementById("page-url-link"),
    pageUrlText:    document.getElementById("page-url-text"),
    statEditors:    document.getElementById("stat-editors"),
    statHits:       document.getElementById("stat-hits"),
    statAvgScore:   document.getElementById("stat-avg-score"),
    statSynced:     document.getElementById("stat-synced"),
    editorsSection: document.getElementById("editors-section"),
    editorsGrid:    document.getElementById("editors-grid"),
    editorsCount:   document.getElementById("editors-count"),
    emptyState:     document.getElementById("empty-state"),
    topHitsSection: document.getElementById("top-hits-section"),
    topHitsGrid:    document.getElementById("top-hits-grid"),
    topHitsCount:   document.getElementById("top-hits-count"),
  };

  // ── Resolve page slug from query string ────────────────────────
  const params = new URLSearchParams(window.location.search);
  const pageSlug = params.get("page");

  if (!pageSlug) {
    showError("No page specified.");
    injectChrome();
    return;
  }

  let index;
  try {
    index = await fetchPageIndex(pageSlug);
  } catch (err) {
    console.error(err);
    showError(`Could not load report data for "${pageSlug}".`);
    injectChrome({ pageSlug });
    return;
  }

  injectChrome({ pageUrl: index.page_url, pageSlug, pageTitle: index.page_title });

  // ── Page header ────────────────────────────────────────────────
  const niceTitle = (index.page_title || "Unknown Page").replace(/_/g, " ");
  els.pageTitle.textContent = niceTitle;
  document.title = `${niceTitle} — Editor Analysis · RSS Watch`;

  if (index.page_url) {
    els.pageUrlLink.href = index.page_url;
    els.pageUrlText.textContent = index.page_url;
    els.pageUrlLink.style.display = "inline-flex";
  }

  // ── Aggregate stats ────────────────────────────────────────────
  els.statEditors.textContent = index.total_editors ?? 0;
  els.statHits.textContent    = index.total_hits ?? 0;
  els.statAvgScore.textContent = index.avg_score ?? 0;
  els.statSynced.textContent  = fmtDate(index.generated_at);

  // ── Editors grid ───────────────────────────────────────────────
  const editors = index.editors || [];

  if (editors.length) {
    els.editorsSection.style.display = "";
    els.editorsCount.textContent = `${editors.length} Editor${editors.length === 1 ? "" : "s"}`;
    els.editorsGrid.innerHTML = editors.map(ed => renderEditorCard(ed, pageSlug)).join("");
  } else {
    els.emptyState.style.display = "flex";
  }

  // ── Top hits ───────────────────────────────────────────────────
  const topHits = index.top_hits || [];
  if (topHits.length) {
    els.topHitsSection.style.display = "";
    els.topHitsCount.textContent = `Top ${topHits.length}`;
    els.topHitsGrid.innerHTML = topHits.map(hit => `
      <div class="hit-wrap">
        <a href="${editorHref(pageSlug, hit.editor_slug)}" class="hit-editor-link">
          ${ICONS.user}
          ${escapeHtml(hit.editor)}
          ${ICONS.chevronRight}
        </a>
        ${renderHitCard(hit, { showId: false })}
      </div>
    `).join("");
  }

  els.loading.style.display = "none";
  els.content.style.display = "";

  /* ── Helpers ─────────────────────────────────────────────────── */

  function showError(msg) {
    els.loading.style.display = "none";
    els.error.style.display = "flex";
    els.errorText.textContent = msg;
  }
})();
