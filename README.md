# RSS Watch — Static Site

A static, vanilla HTML/CSS/JS site for browsing Wikipedia neutrality/bias
analysis reports produced by the `neutrality_check.py` pipeline. No build
step, no framework, no backend.

## Structure

```
index.html          Home page — overall stats, analysis table, report cards
report.html          Single report — Summary / Editors / Insight / Scoring / Appendix tabs
editor.html           Single editor's profile, scoped to one report
css/style.css         Shared stylesheet
js/common.js           Shared helpers + navbar/footer injection
js/index.js              Drives index.html
js/report.js             Drives report.html
js/editor.js              Drives editor.html
reports/index.json   Manifest — list of all reports (hand-maintained)
reports/*.json         Individual report files (neutrality_check.py output)
```

## Adding a new report

1. Drop the new report JSON file into `reports/`.
2. Open `reports/index.json` and add one entry to the `reports` array:

```json
{
  "id": "neutrality_SomeArticle_20260701_120000_enriched",
  "file": "reports/neutrality_SomeArticle_20260701_120000_enriched.json",
  "title": "Some Article",
  "source_url": "https://en.wikipedia.org/wiki/Some_Article",
  "latest_rev_timestamp": "2026-07-01T12:00:00Z",
  "total_detections": 8,
  "severe_count": 3,
  "moderate_count": 4,
  "minor_count": 1,
  "final_score": 6.4,
  "report_score": 10.0,
  "editor_count": 4,
  "editors": ["EditorOne", "EditorTwo", "EditorThree", "EditorFour"]
}
```

These summary fields (total_detections, severe_count, final_score, editors,
etc.) drive the home page table and cards without needing to fetch every
report file up front — pull them straight from the report's own `summary`,
`composite_score`, and `detections[]` fields when writing the entry.

3. Commit and push. No build step required.

## Deploying to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **New Project** → import the repo.
3. Framework preset: **Other** (or "No Framework").
4. Build command: leave empty.
5. Output directory: `.` (repository root).
6. Deploy.

Every new report only requires steps 1–3 above ("Adding a new report") and
a new commit — no redeploy configuration changes needed.

## Notes on scoring

- The **final score** shown everywhere (Summary tab, Scoring tab, editor
  page, home page table/cards) is always computed live from the
  detections: highest single detection score + 0.25 × every other
  detection in the same scope, capped at 10. The `composite_score` block
  in the report JSON (if present) is not used for this — it's informational
  pipeline metadata only.
- On the report's Scoring tab, the "Highest Scoring Hit" callout shows
  every detection tied for the top score, not just one — ties happen
  often since scores are integers on a 1–10 scale.
- The editor page's "Composite Score" uses the same formula, scoped to
  just that editor's own detections within the report.

## Known limitation

Some `rebuttal_source_url` values in pipeline output may be Gemini
grounding-redirect URLs (`vertexaisearch.cloud.google.com/...`) rather than
stable public links. These still render correctly as the cited source link
in the Appendix, but may not resolve indefinitely — worth revisiting in the
pipeline if long-term link stability matters.
