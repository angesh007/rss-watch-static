"""
=============================================================
  wr.py  v1.0  —  Editor Rebuttal Report Generator
                  (Content-First Pipeline)

  REPLACES: er.py / report.py

  PIPELINE:
    [wik.py]    → wiki_output/content_package.json
    [editor.py] → editor_output/attributed_findings/*.json
    [wr.py]     → editor_reports/*.json   ← THIS FILE

  Per-editor report includes:
    - Editor profile (account + activity stats)
    - Executive summary of editing behaviour
    - Qualitative behavioural insight
    - Taxonomy breakdown (8 main categories)
    - All detected phobic_references with live Gemini rebuttal
    - Composite final score (phobia_intensity × breadth)

  SDK: google-genai (from google import genai)

  Run:  python wr.py
  Run single editor: python wr.py --editor Kautilya3
  Skip rebuttals:    python wr.py --no-rebuttals
=============================================================
"""

import argparse
import gc
import json
import os
import pathlib
import re
import time
from typing import Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types
from tqdm import tqdm

from taxonomy import calculate_composite_score, summarize_by_main_category

# ─────────────────────────────────────────────────────────
#  CONFIGURATION
# ─────────────────────────────────────────────────────────
load_dotenv()

BASE_DIR          = os.path.dirname(os.path.abspath(__file__))
DATA_DIR          = os.path.join(BASE_DIR, "editor_output", "attributed_findings")
WIKI_OUT_DIR      = os.path.join(BASE_DIR, "wiki_output")   # article_findings fallback
OUTPUT_DIR        = os.path.join(BASE_DIR, "editor_reports")
INTERNAL_DOC_PATH = os.path.join(BASE_DIR, "Internaldoc.docx.pdf")   # optional

GEMINI_MODEL_NAME  = "gemini-2.5-pro"
MAX_CHARS_INTERNAL = 120_000
BATCH_SIZE         = 7      # refs per Gemini rebuttal call (up from 5 in er.py)
INTER_BATCH_DELAY  = 2.0    # seconds between rebuttal batch calls

os.makedirs(OUTPUT_DIR, exist_ok=True)

REBUTTAL_SOURCES = [
    "https://www.rss.org", "https://www.archivesofrss.org",
    "https://www.rssfacts.org", "https://www.organiser.org",
    "https://www.panchjanya.com", "https://vskbharat.com",
    "https://www.sevabharati.org", "https://myind.net",
    "https://indiafacts.org", "https://swarajyamag.com",
    "https://www.pgurus.com", "https://www.hinduvivekkendra.com",
    "https://bharatmata.in", "https://www.vicharkendrabharat.com",
    "https://indiapolicyfoundation.org",
]


# ─────────────────────────────────────────────────────────
#  SYSTEM PROMPTS  (identical to er.py)
# ─────────────────────────────────────────────────────────

REBUTTAL_SYSTEM_PROMPT = f"""
You are an expert research analyst specialising in Indian socio-political history,
the Rashtriya Swayamsevak Sangh (RSS), Hindu nationalism, and inter-community
relations in India.

Your task is to write accurate, well-grounded rebuttals to specific claims or
accusations made against the RSS or its affiliated organisations
(BJP, VHP, Bajrang Dal, Vishwa Hindu Parishad, etc.) found in a Wikipedia article.

You are given:
  1. A list of HIT TEXTS (numbered claims to rebut).
  2. INTERNAL DOCUMENT — an authoritative internal knowledge base about the RSS.
  3. You MUST use your Google Search tool to find current, primary-source
     evidence from: {", ".join(REBUTTAL_SOURCES)}

WRITING RULES:
  • Directly address each claim — do not be vague or generic.
  • Ground every sentence in evidence from the internal doc or search results.
  • Be factual, measured, and academically credible.
  • Each rebuttal: 100-200 words.
  • Prioritise primary RSS sources over secondary commentary.

SOURCE ATTRIBUTION RULE:
  Set "rebuttal_source" to ONE of:
    - "internal"          → internal doc was the primary basis
    - an exact URL string → a specific web page was the primary basis

URL VALIDATION RULE:
  • If using a web source, you MUST provide a valid, working URL.
  • Do NOT fabricate or guess article URLs.
  • If a specific article URL cannot be verified, use ONLY the base domain.
  • Never return broken links. If unsure → ALWAYS return the homepage URL.

OUTPUT FORMAT — respond with ONLY a valid JSON array, one object per input claim,
in the SAME ORDER as the input. No markdown fences, no preamble:
[
  {{"index": 0, "rebuttal": "...", "rebuttal_source": "..."}},
  {{"index": 1, "rebuttal": "...", "rebuttal_source": "..."}},
  ...
]
""".strip()


EXEC_SUMMARY_PROMPT = """
You are a Senior Academic Auditor specializing in objective content analysis.

TASK:
Write an Executive Summary (200-300 words) based on the RSS-phobic references
found in this Wikipedia editor's contributions to the article. Focus on what is
wrong in the edits and the editor's rhetorical/editorial behaviour. Concise,
factual, based solely on the provided information.

INPUT:
Editor              : {editor}
Page                : {page_title}
Account registered  : {registered}
Total wiki edits    : {total_edits}
Revisions on page   : {page_revisions}
Bytes added         : {bytes_added}
Bytes removed       : {bytes_removed}
Final score         : {final_score}/8
Phobia breadth      : {phobia_breadth} (distinct main categories / 8)

PHOBIC REFERENCES:
{refs_json}

RULES:
- Analytical tone.
- Start directly with the text. No headers.
""".strip()


QUALITATIVE_INSIGHT_PROMPT = """You are analyzing rhetorical construction patterns in a Wikipedia
editor's contribution history.
Write a structured academic analysis (150-220 words). Explain: how the
editor's edits construct or reshape the narrative step-by-step, framing and
labeling strategies, escalation patterns, justification of exclusion or harm,
fear amplification, tone.
Analytical neutrality. No bullet points. Max 220 words.

Text:
{texts}"""


# ─────────────────────────────────────────────────────────
#  SETUP
# ─────────────────────────────────────────────────────────

def configure_gemini() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY not set in environment / .env")
    return genai.Client(api_key=api_key)


def load_internal_pdf(path: str, max_chars: int = MAX_CHARS_INTERNAL) -> str:
    if not os.path.exists(path):
        tqdm.write(f"  [INFO] Internal doc not found (optional): {path}")
        return ""
    try:
        import pdfplumber
        parts = []
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                parts.append(page.extract_text() or "")
        full = "\n".join(parts)
        tqdm.write(f"  ✓ Internal PDF loaded ({len(full):,} chars → capped at {max_chars:,})")
        return full[:max_chars]
    except Exception as exc:
        tqdm.write(f"  [ERROR] Could not read PDF: {exc}")
        return ""


# ─────────────────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────────────────

def safe_filename(name: str) -> str:
    return re.sub(r'[\\/*?:"<>|]', "_", name)


def dedup_sentences(text: str) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    seen, out = set(), []
    for s in sentences:
        k = s.lower().strip()
        if k and k not in seen:
            seen.add(k)
            out.append(s)
    return " ".join(out)


# ─────────────────────────────────────────────────────────
#  REBUTTAL — BATCH PROMPT BUILDER
# ─────────────────────────────────────────────────────────

def _build_rebuttal_prompt(batch: list[dict], internal_text: str) -> str:
    claims_block = "\n".join(
        f"[{item['index']}] (section: {item.get('section','?')}) {item['text'].strip()}"
        for item in batch
    )
    return "\n".join([
        "=== HIT TEXTS (claims to rebut) ===",
        "Each line shows the article section where this claim appears.",
        claims_block,
        "",
        "=== INTERNAL DOCUMENT ===",
        internal_text.strip() if internal_text.strip() else "[Not available]",
        "",
        (
            "Using the internal document above AND your Google Search tool "
            f"(prioritise: {', '.join(REBUTTAL_SOURCES)}), "
            f"generate the rebuttal JSON array for ALL {len(batch)} claims above."
        ),
    ])


# ─────────────────────────────────────────────────────────
#  REBUTTAL — GEMINI BATCH CALL
# ─────────────────────────────────────────────────────────

def _call_rebuttal_batch(
    client: genai.Client,
    batch: list[dict],
    internal_text: str,
    retries: int = 3,
) -> Optional[dict]:
    config = types.GenerateContentConfig(
        system_instruction=REBUTTAL_SYSTEM_PROMPT,
        tools=[types.Tool(google_search=types.GoogleSearch())],
    )
    prompt = _build_rebuttal_prompt(batch, internal_text)
    raw = ""

    for attempt in range(1, retries + 1):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL_NAME,
                contents=prompt,
                config=config,
            )
            raw = response.text.strip()

            if raw.startswith("```"):
                raw = raw.split("```", 2)[1]
            if raw.lower().startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

            parsed = json.loads(raw)
            if not isinstance(parsed, list):
                raise ValueError(f"Expected JSON array, got {type(parsed)}")

            result_map = {}
            for item in parsed:
                idx = item.get("index")
                if idx is None or "rebuttal" not in item:
                    tqdm.write(f"    [WARN] Malformed item: {item}")
                    continue
                result_map[idx] = {
                    "rebuttal"        : item["rebuttal"],
                    "rebuttal_source" : item.get("rebuttal_source"),
                }

            if result_map:
                return result_map

            tqdm.write(f"    [WARN] Empty result map (attempt {attempt})")

        except (json.JSONDecodeError, ValueError) as exc:
            tqdm.write(f"    [WARN] Parse error (attempt {attempt}): {exc}")
            tqdm.write(f"    Raw snippet: {raw[:300]}")
        except Exception as exc:
            tqdm.write(f"    [ERROR] Rebuttal call failed (attempt {attempt}): {exc}")

        if attempt < retries:
            time.sleep(2 ** attempt)

    return None


# ─────────────────────────────────────────────────────────
#  REBUTTAL INJECTOR
# ─────────────────────────────────────────────────────────

def inject_rebuttals(
    refs: list,
    client: genai.Client,
    internal_text: str,
) -> tuple[int, int]:
    """
    Inject rebuttal + rebuttal_source in-place on each ref.
    Returns (updated_count, skipped_count).
    """
    work_items = [
        {
            "index"   : i,
            "ref_obj" : ref,
            "text"    : ref.get("text", ref.get("sentence", "")).strip(),
            "section" : ref.get("section_title", ""),
            "source"  : ref.get("source", "article"),
        }
        for i, ref in enumerate(refs)
    ]

    batches = [
        work_items[i : i + BATCH_SIZE]
        for i in range(0, len(work_items), BATCH_SIZE)
    ]

    updated = skipped = 0

    batch_bar = tqdm(
        batches,
        desc="    rebuttal batches",
        leave=False,
        unit="batch",
        ncols=90,
        colour="cyan",
    )

    for batch in batch_bar:
        valid   = [it for it in batch if it["text"]]
        invalid = [it for it in batch if not it["text"]]

        for it in invalid:
            it["ref_obj"]["rebuttal"]        = "No rebuttal available"
            it["ref_obj"]["rebuttal_source"] = None
            skipped += 1

        if not valid:
            continue

        batch_bar.set_postfix(
            idx=f"{valid[0]['index']}–{valid[-1]['index']}",
            n=len(valid),
        )

        result_map = _call_rebuttal_batch(client, valid, internal_text)

        if result_map:
            for it in valid:
                res = result_map.get(it["index"])
                if res:
                    it["ref_obj"]["rebuttal"]        = res["rebuttal"]
                    it["ref_obj"]["rebuttal_source"] = res["rebuttal_source"]
                    tqdm.write(
                        f"      ✓ ref[{it['index']}]  "
                        f"source → {str(res['rebuttal_source'])[:70]}"
                    )
                    updated += 1
                else:
                    it["ref_obj"]["rebuttal"]        = "No rebuttal available"
                    it["ref_obj"]["rebuttal_source"] = None
                    tqdm.write(f"      ✗ ref[{it['index']}]: missing in batch response")
                    skipped += 1
        else:
            tqdm.write(
                f"      ✗ batch {valid[0]['index']}–{valid[-1]['index']}: "
                "all retries failed — defaults set"
            )
            for it in valid:
                it["ref_obj"]["rebuttal"]        = "No rebuttal available"
                it["ref_obj"]["rebuttal_source"] = None
            skipped += len(valid)

        time.sleep(INTER_BATCH_DELAY)

    batch_bar.close()
    return updated, skipped


# ─────────────────────────────────────────────────────────
#  LLM CALLS — executive summary + qualitative insight
# ─────────────────────────────────────────────────────────

def generate_executive_summary(
    editor_data: dict,
    refs: list,
    client: genai.Client,
) -> str:
    act  = editor_data.get("page_activity", {})
    acc  = editor_data.get("account", {})
    summ = editor_data.get("summary", {})

    refs_preview = [
        {
            "text"        : r.get("text", r.get("sentence", ""))[:150],
            "source"      : r.get("source", "article"),
            "score"       : r.get("score"),
            "method_code" : r.get("method_code"),
            "method_name" : r.get("method_name"),
            "section"     : r.get("section_title", ""),
        }
        for r in refs[:25]
    ]

    prompt = EXEC_SUMMARY_PROMPT.format(
        editor          = editor_data.get("editor", ""),
        page_title      = editor_data.get("page_title", ""),
        registered      = acc.get("registration_date", "?"),
        total_edits     = acc.get("total_wiki_edits", "?"),
        page_revisions  = act.get("total_revisions", 0),
        bytes_added     = f"{act.get('total_bytes_added', 0):,}",
        bytes_removed   = f"{act.get('total_bytes_removed', 0):,}",
        final_score     = summ.get("final_score", 0),
        phobia_breadth  = summ.get("phobia_breadth", 0),
        refs_json       = json.dumps(refs_preview, indent=2),
    )

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL_NAME,
            contents=prompt,
        )
        return dedup_sentences(response.text.strip())
    except Exception as exc:
        tqdm.write(f"  [WARN] Executive summary failed: {exc}")
        return "Summary generation failed."


def generate_qualitative_insight(refs: list, client: genai.Client) -> str:
    tqdm.write("    Generating qualitative insight…")
    texts = [r.get("text", r.get("sentence", "")) for r in refs if r.get("text") or r.get("sentence")][:6]
    if not texts:
        return "No textual data available."
    prompt = QUALITATIVE_INSIGHT_PROMPT.format(texts="\n".join(texts))
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL_NAME,
            contents=prompt,
        )
        return response.text.strip()
    except Exception as exc:
        tqdm.write(f"  [WARN] Qualitative insight failed: {exc}")
        return "Qualitative insight could not be generated."


# ─────────────────────────────────────────────────────────
#  MAIN PIPELINE
# ─────────────────────────────────────────────────────────


# ─────────────────────────────────────────────────────────
#  ARTICLE-FINDINGS → REPORT  (fallback when no attributed files)
# ─────────────────────────────────────────────────────────

def _article_findings_to_editor_data(findings: dict) -> dict:
    """
    Convert an article_findings.json (wiki_analyze.py output) into the
    same shape as an attributed_findings file, so the rest of the pipeline
    can process it identically.

    Since article_findings has no per-editor attribution, we use the
    page title as the subject and set editor="Article Analysis".
    The summary, taxonomy_breakdown, and phobic_references fields are
    taken directly from the article findings.
    """
    page_title = findings.get("page_title", "Unknown")
    dets = findings.get("detections", [])

    # Normalise: detections use "text" (not "sentence") — already correct
    # Compute composite score from raw detections
    scores  = [int(d.get("score", 0)) for d in dets if int(d.get("score", 0)) > 0]
    max_s   = max(scores) if scores else 0
    addl    = max(0, len(scores) - 1)
    final   = round(min(max_s + addl * 0.25, 8), 2)

    strong = sum(1 for s in scores if s >= 7)
    med    = sum(1 for s in scores if 4 <= s <= 6)
    weak   = sum(1 for s in scores if 1 <= s <= 3)

    # Build phobia_breadth from taxonomy_breakdown
    breakdown = findings.get("taxonomy_breakdown", {})
    active_cats = sum(1 for v in breakdown.values() if v.get("count", 0) > 0)
    breadth = round(active_cats / 8, 3)

    return {
        # Identity — used by generate_executive_summary and _assemble_report
        "editor"       : f"{page_title.replace('_', ' ')} — Article Analysis",
        "page_title"   : page_title,
        "page_url"     : findings.get("page_url", ""),
        "account"      : {},
        "page_activity": {
            "total_revisions"    : findings.get("branches_processed", 0),
            "total_bytes_added"  : 0,
            "total_bytes_removed": 0,
        },
        # References — same field name the rest of the pipeline uses
        "phobic_references" : dets,
        # Summary with both old and new field names
        "summary": {
            "total_detections": len(dets),
            "strong_phobic"   : strong,
            "medium_phobic"   : med,
            "weak_phobic"     : weak,
            "final_score"     : final,
            "phobia_intensity": round(sum(scores) / len(scores), 2) if scores else 0,
            "phobia_breadth"  : breadth,
        },
        "taxonomy_breakdown": breakdown,
        "categories"        : findings.get("categories", {}),
        "_source"           : "article_findings",
    }


def _collect_article_findings(wiki_out_dir: str) -> list[tuple[str, dict]]:
    """
    Find all *__article_findings.json files in wiki_output/.
    Returns list of (page_slug, findings_dict).
    """
    results = []
    if not os.path.isdir(wiki_out_dir):
        return results
    for fname in sorted(os.listdir(wiki_out_dir)):
        if not fname.lower().endswith("__article_findings.json"):
            continue
        fpath = os.path.join(wiki_out_dir, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Verify it really is an article_findings file
            if "detections" in data and "taxonomy_breakdown" in data:
                page_slug = fname.replace("__article_findings.json", "")
                results.append((page_slug, data))
        except Exception as exc:
            tqdm.write(f"  [WARN] Could not read {fname}: {exc}")
    return results


# ─────────────────────────────────────────────────────────
#  MAIN PIPELINE
# ─────────────────────────────────────────────────────────

def process_all(target_editor: Optional[str] = None,
                skip_rebuttals: bool = False) -> None:
    print("\n╔═══════════════════════════════════════════════╗")
    print("║   wr.py  v2.0  —  Report Generator             ║")
    print("║   Content-First Pipeline + Taxonomy Breakdown  ║")
    print("╚═══════════════════════════════════════════════╝\n")

    # ── 1. Configure Gemini client ────────────────────────────────────────
    print("[1/4] Configuring Gemini client…")
    client = configure_gemini()
    print(f"  ✓ Model              : {GEMINI_MODEL_NAME}")
    print(f"  ✓ Rebuttal batch size: {BATCH_SIZE} refs per call")
    print(f"  ✓ Rebuttals          : {'DISABLED' if skip_rebuttals else 'enabled (Google Search grounding)'}")
    print()

    # ── 2. Load internal knowledge document ──────────────────────────────
    print("[2/4] Loading internal knowledge document…")
    internal_text = load_internal_pdf(INTERNAL_DOC_PATH)
    print()

    # ── 3. Discover input files ───────────────────────────────────────────
    #
    #  MODE A: attributed_findings/*.json exists  (wik.py + editor.py ran)
    #    → one report per editor, with account/activity data
    #
    #  MODE B: attributed_findings/ empty or missing, BUT wiki_output/
    #          has *__article_findings.json  (only wiki_analyze.py ran)
    #    → one report per article, editor = "Article Analysis"
    #
    print("[3/4] Discovering input files…")

    data_dir   = pathlib.Path(DATA_DIR)
    json_files = []

    if data_dir.exists():
        json_files = sorted(
            p for p in data_dir.glob("*__attributed.json")
            if "__unattributed__" not in p.stem
        )

    if json_files:
        mode = "A"
        print(f"  Mode A: {len(json_files)} attributed editor file(s) in {DATA_DIR}")
        if target_editor:
            safe = re.sub(r"[^\w\-]", "_", target_editor)
            json_files = [p for p in json_files if safe in p.stem]
            if not json_files:
                print(f"  [WARN] No attributed file found for editor: {target_editor}")
                return
    else:
        mode = "B"
        article_items = _collect_article_findings(WIKI_OUT_DIR)
        if not article_items:
            print(
                f"  [WARN] No attributed findings in {DATA_DIR}\n"
                f"  [WARN] No article_findings.json found in {WIKI_OUT_DIR}\n"
                "  Run wiki_analyze.py first, then run wr.py."
            )
            return
        print(f"  Mode B (fallback): {len(article_items)} article_findings file(s)")
        print("  → Generating article-level reports (no per-editor attribution)")

    print()
    print("[4/4] Processing…\n")

    total_updated = total_skipped = 0

    # ── MODE A: per-editor attributed files ──────────────────────────────
    if mode == "A":
        file_bar = tqdm(json_files, desc="Editors", unit="editor", ncols=90, colour="green")

        for json_path in file_bar:
            editor_name = json_path.stem.replace("__attributed", "")
            out_fname   = safe_filename(editor_name) + "__report.json"
            out_path    = pathlib.Path(OUTPUT_DIR) / out_fname

            file_bar.set_description(f"Editor: {editor_name[:40]}")

            if out_path.exists():
                tqdm.write(f"  [SKIP] Already exists: {out_fname}")
                continue

            tqdm.write(f"\n  → Processing: {editor_name}")

            with open(json_path, "r", encoding="utf-8") as fh:
                editor_data = json.load(fh)

            refs = editor_data.get("phobic_references", [])
            tqdm.write(f"    {len(refs)} phobic reference(s) detected")

            up, sk = _process_one_report(
                editor_data, refs, out_path, client, internal_text,
                skip_rebuttals
            )
            total_updated += up
            total_skipped += sk
            gc.collect()

        file_bar.close()

    # ── MODE B: article_findings fallback ────────────────────────────────
    else:
        for page_slug, findings in article_items:
            out_fname = safe_filename(page_slug) + "__article_report.json"
            out_path  = pathlib.Path(OUTPUT_DIR) / out_fname

            if out_path.exists():
                tqdm.write(f"  [SKIP] Already exists: {out_fname}")
                continue

            tqdm.write(f"\n  → Article report: {page_slug}")

            editor_data = _article_findings_to_editor_data(findings)
            refs        = editor_data["phobic_references"]
            tqdm.write(f"    {len(refs)} detection(s) from article analysis")

            up, sk = _process_one_report(
                editor_data, refs, out_path, client, internal_text,
                skip_rebuttals
            )
            total_updated += up
            total_skipped += sk
            gc.collect()

    print("\n" + "─" * 54)
    print(f"  Rebuttals generated  : {total_updated}")
    print(f"  Rebuttals skipped    : {total_skipped}")
    print(f"  Final outputs        : {OUTPUT_DIR}")
    print("─" * 54)
    print("✅  All done.\n")


def _process_one_report(
    editor_data: dict,
    refs: list,
    out_path: pathlib.Path,
    client: genai.Client,
    internal_text: str,
    skip_rebuttals: bool,
) -> tuple[int, int]:
    """
    Shared logic for both Mode A (per-editor) and Mode B (article-level).
    Generates executive summary, injects rebuttals, generates qualitative
    insight, assembles and saves the report JSON.
    Returns (updated_count, skipped_count).
    """
    updated = skipped = 0

    if not refs:
        tqdm.write("    No references — writing empty report.")
        report = _assemble_report(editor_data, refs, "No detections found.", 0.0, "")
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2, ensure_ascii=False)
        tqdm.write(f"  ✓ Saved → {out_path}")
        return 0, 0

    # Stage 1: executive summary
    exec_text   = generate_executive_summary(editor_data, refs, client)
    summ        = editor_data.get("summary", {})
    final_score = summ.get("final_score", 0.0)
    tqdm.write(f"    Final score: {final_score}/8")

    # Stage 2: live rebuttal injection
    if not skip_rebuttals:
        tqdm.write(f"    Generating rebuttals via Gemini ({BATCH_SIZE}/batch)…")
        updated, skipped = inject_rebuttals(refs, client, internal_text)
        tqdm.write(f"    Rebuttals: {updated} generated, {skipped} skipped/failed")

    # Stage 3: qualitative insight
    qualitative_insight = generate_qualitative_insight(refs, client)

    # Stage 4: assemble and save
    report = _assemble_report(
        editor_data, refs, exec_text, final_score, qualitative_insight
    )

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)

    tqdm.write(f"  ✓ Saved → {out_path}")
    return updated, skipped


def _assemble_report(editor_data: dict, refs: list,
                     exec_text: str, final_score: float,
                     qualitative_insight: str) -> dict:
    """
    Assemble the final report JSON.
    Works for both Mode A (editor_data has account/page_activity)
    and Mode B (editor_data built from article_findings — those fields are empty).
    """
    taxonomy_breakdown = editor_data.get("taxonomy_breakdown", {})
    if not taxonomy_breakdown and refs:
        try:
            from taxonomy import summarize_by_main_category
            td = summarize_by_main_category(refs)
            taxonomy_breakdown = {
                k: {
                    "name"      : v["name"],
                    "count"     : v["count"],
                    "avg_score" : v["avg_score"],
                    "max_score" : v["max_score"],
                }
                for k, v in td.items()
            }
        except Exception:
            taxonomy_breakdown = {}

    sections_seen = {}
    for ref in refs:
        sec = ref.get("section_title", "Unknown Section")
        sections_seen.setdefault(sec, 0)
        sections_seen[sec] += 1

    # Build active categories dict from taxonomy_breakdown
    categories = editor_data.get("categories", {})
    if not categories and taxonomy_breakdown:
        categories = {
            k: v["name"]
            for k, v in taxonomy_breakdown.items()
            if v.get("count", 0) > 0
        }

    summ = editor_data.get("summary", {})

    return {
        "meta": {
            "editor"          : editor_data.get("editor"),
            "page_title"      : editor_data.get("page_title"),
            "page_url"        : editor_data.get("page_url", ""),
            "account"         : editor_data.get("account", {}),
            "pipeline_version": "content-first-v2",
            "source"          : editor_data.get("_source", "attributed_findings"),
        },
        "page_activity"     : editor_data.get("page_activity", {}),
        "executive_summary" : {
            "text"            : exec_text,
            "final_score"     : final_score,
            "phobia_intensity": summ.get("phobia_intensity", 0),
            "phobia_breadth"  : summ.get("phobia_breadth", 0),
        },
        "qualitative_insight": qualitative_insight,
        "taxonomy_breakdown" : taxonomy_breakdown,
        "categories"         : categories,
        "sections_hit"       : sections_seen,
        "phobic_references"  : refs,
        "summary"            : summ,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="wr.py — Report Generator (Content-First, supports article + editor modes)"
    )
    parser.add_argument(
        "--editor", default=None,
        help="Process only this editor (partial username match, Mode A only)"
    )
    parser.add_argument(
        "--no-rebuttals", action="store_true",
        help="Skip rebuttal generation (faster, for testing)"
    )
    args = parser.parse_args()

    process_all(
        target_editor  = args.editor,
        skip_rebuttals = args.no_rebuttals,
    )
