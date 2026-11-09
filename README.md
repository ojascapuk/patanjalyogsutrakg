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
- **Word-level grammar**: 1,206 analyzed word entries — lemma, meaning,
  case/number/gender in English and Sanskrit, external sandhi notes, and
  samāsa-vigraha for compounds (curated for notable compounds, derived
  elsewhere and marked as such).
- **Searchable, hyperlinked everything**: search accepts references (`1.2`,
  `१.२`), IAST with or without diacritics, Devanāgarī, translation words,
  concept names, and lemmas; concept/reference chips and source links navigate
  directly to passages.

## Run locally

Requires Node.js 22+.

```sh
npm run build   # validate data
npm test        # unit tests (transliteration + corpus agreement)
npm start
```

Open <http://localhost:8080> (or `PORT=4173 npm start` if 8080 is busy).

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
