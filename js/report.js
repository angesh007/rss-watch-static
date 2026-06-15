/* report.js v4
   Loads page-level report from multiple fallback sources:
   1. editor_reports/<page>__article_report.json   (wr.py Mode B)
   2. editor_reports/<page>__article_findings.json (raw wiki_analyze)
   3. data/pages/<page>/index.json top_hits         (always available, no wr.py needed)
*/
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

  // ── Try to load report data ───────────────────────────────
  let report    = null;
  let pageIndex = null;

  // Always load page index (needed for meta + fallback hits)
  try { pageIndex = await fetchPageIndex(pageSlug); } catch (_) {}

  // Try dedicated report files first
  const reportCandidates = [
    `editor_reports/${encodeURIComponent(pageSlug)}__article_report.json`,
    `editor_reports/${encodeURIComponent(pageSlug)}__article_findings.json`,
  ];

  for (const url of reportCandidates) {
    try {
      report = await fetchJSON(url);
      break;
    } catch (_) {}
  }

  // Fallback: try first editor's report file
  if (!report && pageIndex?.editors?.length) {
    for (const ed of pageIndex.editors.slice(0, 3)) {
      try {
        report = await fetchJSON(`editor_reports/${encodeURIComponent(ed.editor_key)}__report.json`);
        break;
      } catch (_) {}
    }
  }

  // Final fallback: build synthetic report from page index top_hits
  if (!report && pageIndex) {
    const allHits = pageIndex.top_hits || [];
    const scores  = allHits.map(h => Number(h.score || 0)).filter(s => s > 0);
    const strong  = scores.filter(s => s >= 7).length;
    const med     = scores.filter(s => s >= 4 && s <= 6).length;
    const weak    = scores.filter(s => s >= 1 && s <= 3).length;

    report = {
      page_title         : pageIndex.page_title,
      page_url           : pageIndex.page_url,
      generated_at       : pageIndex.generated_at,
      branches_processed : pageIndex.total_editors,
      detections         : allHits,
      phobic_references  : allHits,
      summary: {
        total_detections : allHits.length,
        strong_phobic    : strong,
        medium_phobic    : med,
        weak_phobic      : weak,
      },
      taxonomy_breakdown : pageIndex.page_breakdown || {},
      categories         : {},
      _synthetic         : true,
    };
  }

  if (!report) {
    showError(`Could not load article report for "${pageSlug}".`);
    injectChrome({ pageSlug });
    return;
  }

  // ── Setup ─────────────────────────────────────────────────
  const pageTitle = report.page_title || report.meta?.page_title || pageSlug;
  const pageUrl   = report.page_url   || report.meta?.page_url   || "";

  injectChrome({ pageUrl, pageSlug, pageTitle, reportPage: true });
  document.title = `${pageTitle.replace(/_/g, " ")} — Article Report · RSS Watch`;

  $("report-title").textContent = pageTitle.replace(/_/g, " ") + " — Article Analysis Report";

  const ru = $("report-url-link");
  if (ru && pageUrl) { ru.href = pageUrl; $("report-url-text").textContent = pageUrl; ru.style.display = "inline-flex"; }
  if ($("generated-at"))  $("generated-at").textContent  = fmtDate(report.generated_at);
  if ($("branch-count"))  $("branch-count").textContent  = report._synthetic
    ? `${report.branches_processed} editors`
    : (report.branches_processed ?? "—");

  // Detections (support both phobic_references and detections field names)
  const detections = report.phobic_references || report.detections || [];
  const summary    = report.summary || {};
  const breakdown  = report.taxonomy_breakdown || pageIndex?.page_breakdown || {};

  const strong = summary.strong_phobic || 0;
  const med    = summary.medium_phobic || 0;
  const weak   = summary.weak_phobic   || 0;
  const total  = summary.total_detections || detections.length;

  // ── Exec summary ──────────────────────────────────────────
  const execEl = $("exec-summary-text");
  if (execEl) {
    execEl.textContent = report.executive_summary?.text ||
      (total > 0
        ? `This ${report._synthetic ? "page" : "article"} analysis yielded ${total} phobic detection${total === 1 ? "" : "s"} — ${strong} strong (score 7–8), ${med} medium (4–6), and ${weak} weak (1–3) across ${pageIndex?.total_editors ?? "multiple"} editors.`
        : `No phobic content detected in this article.`);
  }

  // ── Scoring visual ────────────────────────────────────────
  if (total > 0) {
    const sv = $("score-visual");
    if (sv) sv.innerHTML = renderScoringBreakdown(summary, detections);
  }

  // ── Taxonomy breakdown ────────────────────────────────────
  if (total > 0) {
    // Enrich breakdown with examples from detections
    const enriched = {};
    for (const [k, v] of Object.entries(breakdown)) {
      enriched[k] = { ...v, _examples: [] };
    }
    for (const d of detections) {
      for (const cid of (d.categories || [])) {
        const key = String(cid);
        if (enriched[key] && enriched[key]._examples.length < 2) {
          const txt = (d.text || d.sentence || "").slice(0, 120);
          if (txt) enriched[key]._examples.push(txt);
        }
      }
    }

    const active = Object.values(breakdown).filter(v => v.count > 0);
    const bkdS   = $("breakdown-section");
    if (bkdS && active.length) {
      bkdS.style.display = "";
      if ($("breakdown-count")) $("breakdown-count").textContent = `${active.length} Categories`;
      if ($("breakdown-grid"))  $("breakdown-grid").innerHTML = renderBreakdownGrid(enriched, total);
    }

    // Category rows table
    const cr = $("cat-rows");
    if (cr) {
      const rows = Object.entries(breakdown)
        .filter(([, v]) => v.count > 0)
        .sort(([, a], [, b]) => b.count - a.count);

      cr.innerHTML = `<div class="cat-rows-head"><span>Category</span><span>Hits</span><span>Max</span><span>Share</span></div>`
        + rows.map(([, cat]) => {
          const pct = Math.round((cat.count / total) * 100);
          const sev = cat.max_score >= 7 ? "sev-high" : cat.max_score >= 4 ? "sev-med" : "sev-low";
          return `<div class="cat-row ${sev}">
            <span class="cat-row-name"><span class="cat-row-dot"></span>${escapeHtml(cat.name)}</span>
            <span class="cat-row-count">${cat.count}</span>
            <span class="cat-row-score">${cat.max_score}/8</span>
            <div class="cat-row-bar-wrap"><div class="cat-row-bar" style="width:${Math.min(pct, 100)}%"></div><span class="cat-row-pct">${pct}%</span></div>
          </div>`;
        }).join("");
    }
  }

  // ── All detections across editors ─────────────────────────
  const hitsCount  = $("hits-count");
  const hitsEmpty  = $("hits-empty");
  const catBar     = $("cat-filter-bar");
  const hitsGrid   = $("hits-grid");

  if (hitsCount) hitsCount.textContent = `${detections.length} / ${detections.length} Detections`;

  if (!detections.length) {
    if (hitsEmpty) hitsEmpty.style.display = "flex";
    if (catBar)    catBar.style.display    = "none";
  } else {
    // Build section groups
    const groups = {};
    for (const d of detections) {
      const k = d.section_title || (d.editor ? `Editor: ${d.editor}` : "Unknown Section");
      if (!groups[k]) groups[k] = { id: k, name: k, count: 0, maxScore: 0 };
      groups[k].count++;
      groups[k].maxScore = Math.max(groups[k].maxScore, Number(d.score || 0));
    }
    const gList = Object.values(groups).sort((a, b) => b.count - a.count);

    let af = null;

    function renderBar() {
      if (!catBar) return;
      catBar.innerHTML =
        `<span class="filter-group-label">Filter:</span>` +
        `<button class="cat-chip${af === null ? " cat-chip--active" : ""}" data-f="">` +
          `<span class="chip-dot chip-dot--all"></span>All` +
          `<span class="chip-count">${detections.length}</span>` +
        `</button>` +
        gList.map(g => {
          const sev = severityClass(g.maxScore, 8);
          return `<button class="cat-chip${af === g.id ? " cat-chip--active" : ""}" data-f="${escapeAttr(g.id)}">` +
            `<span class="chip-dot chip-dot--${sev}"></span>${escapeHtml(g.name)}` +
            `<span class="chip-count">${g.count}</span>` +
          `</button>`;
        }).join("");

      catBar.querySelectorAll(".cat-chip").forEach(btn =>
        btn.addEventListener("click", () => {
          const f = btn.getAttribute("data-f");
          af = f === "" ? null : (af === f ? null : f);
          renderBar();
          renderDets();
        })
      );
    }

    function renderDets() {
      const f = af
        ? detections.filter(d => {
            const k = d.section_title || (d.editor ? `Editor: ${d.editor}` : "Unknown Section");
            return k === af;
          })
        : detections;
      if (hitsCount) hitsCount.textContent = `${f.length} / ${detections.length} Detections`;
      if (hitsGrid)  hitsGrid.innerHTML    = f.map(d => renderHitCard(d, { showId: true, showEditor: true })).join("");
    }

    renderBar();
    renderDets();
  }

  $("loading-state").style.display = "none";
  $("report-content").style.display = "";
})();
