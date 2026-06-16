/* editor.js v4 — profile.vue style
   - NO Executive Summary, NO Qualitative Insight on this page
   - Phobia Analysis Breakdown (profile.vue cards)
   - Evidence section (single report card, links to report.html)
   - Handles BOTH old schema (hits, no taxonomy_breakdown) 
     and new schema (phobic_references, taxonomy_breakdown)
*/
(async function () {
  const params     = new URLSearchParams(window.location.search);
  const pageSlug   = params.get("page");
  const editorSlug = params.get("editor");
  const $          = id => document.getElementById(id);

  function showError(msg) {
    $("loading-state").style.display = "none";
    $("error-state").style.display   = "flex";
    const et = $("error-text"); if (et) et.textContent = msg;
  }

  if (!pageSlug || !editorSlug) { showError("No editor specified."); injectChrome(); return; }

  const errBack = $("error-back-link"); if (errBack) errBack.href = pageHref(pageSlug);
  const profBack = $("profile-back-link"); if (profBack) profBack.href = pageHref(pageSlug);

  let editor;
  try { editor = await fetchEditor(pageSlug, editorSlug); }
  catch (err) {
    console.error(err);
    showError(`Could not load profile for "${editorSlug}".`);
    injectChrome({ pageSlug });
    return;
  }

  injectChrome({ pageUrl: editor.page_url, pageSlug, pageTitle: editor.page_title, editorName: editor.editor });
  document.title = `${editor.editor} — Editor Profile · RSS Watch`;

  const profBackLabel = $("profile-back-label");
  if (profBackLabel) profBackLabel.textContent = `Return to ${(editor.page_title || pageSlug).replace(/_/g, " ")}`;

  // ── Normalise schema differences ─────────────────────────
  // Old schema: hits[], final_score at top level, no taxonomy_breakdown
  // New schema: phobic_references[], summary.final_score, taxonomy_breakdown{}
  const hits = editor.phobic_references || editor.hits || [];

  // Compute final_score live from refs (never trust stored 0)
  const scores     = hits.map(r => Number(r.score || 0)).filter(s => s > 0);
  const maxS       = scores.length ? Math.max(...scores) : 0;
  const finalScore = Math.min(maxS + Math.max(0, scores.length - 1) * 0.25, 10).toFixed(2);
  const scoreMax   = editor.score_max || 10;

  // Summary — merge old and new field names
  const summary = editor.summary || {};
  const strong  = summary.strong_phobic ?? summary.strong ?? hits.filter(h => Number(h.score) >= 7).length;
  const med     = summary.medium_phobic ?? summary.medium ?? hits.filter(h => Number(h.score) >= 4 && Number(h.score) <= 6).length;
  const weak    = summary.weak_phobic   ?? summary.weak   ?? hits.filter(h => Number(h.score) >= 1 && Number(h.score) <= 3).length;

  // ── Info card ─────────────────────────────────────────────
  $("editor-name").textContent = editor.editor;
  const av = $("info-avatar");
  if (editor.is_ip) av.classList.add("info-avatar--ip");
  av.innerHTML = editor.is_ip
    ? `<svg width="40" height="40" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M6 10H6.01M10 10H10.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
    : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" stroke="currentColor" stroke-width="1.8"/><path d="M3 22C3 17.5817 7.02944 14 12 14C16.9706 14 21 17.5817 21 22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

  const acc = editor.account || {};
  const pills = [];
  if (editor.is_ip) {
    pills.push({ l: "IP Editor", c: "info-pill--muted" });
  } else {
    if (acc.is_admin) pills.push({ l: "Administrator", c: "info-pill--green" });
    if (acc.is_bot)   pills.push({ l: "Bot", c: "" });
    (acc.user_groups || []).forEach(g => pills.push({ l: g, c: "info-pill--muted" }));
    if (!acc.is_admin && !acc.is_bot && !acc.user_groups?.length)
      pills.push({ l: "Registered editor", c: "info-pill--muted" });
  }
  $("info-pills").innerHTML = pills.map(p =>
    `<span class="info-pill ${p.c}">${escapeHtml(p.l)}</span>`
  ).join("");

  const infoRows = [];
  if (!editor.is_ip) {
    infoRows.push({ icon: ICONS.cal,    label: "Registered:",          value: acc.registration_date ? fmtDate(acc.registration_date) : "Unknown" });
    infoRows.push({ icon: ICONS.shield, label: "Total Wikipedia edits:", value: acc.total_wiki_edits != null ? acc.total_wiki_edits.toLocaleString() : "Unknown" });
  }
  infoRows.push({ icon: ICONS.doc, label: "Page:", value: (editor.page_title || "—").replace(/_/g, " ") });
  if (editor.page_url)
    infoRows.push({ icon: ICONS.globe, label: "Article:", vHtml: `<a href="${escapeAttr(editor.page_url)}" target="_blank" rel="noopener noreferrer">View on Wikipedia ${ICONS.extLink}</a>` });

  $("info-items").innerHTML = infoRows.map(r =>
    `<div class="info-row">${r.icon}<span class="info-label">${escapeHtml(r.label)}</span><span class="info-value">${r.vHtml || escapeHtml(r.value)}</span></div>`
  ).join("");

  // ── Stats card ────────────────────────────────────────────
  const act = editor.page_activity || {};

  $("profile-stats").innerHTML = [
    { cls: "danger",   icon: ICONS.alert,   label: "Editorial Score",     val: `${finalScore}<span class="stat-max">/${scoreMax}</span>` },
    { cls: "warning",  icon: ICONS.warning, label: "Total Hits",          val: hits.length },
    { cls: "info",     icon: ICONS.doc,     label: "Page Revisions",      val: act.total_revisions ?? 0 },
    { cls: "success",  icon: ICONS.shield,  label: "Strong / Med / Weak", val: `${strong} / ${med} / ${weak}`, sm: true },
  ].map(b =>
    `<div class="stat-box ${b.cls}">
      <div class="stat-icon">${b.icon}</div>
      <div class="stat-content">
        <span class="stat-label">${escapeHtml(b.label)}</span>
        <strong class="stat-number${b.sm ? " stat-number--small" : ""}">${b.val}</strong>
      </div>
    </div>`
  ).join("");

  // Report link button
  const rl = $("report-link");
  if (rl && pageSlug) { rl.href = reportHref(pageSlug); rl.style.display = "inline-flex"; }

  // ── Phobia Analysis Breakdown ──────────────────────────────
  // Build breakdown from taxonomy_breakdown (new schema) OR
  // compute it live from hit.categories / hit.method_code (old schema)
  let breakdown = editor.taxonomy_breakdown || null;

  if ((!breakdown || Object.keys(breakdown).length === 0) && hits.length) {
    // Build synthetic breakdown from hits
    const buckets = {};
    for (const h of hits) {
      // Determine category IDs - new schema has categories[], old schema has method_code
      let catIds = h.categories || [];
      if (!catIds.length && h.main_category_names?.length) {
        // Can't recover numeric IDs, skip breakdown build
      }
      // For old schema hits with no categories, group by method_code prefix
      if (!catIds.length) {
        const mc  = (h.method_code || "").charAt(0).toUpperCase() || "?";
        const key = "mc_" + mc;
        if (!buckets[key]) buckets[key] = {
          name:       h.method_name || `Method ${mc}`,
          count:      0, avg_score: 0, max_score: 0, _scores: []
        };
        buckets[key].count++;
        buckets[key].max_score = Math.max(buckets[key].max_score, Number(h.score || 0));
        buckets[key]._scores.push(Number(h.score || 0));
      } else {
        for (const cid of catIds) {
          const key = String(cid);
          if (!buckets[key]) {
            const name = (h.main_category_names || [])[catIds.indexOf(cid)] || `Category ${cid}`;
            buckets[key] = { name, count: 0, avg_score: 0, max_score: 0, _scores: [] };
          }
          buckets[key].count++;
          buckets[key].max_score = Math.max(buckets[key].max_score, Number(h.score || 0));
          buckets[key]._scores.push(Number(h.score || 0));
        }
      }
    }
    for (const v of Object.values(buckets)) {
      v.avg_score = v._scores.length ? +(v._scores.reduce((a,b) => a+b, 0) / v._scores.length).toFixed(2) : 0;
      delete v._scores;
    }
    if (Object.keys(buckets).length) breakdown = buckets;
  }

  const bkdSection = $("breakdown-section");
  if (breakdown && hits.length > 0 && bkdSection) {
    // Attach examples
    const enriched = {};
    for (const [k, v] of Object.entries(breakdown)) {
      enriched[k] = { ...v, _examples: [] };
    }
    for (const h of hits) {
      const catIds = h.categories || [];
      const mc     = "mc_" + (h.method_code || "").charAt(0).toUpperCase();
      const keys   = catIds.length ? catIds.map(String) : [mc];
      for (const key of keys) {
        if (enriched[key] && enriched[key]._examples.length < 2) {
          const txt = (h.text || h.sentence || "").slice(0, 120);
          if (txt) enriched[key]._examples.push(txt);
        }
      }
    }
    const active = Object.values(enriched).filter(v => v.count > 0);
    if (active.length) {
      bkdSection.style.display = "";
      const bc  = $("breakdown-count");  if (bc) bc.textContent  = `${active.length} Categories`;
      const bc2 = $("breakdown-count2"); if (bc2) bc2.textContent = `${hits.length} unique detections across ${active.length} categories`;
      $("breakdown-grid").innerHTML = renderBreakdownGrid(enriched, hits.length);
    }
  }

  // ── Evidence section ──────────────────────────────────────
  // Links to report.html which shows the full article-level report
  const evSection = $("evidence-section");
  if (evSection && hits.length) {
    const topHit    = [...hits].sort((a, b) => Number(b.score) - Number(a.score))[0];
    const topScore  = topHit ? Number(topHit.score) : 0;
    const scoreCls  = topScore >= 7 ? "score-tag--high" : topScore >= 4 ? "" : "score-tag--low";

    // Category pills — collect unique method/category labels across all hits
    const catSet = new Set();
    for (const h of hits) {
      if (h.main_category_names?.length) h.main_category_names.slice(0, 2).forEach(n => catSet.add(n));
      else if (h.method_name) catSet.add(h.method_name.split(":")[0].trim());
    }
    const catPills = [...catSet].slice(0, 4).map(n =>
      `<span class="ev-cat-pill">${escapeHtml(n)}</span>`
    ).join("");

    $("ev-report-title").textContent = (editor.page_title || "").replace(/_/g, " ") + " — Wikipedia Article";
    $("ev-report-score").textContent = `Score: ${finalScore}`;
    $("ev-report-score").className   = `score-tag ${scoreCls}`;
    $("ev-report-hits").textContent  = `${hits.length} instance${hits.length === 1 ? "" : "s"}`;
    $("ev-report-cats").innerHTML    = catPills;

    const viewBtn = $("ev-report-view");
    if (viewBtn) viewBtn.href = reportHref(pageSlug);

    evSection.style.display = "";
  }

  // ── Flagged Contributions appendix ───────────────────────
  // Profile.vue style: category filter chips, then hit cards
  $("hits-count").textContent = `${hits.length} / ${hits.length} References`;
  const hitsEmpty = $("hits-empty");
  const catBar    = $("cat-filter-bar");
  const hitsGrid  = $("hits-grid");

  if (!hits.length) {
    if (hitsEmpty) hitsEmpty.style.display = "flex";
    if (catBar)    catBar.style.display    = "none";
  } else {
    // Group by category (works for both old and new schema)
    const groups = {};
    for (const h of hits) {
      const k = (h.main_category_names?.[0]) || h.method_code || "Uncategorized";
      if (!groups[k]) groups[k] = { id: k, name: k, count: 0, maxScore: 0 };
      groups[k].count++;
      groups[k].maxScore = Math.max(groups[k].maxScore, Number(h.score || 0));
    }
    const gList = Object.values(groups).sort((a, b) => b.count - a.count);
    let activeFilter = null;

    function renderBar() {
      if (!catBar) return;
      catBar.innerHTML =
        `<button class="cat-chip${activeFilter === null ? " cat-chip--active" : ""}" data-cat="">` +
          `<span class="chip-dot chip-dot--all"></span>All<span class="chip-count">${hits.length}</span>` +
        `</button>` +
        gList.map(g => {
          const sev = severityClass(g.maxScore, 10);
          return `<button class="cat-chip${activeFilter === g.id ? " cat-chip--active" : ""}" data-cat="${escapeAttr(g.id)}">` +
            `<span class="chip-dot chip-dot--${sev}"></span>${escapeHtml(g.name)}<span class="chip-count">${g.count}</span>` +
          `</button>`;
        }).join("");

      catBar.querySelectorAll(".cat-chip").forEach(btn =>
        btn.addEventListener("click", () => {
          const c = btn.getAttribute("data-cat");
          activeFilter = c === "" ? null : (activeFilter === c ? null : c);
          renderBar();
          renderHits();
        })
      );
    }

    function renderHits() {
      const f = activeFilter
        ? hits.filter(h => ((h.main_category_names?.[0]) || h.method_code || "Uncategorized") === activeFilter)
        : hits;
      if ($("hits-count")) $("hits-count").textContent = `${f.length} / ${hits.length} References`;
      if (hitsGrid) hitsGrid.innerHTML = f.map(h => renderHitCard(h, { showId: true, showEditor: false })).join("");
    }

    renderBar();
    renderHits();
  }

  $("loading-state").style.display = "none";
  $("profile-content").style.display = "";
})();
