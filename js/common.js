/* ═══════════════════════════════════════════════════════════════
   RSS Watch — common.js
   Shared navbar/footer injection + helper utilities used by
   index.js, report.js, and editor.js.
   ═══════════════════════════════════════════════════════════════ */

(function () {

  // ── Navbar / Footer injection ────────────────────────────────
  const NAV_LINKS = [
    { href: "index.html", label: "Home" },
  ];

  function injectNavbar() {
    const el = document.getElementById("app-navbar");
    if (!el) return;
    const current = window.location.pathname.split("/").pop() || "index.html";
    const links = NAV_LINKS.map(
      (l) =>
        `<a href="${l.href}" class="${l.href === current ? "active" : ""}">${l.label}</a>`
    ).join("");
    el.innerHTML = `
      <div class="container nav-inner">
        <a href="index.html" class="logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/>
          </svg>
          <span>RSS Watch</span>
        </a>
        <nav class="nav-links">${links}</nav>
      </div>
      <div class="nav-accent"></div>
    `;
  }

  function injectFooter() {
    const el = document.getElementById("app-footer");
    if (!el) return;
    el.innerHTML = `
      <div class="container footer-inner">
        <p>© 2024–2026 RSS Watch. Infinity Foundation Initiative.</p>
      </div>
    `;
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectNavbar();
    injectFooter();
  });

  // ── HTML escaping ─────────────────────────────────────────────
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ── Query param helpers ──────────────────────────────────────
  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  // ── Severity classification (shared score → class mapping) ──
  // Detection scores run 1–10. high >= 8, medium 5–7, low 1–4.
  function severityClass(score) {
    const s = Math.abs(Number(score) || 0);
    if (s >= 8) return "high";
    if (s >= 5) return "medium";
    return "low";
  }

  function severityLabel(score) {
    const cls = severityClass(score);
    return cls === "high" ? "Severe" : cls === "medium" ? "Moderate" : "Minor";
  }

  // ── Date formatting ──────────────────────────────────────────
  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function timeAgo(iso) {
    if (!iso) return "—";
    try {
      const diffMs = Date.now() - new Date(iso).getTime();
      const mins = Math.round(diffMs / 60000);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.round(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.round(hrs / 24);
      if (days < 30) return `${days}d ago`;
      return formatDate(iso);
    } catch {
      return iso;
    }
  }

  // ── Editor display helpers ──────────────────────────────────
  // Detects bare-IP editor identities (IPv4/IPv6) vs named/unattributed.
  function isIpEditor(name) {
    if (!name) return false;
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6 = /^[0-9a-fA-F:]+:[0-9a-fA-F:]+$/;
    return ipv4.test(name) || ipv6.test(name);
  }

  function fmtEditorName(name) {
    if (!name || name === "__unattributed__") return "Unattributed Hits";
    return name;
  }

  function editorInitial(name) {
    const n = fmtEditorName(name);
    if (n === "Unattributed Hits") return "?";
    if (isIpEditor(n)) return "IP";
    return n.charAt(0).toUpperCase();
  }

  function slugify(str) {
    return String(str || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  // ── Fetch JSON helper with friendly errors ──────────────────
  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
    }
    return res.json();
  }

  // ── Truncate text for previews ───────────────────────────────
  function truncate(str, len) {
    if (!str) return "";
    return str.length > len ? str.slice(0, len).trim() + "…" : str;
  }

  // ── Expose on a shared namespace ─────────────────────────────
  window.RSSWatch = {
    escapeHtml,
    getParam,
    severityClass,
    severityLabel,
    formatDate,
    formatDateTime,
    timeAgo,
    isIpEditor,
    fmtEditorName,
    editorInitial,
    slugify,
    fetchJson,
    truncate,
  };
})();
