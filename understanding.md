# Codebase understanding

Reviewed on 2026-11-12 against the repository's source, bundled data, generators, tests, and deployment configuration. This document describes the implementation as inspected; textual attribution and scholarly claims in the project metadata are not independent scholarly verification.

## Purpose and architecture

The **Patañjali Yoga Sūtra Knowledge Atlas** is a static study application combining a Sanskrit passage library, linguistic analysis, attributed commentary, English translation, curated concepts, and an interactive knowledge graph.

The browser application uses plain HTML, CSS, and JavaScript ES modules. There is no frontend framework, bundler, package dependency, database, authentication service, or application API in this repository. Python is used offline to generate the committed JSON data. Node.js supplies tests, validation, static packaging, and a small local HTTP server.

```text
Bundled source snapshots
  ├─ GRETIL XML + SanskritDocuments HTML + Johnston TXT
  │    └─ scripts/build_corpus.py
  │         ├─ data/corpus.json
  │         └─ data/source-audit.json
  └─ Four Vyāsa-bhāṣya HTML snapshots
       └─ scripts/build_sanskrit_commentary.py
            └─ data/sanskrit-commentary.json

data/corpus.json + scripts/sutra_readings.py + bilingual gloss/compound tables
  └─ scripts/build_word_analysis.py
       └─ data/word-analysis.json

Five application JSON files, including curated data/concepts.json
  ├─ app.js → passage/concept reader, search, graph data, export
  └─ npm run build → validate JSON → copy 10 static files to dist/
```

The generators read local snapshots; they do not download sources. This corrects the ambiguous README sentence saying the corpus is generated “not [from] the bundled source files.” Refreshing those snapshots is a separate operation.

## Repository map

| Path | Responsibility |
| --- | --- |
| `index.html` | Page structure, controls, reader container, initial theme application, module entry point. |
| `app.js` | JSON loading, in-memory indexes, DOM rendering, navigation, search, themes, graph construction, JSON export. |
| `styles.css` | Light/dark variables, graph and reading-room layout, responsive rules, Sanskrit font fallbacks. Fonts are named locally rather than bundled or downloaded by this stylesheet. |
| `lib/graph3d.js` | Custom perspective renderer using Canvas 2D, layouts, hit testing, rotation, zoom, and keyboard selection. |
| `lib/iast.js` | Browser-side IAST-to-Devanāgarī conversion. |
| `lib/transliterate.py` | Python transliteration in both directions and witness-comparison normalization. |
| `scripts/build_corpus.py` | Source parsing, Book III renumbering, translation extraction, corpus and audit generation. |
| `scripts/lexicon.py` | Stems, seven-case/three-number paradigms, irregular forms, verbs, indeclinables, compounds, and join rules. |
| `scripts/sanskrit_editorial.py` | Sanskrit glosses, contextual grammar corrections, compound corrections, six fallback explanations, and reviewed sandhi. |
| `scripts/sutra_readings.py` | Explicit sandhi-resolved padas, lexical assignments, and simple Sanskrit/English meanings for all 196 passages. |
| `scripts/reading_glosses.py`, `scripts/reading_compounds.py` | Additional bilingual lexical glosses and explicit syntactic compound expansions. |
| `scripts/reading_sandhi.py` | Bounded forward sandhi rules checking recomposition of recorded external word boundaries against IAST. |
| `scripts/build_word_analysis.py` | Generates the explicit editorial reading layer, morphological alternatives, and sandhi events. Retains legacy segmentation helpers for reference/tests. |
| `scripts/build_sanskrit_commentary.py` | BeautifulSoup extraction and numbering alignment of commentary snapshots. |
| `scripts/validate-data.mjs` | Structural and coverage checks required by the build. |
| `scripts/build-static.mjs` | Deletes/recreates `dist/` and copies an explicit asset list. No compilation or data regeneration. |
| `test/` | Transliteration examples and targeted commentary/linguistic regression checks. |
| `server.mjs` | Local static HTTP server rooted at the repository directory. |
| `Dockerfile`, `compose.yaml`, `vercel.json` | Container and static hosting configuration. |
| `SKILL.md` | Reusable atlas-building guidance; broader than the current implementation and not executable application code. |

`dist/` is ignored generated output. `data/sources/gretil-patanjali-yogasutra.html` is bundled, but the corpus generator reads the XML snapshot instead.

## Data contracts and measured coverage

| File | Shape and meaning |
| --- | --- |
| `data/corpus.json` | `{ edition, passages }`; edition includes chapter/source metadata. Each passage has `id`, `reference`, `chapter`, `chapterId`, `verse`, `devanagari`, `iast`, and an attributed `translation` object. |
| `data/concepts.json` | Array of curated concepts with stable `id`, names/scripts, definition in `meaning`, passage ranges, related IDs, and a Wikipedia URL. |
| `data/word-analysis.json` | `{ generated, passages, editorialNote, stats }`; passages are keyed by reference and contain tokens, reviewed sandhi, and optional fallback Sanskrit meaning. |
| `data/source-audit.json` | Source snapshot hashes, recorded dates, numbering decisions, witness comparison, translation coverage, and superseded-draft audit. |
| `data/sanskrit-commentary.json` | Commentary metadata and source hashes, with attributed entries keyed by atlas reference. Entries retain source reference, source sūtra, text, and URL. |

Measured from the bundled JSON:

- **196 passages**, divided as 51 / 55 / 56 / 34 across four pādas.
- **26 concepts**.
- **195 nonempty Johnston translations**; only atlas `3.22` has none.
- **190 commentary entries**. References `1.6`, `1.44`–`1.47`, and `3.22` use explicitly editorial Sanskrit summaries from the word analysis instead.
- **1,234 lexical entries**, all with explicit lexical assignments and Sanskrit/English meanings. They carry `confidence: "editorial"`; this is an editorial provenance label, not independent scholarly verification.
- **319 compound occurrences with syntactic expansions**; no tentative automatic splits in generated readings. **216 external boundary events** across 133 passages, plus **22 separately edited sandhi examples** across 17 passages.

These are counts of records and flags, not a certification of linguistic accuracy. The stale hardcoded 1,206-word hero count has been replaced with a description of the reading features.

Passage identity distinguishes an internal ID such as `ys-1-01` from a displayed/data lookup reference such as `1.1`. Analysis and commentary use the latter. Concept ranges such as `1.1-1.4` expand within one chapter; the current range helpers do not implement cross-chapter ranges.

## Source handling and numbering

The two displayed Sanskrit scripts preserve separate witness readings: Devanāgarī comes from SanskritDocuments, while IAST comes from GRETIL. The IAST line is therefore not necessarily an exact transliteration of the displayed Devanāgarī at variant passages. Word analysis is generated from the GRETIL-based IAST.

The corpus builder strips selected Vedic accents and parenthesized alternatives from the SanskritDocuments extraction. It compares transliterated readings after normalization of spaces, punctuation/separators, avagraha, and specified nasal spellings. The recorded **189/195 agreement** means equality under this normalization, not byte-identical source text. The six differing references are `1.26`, `1.35`, `2.35`, `2.42`, `3.36`, and `4.25`.

Both main Sanskrit snapshots have 55 numbered Book III entries. The builder shifts their references `3.22`–`3.55` to atlas `3.23`–`3.56`, then inserts hardcoded Sanskrit readings for atlas `3.22`. The metadata attributes this addition to the Vyāsa-bhāṣya tradition; it is not established by agreement of the two main snapshots. Commentary source Book III follows the same shift and provides no separate entry for atlas `3.22`.

The Johnston parser also increments Book III numbers starting at 22. Its source has an unpunctuated `34 By ...` entry, which the extraction regex accepts. The audit describes items 35–55 as mapping to atlas 35–56; that wording is imprecise. The implemented numeric mapping is **source 22–55 → atlas 23–56**, including source 34 → atlas 35. Keep this distinction when modifying alignment.

The source audit's `retrieved` values are assigned from the generation date rather than measured downloads. Its superseded-draft comparison also depends on the optional external file `/tmp/draft-corpus.json`; that historical audit cannot be assumed reproducible from the repository alone. Commentary retrieval metadata is hardcoded separately.

The repository describes these sources as public-domain/open material and calls the Sanskrit witnesses independent. This inspection verified the bundled bytes against their hashes, not licensing, manuscript independence, live source pages, or historical attribution.

## Linguistic generation

`build_word_analysis.py` now generates reader content from explicit records in `sutra_readings.py`. Every record supplies whole inflected padas before external sandhi, explicitly assigned lexical stems or verbal roots, and simple Sanskrit/English passage meanings. It does not use the retained recursive segmenter to generate displayed word readings.

Compound components are `compound-member` records in lexical form, without invented individual case endings. All listed compounds have Sanskrit syntactic expansions and English meanings. Existing named types are retained where supplied; new expansions do not infer formal subtypes from component lists. There are no automatic candidates in generated output.

The generator applies bilingual glosses and reference/form-specific grammar overrides. Nominal alternatives are taken only from exact pre-sandhi forms with the recorded lemma, and labelled `grammarTentative` unless context is assigned. Forward composition verifies that the padas can reproduce IAST under witness normalization and records the external boundary rules used. Separate edited sandhi examples remain in the editorial table. This is not an exhaustive derivation of internal sound changes or proof of compound semantics.

Keep editorial corrections in the Python source tables so regeneration preserves them. Complete record coverage and successful recomposition do not prove complete scholarly accuracy of morphology, meanings, or interpretations.

The JavaScript and Python transliterators are separate implementations. Changes to one do not automatically update the other, so shared edge cases need explicit review.

## Browser behavior

`app.js` fetches all five JSON files concurrently using absolute `/data/...` URLs. Initialization waits for all five and then creates passage maps, concept/range maps, and a lemma concordance. The app expects HTTP hosting at the origin root; directly opening `index.html` or placing the site under a URL subdirectory is not supported by the current asset paths.

The main views are the sūtra library, concept index, and source audit. A selected passage opens a reader with meaning, words, sandhi, compounds, and sources. Simple Sanskrit/English passage meanings and word meanings are directly visible. Attributed commentary and Johnston's translation are expandable supplements. Compound expansions appear with their words and in the Sandhi and Samāsa views. The script control changes which script is prominent in the reader; both scripts remain displayed, and library cards always render both.

Search runs on input. It normalizes case and combining diacritics, accepts Devanāgarī reference digits, and checks passage text, translations, exact normalized lemma keys, and related concept text. Valid exact references open the passage immediately and reset the library chapter filter. General searches filter results; there is no dedicated Enter-to-open-result handler. The lemma concordance is based on generated analyses rather than exact source-form identity, and the word reader shows at most 12 other references per entry.

Passages use `#1.2`-style URLs and concepts use `#concept-yoga`. Initial hashes and `hashchange` restore recognized selections. Normal selection uses `history.replaceState`, so each selection does not create a separate browser history entry. `openPassage` updates the reader and selected card, but does not scroll the matching library card into view. Graph and library chapter filters are independent.

Theme and script preferences use `localStorage` keys `patanjali-atlas-theme` and `patanjali-atlas-script`. System theme follows OS changes. The initial theme is applied before the stylesheet; the graph refreshes its CSS-derived colors when the theme changes. There are no user notes or bookmarks in the current application.

Desktop CSS uses an approximately 1.62:1 library/reader split with a sticky reader. At widths of 980px or less it becomes one column with the reader below the atlas panel, not an overlay.

## Graph and export

`buildGraphData()` constructs **227 nodes**: one text, four chapters, 196 passages, and 26 concepts. Edges carry `relationship` and `basis`: text → chapter `organizes`, chapter → passage `contains`, passage → concept `attests`, and concept → concept `relatedTo`. Concept associations are editorial. There are no word/lemma graph nodes or graph database.

Each concept is assigned to the chapter containing the largest number of its linked passages, with ties choosing the first chapter. Graph chapter filtering uses this single assignment, so a cross-chapter concept may disappear when another chapter it discusses is selected. Related edges are emitted as listed, without reciprocal deduplication.

`Graph3D` performs rotations and perspective projection on Canvas 2D, with sphere (default), chakra, and spiral layouts. It supports dragging, wheel zoom, arrow-key rotation, `+`/`-` zoom, Enter/Space cycling, and O opening the selected node. Reduced-motion preference disables automatic rotation at initialization; the animation frame loop still runs. The jump control lists concepts and chapters, while the library provides access to all passages.

Export downloads `patanjali-yoga-sutra-atlas.json` containing `corpus`, `concepts`, `wordAnalysis`, generated `graph`, and `sourceAudit`. **The loaded commentary object is omitted**, so this export is not a complete copy of all reader content.

## Running, building, and deployment

Node.js **22+** is declared in `package.json`. Python 3 is also needed by the analysis regression test. Only commentary regeneration imports the third-party Python package `beautifulsoup4`; there is no Python dependency manifest in this repository.

```sh
npm test
npm run build
npm start
```

`npm start` serves the repository root at `0.0.0.0:8080`; `PORT` changes the port. It serves existing files with a small MIME map, `nosniff`, and `no-cache`, rejects paths resolved outside its root, and returns errors for missing files/directories. It does not serve `dist/` as its document root, and has no hidden-file denylist or authentication. Do not assume it exposes only the production build's asset allowlist.

`npm run build` validates existing JSON and copies exactly ten files into `dist/`: HTML, CSS, app JS, two browser library modules, and five JSON files. It does not run Python generators, tests, source downloads, or transpilation. Source snapshots and Python code are excluded from this static output.

For data regeneration, run these in order after intentionally updating local snapshots or editorial tables:

```sh
python3 scripts/build_corpus.py
python3 scripts/build_word_analysis.py
python3 scripts/build_sanskrit_commentary.py
npm test
npm run build
```

The multi-stage Dockerfile builds with Node 22 Alpine and runs `server.mjs` as the non-root `node` user with an HTTP health check. The runtime copies the entire build-stage `/app`, including source data and `dist/`; it still serves `/app`, not `/app/dist`. Compose publishes to host loopback at `127.0.0.1:${ATLAS_PORT:-8080}`. Vercel instead uses the explicit `@vercel/static-build` configuration and serves `dist/`, without an application server or function.

## Validation and remaining limits

Checks performed during this review:

- `npm test` passed for four test files (15 cases) on Node v22.22.0 and Python 3.11.7. The reading tests cover all-passage content rendering with a DOM fixture, bilingual coverage, false splits, source recomposition, and regeneration. This fixture does not check real browser layout or navigation.
- `npm run build` passed: 196 passages, 26 concepts, 1,234 lexical entries, recorded witness agreement 189/195, and ten packaged files.
- All seven recorded source hashes matched the corresponding bundled snapshots.
- Regeneration in a temporary directory reproduced `corpus.json` and `sanskrit-commentary.json` as equal parsed JSON objects, and recomputed the stored witness-comparison and Johnston-coverage results. The original data files were preserved.
- Before the reading-layer correction, word-analysis regeneration varied in three automatic annotations. The explicit replacement now reproduces identical bytes under the two Python hash seeds tested; legacy candidate ordering was also stabilized.

The build validator checks chapter counts, sequential numbers, script/translation coverage, recorded witness agreement, analysis presence, source/analysis freshness, padaccheda/token consistency, bilingual meanings, compound expansion coverage, and concept references. Tests additionally check source recomposition and deterministic regeneration. These checks do not independently establish grammar or semantic accuracy, validate browser navigation, or verify every metadata claim.

Additional implementation limits visible in source: initial JSON loading has no surrounding error handler, and the `#load-error` container is never populated; graph labels include sizes below 12px; the broader features prescribed in `SKILL.md` are not all implemented. Browser QA was attempted for the reading changes, but the browser access host was unavailable. Docker and deployment were not run. Primary Sanskrit Heritage reading guidance and source transcription pages were consulted online; this was not an independent scholarly review.

## Guidance for future changes

- Change browser behavior in `app.js`, graph mechanics in `lib/graph3d.js`, and layout/theme rules in `styles.css`.
- Change reproducible grammar and explanatory content in `scripts/lexicon.py` or `scripts/sanskrit_editorial.py`, then regenerate analysis.
- Treat changes to source readings or Book III alignment as coordinated corpus, analysis, commentary, audit, and regression-test changes.
- Keep stable IDs and distinguish source numbering from atlas numbering. Preserve the deliberate missing Johnston translation at `3.22`.
- If adding a runtime asset, update the explicit static-copy list and, where necessary, Docker copies. Verify the packaged `dist/` output as well as local root serving.
- Derive displayed totals from data when changing coverage, and preserve uncertainty and attribution rather than treating successful structural checks as scholarly certification.
