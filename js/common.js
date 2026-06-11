/* ═══════════════════════════════════════════════════════════════
   common.js
   Shared utilities used by index.js and editor.js:
     - injectChrome(): renders navbar + footer into #app-navbar / #app-footer
     - fmtNum(), fmtDate(): formatting helpers
     - escapeHtml(): XSS-safe text interpolation
     - renderHitCard(hit, opts): returns HTML string for one hit/reference
     - severityClass(score, max): returns 'high' | 'medium' | 'low'
   ═══════════════════════════════════════════════════════════════ */

   const DATA_BASE = "data";

   /* ── Fetch helpers ─────────────────────────────────────────────── */
   
   async function fetchJSON(path) {
     const res = await fetch(path, { cache: "no-store" });
     if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
     return res.json();
   }
   
   /** All wiki pages that have been analyzed (data/pages.json) */
   async function fetchPagesList() {
     return fetchJSON(`${DATA_BASE}/pages.json`);
   }
   
   /** Per-page summary + editor list (data/pages/<page_slug>/index.json) */
   async function fetchPageIndex(pageSlug) {
     return fetchJSON(`${DATA_BASE}/pages/${encodeURIComponent(pageSlug)}/index.json`);
   }
   
   /** One normalized editor file (data/editors/<page_slug>__<editor_slug>.json) */
   async function fetchEditor(pageSlug, editorSlug) {
     const key = `${pageSlug}__${editorSlug}`;
     return fetchJSON(`${DATA_BASE}/editors/${encodeURIComponent(key)}.json`);
   }
   
   /** Build the URL for a page's overview */
   function pageHref(pageSlug) {
     return `page.html?page=${encodeURIComponent(pageSlug)}`;
   }
   
   /** Build the URL for an editor's profile, scoped to its page */
   function editorHref(pageSlug, editorSlug) {
     return `editor.html?page=${encodeURIComponent(pageSlug)}&editor=${encodeURIComponent(editorSlug)}`;
   }
   
   /* ── Navbar / Footer ───────────────────────────────────────────── */
   
   const STAR_ICON = `
     <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
       <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/>
     </svg>`;
   
   /**
    * Injects the shared navbar and footer.
    * @param {object} opts
    * @param {string} [opts.pageUrl]   - source Wikipedia article URL, shown as a nav link if present
    * @param {string} [opts.pageSlug]  - current page_slug, shows an "All Pages" link back to index.html
    * @param {string} [opts.pageTitle] - current page title, shown as a breadcrumb link to page.html
    */
   function injectChrome(opts = {}) {
     const navbar = document.getElementById("app-navbar");
     const footer = document.getElementById("app-footer");
   
     if (navbar) {
       const links = [];
   
       if (opts.pageSlug) {
         links.push(`<a href="index.html">All Pages</a>`);
         links.push(`<a href="${pageHref(opts.pageSlug)}" class="active">${escapeHtml((opts.pageTitle || opts.pageSlug).replace(/_/g, " "))}</a>`);
       } else {
         links.push(`<a href="index.html" class="active">All Pages</a>`);
       }
   
       if (opts.pageUrl) {
         links.push(`<a href="${escapeAttr(opts.pageUrl)}" target="_blank" rel="noopener noreferrer">Source Article</a>`);
       }
   
       navbar.innerHTML = `
         <div class="container nav-inner">
           <a href="index.html" class="logo">
             ${STAR_ICON}
             <span>RSS Watch</span>
           </a>
           <nav class="nav-links">
             ${links.join("\n")}
           </nav>
         </div>
         <div class="nav-accent"></div>
       `;
     }
   
     if (footer) {
       footer.innerHTML = `
         <div class="container footer-inner">
           <p>&copy; 2024&ndash;2026 RSS Watch &middot; Editor Contribution Analysis &middot; Infinity Foundation Initiative.</p>
         </div>
       `;
     }
   }
   
   /* ── Formatting helpers ───────────────────────────────────────── */
   
   function fmtNum(n) {
     if (n === null || n === undefined) return "—";
     const v = Number(n);
     if (Number.isNaN(v)) return "—";
     if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
     if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
     return String(v);
   }
   
   function fmtSignedNum(n) {
     if (n === null || n === undefined) return "—";
     const v = Number(n);
     if (Number.isNaN(v)) return "—";
     const sign = v > 0 ? "+" : v < 0 ? "\u2212" : "";
     return sign + fmtNum(Math.abs(v));
   }
   
   function fmtDate(str) {
     if (!str) return "—";
     try {
       const d = new Date(str);
       if (Number.isNaN(d.getTime())) return str;
       return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
     } catch {
       return str;
     }
   }
   
   function escapeHtml(str) {
     if (str === null || str === undefined) return "";
     return String(str)
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
   }
   
   function escapeAttr(str) {
     return escapeHtml(str);
   }
   
   function isHttpLink(str) {
     return typeof str === "string" && /^https?:\/\//i.test(str);
   }
   
   /**
    * severityClass — bucket a score into high/medium/low based on its
    * fraction of score_max.
    */
   function severityClass(score, maxVal) {
     const ratio = maxVal ? Math.abs(score) / maxVal : 0;
     if (ratio >= 0.7) return "high";
     if (ratio >= 0.4) return "medium";
     return "low";
   }
   
   /* ── SVG icon snippets (inline, reused across renderers) ─────── */
   
   const ICONS = {
     user: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" stroke="currentColor" stroke-width="1.8"/><path d="M3 22C3 17.5817 7.02944 14 12 14C16.9706 14 21 17.5817 21 22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
     ip: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M6 10H6.01M10 10H10.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
     chevronRight: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 11L9 7L5 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
     externalLink: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 10L10 2M10 2H5M10 2V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
     back: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
     star: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L8.44 3.92L11.68 4.38L9.34 6.66L9.92 9.89L7 8.35L4.08 9.89L4.66 6.66L2.32 4.38L5.56 3.92L7 1Z" fill="currentColor"/></svg>`,
     warning: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 8V12M12 16H12.01M3 12L12 3L21 12L12 21L3 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
     alert: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
     calendar: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 9H21M8 2V6M16 2V6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
     doc: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
     link: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 8L10 4M10 4H7M10 4V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10 9V11C10 11.5523 9.55228 12 9 12H3C2.44772 12 2 11.5523 2 11V5C2 4.44772 2.44772 4 3 4H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
     rebuttal: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2V8L11 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/></svg>`,
     reasoning: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M7 5v3M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
     clock: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4 1.5V3.5M9 1.5V3.5M1.5 5.5H11.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
     calendarSmall: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 8C9.65685 8 11 6.65685 11 5C11 3.34315 9.65685 2 8 2C6.34315 2 5 3.34315 5 5C5 6.65685 6.34315 8 8 8Z" stroke="currentColor" stroke-width="1.5"/><path d="M13 14C13 11.7909 10.7614 10 8 10C5.23858 10 3 11.7909 3 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
     globe: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z" stroke="currentColor" stroke-width="1.5"/><path d="M2 8H14M8 2C9.10457 4.68629 9.10457 11.3137 8 14C6.89543 11.3137 6.89543 4.68629 8 2Z" stroke="currentColor" stroke-width="1.5"/></svg>`,
     shield: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L13.5 3.5V7.5C13.5 11 11 13.5 8 14.5C5 13.5 2.5 11 2.5 7.5V3.5L8 1.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
   };
   
   /* ── Hit / reference card renderer ───────────────────────────── */
   
   /**
    * renderHitCard — returns an HTML string for one normalized hit object:
    *   { id, text, source, score, score_max, method_code, method_name,
    *     revision_dates, edit_comment, reasoning, rebuttal, rebuttal_source,
    *     red_flag, slur }
    *
    * @param {object} hit
    * @param {object} [opts]
    * @param {boolean} [opts.showId=true]
    */
   function renderHitCard(hit, opts = {}) {
     const showId = opts.showId !== false;
   
     const sourceTag = hit.source
       ? `<span class="source-tag ${hit.source === "removed" ? "source-tag--removed" : "source-tag--added"}">
            ${hit.source === "removed" ? "Removed from article" : "Added to article"}
          </span>`
       : "";
   
     const idTag = showId && hit.id
       ? `<span class="ref-id">#${escapeHtml(hit.id)}</span>`
       : "";
   
     const categoryTags = `
       ${hit.method_code ? `<span class="category-label method-code">${escapeHtml(hit.method_code)}</span>` : ""}
       ${hit.method_name ? `<span class="category-label">${escapeHtml(hit.method_name)}</span>` : ""}
       ${hit.red_flag ? `<span class="category-label flag flag--red">Red Flag</span>` : ""}
       ${hit.slur ? `<span class="category-label flag flag--slur">Slur</span>` : ""}
     `;
   
     const revisionMeta = (hit.revision_dates?.length || hit.edit_comment)
       ? `<div class="revision-meta">
            ${hit.revision_dates?.length ? `
              <span class="rev-date">
                ${ICONS.clock}
                ${escapeHtml(hit.revision_dates.join(", "))}
              </span>` : ""}
            ${hit.edit_comment ? `<span class="rev-comment">&ldquo;${escapeHtml(hit.edit_comment)}&rdquo;</span>` : ""}
          </div>`
       : "";
   
     const reasoningBox = hit.reasoning
       ? `<div class="reasoning-box">
            <div class="reasoning-header">
              ${ICONS.reasoning}
              <strong>Reasoning</strong>
            </div>
            <p>${escapeHtml(hit.reasoning)}</p>
          </div>`
       : "";
   
     const rebuttalSourceBlock = hit.rebuttal_source
       ? `<div class="source">
            ${ICONS.link}
            <strong>Source:</strong>
            ${isHttpLink(hit.rebuttal_source)
              ? `<a href="${escapeAttr(hit.rebuttal_source)}" target="_blank" rel="noopener noreferrer" class="source-link">${escapeHtml(hit.rebuttal_source)}</a>`
              : `<span class="source-text">${escapeHtml(hit.rebuttal_source)}</span>`}
          </div>`
       : "";
   
     return `
       <div class="appendix-item">
         <div class="appendix-head">
           <div class="appendix-head-left">
             ${idTag}
             <span class="top-score-method"><strong>Score: ${hit.score}/${hit.score_max}</strong></span>
             ${sourceTag}
           </div>
           <div class="category-tags">${categoryTags}</div>
         </div>
   
         <p class="ref-text">${escapeHtml(hit.text)}</p>
   
         ${revisionMeta}
         ${reasoningBox}
   
         <div class="rebuttal-box">
           <div class="rebuttal-header">
             ${ICONS.rebuttal}
             <strong>Rebuttal</strong>
           </div>
           <p>${escapeHtml(hit.rebuttal || "No rebuttal available.")}</p>
           ${rebuttalSourceBlock}
         </div>
       </div>
     `;
   }
   
   /* ── Editor display helpers ─────────────────────────────────── */
   
   function editorTagLabel(editor) {
     if (editor.is_ip) return "IP Editor";
     if (editor.account?.is_admin) return "Administrator";
     if (editor.account?.is_bot) return "Bot";
     return null; // ordinary registered editor — no tag shown
   }
   
   /* ── Card renderers ───────────────────────────────────────────── */
   
   /**
    * renderEditorCard — one editor summary card, linking to their profile
    * page scoped to the given pageSlug.
    */
   function renderEditorCard(editor, pageSlug) {
     const scoreCls = severityClass(editor.final_score, editor.score_max);
     const tagLabel = editorTagLabel(editor);
   
     const topHitHtml = editor.top_hit
       ? `<p class="editor-top-hit"><span class="quote-mark">&ldquo;</span>${escapeHtml(editor.top_hit.text)}<span class="quote-mark">&rdquo;</span></p>`
       : `<p class="editor-top-hit editor-top-hit--empty">No flagged content detected for this editor.</p>`;
   
     const act = editor.page_activity || {};
   
     return `
       <a href="${editorHref(pageSlug, editor.editor_slug)}" class="editor-card">
         <div class="editor-card__top">
           <div class="editor-avatar ${editor.is_ip ? "editor-avatar--ip" : ""}">
             ${editor.is_ip ? ICONS.ip : ICONS.user}
           </div>
           <div class="editor-name-block">
             <h3 class="editor-name">${escapeHtml(editor.editor)}</h3>
             ${tagLabel ? `<span class="editor-tag ${editor.is_ip ? "editor-tag--muted" : ""}">${escapeHtml(tagLabel)}</span>` : ""}
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
   
   /**
    * renderPageCard — one Wikipedia page summary card, linking to that
    * page's editor overview (page.html?page=<slug>).
    */
   function renderPageCard(page) {
     const scoreCls = severityClass(page.top_score, page.score_max || 8);
     const niceTitle = (page.page_title || page.page_slug).replace(/_/g, " ");
   
     return `
       <a href="${pageHref(page.page_slug)}" class="page-card">
         <div class="page-card__top">
           <div class="page-card__icon">${ICONS.doc}</div>
           <div class="page-card__title-block">
             <h3 class="page-card__title">${escapeHtml(niceTitle)}</h3>
             ${page.page_url ? `<span class="page-card__url">${escapeHtml(page.page_url.replace(/^https?:\/\//, ""))}</span>` : ""}
           </div>
           <div class="editor-score ${scoreCls}">
             <span class="editor-score__num">${page.top_score}</span>
             <span class="editor-score__max">/${page.score_max || 8}</span>
           </div>
         </div>
   
         <div class="page-card__stats">
           <div class="ec-stat">
             <span class="ec-stat__num">${page.total_editors}</span>
             <span class="ec-stat__label">Editor${page.total_editors === 1 ? "" : "s"}</span>
           </div>
           <div class="ec-stat">
             <span class="ec-stat__num">${page.total_hits}</span>
             <span class="ec-stat__label">Hit${page.total_hits === 1 ? "" : "s"}</span>
           </div>
           <div class="ec-stat">
             <span class="ec-stat__num">${page.avg_score}</span>
             <span class="ec-stat__label">Avg Score</span>
           </div>
           <div class="ec-stat">
             <span class="ec-stat__num ec-stat__num--text">${page.top_editor ? escapeHtml(page.top_editor) : "—"}</span>
             <span class="ec-stat__label">Top Editor</span>
           </div>
         </div>
   
         <div class="editor-card__footer">
           <span class="view-profile">
             View editors for this page
             ${ICONS.chevronRight}
           </span>
         </div>
       </a>
     `;
   }