# Patañjali Yoga Sūtra Knowledge Atlas

A 3D knowledge graph and grammar-rich reading atlas of the Patañjali Yoga
Sūtras — Devanāgarī-first, built from public-domain canonical sources verified
against each other over the internet.

## Features

- **3D knowledge graph** (chakra rings / sphere / spiral layouts) occupying the
  landing page: text, four pādas, 196 sūtra nodes, 26 curated concepts. Drag to
  rotate, scroll to zoom, click to open; keyboard-operable (Enter cycles nodes,
  O opens), with an accessible jump-to control.
- **Verified canonical text**: Devanāgarī from SanskritDocuments.org and IAST
  from GRETIL, compared letter-by-letter (189/195 sūtras identical; the six
  genuine reading variants are documented in the Sources view and per-passage).
- **Public-domain translation**: Charles Johnston, *The Yoga Sutras of
  Patanjali* (1912, Project Gutenberg #2526), aligned to the 196-sūtra
  numbering (Johnston's Book III crosswalk documented).
- **Word-level grammar**: lemma, meaning,
  case/number/gender in English and Sanskrit, external sandhi notes, and
  samāsa-vigraha for compounds (curated for notable compounds, derived
  elsewhere and marked as such). The reader presents Sanskrit first; English
  and IAST are expandable supplements.
- **Searchable, hyperlinked everything**: search accepts references (`1.2`,
  `१.२`), IAST with or without diacritics, Devanāgarī, translation words,
  concept names, and lemmas; concept/reference chips and source links navigate
  directly to passages.

## Run locally

Requires Node.js 22+. Analysis regression tests also use Python 3.

```sh
npm run build   # validate data and create the static site in dist/
npm test        # unit tests (transliteration + corpus agreement)
npm start
```

Open <http://localhost:8080> (or `PORT=4173 npm start` if 8080 is busy).

## Deploy on Vercel

Import the repository into Vercel. The committed `vercel.json` explicitly uses
`@vercel/static-build` with `distDir: "dist"`. Its `vercel-build` script runs
`npm run build`. This explicit builder list prevents the browser's `app.js`
from being deployed as a Node function. Vercel may warn that dashboard Build
and Development Settings are ignored when `builds` is present; that is expected.
For reference, the equivalent static-site settings are:

| Setting | Value |
| --- | --- |
| Framework Preset | Other |
| Root Directory | Repository root |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | Default (`npm install`) |
| Node.js Version | 22.x |

No environment variables or production start command are required. The build
copies only the browser assets and application JSON into `dist/`; Vercel serves
these files directly. `server.mjs` is for local development and Docker.

After changing an existing deployment, push these files and deploy the new
commit. Remove any dashboard routing overrides that send requests to a Node
function. In particular, use `dist` rather than the earlier `.` output setting.
A successful static deployment should have no application Functions output.
Redeploy the latest commit with the existing Build Cache disabled. If logs show
`loadJSON (file:///var/task/app.mjs)` or `Failed to parse URL from
/data/corpus.json`, the browser code is still being run as a function: confirm
the deployment uses the latest commit and the repository root containing this
`vercel.json`. Relative data URLs are intentional and run in the browser.

## Run with Docker

```sh
docker compose up --build -d
docker compose logs -f
docker compose down
```

Published on host loopback at <http://127.0.0.1:8080> (`ATLAS_PORT=8090` to
change). The container runs as the non-root `node` user and exposes an HTTP
health check.

## Rebuilding the corpus

The corpus is generated from public-domain sources, not the bundled source
files:

```sh
# 1. fetch sources (already vendored in data/sources/)
curl -o data/sources/gretil-patanjali-yogasutra.xml \
  'https://gretil.sub.uni-goettingen.de/gretil/corpustei/sa_pataJjali-yogasUtra.xml'
curl -A 'Mozilla/5.0' -o data/sources/sanskritdocuments-yogasutra.html \
  'https://sanskritdocuments.org/doc_yoga/yogasuutra.html'
curl -A 'Mozilla/5.0' -o data/sources/johnston-yogasutras.txt \
  'https://www.gutenberg.org/files/2526/2526-0.txt'

# 2. build corpus + audit, then word analysis
python3 scripts/build_corpus.py
python3 scripts/build_word_analysis.py
python3 scripts/build_sanskrit_commentary.py  # requires beautifulsoup4
npm run build
```

`data/source-audit.json` records source URLs, SHA-256 hashes, the comparison
method, the six genuine witness variants, the YS 3.22 numbering note, and the
audit trail against a superseded draft transcription.

## Sources

| Witness | Role | License |
| --- | --- | --- |
| [GRETIL](https://gretil.sub.uni-goettingen.de/gretil/corpustei/sa_pataJjali-yogasUtra.xml) | IAST saṃhitā | Academic open corpus |
| [SanskritDocuments.org](https://sanskritdocuments.org/doc_yoga/yogasuutra.html) | Devanāgarī saṃhitā | Freely distributable text |
| [Project Gutenberg #2526](https://www.gutenberg.org/ebooks/2526) | Johnston's English interpretation (1912) | Public domain |

Editorial limits: word-level grammar marked `derived` comes from a declension
lexicon + sandhi segmenter and should be verified against a commentary before
scholarly citation; `curated` entries were hand-assigned. No copyrighted
modern translation or commentary is reproduced.

## Sanskrit reader and analysis

The scrollable reader shows attributed **Vyāsa-bhāṣya** first, using classical
Sanskrit transcriptions from [The Vyasa](https://thevyasa.in/yoga/). The four
vendored HTML content snapshots and their SHA-256 hashes are recorded in
`data/sanskrit-commentary.json`. They are web transcriptions, not a critical
edition; transcription errors and edition variants remain possible. The
canonical sutra corpus is preserved separately.

190 commentary entries are aligned to the atlas. The source omits separate
commentary for 1.6, 1.44–1.47, and the atlas's additional 3.22; those six receive
explicitly labelled editorial Sanskrit summaries. Source Book III 22–55 maps
to atlas Book III 23–56. `scripts/build_sanskrit_commentary.py` reproduces the
extraction from the snapshots, using `beautifulsoup4`.

`scripts/sanskrit_editorial.py` holds Sanskrit lexical glosses, contextual
corrections, and explicit sandhi analyses. It survives regeneration of the
word-analysis JSON. Compound components no longer receive independently
invented case endings. Grammatical alternatives are retained when a form is
ambiguous; a context-specific correction overrides them. Automatic splits are
collapsed as tentative suggestions and are not labelled formal samāsa-vigraha.
Sandhi entries display edited boundary analyses; missing entries do not assert
that a sutra has no sandhi. Full scholarly review of all morphology and compound
relations has not been completed.
