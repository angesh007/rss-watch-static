#!/usr/bin/env python3
"""
=============================================================
  sync_reports.py  v2
  -------------------------------------------------------------
  Reads every *.json report from EDITOR_REPORTS_DIR and normalizes
  three schemas:

    ARTICLE   -> wiki_analyze.py article_findings output
                 { detections, summary, taxonomy_breakdown, categories }
                 One file = one Wikipedia page (not one editor).
                 Each detection may have primary_editor attribution.

    EDITOR    -> wr.py / report.py per-editor output
                 { phobic_references, executive_summary, ... }
                 One file = one editor on one page.

    OLD       -> Legacy editor_m.py + old report.py output
                 { edit_patterns, ... severity 1-5 }

  Output layout:
    data/pages.json              <- landing page list
    data/pages/<slug>/index.json <- per-page editor listing
    data/editors/<key>.json      <- normalized per-editor file

  The ARTICLE schema produces one entry per unique primary_editor
  found in the detections (plus one "__article__" entry holding
  all unattributed detections).

  Run:
    python3 scripts/sync_reports.py
=============================================================
"""

import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR   = os.path.dirname(SCRIPT_DIR)

SRC_DIR = os.environ.get(
    "EDITOR_REPORTS_DIR",
    os.path.join(ROOT_DIR, "editor_reports"),
)

OUT_DIR        = os.path.join(ROOT_DIR, "data")
OUT_EDITORS    = os.path.join(OUT_DIR, "editors")
OUT_PAGES_DIR  = os.path.join(OUT_DIR, "pages")
OUT_PAGES_LIST = os.path.join(OUT_DIR, "pages.json")

os.makedirs(OUT_EDITORS,   exist_ok=True)
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
    return round(min(v, max_val), 2)


def detect_schema(raw: dict) -> str:
    """
    Return 'article', 'editor', or 'old'.

    article -> wiki_analyze.py output:
               has top-level 'detections' list (not nested under meta/editor)
               AND has 'branches_processed' OR 'taxonomy_breakdown'

    editor  -> wr.py / new report.py output:
               has 'phobic_references' list

    old     -> legacy editor_m.py output:
               has 'edit_patterns' list or falls through
    """
    if isinstance(raw.get("detections"), list) and (
        "branches_processed" in raw or "taxonomy_breakdown" in raw
    ):
        return "article"
    if isinstance(raw.get("phobic_references"), list):
        return "editor"
    return "old"


# ── Normalize a single detection from article_findings schema ──
def normalize_detection(det: dict) -> dict:
    """
    article_findings detection fields:
      id, text, score, method_code, method_name, topic_name, topic_id,
      reasoning, red_flag, slur, section_title, branch_id, source_pages,
      categories, main_category_names, primary_editor,
      revision_dates, edit_comment, rebuttal, rebuttal_source
    """
    return {
        "id":               str(det.get("id", "")),
        "text":             det.get("text", det.get("sentence", "")),
        "source":           "article",
        "score":            clamp_score(det.get("score", 0), 8),
        "score_max":        8,
        "method_code":      det.get("method_code", ""),
        "method_name":      det.get("method_name", ""),
        "section_title":    det.get("section_title", ""),
        "topic_name":       det.get("topic_name", ""),
        "topic_id":         det.get("topic_id", ""),
        "categories":       det.get("categories", []),
        "main_category_names": det.get("main_category_names", []),
        "revision_dates":   det.get("revision_dates", []),
        "edit_comment":     det.get("edit_comment", ""),
        "reasoning":        det.get("reasoning", ""),
        "rebuttal":         det.get("rebuttal"),
        "rebuttal_source":  det.get("rebuttal_source"),
        "red_flag":         bool(det.get("red_flag")),
        "slur":             bool(det.get("slur")),
        "primary_editor":   det.get("primary_editor"),
        "source_pages":     det.get("source_pages", []),
    }


# ── Normalize a single hit from editor/old schema ─────────────
def normalize_hit(raw: dict, schema: str) -> dict:
    if schema == "editor":
        return {
            "id":             str(raw.get("id", "")),
            "text":           raw.get("text", raw.get("sentence", "")),
            "source":         raw.get("source") or "added",
            "score":          clamp_score(raw.get("score", 0), 8),
            "score_max":      8,
            "method_code":    raw.get("method_code", ""),
            "method_name":    raw.get("method_name", ""),
            "section_title":  raw.get("section_title", ""),
            "topic_name":     raw.get("topic_name", ""),
            "categories":     raw.get("categories", []),
            "main_category_names": raw.get("main_category_names", []),
            "revision_dates": raw.get("revision_dates") or [],
            "edit_comment":   raw.get("edit_comment", ""),
            "reasoning":      raw.get("reasoning", ""),
            "rebuttal":       raw.get("rebuttal"),
            "rebuttal_source":raw.get("rebuttal_source"),
            "red_flag":       bool(raw.get("red_flag")),
            "slur":           bool(raw.get("slur")),
        }
    # OLD schema
    return {
        "id":             str(raw.get("id", "")),
        "text":           raw.get("snippet") or raw.get("text", ""),
        "source":         raw.get("source") or "added",
        "score":          clamp_score(raw.get("severity", raw.get("score", 0)), 5),
        "score_max":      5,
        "method_code":    raw.get("pattern_code") or raw.get("method_code", ""),
        "method_name":    raw.get("pattern_name") or raw.get("method_name", ""),
        "section_title":  "",
        "topic_name":     "",
        "categories":     [],
        "main_category_names": [],
        "revision_dates": raw.get("revision_dates") or [],
        "edit_comment":   raw.get("edit_comment", ""),
        "reasoning":      raw.get("reasoning", ""),
        "rebuttal":       raw.get("narrative", raw.get("rebuttal")),
        "rebuttal_source":raw.get("policy_ref", raw.get("rebuttal_source")),
        "red_flag":       bool(raw.get("red_flag")),
        "slur":           bool(raw.get("slur")),
    }


# ── Process ARTICLE schema (wiki_analyze.py output) ───────────
def process_article_schema(raw: dict, fname: str) -> list:
    """
    An article_findings file contains detections for the whole article.
    Group them by primary_editor and return a list of normalized
    editor-like dicts, one per unique editor (plus one for unattributed).

    Returns: list of normalized editor dicts ready for the pages system.
    """
    page_title = raw.get("page_title", "")
    page_url   = raw.get("page_url", "")
    page_slug  = safe_slug(page_title)
    summary    = raw.get("summary", {})
    taxonomy   = raw.get("taxonomy_breakdown", {})
    categories = raw.get("categories", {})

    all_dets = [normalize_detection(d) for d in raw.get("detections", [])]

    # Group by primary_editor
    by_editor = defaultdict(list)
    for det in all_dets:
        editor = det.get("primary_editor") or "__article__"
        by_editor[editor].append(det)

    # If no attribution at all, put everything under __article__
    if not by_editor:
        by_editor["__article__"] = all_dets

    results = []
    for editor_name, dets in by_editor.items():
        dets_sorted = sorted(dets, key=lambda d: d["score"], reverse=True)

        scores = [d["score"] for d in dets_sorted if d["score"] > 0]
        max_s  = max(scores) if scores else 0
        addl   = max(0, len(scores) - 1)
        final  = round(min(max_s + addl * 0.25, 8), 2)

        strong = sum(1 for d in dets_sorted if d["score"] >= 7)
        med    = sum(1 for d in dets_sorted if 4 <= d["score"] <= 6)
        weak   = sum(1 for d in dets_sorted if 1 <= d["score"] <= 3)

        top_hit = None
        if dets_sorted:
            h = dets_sorted[0]
            top_hit = {
                "text":        h["text"][:160],
                "score":       h["score"],
                "method_name": h["method_name"],
            }

        is_ip = bool(re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", editor_name)) \
             or bool(re.match(r"^[0-9a-fA-F:]+:[0-9a-fA-F:]+$", editor_name))

        norm = {
            "schema":       "article",
            "editor":       editor_name,
            "editor_slug":  safe_slug(editor_name),
            "is_ip":        is_ip,
            "page_title":   page_title,
            "page_slug":    page_slug,
            "page_url":     page_url,
            "account":      {},
            "page_activity":{},
            "final_score":  final,
            "score_max":    8,
            "exec_summary": "",
            "qualitative_insight": "",
            "taxonomy_breakdown": taxonomy,
            "categories":   categories,
            # Store detections under both 'hits' (for sync) and
            # 'phobic_references' (for editor.html JS compatibility)
            "hits":             dets_sorted,
            "phobic_references":dets_sorted,
            "summary": {
                "total_detections": len(dets_sorted),
                "strong":  strong,
                "medium":  med,
                "weak":    weak,
                "strong_phobic": strong,
                "medium_phobic": med,
                "weak_phobic":   weak,
            },
        }
        results.append(norm)

    return results


# ── Process EDITOR schema (wr.py output) ──────────────────────
def normalize_editor_schema(raw: dict, fallback_name: str) -> dict:
    meta         = raw.get("meta", {})
    exec_summary = raw.get("executive_summary", {})
    raw_hits     = raw.get("phobic_references", [])
    hits         = [normalize_hit(h, "editor") for h in raw_hits]
    hits.sort(key=lambda h: h["score"], reverse=True)

    final  = float(exec_summary.get("final_score", 0) or 0)
    scores = [h["score"] for h in hits if h["score"] > 0]
    if final == 0 and scores:
        max_s  = max(scores)
        final  = round(min(max_s + max(0, len(scores) - 1) * 0.25, 8), 2)

    summary = raw.get("summary", {})
    editor_name = meta.get("editor") or raw.get("editor") or fallback_name
    is_ip = bool(re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", editor_name)) \
         or bool(re.match(r"^[0-9a-fA-F:]+:[0-9a-fA-F:]+$", editor_name))
    page_title = meta.get("page_title") or raw.get("page_title", "") or "Unknown_Page"
    page_url   = meta.get("page_url")   or raw.get("page_url", "")

    return {
        "schema":       "editor",
        "editor":       editor_name,
        "editor_slug":  safe_slug(editor_name),
        "is_ip":        is_ip,
        "page_title":   page_title,
        "page_slug":    safe_slug(page_title),
        "page_url":     page_url,
        "account":      meta.get("account") or raw.get("account") or {},
        "page_activity":raw.get("page_activity", {}),
        "final_score":  round(final, 2),
        "score_max":    8,
        "exec_summary": exec_summary.get("text", ""),
        "qualitative_insight": raw.get("qualitative_insight", ""),
        "taxonomy_breakdown":  raw.get("taxonomy_breakdown", {}),
        "categories":          raw.get("categories", {}),
        "hits": hits,
        "phobic_references": hits,
        "summary": {
            "total_detections": summary.get("total_detections", len(hits)),
            "strong":          summary.get("strong_phobic"),
            "medium":          summary.get("medium_phobic"),
            "weak":            summary.get("weak_phobic"),
            "strong_phobic":   summary.get("strong_phobic"),
            "medium_phobic":   summary.get("medium_phobic"),
            "weak_phobic":     summary.get("weak_phobic"),
        },
    }


# ── Process OLD schema (legacy editor_m.py) ───────────────────
def normalize_old_schema(raw: dict, fallback_name: str) -> dict:
    meta     = raw.get("meta", {})
    exec_s   = raw.get("executive_summary", {})
    raw_hits = raw.get("edit_patterns", [])
    hits     = [normalize_hit(h, "old") for h in raw_hits]
    hits.sort(key=lambda h: h["score"], reverse=True)

    final = float(exec_s.get("influence_score", exec_s.get("final_score", 0)) or 0)
    editor_name = meta.get("editor") or raw.get("editor") or fallback_name
    is_ip = bool(re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", editor_name))
    page_title = meta.get("page_title") or raw.get("page_title", "") or "Unknown_Page"

    return {
        "schema":       "old",
        "editor":       editor_name,
        "editor_slug":  safe_slug(editor_name),
        "is_ip":        is_ip,
        "page_title":   page_title,
        "page_slug":    safe_slug(page_title),
        "page_url":     meta.get("page_url") or raw.get("page_url", ""),
        "account":      meta.get("account") or raw.get("account") or {},
        "page_activity":raw.get("page_activity", {}),
        "final_score":  round(final, 2),
        "score_max":    5,
        "exec_summary": exec_s.get("text", ""),
        "qualitative_insight": raw.get("qualitative_insight", ""),
        "taxonomy_breakdown":  {},
        "categories":          {},
        "hits": hits,
        "phobic_references": hits,
        "summary": {
            "total_detections": len(hits),
            "strong": None, "medium": None, "weak": None,
            "strong_phobic": None, "medium_phobic": None, "weak_phobic": None,
            "dominant_pattern": raw.get("summary", {}).get("dominant_pattern"),
        },
    }


# ─────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────

def write_empty():
    with open(OUT_PAGES_LIST, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_pages": 0, "total_editors": 0, "total_hits": 0, "pages": [],
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

    seen_keys = {}
    pages = defaultdict(lambda: {"page_title": "", "page_url": "", "editors": []})

    for fname in files:
        full = os.path.join(SRC_DIR, fname)
        try:
            with open(full, "r", encoding="utf-8") as f:
                raw = json.load(f)
        except Exception as exc:
            print(f"  [SKIP] {fname}: invalid JSON ({exc})")
            continue

        schema = detect_schema(raw)
        fallback = re.sub(r"(__article_report|__report|__article_findings|__attributed)?\.json$",
                          "", fname, flags=re.IGNORECASE)

        if schema == "article":
            # Returns a list of per-editor dicts grouped from detections
            norm_list = process_article_schema(raw, fname)
        elif schema == "editor":
            norm_list = [normalize_editor_schema(raw, fallback)]
        else:
            norm_list = [normalize_old_schema(raw, fallback)]

        for norm in norm_list:
            page_slug  = norm["page_slug"]
            page_bucket = pages[page_slug]

            if not page_bucket["page_title"]:
                page_bucket["page_title"] = norm["page_title"]
            if not page_bucket["page_url"] and norm["page_url"]:
                page_bucket["page_url"] = norm["page_url"]

            editor_key = f"{page_slug}__{norm['editor_slug']}"
            if editor_key in seen_keys:
                print(f"  [WARN] Duplicate key '{editor_key}' "
                      f"({seen_keys[editor_key]!r} and {fname!r}) — overwriting.")
            seen_keys[editor_key] = fname

            norm["editor_key"] = editor_key

            out_path = os.path.join(OUT_EDITORS, f"{editor_key}.json")
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(norm, f, indent=2, ensure_ascii=False)

            top_hit = None
            if norm["hits"]:
                h = norm["hits"][0]
                top_hit = {
                    "text":        h["text"][:160],
                    "score":       h["score"],
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
            print(f"  [OK]  [{page_slug}] {norm['editor']:<35}"
                  f"  score {norm['final_score']}/{norm['score_max']}"
                  f"  ({len(norm['hits'])} hits)"
                  f"  schema={schema}"
                  f"  -> {rel}")

    # ── Per-page index files ───────────────────────────────────────
    pages_summary = []

    for page_slug, bucket in pages.items():
        editors = bucket["editors"]
        editors.sort(key=lambda e: (e["final_score"], e["total_hits"]), reverse=True)

        # Collect top hits across all editors for this page
        all_hits = []
        for e in editors:
            ed_path = os.path.join(OUT_EDITORS, f"{e['editor_key']}.json")
            with open(ed_path, "r", encoding="utf-8") as f:
                full = json.load(f)
            for h in full.get("hits", []):
                hit = dict(h)
                hit["editor"]      = full["editor"]
                hit["editor_slug"] = full["editor_slug"]
                hit["editor_key"]  = e["editor_key"]
                all_hits.append(hit)

        all_hits.sort(key=lambda h: h["score"], reverse=True)

        total_hits = sum(e["total_hits"] for e in editors)
        avg_score  = round(sum(e["final_score"] for e in editors) / len(editors), 2) if editors else 0

        # Page score: top-10 editors by final_score, average × (hits_factor), scale to 100
        top10 = sorted(editors, key=lambda e: e["final_score"], reverse=True)[:10]
        if top10:
            top10_avg   = sum(e["final_score"] for e in top10) / len(top10)
            hits_factor = min(1.0, total_hits / max(len(top10) * 3, 1))
            page_score  = round((top10_avg / 8) * 100 * (0.7 + 0.3 * hits_factor), 1)
        else:
            page_score = 0.0

        # Page-level taxonomy breakdown: merge across all editors
        page_breakdown: dict = {}
        for e in editors:
            ed_path = os.path.join(OUT_EDITORS, f"{e['editor_key']}.json")
            try:
                with open(ed_path,"r",encoding="utf-8") as f2: full2=json.load(f2)
                for k,v in (full2.get("taxonomy_breakdown") or {}).items():
                    if k not in page_breakdown:
                        page_breakdown[k] = {"name":v["name"],"count":0,"avg_score":0.0,"max_score":0,"_scores":[]}
                    page_breakdown[k]["count"]     += v["count"]
                    page_breakdown[k]["max_score"]  = max(page_breakdown[k]["max_score"], v["max_score"])
                    page_breakdown[k]["_scores"].extend([v["avg_score"]]*max(v["count"],1))
            except Exception: pass
        for v in page_breakdown.values():
            v["avg_score"] = round(sum(v["_scores"])/len(v["_scores"]),2) if v["_scores"] else 0.0
            del v["_scores"]

        page_index = {
            "page_title":      bucket["page_title"] or "Unknown Page",
            "page_slug":       page_slug,
            "page_url":        bucket["page_url"] or "",
            "generated_at":    datetime.now(timezone.utc).isoformat(),
            "total_editors":   len(editors),
            "total_hits":      total_hits,
            "avg_score":       avg_score,
            "page_score":      page_score,
            "page_breakdown":  page_breakdown,
            "editors":         editors,
            "top_hits":        all_hits[:10],
        }

        page_dir = os.path.join(OUT_PAGES_DIR, page_slug)
        os.makedirs(page_dir, exist_ok=True)
        page_index_path = os.path.join(page_dir, "index.json")
        with open(page_index_path, "w", encoding="utf-8") as f:
            json.dump(page_index, f, indent=2, ensure_ascii=False)

        pages_summary.append({
            "page_title":    page_index["page_title"],
            "page_slug":     page_slug,
            "page_url":      page_index["page_url"],
            "total_editors": len(editors),
            "total_hits":    total_hits,
            "avg_score":     avg_score,
            "page_score":    page_score,
            "top_editor":    editors[0]["editor"]      if editors else None,
            "top_score":     editors[0]["final_score"] if editors else 0,
            "score_max":     editors[0]["score_max"]   if editors else 8,
        })

        rel = os.path.relpath(page_index_path, ROOT_DIR)
        print(f"\n  [PAGE] {page_index['page_title']:<40}"
              f"  {len(editors)} editor(s), {total_hits} hit(s)  -> {rel}")

    pages_summary.sort(key=lambda p: (p["total_hits"], p["top_score"]), reverse=True)

    pages_list = {
        "generated_at":  datetime.now(timezone.utc).isoformat(),
        "total_pages":   len(pages_summary),
        "total_editors": sum(p["total_editors"] for p in pages_summary),
        "total_hits":    sum(p["total_hits"]    for p in pages_summary),
        "pages":         pages_summary,
    }

    with open(OUT_PAGES_LIST, "w", encoding="utf-8") as f:
        json.dump(pages_list, f, indent=2, ensure_ascii=False)

    print(f"\n[sync_reports] Wrote pages list -> {os.path.relpath(OUT_PAGES_LIST, ROOT_DIR)}")
    print(f"[sync_reports] {len(pages_summary)} page(s), "
          f"{pages_list['total_editors']} editor(s), "
          f"{pages_list['total_hits']} total hit(s)\n")


if __name__ == "__main__":
    main()
