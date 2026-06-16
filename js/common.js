/* common.js — Shared utilities v3 */

const DATA_BASE    = "data";
const REPORTS_BASE = "editor_reports";

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

async function fetchPagesList()               { return fetchJSON(`${DATA_BASE}/pages.json`); }
async function fetchPageIndex(slug)           { return fetchJSON(`${DATA_BASE}/pages/${encodeURIComponent(slug)}/index.json`); }
async function fetchEditor(pageSlug, edSlug)  { return fetchJSON(`${DATA_BASE}/editors/${encodeURIComponent(pageSlug + "__" + edSlug)}.json`); }

/**
 * Fetch article report — tries __article_report.json first (wr.py Mode B output),
 * then __article_findings.json (raw wiki_analyze output), then the per-editor
 * __report.json for the first editor on the page.
 */
async function fetchArticleReport(pageSlug) {
  const candidates = [
    `${REPORTS_BASE}/${encodeURIComponent(pageSlug)}__article_report.json`,
    `${REPORTS_BASE}/${encodeURIComponent(pageSlug)}__article_findings.json`,
  ];
  for (const url of candidates) {
    try { return await fetchJSON(url); } catch (_) {}
  }
  // Final fallback: first editor report for this page
  try {
    const idx = await fetchPageIndex(pageSlug);
    const ed  = idx.editors?.[0];
    if (ed) {
      return await fetchJSON(`${REPORTS_BASE}/${encodeURIComponent(ed.editor_key)}__report.json`);
    }
  } catch (_) {}
  throw new Error(`No report found for "${pageSlug}"`);
}

function pageHref(slug)             { return `page.html?page=${encodeURIComponent(slug)}`; }
function editorHref(pSlug, eSlug)   { return `editor.html?page=${encodeURIComponent(pSlug)}&editor=${encodeURIComponent(eSlug)}`; }
function reportHref(slug)           { return `report.html?page=${encodeURIComponent(slug)}`; }

/* ── Navbar / Footer ───────────────────────────────────── */
const STAR_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/></svg>`;

function injectChrome(opts = {}) {
  const navbar = document.getElementById("app-navbar");
  const footer = document.getElementById("app-footer");
  if (navbar) {
    const links = [];
    if (opts.pageSlug) {
      links.push(`<a href="index.html">All Pages</a>`);
      links.push(`<a href="${pageHref(opts.pageSlug)}">${escapeHtml((opts.pageTitle||opts.pageSlug).replace(/_/g," "))}</a>`);
    } else {
      links.push(`<a href="index.html" class="active">All Pages</a>`);
    }
    if (opts.editorName && opts.pageSlug)
      links.push(`<a href="#" class="active">${escapeHtml(opts.editorName)}</a>`);
    if (opts.reportPage && opts.pageSlug)
      links.push(`<a href="${reportHref(opts.pageSlug)}" class="active">Article Report</a>`);
    if (opts.pageUrl)
      links.push(`<a href="${escapeAttr(opts.pageUrl)}" target="_blank" rel="noopener noreferrer">Source Article ↗</a>`);
    navbar.innerHTML = `
      <div class="container nav-inner">
        <a href="index.html" class="logo">${STAR_SVG}<span>RSS Watch</span></a>
        <nav class="nav-links">${links.join("")}</nav>
      </div><div class="nav-accent"></div>`;
  }
  if (footer) {
    footer.innerHTML = `<div class="container footer-inner"><p>&copy; 2024&ndash;2026 RSS Watch &middot; Wikipedia Editor Analysis &middot; Infinity Foundation Initiative.</p></div>`;
  }
}

/* ── Formatters ─────────────────────────────────────────── */
function fmtNum(n) {
  if (n==null) return "—";
  const v=Number(n); if(isNaN(v)) return "—";
  if(v>=1e6) return (v/1e6).toFixed(1)+"M";
  if(v>=1e3) return (v/1e3).toFixed(1)+"K";
  return String(v);
}
function fmtSignedNum(n) {
  if(n==null) return "—"; const v=Number(n); if(isNaN(v)) return "—";
  return (v>0?"+":v<0?"−":"")+fmtNum(Math.abs(v));
}
function fmtDate(str) {
  if(!str) return "—";
  try { const d=new Date(str); return isNaN(d)?str:d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }
  catch { return str; }
}
function escapeHtml(s){ return s==null?"":String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
function escapeAttr(s){ return escapeHtml(s); }
function isHttpLink(s){ return typeof s==="string"&&/^https?:\/\//i.test(s); }

function severityClass(score, max) {
  const r=(max?Math.abs(score)/max:0);
  return r>=0.7?"high":r>=0.4?"medium":"low";
}

/* ── Icons ──────────────────────────────────────────────── */
const ICONS = {
  user:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" stroke="currentColor" stroke-width="1.8"/><path d="M3 22C3 17.5817 7.02944 14 12 14C16.9706 14 21 17.5817 21 22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  ip:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M6 10H6.01M10 10H10.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  chevron:`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 11L9 7L5 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  extLink:`<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 10L10 2M10 2H5M10 2V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  star:`<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5L8.09 4.71L11.65 5.24L9.07 7.75L9.67 11.3L6.5 9.63L3.33 11.3L3.93 7.75L1.35 5.24L4.91 4.71L6.5 1.5Z" fill="currentColor" opacity="0.65"/></svg>`,
  warning:`<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 8V12M12 16H12.01M3 12L12 3L21 12L12 21L3 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  alert:`<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  doc:`<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  shield:`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L13.5 3.5V7.5C13.5 11 11 13.5 8 14.5C5 13.5 2.5 11 2.5 7.5V3.5L8 1.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  globe:`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M2 8H14M8 2C9.1 4.7 9.1 11.3 8 14C6.9 11.3 6.9 4.7 8 2Z" stroke="currentColor" stroke-width="1.5"/></svg>`,
  cal:`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M2 6H14M5 1.5V4M11 1.5V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  tag:`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2H6.5L12 7.5L7.5 12L2 6.5V2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="4.5" cy="4.5" r="1" fill="currentColor"/></svg>`,
  sec:`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3h10M2 7h6M2 11h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  link:`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 8L10 4M10 4H7M10 4V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10 9V11C10 11.55 9.55 12 9 12H3C2.45 12 2 11.55 2 11V5C2 4.45 2.45 4 3 4H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  reb:`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  reason:`<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M7 5v3M7 9.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  clock:`<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4 1.5V3.5M9 1.5V3.5M1.5 5.5H11.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
};

/* ── Hit card renderer ──────────────────────────────────── */
function renderHitCard(hit, opts={}) {
  const scoreMax = hit.score_max||10;
  const txt      = hit.text||hit.sentence||"";
  const cats     = hit.main_category_names||(hit.method_name?[hit.method_name]:[]);
  const sev      = severityClass(hit.score, scoreMax);

  const secTag   = hit.section_title?`<span class="htag htag--sec">${ICONS.sec}${escapeHtml(hit.section_title)}</span>`:"";
  const topTag   = hit.topic_name?`<span class="htag htag--topic">${ICONS.tag}${escapeHtml(hit.topic_name)}</span>`:"";
  const edTag    = hit.primary_editor&&opts.showEditor!==false?`<span class="htag htag--ed">${ICONS.user}${escapeHtml(hit.primary_editor)}</span>`:"";
  const revMeta  = (hit.revision_dates?.length||hit.edit_comment)?`<div class="rev-meta">${hit.revision_dates?.length?`<span class="rev-date">${ICONS.clock}${escapeHtml(hit.revision_dates.join(", "))}</span>`:""} ${hit.edit_comment?`<span class="rev-comment">"${escapeHtml(hit.edit_comment)}"</span>`:""}</div>`:"";
  const reaSrc   = hit.rebuttal_source?`<div class="src-row">${ICONS.link}<strong>Source:</strong>${isHttpLink(hit.rebuttal_source)?`<a href="${escapeAttr(hit.rebuttal_source)}" target="_blank" class="src-link">${escapeHtml(hit.rebuttal_source)}</a>`:`<span>${escapeHtml(hit.rebuttal_source)}</span>`}</div>`:"";

  return `<div class="appendix-item sev-${sev}">
    <div class="appendix-head">
      <div class="appendix-head-left">
        ${opts.showId&&hit.id?`<span class="ref-id">#${escapeHtml(String(hit.id))}</span>`:""}
        <span class="score-pill score-pill--${sev}">Score: ${hit.score}/${scoreMax}</span>
        ${secTag}${topTag}${edTag}
      </div>
      <div class="cat-tags">
        ${hit.method_code?`<span class="cat-lbl method-code">${escapeHtml(hit.method_code)}</span>`:""}
        ${cats.map(n=>`<span class="cat-lbl">${escapeHtml(n)}</span>`).join("")}
        ${hit.red_flag?`<span class="cat-lbl flag-red">Red Flag</span>`:""}
        ${hit.slur?`<span class="cat-lbl flag-slur">Slur</span>`:""}
      </div>
    </div>
    <p class="ref-text">${escapeHtml(txt)}</p>
    ${revMeta}
    ${hit.reasoning?`<div class="reasoning-box"><div class="reb-hdr">${ICONS.reason}<strong>Reasoning</strong></div><p>${escapeHtml(hit.reasoning)}</p></div>`:""}
    <div class="rebuttal-box"><div class="reb-hdr">${ICONS.reb}<strong>Rebuttal</strong></div><p>${escapeHtml(hit.rebuttal||"No rebuttal available.")}</p>${reaSrc}</div>
  </div>`;
}

/* ── Taxonomy breakdown grid (profile.vue style) ─────────── */
function renderBreakdownGrid(breakdown, total) {
  if (!breakdown||!total) return "";
  const rows = Object.entries(breakdown).filter(([,v])=>v.count>0).sort(([,a],[,b])=>b.count-a.count);
  if (!rows.length) return `<p class="no-data">No category breakdown available.</p>`;

  return `<div class="breakdown-grid">${rows.map(([,cat])=>{
    const pct  = Math.round((cat.count/total)*100);
    const sev  = cat.max_score>=7?"high":cat.max_score>=4?"medium":"low";
    // Build example quotes from detections if available (passed via cat._examples)
    const exHtml = cat._examples?.length ? `<div class="bkd-examples">
      <p class="bkd-ex-text">"${escapeHtml(cat._examples[0])}"</p>
    </div>` : "";
    return `<div class="breakdown-card">
      <div class="card-body">
        <div class="card-title-row">
          <h3 class="card-category">${escapeHtml(cat.name)}</h3>
          <span class="severity-badge ${sev}">${pct}%</span>
        </div>
        <div class="card-stats-row">
          <span class="offense-count">${ICONS.star}${cat.count} of ${total} refs</span>
          <span class="avg-lbl">Avg: ${cat.avg_score} · Max: ${cat.max_score}/10</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar"><div class="progress-fill ${sev}" style="width:${pct}%"></div></div>
          <div class="progress-labels">
            <span class="progress-pct ${sev}">${pct}% of refs flagged</span>
            <span class="progress-track-label">Max score: ${cat.max_score}/10</span>
          </div>
        </div>
      </div>
      ${exHtml}
    </div>`;
  }).join("")}</div>`;
}

/* ── Scoring breakdown (report page) ────────────────────── */
function renderScoringBreakdown(summary, detections) {
  if (!summary||!detections?.length) return "";
  const scores   = detections.map(d=>Number(d.score||0)).filter(s=>s>0);
  const maxScore = scores.length?Math.max(...scores):0;
  const addl     = Math.max(0,scores.length-1);
  const finalS   = Math.min(maxScore+addl*0.25,10).toFixed(2);
  const sev      = Number(finalS)>=5.5?"score-plain--danger":Number(finalS)>=3.5?"score-plain--med":"score-plain--low";
  const topDet   = detections.reduce((b,d)=>Number(d.score||0)>Number(b?.score||0)?d:b,detections[0]);

  return `<div class="score-visual-row">
    <div class="score-plain-block"><span class="score-plain-num ${sev}">${finalS}</span><span class="score-plain-denom">/10</span></div>
    <div class="calc-row">
      <div class="calc-step"><div class="step-icon step-icon--max">${ICONS.star}</div><div class="step-body"><span class="step-label">Highest hit</span><span class="step-val">${maxScore}</span></div></div>
      <span class="calc-op">+</span>
      <div class="calc-step"><div class="step-icon step-icon--add"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V12M2 7H12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div><div class="step-body"><span class="step-label">${addl} remaining × 0.25</span><span class="step-val">+${(addl*0.25).toFixed(2)}</span></div></div>
      <span class="calc-op">=</span>
      <div class="calc-step calc-step--result"><div class="step-icon step-icon--result"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L5.5 10.5L12 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="step-body"><span class="step-label">Final (cap 10)</span><span class="step-val step-val--final">${finalS}</span></div></div>
    </div>
  </div>
  ${topDet?`<div class="top-hit-card"><div class="top-hit-header"><div class="top-hit-badge">${ICONS.star}Highest Hit</div><span class="top-hit-score-pill">Score: ${topDet.score}/10</span><span class="top-hit-cats">${escapeHtml((topDet.main_category_names||[]).join(", "))}</span></div><blockquote class="top-hit-quote"><span class="qmark">"</span>${escapeHtml(topDet.text||topDet.sentence||"")}<span class="qmark">"</span></blockquote></div>`:""}
  <div class="score-bucket-row">
    <div class="score-bucket score-bucket--high"><span class="bucket-num">${summary.strong_phobic||0}</span><span class="bucket-label">Strong (7–10)</span></div>
    <div class="score-bucket score-bucket--med"><span class="bucket-num">${summary.medium_phobic||0}</span><span class="bucket-label">Medium (4–6)</span></div>
    <div class="score-bucket score-bucket--low"><span class="bucket-num">${summary.weak_phobic||0}</span><span class="bucket-label">Weak (1–3)</span></div>
  </div>`;
}

/* ── Editor card for page.html ──────────────────────────── */
function renderEditorCard(editor, pageSlug) {
  const scoreCls = severityClass(editor.final_score, editor.score_max||10);
  const topHit   = editor.top_hit;
  const act      = editor.page_activity||{};
  return `<a href="${editorHref(pageSlug, editor.editor_slug)}" class="editor-card">
    <div class="editor-card__top">
      <div class="editor-avatar${editor.is_ip?" editor-avatar--ip":""}">${editor.is_ip?ICONS.ip:ICONS.user}</div>
      <div class="editor-name-block"><h3 class="editor-name">${escapeHtml(editor.editor)}</h3></div>
      <div class="editor-score ${scoreCls}"><span class="editor-score__num">${editor.final_score}</span><span class="editor-score__max">/${editor.score_max||10}</span></div>
    </div>
    ${topHit?`<p class="editor-top-hit"><span class="qm">"</span>${escapeHtml(topHit.text||"")}<span class="qm">"</span></p>`:`<p class="editor-top-hit editor-top-hit--empty">No flagged content detected.</p>`}
    <div class="editor-card__stats">
      <div class="ec-stat"><span class="ec-stat__num">${editor.total_hits}</span><span class="ec-stat__label">Hit${editor.total_hits===1?"":"s"}</span></div>
      <div class="ec-stat"><span class="ec-stat__num">${act.total_revisions??"—"}</span><span class="ec-stat__label">Revisions</span></div>
      <div class="ec-stat"><span class="ec-stat__num">${fmtSignedNum(act.total_bytes_added)}</span><span class="ec-stat__label">Bytes +</span></div>
    </div>
    <div class="editor-card__footer"><span class="view-profile">View editor profile ${ICONS.chevron}</span></div>
  </a>`;
}

function renderPageCard(page) {
  const scoreMax = page.page_score_max ?? page.score_max ?? 10;
  const scoreCls = severityClass(page.page_score??page.top_score, scoreMax);
  const niceTitle= (page.page_title||page.page_slug).replace(/_/g," ");
  return `<a href="${pageHref(page.page_slug)}" class="page-card">
    <div class="page-card__top">
      <div class="page-card__icon">${ICONS.doc}</div>
      <div class="page-card__title-block"><h3 class="page-card__title">${escapeHtml(niceTitle)}</h3>${page.page_url?`<span class="page-card__url">${escapeHtml(page.page_url.replace(/^https?:\/\//,""))}</span>`:""}</div>
      <div class="editor-score ${scoreCls}"><span class="editor-score__num">${page.page_score??page.top_score}</span><span class="editor-score__max">/${scoreMax}</span></div>
    </div>
    <div class="page-card__stats">
      <div class="ec-stat"><span class="ec-stat__num">${page.total_editors}</span><span class="ec-stat__label">Editors</span></div>
      <div class="ec-stat"><span class="ec-stat__num">${page.total_hits}</span><span class="ec-stat__label">Hits</span></div>
      <div class="ec-stat"><span class="ec-stat__num">${page.page_score??page.top_score}</span><span class="ec-stat__label">Page Score</span></div>
    </div>
    <div class="editor-card__footer"><span class="view-profile">View editors ${ICONS.chevron}</span></div>
  </a>`;
}
