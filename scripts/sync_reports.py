#!/usr/bin/env python3
"""
=============================================================
  sync_reports.py
  -------------------------------------------------------------
  Reads every *.json report from EDITOR_REPORTS_DIR (output of
  report.py), normalizes both schemas:

    OLD  -> edit_patterns + narrative/policy_ref  (severity 1-5)
    NEW  -> phobic_references + rebuttal/rebuttal_source (score 1-8)

  Reports may come from MULTIPLE Wikipedia pages (different
  page_title/page_url per editor). This script groups editors
  by their source page and writes a multi-page data layout:

    data/pages.json
        <- list of all pages, each with summary stats + editor list

    data/pages/<page_slug>/index.json
        <- per-page summary (same shape as the old top-level index.json):
           page_title, page_url, totals, editors[], top_hits[]

    data/editors/<page_slug>__<editor_slug>.json
        <- one normalized file per (page, editor) pair.
           Namespacing by page avoids collisions when the same
           username appears on multiple pages.

  This script only READS the existing report JSONs. It does not
  modify wiki.py / editor_m.py / report.py or their outputs.

  Run:
    python3 scripts/sync_reports.py
    EDITOR_REPORTS_DIR="/path/to/editor_reports" python3 scripts/sync_reports.py
=============================================================
"""

import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR   = os.path.dirname(SCRIPT_DIR)

# Default: an `editor_reports/` folder placed alongside this project
# (i.e. /home/shri/iBee Analytics/rss-watch-static/editor_reports).
# Override with EDITOR_REPORTS_DIR if your reports live elsewhere.
SRC_DIR = os.environ.get(
    "EDITOR_REPORTS_DIR",
    os.path.join(ROOT_DIR, "editor_reports"),
)

OUT_DIR       = os.path.join(ROOT_DIR, "data")
OUT_EDITORS   = os.path.join(OUT_DIR, "editors")
OUT_PAGES_DIR = os.path.join(OUT_DIR, "pages")
OUT_PAGES_LIST = os.path.join(OUT_DIR, "pages.json")

os.makedirs(OUT_EDITORS, exist_ok=True)
os.makedirs(OUT_PAGES_DIR, exist_ok=True)


# ─────────────────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────────────────

def safe_slug(name: str) -> str:
    name = name or "unknown"
    slug = re.sub(r"[^\w\-]", "_", name)
    slug = re.sub(r"_+", "_", slug)
    return slug.strip("_") or "unknown"


def clamp_score(n, max_val):
    try:
        v = abs(float(n))
    except (TypeError, ValueError):
        v = 0
    return min(v, max_val)


def normalize_hit(raw: dict, schema: str) -> dict:
    """
    Normalize a single hit/detection from either schema into:
      { id, text, source, score, score_max, method_code, method_name,
        revision_dates, edit_comment, reasoning,
        rebuttal, rebuttal_source, red_flag, slur }
    """
    if schema == "new":
        # phobic_references shape (editor_m.py / new report.py)
        return {
            "id":             str(raw.get("id", "")),
            "text":           raw.get("text", ""),
            "source":         raw.get("source") or "added",   # "added" | "removed"
            "score":          clamp_score(raw.get("score"), 8),
            "score_max":      8,
            "method_code":    raw.get("method_code", ""),
            "method_name":    raw.get("method_name", ""),
            "revision_dates": raw.get("revision_dates") or [],
            "edit_comment":   raw.get("edit_comment", ""),
            "reasoning":      raw.get("reasoning", ""),
            "rebuttal":        raw.get("rebuttal"),
            "rebuttal_source": raw.get("rebuttal_source"),
            "red_flag":       bool(raw.get("red_flag")),
            "slur":           bool(raw.get("slur")),
        }

    # OLD schema: edit_patterns shape (severity 1-5, narrative/policy_ref)
    return {
        "id":             str(raw.get("id", "")),
        "text":           raw.get("snippet") or raw.get("text", ""),
        "source":         raw.get("source") or "added",
        "score":          clamp_score(raw.get("severity", raw.get("score")), 5),
        "score_max":      5,
        "method_code":    raw.get("pattern_code") or raw.get("method_code", ""),
        "method_name":    raw.get("pattern_name") or raw.get("method_name", ""),
        "revision_dates": raw.get("revision_dates") or [],
        "edit_comment":   raw.get("edit_comment", ""),
        "reasoning":      raw.get("reasoning", ""),
        # "narrative"/"policy_ref" play the same role as rebuttal/rebuttal_source
        "rebuttal":        raw.get("narrative", raw.get("rebuttal")),
        "rebuttal_source": raw.get("policy_ref", raw.get("rebuttal_source")),
        "red_flag":       bool(raw.get("red_flag")),
        "slur":           bool(raw.get("slur")),
    }


def normalize_report(raw: dict, fallback_editor_name: str) -> dict:
    """Normalize a full report JSON (one editor) into a consistent shape."""
    meta = raw.get("meta", {})
    exec_summary = raw.get("executive_summary", {})

    is_new = isinstance(raw.get("phobic_references"), list)
    schema = "new" if is_new else "old"

    raw_hits = raw.get("phobic_references") if is_new else raw.get("edit_patterns")
    raw_hits = raw_hits or []

    hits = [normalize_hit(h, schema) for h in raw_hits]
    hits.sort(key=lambda h: h["score"], reverse=True)

    # Score: prefer final_score, fall back to influence_score (old, /5)
    if exec_summary.get("final_score") is not None:
        final_score = float(exec_summary["final_score"])
        score_max = 8 if is_new else 5
    elif exec_summary.get("influence_score") is not None:
        final_score = float(exec_summary["influence_score"])
        score_max = 5
    else:
        final_score = 0.0
        score_max = 8 if is_new else 5

    summary = raw.get("summary", {})

    editor_name = meta.get("editor") or raw.get("editor") or fallback_editor_name or "Unknown"

    is_ip = bool(re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", editor_name)) \
        or bool(re.match(r"^[0-9a-fA-F:]+:[0-9a-fA-F:]+$", editor_name))  # IPv6

    page_title = meta.get("page_title") or raw.get("page_title", "") or "Unknown_Page"
    page_url   = meta.get("page_url") or raw.get("page_url", "")

    return {
        "schema":      schema,
        "editor":      editor_name,
        "editor_slug": safe_slug(editor_name),
        "is_ip":       is_ip,
        "page_title":  page_title,
        "page_slug":   safe_slug(page_title),
        "page_url":    page_url,
        "account":     meta.get("account") or raw.get("account") or {},
        "page_activity": raw.get("page_activity", {}),
        "final_score": round(final_score, 2),
        "score_max":   score_max,
        "exec_summary": exec_summary.get("text", ""),
        "qualitative_insight": raw.get("qualitative_insight", ""),
        "hits": hits,
        "summary": {
            "total_detections": summary.get("total_detections", len(hits)),
            "strong":  summary.get("strong_phobic"),
            "medium":  summary.get("medium_phobic"),
            "weak":    summary.get("weak_phobic"),
            "dominant_pattern": summary.get("dominant_pattern"),
        },
    }


# ─────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────

def write_empty():
    with open(OUT_PAGES_LIST, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_pages": 0,
            "total_editors": 0,
            "total_hits": 0,
            "pages": [],
        }, f, indent=2, ensure_ascii=False)


def main():
    if not os.path.isdir(SRC_DIR):
        print(f"\n[sync_reports] WARNING: source dir not found:\n  {SRC_DIR}")
        print("[sync_reports] Writing empty dataset so the site can still render.\n")
        write_empty()
        return

    files = sorted(f for f in os.listdir(SRC_DIR) if f.lower().endswith(".json"))

    if not files:
        print(f"[sync_reports] No JSON files found in {SRC_DIR}")
        write_empty()
        return

    print(f"[sync_reports] Found {len(files)} report file(s) in:\n  {SRC_DIR}\n")

    # editor_slug collisions are now namespaced by page, but two files for
    # the SAME (page_slug, editor_slug) would still collide if they exist.
    # Track that explicitly so it's visible rather than silently overwritten.
    seen_keys = {}

    # page_slug -> { page_title, page_url, editors: [...] }
    pages = defaultdict(lambda: {"page_title": "", "page_url": "", "editors": []})

    for fname in files:
        full = os.path.join(SRC_DIR, fname)
        try:
            with open(full, "r", encoding="utf-8") as f:
                raw = json.load(f)
        except Exception as exc:
            print(f"  [SKIP] {fname}: invalid JSON ({exc})")
            continue

        fallback_name = re.sub(r"(__report)?\.json$", "", fname, flags=re.IGNORECASE)
        norm = normalize_report(raw, fallback_name)

        page_slug = norm["page_slug"]
        page_bucket = pages[page_slug]
        if not page_bucket["page_title"]:
            page_bucket["page_title"] = norm["page_title"]
        if not page_bucket["page_url"] and norm["page_url"]:
            page_bucket["page_url"] = norm["page_url"]

        # Namespace the editor file by page to avoid cross-page collisions.
        editor_key = f"{page_slug}__{norm['editor_slug']}"

        if editor_key in seen_keys:
            print(f"  [WARN] Duplicate editor+page combo '{editor_key}' "
                  f"(files: {seen_keys[editor_key]!r} and {fname!r}) — "
                  f"the later file overwrites the earlier one.")
        seen_keys[editor_key] = fname

        out_path = os.path.join(OUT_EDITORS, f"{editor_key}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(norm, f, indent=2, ensure_ascii=False)

        top_hit = None
        if norm["hits"]:
            h = norm["hits"][0]
            top_hit = {
                "text": h["text"][:160],
                "score": h["score"],
                "method_name": h["method_name"],
            }

        page_bucket["editors"].append({
            "editor":        norm["editor"],
            "editor_slug":   norm["editor_slug"],
            "editor_key":    editor_key,
            "is_ip":         norm["is_ip"],
            "account":       norm["account"],
            "page_activity": norm["page_activity"],
            "final_score":   norm["final_score"],
            "score_max":     norm["score_max"],
            "total_hits":    len(norm["hits"]),
            "summary":       norm["summary"],
            "top_hit":       top_hit,
        })

        rel = os.path.relpath(out_path, ROOT_DIR)
        print(f"  [OK]  [{page_slug}] {norm['editor']:<28}  "
              f"score {norm['final_score']}/{norm['score_max']}  "
              f"({len(norm['hits'])} hits)  -> {rel}")

    # ── Build per-page index files ─────────────────────────────────
    pages_summary = []

    for page_slug, bucket in pages.items():
        editors = bucket["editors"]
        editors.sort(key=lambda e: (e["final_score"], e["total_hits"]), reverse=True)

        # Build top_hits for this page across its editors
        all_hits = []
        for e in editors:
            ed_path = os.path.join(OUT_EDITORS, f"{e['editor_key']}.json")
            with open(ed_path, "r", encoding="utf-8") as f:
                full = json.load(f)
            for h in full["hits"]:
                hit = dict(h)
                hit["editor"] = full["editor"]
                hit["editor_slug"] = full["editor_slug"]
                hit["editor_key"] = e["editor_key"]
                all_hits.append(hit)

        all_hits.sort(key=lambda h: h["score"], reverse=True)

        total_hits = sum(e["total_hits"] for e in editors)
        avg_score = round(sum(e["final_score"] for e in editors) / len(editors), 2) if editors else 0

        page_index = {
            "page_title": bucket["page_title"] or "Unknown Page",
            "page_slug": page_slug,
            "page_url": bucket["page_url"] or "",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_editors": len(editors),
            "total_hits": total_hits,
            "avg_score": avg_score,
            "editors": editors,
            "top_hits": all_hits[:10],
        }

        page_dir = os.path.join(OUT_PAGES_DIR, page_slug)
        os.makedirs(page_dir, exist_ok=True)
        page_index_path = os.path.join(page_dir, "index.json")
        with open(page_index_path, "w", encoding="utf-8") as f:
            json.dump(page_index, f, indent=2, ensure_ascii=False)

        pages_summary.append({
            "page_title": page_index["page_title"],
            "page_slug": page_slug,
            "page_url": page_index["page_url"],
            "total_editors": len(editors),
            "total_hits": total_hits,
            "avg_score": avg_score,
            "top_editor": editors[0]["editor"] if editors else None,
            "top_score": editors[0]["final_score"] if editors else 0,
            "score_max": editors[0]["score_max"] if editors else 8,
        })

        rel = os.path.relpath(page_index_path, ROOT_DIR)
        print(f"\n  [PAGE] {page_index['page_title']:<35} "
              f"{len(editors)} editor(s), {total_hits} hit(s)  -> {rel}")

    # Sort pages by total_hits desc for the landing page
    pages_summary.sort(key=lambda p: (p["total_hits"], p["top_score"]), reverse=True)

    pages_list = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_pages": len(pages_summary),
        "total_editors": sum(p["total_editors"] for p in pages_summary),
        "total_hits": sum(p["total_hits"] for p in pages_summary),
        "pages": pages_summary,
    }

    with open(OUT_PAGES_LIST, "w", encoding="utf-8") as f:
        json.dump(pages_list, f, indent=2, ensure_ascii=False)

    print(f"\n[sync_reports] Wrote pages list -> {os.path.relpath(OUT_PAGES_LIST, ROOT_DIR)}")
    print(f"[sync_reports] {len(pages_summary)} page(s), "
          f"{pages_list['total_editors']} editor(s), "
          f"{pages_list['total_hits']} total hit(s)\n")


if __name__ == "__main__":
    main()
