/* page.js v4 — 3-col editors, view-more, page breakdown, all-hits section */
(async function () {
  const params   = new URLSearchParams(window.location.search);
  const pageSlug = params.get("page");
  const $        = id => document.getElementById(id);

  function showError(msg) {
    $("loading-state").style.display = "none";
    $("error-state").style.display   = "flex";
    const et = $("error-text"); if (et) et.textContent = msg;
  }

  if (!pageSlug) { showError("No page specified."); injectChrome(); return; }

  let index;
  try { index = await fetchPageIndex(pageSlug); }
  catch (err) {
    console.error(err);
    showError(`Could not load data for "${pageSlug}".`);
    injectChrome({ pageSlug });
    return;
  }

  injectChrome({ pageUrl: index.page_url, pageSlug, pageTitle: index.page_title });
  document.title = `${(index.page_title || pageSlug).replace(/_/g, " ")} — Editor Analysis · RSS Watch`;

  $("page-title").textContent = (index.page_title || "Unknown Page").replace(/_/g, " ");

  const urlLink = $("page-url-link");
  if (urlLink && index.page_url) {
    urlLink.href = index.page_url;
    $("page-url-text").textContent = index.page_url;
    urlLink.style.display = "inline-flex";
  }

  const rpBtn = $("article-report-btn");
  if (rpBtn) { rpBtn.href = reportHref(pageSlug); rpBtn.style.display = "inline-flex"; }

  // Page score — /100
  // Compute client-side if not in index (top-10 editors × hits factor)
  let pageScore = index.page_score;
  if (pageScore == null) {
    const eds     = index.editors || [];
    const top10   = [...eds].sort((a, b) => b.final_score - a.final_score).slice(0, 10);
    const totalH  = index.total_hits || 0;
    if (top10.length) {
      const avg        = top10.reduce((s, e) => s + e.final_score, 0) / top10.length;
      const hitsFactor = Math.min(1.0, totalH / Math.max(top10.length * 3, 1));
      pageScore = Math.round((avg / 8) * 100 * (0.7 + 0.3 * hitsFactor) * 10) / 10;
    } else {
      pageScore = 0;
    }
  }
  $("stat-editors").textContent   = index.total_editors ?? 0;
  $("stat-hits").textContent      = index.total_hits ?? 0;
  $("stat-page-score").textContent = pageScore;
  $("stat-synced").textContent    = fmtDate(index.generated_at);

  // ── Phobia Breakdown ──────────────────────────────────────
  const pageBkdSection = $("page-breakdown-section");
  if (pageBkdSection && index.page_breakdown) {
    const active = Object.values(index.page_breakdown).filter(v => v.count > 0);
    if (active.length && index.total_hits > 0) {
      pageBkdSection.style.display = "";
      const pbc  = $("page-breakdown-count");    if (pbc) pbc.textContent   = `${active.length} Categories`;
      const pbsub = $("page-breakdown-subtitle"); if (pbsub) pbsub.textContent = `${index.total_hits} detections across ${active.length} phobia categories`;
      const pbg  = $("page-breakdown-grid");     if (pbg) pbg.innerHTML = renderBreakdownGrid(index.page_breakdown, index.total_hits);
    }
  }

  // ── Editors grid: 3-col, show 3, view-more ────────────────
  const editors  = index.editors || [];
  const edSection = $("editors-section");

  if (editors.length) {
    edSection.style.display = "";
    const ec = $("editors-count"); if (ec) ec.textContent = `${editors.length} Editor${editors.length === 1 ? "" : "s"}`;
    const grid    = $("editors-grid");
    const INITIAL = 3;

    function renderEditors(n) {
      if (grid) grid.innerHTML = editors.slice(0, n).map(ed => renderEditorCard(ed, pageSlug)).join("");
    }

    renderEditors(Math.min(INITIAL, editors.length));

    if (editors.length > INITIAL) {
      const vmWrap = $("view-more-wrap");
      const vmBtn  = $("view-more-btn");
      if (vmWrap) vmWrap.style.display = "flex";
      let showing = INITIAL;
      if (vmBtn) {
        vmBtn.textContent = `View all ${editors.length} editors`;
        vmBtn.addEventListener("click", () => {
          showing = showing >= editors.length ? INITIAL : editors.length;
          renderEditors(showing);
          vmBtn.textContent = showing >= editors.length
            ? "Show fewer"
            : `View all ${editors.length} editors`;
        });
      }
    }
  } else {
    const es = $("empty-state"); if (es) es.style.display = "flex";
  }

  // ── All Hits Across Editors ──────────────────────────────
  // (renamed from "Highest-Scoring Hits" — shows ALL top_hits with editor attribution)
  const allHitsSection = $("all-hits-section");
  const topHits        = index.top_hits || [];

  if (allHitsSection && topHits.length) {
    allHitsSection.style.display = "";
    const ahc = $("all-hits-count"); if (ahc) ahc.textContent = `Top ${topHits.length}`;
    const ahg = $("all-hits-grid");
    if (ahg) {
      ahg.innerHTML = topHits.map(hit => {
        const editorLink = hit.editor_slug
          ? `<a href="${editorHref(pageSlug, hit.editor_slug)}" class="hit-editor-link">
               ${ICONS.user} ${escapeHtml(hit.editor || hit.editor_slug)} ${ICONS.chevron}
             </a>`
          : "";
        return `<div class="hit-wrap">${editorLink}${renderHitCard(hit, { showId: false, showEditor: true })}</div>`;
      }).join("");
    }
  }

  $("loading-state").style.display = "none";
  $("page-content").style.display  = "";
})();
