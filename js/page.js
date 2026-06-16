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

  // Page score — SAME formula and SAME scale as report.html's
  // "Scoring Breakdown": pool every hit across the whole article
  // (not a top-10 editor average, not rescaled to /100).
  //   page_score = min(highest_hit + 0.25 × remaining_hits, 10)
  let pageScore    = index.page_score;
  let pageScoreMax = index.page_score_max ?? 10;
  if (pageScore == null) {
    const allHits = (index.top_hits || []).map(h => Number(h.score || 0)).filter(s => s > 0);
    if (allHits.length) {
      const maxHit   = Math.max(...allHits);
      const addl     = Math.max(0, allHits.length - 1);
      pageScore = Math.round(Math.min(maxHit + addl * 0.25, 10) * 100) / 100;
    } else {
      pageScore = 0;
    }
  }
  $("stat-editors").textContent   = index.total_editors ?? 0;
  $("stat-hits").textContent      = index.total_hits ?? 0;
  $("stat-page-score").textContent = pageScore;
  const pageScoreDenom = $("stat-page-score-max");
  if (pageScoreDenom) pageScoreDenom.textContent = `/${pageScoreMax}`;
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
