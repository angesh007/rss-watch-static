/* ═══════════════════════════════════════════════════════════════
   editor.js — Editor profile page
   Reads ?editor=<slug> from the URL and renders the normalized
   editor JSON from data/editors/<slug>.json
   ═══════════════════════════════════════════════════════════════ */

   (async function () {
    const els = {
      loading:        document.getElementById("loading-state"),
      error:          document.getElementById("error-state"),
      errorText:      document.getElementById("error-text"),
      content:        document.getElementById("profile-content"),
  
      infoAvatar:     document.getElementById("info-avatar"),
      editorName:     document.getElementById("editor-name"),
      infoPills:      document.getElementById("info-pills"),
      infoItems:      document.getElementById("info-items"),
      profileStats:   document.getElementById("profile-stats"),
  
      execScoreValue: document.getElementById("exec-score-value"),
      execSummaryText:document.getElementById("exec-summary-text"),
      qualitativeText:document.getElementById("qualitative-text"),
  
      timelineSection:document.getElementById("timeline-section"),
      timelineCount:  document.getElementById("timeline-count"),
      timelineList:   document.getElementById("timeline-list"),
  
      hitsCount:      document.getElementById("hits-count"),
      catFilterBar:   document.getElementById("cat-filter-bar"),
      hitsGrid:       document.getElementById("hits-grid"),
      hitsEmpty:      document.getElementById("hits-empty"),
    };
  
    // ── Resolve page + editor slugs from query string ──────────────
    const params = new URLSearchParams(window.location.search);
    const pageSlug = params.get("page");
    const editorSlug = params.get("editor");
  
    if (!pageSlug || !editorSlug) {
      showError("No editor specified.");
      injectChrome();
      return;
    }
  
    // Back links go to this editor's page overview.
    const backLink = document.getElementById("error-back-link");
    if (backLink) backLink.href = pageHref(pageSlug);
    const profileBackLink = document.getElementById("profile-back-link");
    if (profileBackLink) profileBackLink.href = pageHref(pageSlug);
  
    let editor;
    try {
      editor = await fetchEditor(pageSlug, editorSlug);
    } catch (err) {
      console.error(err);
      showError(`Could not load profile for "${editorSlug}".`);
      injectChrome({ pageSlug });
      return;
    }
  
    injectChrome({ pageUrl: editor.page_url, pageSlug, pageTitle: editor.page_title });
  
    // Update "Return to ..." label now that we know the page title.
    const profileBackLabel = document.getElementById("profile-back-label");
    if (profileBackLabel) {
      profileBackLabel.textContent = `Return to ${(editor.page_title || pageSlug).replace(/_/g, " ")}`;
    }
  
    // ── Page title ──────────────────────────────────────────────────
    document.title = `${editor.editor} — Editor Profile · RSS Watch`;
  
    // ── Info card ────────────────────────────────────────────────────
    els.editorName.textContent = editor.editor;
    if (editor.is_ip) els.infoAvatar.classList.add("info-avatar--ip");
    els.infoAvatar.innerHTML = editor.is_ip
      ? `<svg width="40" height="40" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M6 10H6.01M10 10H10.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
      : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" stroke="currentColor" stroke-width="1.8"/><path d="M3 22C3 17.5817 7.02944 14 12 14C16.9706 14 21 17.5817 21 22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  
    // Pills
    const acc = editor.account || {};
    const pills = [];
    if (editor.is_ip) {
      pills.push({ label: "IP Editor", cls: "info-pill--muted" });
    } else {
      if (acc.is_admin) pills.push({ label: "Administrator", cls: "info-pill--green" });
      if (acc.is_bot) pills.push({ label: "Bot", cls: "" });
      if (acc.user_groups?.length) {
        acc.user_groups.forEach(g => pills.push({ label: g, cls: "info-pill--muted" }));
      }
      if (!acc.is_admin && !acc.is_bot && !acc.user_groups?.length) {
        pills.push({ label: "Registered editor", cls: "info-pill--muted" });
      }
    }
    els.infoPills.innerHTML = pills.map(p =>
      `<span class="info-pill ${p.cls}">${escapeHtml(p.label)}</span>`
    ).join("");
  
    // Info rows
    const infoRows = [];
    if (!editor.is_ip) {
      infoRows.push({
        icon: ICONS.calendarSmall,
        label: "Registered:",
        value: acc.registration_date ? fmtDate(acc.registration_date) : "Unknown",
      });
      infoRows.push({
        icon: ICONS.shield,
        label: "Total Wikipedia edits:",
        value: acc.total_wiki_edits != null ? acc.total_wiki_edits.toLocaleString() : "Unknown",
      });
    }
    infoRows.push({
      icon: ICONS.doc,
      label: "Page:",
      value: (editor.page_title || "—").replace(/_/g, " "),
    });
    if (editor.page_url) {
      infoRows.push({
        icon: ICONS.globe,
        label: "Article:",
        valueHtml: `<a href="${escapeAttr(editor.page_url)}" target="_blank" rel="noopener noreferrer">View on Wikipedia ${ICONS.externalLink}</a>`,
      });
    }
  
    els.infoItems.innerHTML = infoRows.map(row => `
      <div class="info-row">
        ${row.icon}
        <span class="info-label">${escapeHtml(row.label)}</span>
        <span class="info-value">${row.valueHtml || escapeHtml(row.value)}</span>
      </div>
    `).join("");
  
    // ── Stats card ──────────────────────────────────────────────────
    const act = editor.page_activity || {};
    const summary = editor.summary || {};
  
    const statBoxes = [
      {
        cls: "danger", icon: ICONS.alert,
        label: "Editorial Score", value: `${editor.final_score}<span class="stat-max">/${editor.score_max}</span>`,
      },
      {
        cls: "warning", icon: ICONS.warning,
        label: "Total Hits", value: editor.hits.length,
      },
      {
        cls: "info", icon: ICONS.doc,
        label: "Page Revisions", value: act.total_revisions ?? 0,
      },
    ];
  
    // Score-bucket breakdown if present (new schema)
    if (summary.strong != null || summary.medium != null || summary.weak != null) {
      statBoxes.push({
        cls: "success", icon: ICONS.shield,
        label: "Strong / Medium / Weak",
        value: `${summary.strong ?? 0} / ${summary.medium ?? 0} / ${summary.weak ?? 0}`,
        small: true,
      });
    } else if (summary.dominant_pattern) {
      statBoxes.push({
        cls: "success", icon: ICONS.shield,
        label: "Dominant Pattern",
        value: summary.dominant_pattern,
        small: true,
      });
    }
  
    els.profileStats.innerHTML = statBoxes.map(b => `
      <div class="stat-box ${b.cls}">
        <div class="stat-icon">${b.icon}</div>
        <div class="stat-content">
          <span class="stat-label">${escapeHtml(b.label)}</span>
          <strong class="stat-number ${b.small ? "stat-number--small" : ""}">${b.value}</strong>
        </div>
      </div>
    `).join("");
  
    // ── Executive summary ────────────────────────────────────────────
    const scoreCls = severityClass(editor.final_score, editor.score_max);
    els.execScoreValue.textContent = editor.final_score;
    if (scoreCls === "medium") els.execScoreValue.classList.add("med");
    else if (scoreCls === "low") els.execScoreValue.classList.add("low");
    els.execSummaryText.textContent = editor.exec_summary || "No executive summary available.";
  
    // ── Qualitative insight ───────────────────────────────────────────
    els.qualitativeText.textContent = editor.qualitative_insight || "No qualitative insights provided.";
  
    // ── Revision timeline ──────────────────────────────────────────────
    // page_activity doesn't always carry full revision list in normalized
    // output; fall back gracefully if absent.
    const revisions = act.revisions || [];
    if (revisions.length) {
      els.timelineSection.style.display = "";
      els.timelineCount.textContent = `${revisions.length} Revision${revisions.length === 1 ? "" : "s"}`;
      els.timelineList.innerHTML = revisions.map((rev, idx) => {
        const delta = rev.size_delta ?? 0;
        const deltaCls = delta > 0 ? "positive" : delta < 0 ? "negative" : "zero";
        const isLast = idx === revisions.length - 1;
        return `
          <div class="timeline-item">
            <div class="timeline-dot-col">
              <div class="timeline-dot ${rev.is_minor ? "minor" : ""}"></div>
              ${!isLast ? '<div class="timeline-line"></div>' : ""}
            </div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="timeline-date">${escapeHtml(rev.date || rev.timestamp || "—")}</span>
                <span class="timeline-delta ${deltaCls}">${fmtSignedNum(delta)} bytes</span>
                ${rev.is_minor ? `<span class="info-pill info-pill--muted" style="font-size:0.65rem;">minor</span>` : ""}
              </div>
              <span class="timeline-comment ${rev.comment ? "" : "empty"}">${rev.comment ? `&ldquo;${escapeHtml(rev.comment)}&rdquo;` : "(no edit summary)"}</span>
            </div>
          </div>
        `;
      }).join("");
    } else if (act.unique_edit_dates?.length) {
      // Fallback: render unique edit dates as a simple timeline if full
      // revision objects aren't present in the normalized output.
      els.timelineSection.style.display = "";
      els.timelineCount.textContent = `${act.unique_edit_dates.length} Edit Day${act.unique_edit_dates.length === 1 ? "" : "s"}`;
      els.timelineList.innerHTML = act.unique_edit_dates.map((date, idx) => `
        <div class="timeline-item">
          <div class="timeline-dot-col">
            <div class="timeline-dot"></div>
            ${idx < act.unique_edit_dates.length - 1 ? '<div class="timeline-line"></div>' : ""}
          </div>
          <div class="timeline-content">
            <div class="timeline-header">
              <span class="timeline-date">${escapeHtml(date)}</span>
            </div>
          </div>
        </div>
      `).join("");
    }
  
    // ── Hits / appendix with category filtering ─────────────────────
    const hits = editor.hits || [];
  
    els.hitsCount.textContent = `${hits.length} / ${hits.length} References`;
  
    if (!hits.length) {
      els.hitsEmpty.style.display = "flex";
      els.catFilterBar.style.display = "none";
    } else {
      // Build category groups from method_code
      const groups = {};
      for (const h of hits) {
        const code = h.method_code || "Uncategorized";
        if (!groups[code]) {
          groups[code] = {
            id: code,
            name: h.method_name ? `${code} — ${h.method_name}` : code,
            count: 0,
            maxScore: 0,
            scoreMax: h.score_max,
          };
        }
        groups[code].count++;
        groups[code].maxScore = Math.max(groups[code].maxScore, h.score);
      }
      const groupList = Object.values(groups).sort((a, b) => b.count - a.count);
  
      let activeFilter = null;
  
      function renderFilterBar() {
        const allChip = `
          <button class="cat-chip ${activeFilter === null ? "cat-chip--active" : ""}" data-cat="">
            <span class="chip-dot chip-dot--all"></span>
            All
            <span class="chip-count">${hits.length}</span>
          </button>
        `;
        const groupChips = groupList.map(g => {
          const sevCls = severityClass(g.maxScore, g.scoreMax);
          return `
            <button class="cat-chip ${activeFilter === g.id ? "cat-chip--active" : ""}" data-cat="${escapeAttr(g.id)}">
              <span class="chip-dot chip-dot--${sevCls}"></span>
              ${escapeHtml(g.name)}
              <span class="chip-count">${g.count}</span>
            </button>
          `;
        }).join("");
  
        els.catFilterBar.innerHTML = allChip + groupChips;
  
        els.catFilterBar.querySelectorAll(".cat-chip").forEach(btn => {
          btn.addEventListener("click", () => {
            const cat = btn.getAttribute("data-cat");
            if (cat === "") {
              activeFilter = null;
            } else {
              activeFilter = (activeFilter === cat) ? null : cat;
            }
            renderFilterBar();
            renderHits();
          });
        });
      }
  
      function renderHits() {
        const filtered = activeFilter
          ? hits.filter(h => (h.method_code || "Uncategorized") === activeFilter)
          : hits;
  
        els.hitsCount.textContent = `${filtered.length} / ${hits.length} References`;
        els.hitsGrid.innerHTML = filtered.map(h => renderHitCard(h, { showId: true })).join("");
      }
  
      renderFilterBar();
      renderHits();
    }
  
    // ── Show content ──────────────────────────────────────────────────
    els.loading.style.display = "none";
    els.content.style.display = "";
  
    /* ── Helpers ───────────────────────────────────────────────────── */
  
    function showError(msg) {
      els.loading.style.display = "none";
      els.error.style.display = "flex";
      els.errorText.textContent = msg;
    }
  })();