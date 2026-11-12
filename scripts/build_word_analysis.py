#!/usr/bin/env python3
"""Generate explicit bilingual readings, padaccheda, stems, and vigrahas.

Legacy segmenter helpers remain available for regression/reference purposes;
main() never uses their guessed segmentations as reader content.
"""

import json
import re
import sys
from copy import deepcopy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from transliterate import iast_to_devanagari
from lexicon import (
    CASES_EN, CASES_SA, NUM_EN, NUM_SA, GENDER,
    PARADIGMS, STEMS, INDECL, VERBS, FORMS, COMPOUNDS, JOIN_RULES,
    SPECIAL_AVAGRAHA,
)
from sanskrit_editorial import MEANINGS_SA, COMPOUND_FIXES, COMPOUND_GRAMMAR, CONTEXT_GRAMMAR, SHORT_MEANINGS, SANDHI_CURATED
from sutra_readings import readings
from reading_glosses import GLOSSES
from reading_compounds import EXPANSIONS
from reading_sandhi import compose_to_source, joins

for key, (kind, vigraha, sanskrit) in COMPOUND_FIXES.items():
    COMPOUNDS[key].update(type=kind, type_en=kind.replace("-", " "), vigraha=vigraha, vigraha_sa=sanskrit)
for key, grammar in COMPOUND_GRAMMAR.items():
    COMPOUNDS[key]["grammar_sa"] = grammar

_NASAL_VARIANT_RE = [
    (re.compile(r"ṅ(?=[kg])"), "ṃ"), (re.compile(r"ñ(?=[cj])"), "ṃ"),
    (re.compile(r"ṇ(?=[ṭḍ])"), "ṃ"), (re.compile(r"n(?=[td])"), "ṃ"),
    (re.compile(r"m(?=[pb])"), "ṃ"),
]


def nasal_variant(form):
    """Homorganic nasal -> anusvara spelling variant (e.g. asaṅga ~ asaṃga)."""
    out = form
    for rx, rep in _NASAL_VARIANT_RE:
        out = rx.sub(rep, out)
    return out


def natva_variant(form):
    """n -> ṇ after r/ṛ/ṣ in the same word (ṇatva)."""
    m = re.search(r"[rṛṣ]", form)
    if not m:
        return None
    tail = form[m.end():]
    if "n" in tail:
        return form[: m.end()] + tail.replace("n", "ṇ", 1)
    return None

ROOT = Path(__file__).resolve().parent.parent

CASE_IDX = {name: i for i, name in enumerate(
    ["nom", "acc", "ins", "dat", "abl", "gen", "loc"])}


def grammar_text(case, num, gender):
    cis = [CASE_IDX[c] for c in case.split("/")]
    nis = [{"sg": 0, "du": 1, "pl": 2}[n] for n in num.split("/")]
    gender = gender or "m"
    if "/" in gender:
        g_en = "/".join(GENDER[x][0] for x in gender.split("/"))
        g_sa = "/".join(GENDER[x][1] for x in gender.split("/"))
    else:
        g_en, g_sa = GENDER[gender]
    num_en = {"sg": "singular", "du": "dual", "pl": "plural"}.get(num, num)
    en = f"{'/'.join(CASES_EN[c] for c in cis)} {num_en}, {g_en}"
    sa = f"{'/'.join(CASES_SA[c] for c in cis)}-विभक्तिः, {'/'.join(NUM_SA[n] for n in nis)}, {g_sa}"
    return en, sa


# Build inflected-form lookup: surface -> list of analyses
INFLECTED = {}


def add_form(surface, stem, meaning, case, num, gender, confidence="curated", pada=None):
    INFLECTED.setdefault(surface, []).append(
        {"lemma": stem, "meaning": meaning, "case": case, "num": num,
         "gender": gender, "kind": "nominal", "confidence": confidence,
         "pada": pada or surface})


def _surface_variants(form):
    """All common external-sandhi surface variants of a form, to fixpoint."""
    variants = {form}
    for _ in range(3):
        for v in list(variants):
            if v.endswith("ḥ"):
                for r in ("ś", "ṣ", "s", "r", ""):
                    variants.add(v[:-1] + r if r else v[:-1])
                if v.endswith("aḥ"):
                    variants.add(v[:-2] + "o")
            if v.endswith("t"):
                for r in ("d", "n", "l", "c", "j"):
                    variants.add(v[:-1] + r)
            if v.endswith("m"):
                variants.add(v[:-1] + "ṃ")
            if v.endswith(("u", "ū")):
                variants.add(v[:-1] + "v")
            if v.endswith(("i", "ī")):
                variants.add(v[:-1] + "y")
            for diph, glide in (("au", "āv"), ("ai", "āy"), ("e", "ay"), ("o", "av")):
                if v.endswith(diph):
                    variants.add(v[: -len(diph)] + glide)
            nv = nasal_variant(v)
            if nv != v:
                variants.add(nv)
            tv = natva_variant(v)
            if tv:
                variants.add(tv)
    return variants


def _add_with_variants(form, stem, meaning, case, num, gender, confidence="derived"):
    """Register a form plus all its common surface variants."""
    for v in sorted(_surface_variants(form)):
        add_form(v, stem, meaning, case, num, gender, confidence, pada=form)


for stem, entry in STEMS.items():
    if not entry or entry[2] is None:
        continue
    meaning, gender, decl = entry
    grid = PARADIGMS[decl]
    codes = ["nom", "acc", "ins", "dat", "abl", "gen", "loc"]
    for idx, suffix in enumerate(grid):
        case = codes[idx % 7]
        num = ["sg", "du", "pl"][idx // 7]
        base = stem[:-1] if decl != "an_m" else stem[:-2]  # drop stem-final vowel / 'an'
        _add_with_variants(base + suffix, stem, meaning, case, num, gender)

for form, entry in FORMS.items():
    if entry is None:
        continue
    lemma, meaning, g = entry
    if g is None:
        INDECL.setdefault(form, (meaning, "अव्ययम्"))
        continue
    _add_with_variants(form, lemma, meaning, g[0], g[1], g[2], "curated")

STEM_SET = {}
for stem, entry in STEMS.items():
    if entry:
        STEM_SET[stem] = entry

INDECL_SET = {f: v for f, v in INDECL.items() if v}

# Precomputed candidate sources, indexed by first letter for speed.
_SOURCES = []
for f, info in INDECL_SET.items():
    _SOURCES.append((f, {"lemma": f, "meaning": info[0], "kind": "indeclinable",
                         "grammar_sa": info[1], "grammar_en": "indeclinable (avyaya)",
                         "confidence": "curated", "indecl": True}))
for f, info in VERBS.items():
    _SOURCES.append((f, {"lemma": info["lemma"], "meaning": info["meaning"],
                         "kind": "verb", "grammar_en": info["en"], "grammar_sa": info["sa"],
                         "confidence": "curated"}))
for f, entries in INFLECTED.items():
    for e in entries:
        en, sa = grammar_text(e["case"], e["num"], e["gender"])
        _SOURCES.append((f, {"lemma": e["lemma"], "meaning": e["meaning"], "kind": "nominal",
                             "grammar_en": en, "grammar_sa": sa, "confidence": e["confidence"],
                             "inflected": True, "pada": e["pada"]}))
for st, entry in STEM_SET.items():
    meaning, gender, decl = entry
    info = {"lemma": st, "meaning": meaning, "kind": "stem",
            "grammar_en": "stem form (compound member)",
            "grammar_sa": "प्रातिपदिकम्, समास-पूर्वपदम्",
            "confidence": "derived", "stem": True}
    _SOURCES.append((st, info))
    nv = nasal_variant(st)
    if nv != st:
        _SOURCES.append((nv, info))

# Indeclinables: external sandhi surface variants.
for f, info in list(_SOURCES):
    if info.get("indecl"):
        for v in sorted(_surface_variants(f)):
            if v != f:
                _SOURCES.append((v, info))

_BY_INITIAL = {}
for _f, _info in _SOURCES:
    _BY_INITIAL.setdefault(_f[0], []).append((_f, _info))
for _k in _BY_INITIAL:
    _BY_INITIAL[_k].sort(key=lambda c: (-len(c[0]), c[0], json.dumps(c[1], sort_keys=True, ensure_ascii=False)))


def candidates_at(frag, ate_initial):
    cands = []
    pools = []
    if ate_initial:
        pools.append([(f, info, f[len(ate_initial):]) for f, info in _BY_INITIAL.get(ate_initial[0], [])
                      if f.startswith(ate_initial)])
    elif frag:
        pools.append([(f, info, f) for f, info in _BY_INITIAL.get(frag[0], [])])
    for pool in pools:
        for f, info, base in pool:
            if not base:
                continue
            if frag.startswith(base):
                cands.append((len(base), dict(info, pada=info.get("pada") or f)))
            for x, y, z in JOIN_RULES:
                if base.endswith(x) and base != x:
                    joined = base[: -len(x)] + z
                    if frag.startswith(joined):
                        cand = (len(joined), dict(info, pada=info.get("pada") or f,
                                                  _ate=y, _join=(x, y, z)))
                        if cand not in cands:
                            cands.append(cand)
    return cands


MEMO = {}


def segment(s, ate_initial=None):
    """Return list of pada dicts covering s, or None."""
    key = (s, ate_initial)
    if key in MEMO:
        return deepcopy(MEMO[key])
    if not s:
        return []
    for length, info in candidates_at(s, ate_initial):
        rest = s[length:]
        next_ate = info.get("_ate")
        join = info.get("_join")
        if not rest:
            if next_ate is None and (
                info.get("inflected") or info.get("kind") in ("indeclinable", "verb") or info.get("stem")
            ):
                MEMO[key] = [info]
                return deepcopy(MEMO[key])
            continue
        tail = segment(rest, next_ate)
        if tail is not None:
            if join and tail:
                tail[0]["_sandhi_with_previous"] = SANDHI_NAMES.get(join, "sandhi")
            MEMO[key] = [info] + deepcopy(tail)
            return deepcopy(MEMO[key])
    MEMO[key] = None
    return None


def pada_surface(token):
    """Restore pre-sandhi pada text for display (visarga restoration etc.)."""
    return token


SANDHI_NAMES = {
    ("a", "ā", "ā"): "savarṇadīrgha-sandhi (a + ā → ā)",
    ("ā", "a", "ā"): "savarṇadīrgha-sandhi (ā + a → ā)",
    ("a", "a", "ā"): "savarṇadīrgha-sandhi (a + a → ā)",
    ("ā", "ā", "ā"): "savarṇadīrgha-sandhi (ā + ā → ā)",
    ("a", "i", "e"): "guṇa-sandhi (a + i → e)",
    ("a", "ī", "e"): "guṇa-sandhi (a + ī → e)",
    ("ā", "i", "e"): "guṇa-sandhi (ā + i → e)",
    ("a", "u", "o"): "guṇa-sandhi (a + u → o)",
    ("a", "ū", "o"): "guṇa-sandhi (a + ū → o)",
    ("a", "ṛ", "ar"): "guṇa-sandhi (a + ṛ → ar)",
    ("ā", "ṛ", "ar"): "guṇa-sandhi (ā + ṛ → ar)",
    ("a", "e", "ai"): "vṛddhi-sandhi (a + e → ai)",
    ("a", "o", "au"): "vṛddhi-sandhi (a + o → au)",
    ("i", "a", "ya"): "yaṇ-sandhi (i + a → ya)",
    ("i", "ā", "ya"): "yaṇ-sandhi (i + ā → yā)",
    ("u", "a", "va"): "yaṇ-sandhi (u + a → va)",
    ("d", "j", "jj"): "consonant assimilation (d + j → jj)",
    ("t", "j", "jj"): "consonant assimilation (t + j → jj)",
    ("d", "n", "nn"): "consonant assimilation (d + n → nn)",
    ("t", "n", "nn"): "consonant assimilation (t + n → nn)",
    ("d", "d", "dd"): "consonant assimilation (d + d → dd)",
    ("t", "t", "tt"): "consonant assimilation (t + t → tt)",
    ("t", "c", "cc"): "consonant assimilation (t + c → cc)",
    ("d", "ch", "cch"): "consonant assimilation (d + ch → cch)",
    ("n", "n", "nn"): "consonant assimilation (n + n → nn)",
    ("s", "t", "st"): "consonant contact (s + t → st)",
    ("m", "m", "mm"): "consonant assimilation (m + m → mm)",
    ("t", "s", "ts"): "consonant contact (t + s → ts)",
    ("n", "ś", "ṃś"): "anusvāra-sandhi (n + ś → ṃś)",
}


def visarga_note(surface, joined):
    """Describe external sandhi when the surface differs only at the boundary."""
    if surface == joined:
        return None
    if surface == joined[:-1] and joined.endswith("ḥ"):
        return "visarga-sandhi: final ḥ elided before the following sound"
    if joined.endswith("ḥ") and surface[:-1] == joined[:-1]:
        rules = {
            "ś": "visarga-sandhi: final ḥ → ś before c/ch or ś",
            "ṣ": "visarga-sandhi: final ḥ → ṣ before ṭ/ṭh or ṣ",
            "s": "visarga-sandhi: final ḥ → s before t/th or s",
            "r": "visarga-sandhi: final ḥ → r before a voiced sound",
            "o": "visarga-sandhi: -aḥ → -o before a voiced consonant",
        }
        if surface[-1:] in rules:
            return rules[surface[-1:]]
    if joined.endswith(("au", "ai")) and surface[:-1] == joined[:-2] + joined[-2:-1]:
        return "vṛddhi-sandhi: diphthong vocalized before a vowel"
    return None  # compound-internal joins are annotated per word instead


def _norm_comp_key(s):
    s = re.sub(r"[’'\s-]", "", s).lower().replace("ṃ", "m")
    return s


_COMPOUND_LOOKUP = {_norm_comp_key(k): v for k, v in COMPOUNDS.items() if v}
_COMPOUND_LOOKUP.update({_norm_comp_key(k)[:-1] + "ḥ": v for k, v in COMPOUNDS.items()
                         if v and _norm_comp_key(k).endswith("o")})


def analyze_passage(iast):
    tokens = iast.split()
    out_tokens = []
    for raw in tokens:
        token = raw.strip(",")
        avagraha = token.startswith("'")
        clean = token.lstrip("'")
        # An initial avagraha marks an elided initial a- (after e/o) of this word.
        if avagraha and clean in SPECIAL_AVAGRAHA:
            clean = SPECIAL_AVAGRAHA[clean]
            avagraha = False
        parts = segment(clean, "a") if avagraha else segment(clean)
        if parts is None and avagraha:
            parts = segment(clean)
        token_entry = {"surface": token, "devanagari": iast_to_devanagari(token),
                       "avagraha": avagraha, "words": [], "sandhi": None}
        if parts is None:
            token_entry["words"] = [{
                "pada": clean, "devanagari": iast_to_devanagari(clean),
                "lemma": clean, "meaning": "not yet analyzed",
                "grammar_en": "", "grammar_sa": "", "confidence": "unanalyzed"}]
            token_entry["unresolved"] = True
        else:
            for w in parts:
                w["devanagari"] = iast_to_devanagari(w["pada"])
                if "_sandhi_with_previous" in w:
                    w["sandhiWithPrevious"] = w.pop("_sandhi_with_previous")
                w.pop("_ate", None)
                w.pop("_join", None)
            token_entry["words"] = parts
            joined = "".join(w["pada"] for w in parts)
            note = visarga_note(clean, joined)
            if note:
                token_entry["sandhi"] = {"joined": clean, "note": note}
        # compound analysis (tolerate external-sandhi surface endings)
        letters = re.sub(r"[’']", "", clean)

        def _comp_key(s):
            s = s.lower().replace("ṃ", "m")
            for a, b in (("o", "aḥ"), ("ś", "ḥ"), ("ṣ", "ḥ"), ("s", "ḥ"), ("r", "ḥ")):
                if s.endswith(a):
                    return s[: -len(a)] + b
            return s

        comp = COMPOUNDS.get(letters) or _COMPOUND_LOOKUP.get(_comp_key(letters))
        if comp:
            comp = dict(comp)
            comp.setdefault("confidence", "curated")
            comp["type_sa"] = iast_to_devanagari(comp["type"])
            comp["vigraha_devanagari"] = comp.get("vigraha_sa") or iast_to_devanagari(comp["vigraha"])
            token_entry["samasa"] = comp
            token_entry["grammar_sa"] = comp.get("grammar_sa", "")
            # Compound members are stems, not independently inflected words.
            # Keep the segmenter's candidates separately for editorial review.
            token_entry["automaticCandidates"] = token_entry["words"]
            token_entry["sandhi"] = None
            token_entry["words"] = []
            for part in comp["parts"]:
                stem = part if part in STEMS else next((w["lemma"] for w in parts or []
                                                        if w["pada"] == part), part)
                if stem == part and part not in STEMS:
                    stems = {e["lemma"] for e in INFLECTED.get(part, [])}
                    if len(stems) == 1:
                        stem = stems.pop()
                entry = STEMS.get(stem)
                token_entry["words"].append({"pada": part, "lemma": stem,
                    "devanagari": iast_to_devanagari(part),
                    "meaning": entry[0] if entry else "", "kind": "compound-member",
                    "grammar_sa": "समासावयवः; अस्य पृथक् सुप्प्रत्ययः न विवक्षितः।",
                    "grammar_en": "compound component; not an independently inflected word",
                    "confidence": "curated"})
        elif len(token_entry["words"]) > 1:
            token_entry["segmentationTentative"] = True
        out_tokens.append(token_entry)
    return out_tokens


def lexical_gloss(lemma):
    if lemma in GLOSSES:
        return GLOSSES[lemma]
    sa = MEANINGS_SA.get(lemma)
    entry = STEMS.get(lemma) or INDECL.get(lemma)
    en = entry[0] if entry else FORMS[lemma][1] if FORMS.get(lemma) else None
    assert sa and en, f"Missing bilingual gloss: {lemma}"
    return sa, en


def explicit_analysis(reference, reading):
    """Render recorded padas and lexical members, without guessing a split."""
    tokens = []
    for spec in reading["words"]:
        form, separator, lex = spec.partition(":")
        lemmas = (lex if separator else form).split("+")
        compound = len(lemmas) > 1
        token = {"surface": form, "devanagari": iast_to_devanagari(form),
                 "words": [], "analysisSource": "editorial-reading", "sandhi": None}
        for lemma in lemmas:
            sa, en = lexical_gloss(lemma)
            if lemma == "sattva" and reference in {"2.41", "3.36", "3.50", "3.56"}:
                sa, en = "बुद्धिसत्त्वम्; प्रकाशशीलम् अन्तःकरणम्।", "the luminous mind or intellect (sattva)"
            word = {"pada": lemma if compound else form, "lemma": lemma,
                    "devanagari": iast_to_devanagari(lemma if compound else form),
                    "meaning_sa": sa, "meaning": en, "confidence": "editorial",
                    "kind": "compound-member" if compound else "word"}
            if compound:
                word.update(grammar_sa="समासावयवः; पृथक् विभक्तिः न कल्पिता।",
                            grammar_en="lexical component of a compound; no independent case ending")
            elif lemma in ("as", "jan", "kṣi"):
                word["kind"] = "verb"
                word["root"] = lemma
                verb = VERBS.get(form)
                if verb:
                    word.update(grammar_sa=verb["sa"], grammar_en=verb["en"])
            elif form in INDECL and INDECL[form]:
                word.update(kind="indeclinable", grammar_sa=INDECL[form][1], grammar_en="indeclinable")
            else:
                # Only exact pre-sandhi forms for the explicitly recorded lemma.
                # Broad external-sandhi variants must not choose a morphology.
                alternatives = sorted({grammar_text(e["case"], e["num"], e["gender"])[1]
                    for e in INFLECTED.get(form, []) if e["lemma"] == lemma and e["pada"] == form})
                if alternatives:
                    word.update(grammar_sa=" अथवा ".join(alternatives), grammarTentative=True)
            contextual = CONTEXT_GRAMMAR.get((reference, form)) if not compound else None
            if contextual:
                word.update(grammar_sa=contextual, grammar_en="", contextReviewed=True)
                word.pop("grammarTentative", None)
            token["words"].append(word)
        if compound:
            comp = COMPOUNDS.get(form)
            if form in EXPANSIONS:
                vigraha_sa, vigraha_en = EXPANSIONS[form]
                token["samasa"] = {"confidence": "editorial", "type_sa": "अर्थानुसारः विग्रहः",
                    "vigraha_devanagari": vigraha_sa, "vigraha_en": vigraha_en,
                    "parts": lemmas, "basis": "explicit editorial syntactic expansion"}
            elif comp:
                comp = deepcopy(comp)
                comp.update(confidence="editorial", type_sa=iast_to_devanagari(comp["type"]),
                            parts=lemmas, vigraha_devanagari=comp.get("vigraha_sa") or iast_to_devanagari(comp["vigraha"]))
                token["samasa"] = comp
                token["grammar_sa"] = comp.get("grammar_sa", "")
            else:
                raise ValueError(f"Missing compound expansion: {reference}: {form}")
        tokens.append(token)
    padas = [t["surface"] for t in tokens]
    return {"tokens": tokens, "padaccheda": padas,
            "padaccheda_sa": " । ".join(iast_to_devanagari(p) for p in padas),
            "meaning_sa": reading["meaning_sa"], "meaning_en": reading["meaning_en"],
            "readingBasis": "corpus.iast; editorial padaccheda and lexical stems",
            "sandhiReviewed": [{"parts_sa": parts, "joined_sa": joined, "rule_sa": rule}
                for parts, joined, rule in SANDHI_CURATED.get(reference, [])]}


def main():
    corpus = json.loads((ROOT / "data/corpus.json").read_text(encoding="utf-8"))
    prepared = readings()
    assert set(prepared) == {p["reference"] for p in corpus["passages"]}, "Reading coverage mismatch"
    analysis = {"generated": "build_word_analysis.py", "passages": {},
                "editorialNote": "पदच्छेदः सरलार्थः पदार्थाश्च अध्ययनार्थं सम्पादिताः; प्रातिपदिकं पदरूपाद् भिन्नम्।",
                "provenance": {"kind": "editorial study analysis", "basis": "GRETIL IAST and bundled Vyāsa-bhāṣya; not a quotation or independent critical edition",
                    "files": ["scripts/sutra_readings.py", "scripts/reading_glosses.py", "scripts/reading_compounds.py", "scripts/reading_sandhi.py", "scripts/sanskrit_editorial.py"],
                    "references": ["https://sanskrit.uohyd.ac.in/SKT/faq.en.html", "https://sanskrit.uohyd.ac.in/SKT/manual.html"]}}
    total_words = 0
    curated = 0
    for p in corpus["passages"]:
        entry = explicit_analysis(p["reference"], prepared[p["reference"]])
        entry["sourceIast"] = p["iast"]
        boundary_rules = compose_to_source(entry["padaccheda"], p["iast"])
        entry["externalSandhi"] = []
        for rule in boundary_rules:
            joined = next(text for text, label in joins(rule["left"], rule["right"]) if label == rule["rule_sa"])
            entry["externalSandhi"].append({"parts_sa": " + ".join(iast_to_devanagari(rule[k]) for k in ("left", "right")),
                "joined_sa": iast_to_devanagari(joined), "parts": [rule["left"], rule["right"]],
                "joined": joined, "rule_sa": rule["rule_sa"]})
        analysis["passages"][p["reference"]] = entry
        tokens = entry["tokens"]
        for t in tokens:
            for w in t["words"]:
                total_words += 1
                if w.get("confidence") in ("curated", "editorial"):
                    curated += 1
    stats = {"tokensUnresolved": 0, "words": total_words, "curated": curated,
             "explicitReadings": len(prepared), "method": "explicit editorial readings; no automatic segmentation in output"}
    analysis["stats"] = stats
    (ROOT / "data/word-analysis.json").write_text(
        json.dumps(analysis, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
