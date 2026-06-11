/* ═══════════════════════════════════════════════════════════════
   index.js — Overview page (Wikipedia page summary)
   ═══════════════════════════════════════════════════════════════ */

(async function () {
  const els = {
    loading:        document.getElementById("loading-state"),
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

  let index;
  try {
    index = await fetchIndex();
  } catch (err) {
    console.error(err);
    els.loading.innerHTML = `
      <p>Could not load report data.</p>
      <p style="font-size:0.85rem;">Make sure <code>data/index.json</code> exists (run <code>scripts/sync_reports.py</code>).</p>
    `;
    return;
  }

  injectChrome({ pageUrl: index.page_url });

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
    els.editorsGrid.innerHTML = editors.map(renderEditorCard).join("");
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
        <a href="editor.html?editor=${encodeURIComponent(hit.editor_slug)}" class="hit-editor-link">
          ${ICONS.user}
          ${escapeHtml(hit.editor)}
          ${ICONS.chevronRight}
        </a>
        ${renderHitCard(hit, { showId: false })}
      </div>
    `).join("");
  }

  els.loading.style.display = "none";

  /* ── Renderers ─────────────────────────────────────────────── */

  function renderEditorCard(editor) {
    const scoreCls = severityClass(editor.final_score, editor.score_max);
    const tagLabel = editorTagLabel(editor);
    const isMuted  = editor.is_ip || (!editor.account?.is_admin && !editor.account?.is_bot && editor.account?.total_wiki_edits == null);

    const topHitHtml = editor.top_hit
      ? `<p class="editor-top-hit"><span class="quote-mark">&ldquo;</span>${escapeHtml(editor.top_hit.text)}<span class="quote-mark">&rdquo;</span></p>`
      : `<p class="editor-top-hit editor-top-hit--empty">No flagged content detected for this editor.</p>`;

    const act = editor.page_activity || {};

    return `
      <a href="editor.html?editor=${encodeURIComponent(editor.editor_slug)}" class="editor-card">
        <div class="editor-card__top">
          <div class="editor-avatar ${editor.is_ip ? "editor-avatar--ip" : ""}">
            ${editor.is_ip ? ICONS.ip : ICONS.user}
          </div>
          <div class="editor-name-block">
            <h3 class="editor-name">${escapeHtml(editor.editor)}</h3>
            <span class="editor-tag ${isMuted ? "editor-tag--muted" : ""}">${escapeHtml(tagLabel)}</span>
          </div>
          <div class="editor-score ${scoreCls}">
            <span class="editor-score__num">${editor.final_score}</span>
            <span class="editor-score__max">/${editor.score_max}</span>
          </div>
        </div>

        ${topHitHtml}

        <div class="editor-card__stats">
          <div class="ec-stat">
            <span class="ec-stat__num">${editor.total_hits}</span>
            <span class="ec-stat__label">Hit${editor.total_hits === 1 ? "" : "s"}</span>
          </div>
          <div class="ec-stat">
            <span class="ec-stat__num">${act.total_revisions ?? "—"}</span>
            <span class="ec-stat__label">Revisions</span>
          </div>
          <div class="ec-stat">
            <span class="ec-stat__num">${fmtSignedNum(act.total_bytes_added)}</span>
            <span class="ec-stat__label">Bytes Added</span>
          </div>
          <div class="ec-stat">
            <span class="ec-stat__num">${act.total_bytes_removed != null ? "\u2212" + fmtNum(act.total_bytes_removed) : "—"}</span>
            <span class="ec-stat__label">Bytes Removed</span>
          </div>
        </div>

        <div class="editor-card__footer">
          <span class="view-profile">
            View editor profile
            ${ICONS.chevronRight}
          </span>
        </div>
      </a>
    `;
  }
})();
