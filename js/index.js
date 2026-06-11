/* ═══════════════════════════════════════════════════════════════
   index.js — Landing page: list of all analyzed Wikipedia pages
   ═══════════════════════════════════════════════════════════════ */

(async function () {
  const els = {
    loading:     document.getElementById("loading-state"),
    statPages:   document.getElementById("stat-pages"),
    statEditors: document.getElementById("stat-editors"),
    statHits:    document.getElementById("stat-hits"),
    statSynced:  document.getElementById("stat-synced"),
    pagesSection:document.getElementById("pages-section"),
    pagesGrid:   document.getElementById("pages-grid"),
    pagesCount:  document.getElementById("pages-count"),
    emptyState:  document.getElementById("empty-state"),
  };

  injectChrome();

  let data;
  try {
    data = await fetchPagesList();
  } catch (err) {
    console.error(err);
    els.loading.innerHTML = `
      <p>Could not load report data.</p>
      <p style="font-size:0.85rem;">Make sure <code>data/pages.json</code> exists (run <code>scripts/sync_reports.py</code>).</p>
    `;
    return;
  }

  const pages = data.pages || [];

  // ── Aggregate stats ────────────────────────────────────────────
  els.statPages.textContent   = data.total_pages ?? pages.length;
  els.statEditors.textContent = data.total_editors ?? 0;
  els.statHits.textContent    = data.total_hits ?? 0;
  els.statSynced.textContent  = fmtDate(data.generated_at);

  // ── Pages grid ─────────────────────────────────────────────────
  if (pages.length) {
    els.pagesSection.style.display = "";
    els.pagesCount.textContent = `${pages.length} Page${pages.length === 1 ? "" : "s"}`;
    els.pagesGrid.innerHTML = pages.map(renderPageCard).join("");

    // Single-page convenience: if there's exactly one analyzed page,
    // jump straight to its overview.
    if (pages.length === 1) {
      window.location.replace(pageHref(pages[0].page_slug));
      return;
    }
  } else {
    els.emptyState.style.display = "flex";
  }

  els.loading.style.display = "none";
})();
