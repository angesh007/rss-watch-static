#!/usr/bin/env python3
"""
=============================================================
  sync_reports.py
  -------------------------------------------------------------
  Reads every *.json report from EDITOR_REPORTS_DIR (output of
  report.py), normalizes both schemas:

    OLD  -> edit_patterns + narrative/policy_ref  (severity 1-5)
    NEW  -> phobic_references + rebuttal/rebuttal_source (score 1-8)

  ...into one consistent shape, and writes:

    data/index.json          <- page-level summary + editor list
    data/editors/<slug>.json <- one normalized file per editor

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

OUT_DIR     = os.path.join(ROOT_DIR, "data")
OUT_EDITORS = os.path.join(OUT_DIR, "editors")
OUT_INDEX   = os.path.join(OUT_DIR, "index.json")

os.makedirs(OUT_EDITORS, exist_ok=True)


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

    is_ip = bool(re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", editor_name))

    return {
        "schema":      schema,
        "editor":      editor_name,
        "editor_slug": safe_slug(editor_name),
        "is_ip":       is_ip,
        "page_title":  meta.get("page_title") or raw.get("page_title", ""),
        "page_url":    meta.get("page_url") or raw.get("page_url", ""),
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
    empty = {
        "page_title": "No Data",
        "page_url": "",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_editors": 0,
        "total_hits": 0,
        "avg_score": 0,
        "editors": [],
        "top_hits": [],
    }
    with open(OUT_INDEX, "w", encoding="utf-8") as f:
        json.dump(empty, f, indent=2, ensure_ascii=False)


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

    editors = []
    page_title = ""
    page_url = ""

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

        if not page_title and norm["page_title"]:
            page_title = norm["page_title"]
        if not page_url and norm["page_url"]:
            page_url = norm["page_url"]

        out_path = os.path.join(OUT_EDITORS, f"{norm['editor_slug']}.json")
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

        editors.append({
            "editor":        norm["editor"],
            "editor_slug":   norm["editor_slug"],
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
        print(f"  [OK]  {norm['editor']:<28}  score {norm['final_score']}/{norm['score_max']}  "
              f"({len(norm['hits'])} hits)  -> {rel}")

    # Sort editors by score desc, then by hit count
    editors.sort(key=lambda e: (e["final_score"], e["total_hits"]), reverse=True)

    # Build top_hits across all editors
    all_hits = []
    for e in editors:
        ed_path = os.path.join(OUT_EDITORS, f"{e['editor_slug']}.json")
        with open(ed_path, "r", encoding="utf-8") as f:
            full = json.load(f)
        for h in full["hits"]:
            hit = dict(h)
            hit["editor"] = full["editor"]
            hit["editor_slug"] = full["editor_slug"]
            all_hits.append(hit)

    all_hits.sort(key=lambda h: h["score"], reverse=True)

    total_hits = sum(e["total_hits"] for e in editors)
    avg_score = round(sum(e["final_score"] for e in editors) / len(editors), 2) if editors else 0

    index = {
        "page_title": page_title or "Unknown Page",
        "page_url": page_url or "",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_editors": len(editors),
        "total_hits": total_hits,
        "avg_score": avg_score,
        "editors": editors,
        "top_hits": all_hits[:10],
    }

    with open(OUT_INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    print(f"\n[sync_reports] Wrote index -> {os.path.relpath(OUT_INDEX, ROOT_DIR)}")
    print(f"[sync_reports] {len(editors)} editor(s), {total_hits} total hit(s)\n")


if __name__ == "__main__":
    main()