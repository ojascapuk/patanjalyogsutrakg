#!/usr/bin/env python3
"""Build the canonical Yoga Sutra corpus from public-domain internet sources.

Sources:
  1. GRETIL TEI XML (IAST samhita)          data/sources/gretil-patanjali-yogasutra.xml
  2. SanskritDocuments.org (Devanagari)     data/sources/sanskritdocuments-yogasutra.html
  3. Charles Johnston translation (PG#2526) data/sources/johnston-yogasutras.txt

Writes data/corpus.json and data/source-audit.json.
"""

import datetime
import hashlib
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from transliterate import (
    DEVA_DIGITS,
    devanagari_to_iast,
    norm_for_compare,
    strip_vedic_accents,
)

ROOT = Path(__file__).resolve().parent.parent
EXPECTED = {1: 51, 2: 55, 3: 56, 4: 34}

# Canonical saṃhitā for YS 3.22, omitted from both GRETIL and
# SanskritDocuments saṃhitā texts (both use 55-sūtra vibhūti-pāda
# numbering). Attested in the Vyāsa-bhāṣya manuscript tradition and in
# Woods (1914). Included so the atlas keeps the common 4-pāda count of
# 51 / 55 / 56 / 34.
YS_3_22_IAST = "etena śabdādyantardhānam uktam"
YS_3_22_DEVA = "एतेन शब्दाद्यन्तर्धानमुक्तम्"

SOURCES = [
    {
        "name": "GRETIL — Göttingen Register of Electronic Texts in Indian Languages",
        "detail": "Patañjali: Yogasūtra (TEI XML, IAST saṃhitā)",
        "url": "https://gretil.sub.uni-goettingen.de/gretil/corpustei/sa_pataJjali-yogasUtra.xml",
        "file": "data/sources/gretil-patanjali-yogasutra.xml",
        "role": "IAST saṃhitā witness",
    },
    {
        "name": "SanskritDocuments.org",
        "detail": "पातञ्जलयोगसूत्राणि (Devanagari saṃhitā, Vedic accents stripped for display)",
        "url": "https://sanskritdocuments.org/doc_yoga/yogasuutra.html",
        "file": "data/sources/sanskritdocuments-yogasutra.html",
        "role": "Devanagari witness",
    },
    {
        "name": "Project Gutenberg #2526",
        "detail": "Charles Johnston, “The Yoga Sutras of Patanjali: The Book of the Spiritual Man” (1912, public domain)",
        "url": "https://www.gutenberg.org/ebooks/2526",
        "file": "data/sources/johnston-yogasutras.txt",
        "role": "English interpretation (public domain)",
    },
]


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def parse_gretil():
    text = (ROOT / "data/sources/gretil-patanjali-yogasutra.xml").read_text(encoding="utf-8")
    out = {}
    for m in re.finditer(r"<l>(.+?)\|\|\s*YS_(\d+)\.(\d+)\s*\|\|</l>", text, re.S):
        out[(int(m.group(2)), int(m.group(3)))] = re.sub(r"\s+", " ", m.group(1)).strip()
    return out


def parse_sanskritdocuments():
    raw = (ROOT / "data/sources/sanskritdocuments-yogasutra.html").read_text(
        encoding="utf-8", errors="replace"
    )
    text = re.sub(r"<[^>]+>", " ", raw)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text)
    text = strip_vedic_accents(text)
    pattern = re.compile(r"([^॥]+?)॥\s*([०-९]+)\.([०-९]+)॥")
    out = {}
    for m in pattern.finditer(text):
        chapter = int(m.group(2).translate(DEVA_DIGITS))
        verse = int(m.group(3).translate(DEVA_DIGITS))
        body = re.sub(r"\([^)]*\)", " ", m.group(1))  # drop parenthesized alternate readings
        body = re.sub(r"[०-९]", "", body).strip()
        body = re.sub(r"\s+", " ", body)
        if chapter in EXPECTED and 1 <= verse <= EXPECTED[chapter]:
            out.setdefault((chapter, verse), body)
    return out


def renumber_ch3(mapping):
    """Shift chapter-3 refs 22..55 up by one; caller inserts 3.22."""
    out = {}
    for (chapter, verse), value in mapping.items():
        if chapter == 3 and verse >= 22:
            out[(chapter, verse + 1)] = value
        else:
            out[(chapter, verse)] = value
    return out


def parse_johnston():
    lines = (ROOT / "data/sources/johnston-yogasutras.txt").read_text(encoding="utf-8").splitlines()
    book_starts = [
        (i, {"I": 1, "II": 2, "III": 3, "IV": 4}[m.group(1)])
        for i, line in enumerate(lines)
        if (m := re.fullmatch(r"BOOK ([IVX]+)", line.strip()))
    ]
    book_starts = book_starts[4:]  # skip the table of contents
    out = {}
    for bi, (start, chapter) in enumerate(book_starts):
        end = book_starts[bi + 1][0] if bi + 1 < len(book_starts) else len(lines)
        end = min(end, next((j for j in range(start, end) if lines[j].startswith("*** END OF")), end))
        entries = []
        for j in range(start, end):
            m = re.match(r"^(\d+)[\.\s]\s*(.*)$", lines[j])
            if m and (chapter != 3 or int(m.group(1)) != 34 or True):
                entries.append((j, int(m.group(1))))
        for k, (line_no, number) in enumerate(entries):
            next_line = entries[k + 1][0] if k + 1 < len(entries) else end
            block = []
            for line in lines[line_no:next_line]:
                if not line.strip():
                    break
                block.append(line)
            text = " ".join(x.strip() for x in block)
            text = re.sub(r"^\d+[\.\s]\s*", "", text).strip()
            # Book III crosswalk: Johnston omits 3.22 (etena śabdādi...);
            # his 22–33 are standard 23–34, and his 35–55 are standard 35–56.
            if chapter == 3 and number >= 22:
                number += 1
            out[(chapter, number)] = text
    # Book II item 5 was typeset as "5 " without a period; regex above accepts it.
    return out


def main():
    gretil = parse_gretil()
    sd = parse_sanskritdocuments()
    johnston = parse_johnston()

    gretil = renumber_ch3(gretil)
    sd = renumber_ch3(sd)
    gretil[(3, 22)] = YS_3_22_IAST
    sd[(3, 22)] = YS_3_22_DEVA

    audit = {
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sources": [
            {**s, "sha256": sha256(ROOT / s["file"]), "retrieved": datetime.date.today().isoformat()}
            for s in SOURCES
        ],
        "numbering": {
            "scheme": "Four pādas: 51 / 55 / 56 / 34 = 196 sūtras (as in Woods 1914 and most commentarial editions).",
            "note": (
                "YS 3.22 (etena śabdādyantardhānam uktam) is omitted by both the GRETIL and "
                "SanskritDocuments saṃhitā texts, which number vibhūti-pāda 1–55. Their 3.22–3.55 "
                "correspond to 3.23–3.56 here. YS 3.22 is included from the Vyāsa-bhāṣya tradition."
            ),
            "johnstonBook3": "Johnston omits 3.22; his Book III items 22–33 map to 3.23–3.34 and items 35–55 map to 3.35–3.56.",
        },
        "checks": {},
    }

    # Cross-check GRETIL vs SanskritDocuments letters
    mismatches = []
    matches = 0
    for chapter, count in EXPECTED.items():
        for verse in range(1, count + 1):
            ref = (chapter, verse)
            if ref == (3, 22):
                continue
            g = norm_for_compare(gretil[ref])
            d = norm_for_compare(devanagari_to_iast(sd[ref]))
            if g == d:
                matches += 1
            else:
                mismatches.append(f"{chapter}.{verse}")
    variant_details = {
        "1.26": "SanskritDocuments prefixes sa (pūrveṣām…); GRETIL omits it",
        "1.35": "GRETIL sthitinibandhanī; SanskritDocuments sthitinibandhinī",
        "2.35": "GRETIL tatsaṃnidhau; SanskritDocuments tatsannidhau",
        "2.42": "GRETIL anuttamaḥ sukhalābhaḥ; SanskritDocuments anuttama-sukhalābhaḥ (compound)",
        "3.36": "GRETIL parārthāt; SanskritDocuments parārthatvāt",
        "4.25": "GRETIL bhāvanānivṛttiḥ; SanskritDocuments bhāvanāvinivṛttiḥ",
    }
    audit["checks"]["gretilVsSanskritDocuments"] = {
        "method": "Devanagari transliterated to IAST; compared ignoring spaces, daṇḍas, avagraha, and anusvara/homorganic-nasal spelling conventions.",
        "matched": matches,
        "mismatched": len(mismatches),
        "mismatches": mismatches,
        "genuineReadingVariants": {k: v for k, v in variant_details.items() if k in mismatches},
    }

    # Compare previous draft transcription (letters only) for the audit trail
    old_path = Path("/tmp/draft-corpus.json")
    draft_diffs = []
    if old_path.exists():
        old = json.loads(old_path.read_text(encoding="utf-8"))
        if "passages" in old and old["passages"] and "sourceForm" in old["passages"][0]:
            for p in old["passages"]:
                chapter, verse = p["chapter"], p["verse"]
                canonical = norm_for_compare(gretil[(chapter, verse)])
                draft = norm_for_compare(p["sourceForm"])
                if draft != canonical:
                    draft_diffs.append(p["reference"])
    audit["checks"]["supersededDraftTranscription"] = {
        "note": (
            "An earlier draft of this corpus used a word-separated transcription keyed to a modern "
            "copyrighted edition. It has been superseded by the public-domain canonical text above. "
            "Letter-level differences (mostly external sandhi and compound spacing) are listed only "
            "as an audit trail; the modern edition is not used by the atlas."
        ),
        "differingPassages": draft_diffs,
    }

    passages = []
    missing_translation = []
    for chapter, count in EXPECTED.items():
        for verse in range(1, count + 1):
            ref = (chapter, verse)
            translation = johnston.get(ref)
            if not translation:
                missing_translation.append(f"{chapter}.{verse}")
            passages.append(
                {
                    "id": f"ys-{chapter}-{verse:02d}",
                    "reference": f"{chapter}.{verse}",
                    "chapter": chapter,
                    "chapterId": ["samadhi-pada", "sadhana-pada", "vibhuti-pada", "kaivalya-pada"][chapter - 1],
                    "verse": verse,
                    "devanagari": sd[ref],
                    "iast": gretil[ref],
                    "translation": {
                        "text": translation or "",
                        "author": "Charles Johnston",
                        "work": "The Yoga Sutras of Patanjali: The Book of the Spiritual Man",
                        "year": 1912,
                        "license": "Public domain (Project Gutenberg #2526)",
                    },
                }
            )
    audit["checks"]["johnstonCoverage"] = {
        "translated": len(passages) - len(missing_translation),
        "missing": missing_translation,
    }

    corpus = {
        "edition": {
            "title": "Yoga Sūtras of Patañjali",
            "author": "Patañjali",
            "scope": "Four pādas; 196 sūtras (51 / 55 / 56 / 34).",
            "languages": {"primary": "sa-Deva", "secondary": "sa-Latn (IAST)", "translation": "en"},
            "sources": SOURCES,
            "editorialNote": (
                "Devanāgarī and IAST saṃhitā follow the public-domain GRETIL and "
                "SanskritDocuments witnesses, cross-checked letter-by-letter. The English rendering "
                "is Charles Johnston's 1912 public-domain interpretation. See the Sources view for "
                "links, hashes, and the numbering note for YS 3.22."
            ),
            "chapters": [
                {
                    "number": n,
                    "id": slug,
                    "name": name,
                    "devanagari": deva,
                    "passageCount": EXPECTED[n],
                }
                for n, (slug, name, deva) in enumerate(
                    [
                        ("samadhi-pada", "Samādhi Pāda", "समाधिपाद"),
                        ("sadhana-pada", "Sādhana Pāda", "साधनपाद"),
                        ("vibhuti-pada", "Vibhūti Pāda", "विभूतिपाद"),
                        ("kaivalya-pada", "Kaivalya Pāda", "कैवल्यपाद"),
                    ],
                    start=1,
                )
            ],
        },
        "passages": passages,
    }

    (ROOT / "data/corpus.json").write_text(
        json.dumps(corpus, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (ROOT / "data/source-audit.json").write_text(
        json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Wrote {len(passages)} passages.")
    print(
        "GRETIL vs SanskritDocuments: "
        f"{matches} matched, {len(mismatches)} mismatched {mismatches}"
    )
    print(f"Draft-vs-canonical letter differences: {len(draft_diffs)}")
    print(f"Johnston translations missing: {missing_translation}")


if __name__ == "__main__":
    main()
