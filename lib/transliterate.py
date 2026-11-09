"""Devanagari <-> IAST helpers used by the corpus builder."""

DEVA_VOWELS = {
    "अ": "a", "आ": "ā", "इ": "i", "ई": "ī", "उ": "u", "ऊ": "ū",
    "ऋ": "ṛ", "ॠ": "ṝ", "ऌ": "ḷ", "ॡ": "ḹ", "ए": "e", "ऐ": "ai",
    "ओ": "o", "औ": "au",
}
DEVA_MATRAS = {
    "ा": "ā", "ि": "i", "ी": "ī", "ु": "u", "ू": "ū", "ृ": "ṛ",
    "ॄ": "ṝ", "ॢ": "ḷ", "ॣ": "ḹ", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
}
DEVA_CONSONANTS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ṅ",
    "च": "c", "छ": "ch", "ज": "j", "झ": "jh", "ञ": "ñ",
    "ट": "ṭ", "ठ": "ṭh", "ड": "ḍ", "ढ": "ḍh", "ण": "ṇ",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v", "श": "ś",
    "ष": "ṣ", "स": "s", "ह": "h", "ळ": "ḻ",
}
DEVA_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
VEDIC_ACCENTS = dict.fromkeys(map(ord, "॒॑॓॔᳚"), None)


def strip_vedic_accents(text):
    return text.translate(VEDIC_ACCENTS)


def devanagari_to_iast(text):
    out = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch in DEVA_CONSONANTS:
            out.append(DEVA_CONSONANTS[ch])
            if i + 1 < n and text[i + 1] == "्":
                i += 2
                continue
            if i + 1 < n and text[i + 1] in DEVA_MATRAS:
                out.append(DEVA_MATRAS[text[i + 1]])
                i += 2
                continue
            out.append("a")
        elif ch in DEVA_VOWELS:
            out.append(DEVA_VOWELS[ch])
        elif ch == "ं" or ch == "ँ":
            out.append("ṃ")
        elif ch == "ः":
            out.append("ḥ")
        elif ch == "ऽ":
            out.append("'")
        elif ch in "।॥":
            out.append("|")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


IAST_VOWELS = {"a": ("अ", ""), "ā": ("आ", "ा"), "i": ("इ", "ि"), "ī": ("ई", "ी"),
               "u": ("उ", "ु"), "ū": ("ऊ", "ू"), "ṛ": ("ऋ", "ृ"), "ṝ": ("ॠ", "ॄ"),
               "ḷ": ("ऌ", "ॢ"), "e": ("ए", "े"), "ai": ("ऐ", "ै"), "o": ("ओ", "ो"), "au": ("औ", "ौ")}
IAST_CONSONANTS = {"kh": "ख", "gh": "घ", "ch": "छ", "jh": "झ", "ṭh": "ठ", "ḍh": "ढ",
                   "th": "थ", "dh": "ध", "ph": "फ", "bh": "भ", "k": "क", "g": "ग",
                   "ṅ": "ङ", "c": "च", "j": "ज", "ñ": "ञ", "ṭ": "ट", "ḍ": "ड",
                   "ṇ": "ण", "t": "त", "d": "द", "n": "न", "p": "प", "b": "ब",
                   "m": "म", "y": "य", "r": "र", "l": "ल", "v": "व", "ś": "श",
                   "ṣ": "ष", "s": "स", "h": "ह", "ḻ": "ळ"}
_IAST_TOKENS = sorted(list(IAST_VOWELS) + list(IAST_CONSONANTS), key=len, reverse=True)


def iast_to_devanagari(text):
    out = []
    pending = ""
    i = 0
    while i < len(text):
        tok = next((t for t in _IAST_TOKENS if text.startswith(t, i)), None)
        if tok:
            if tok in IAST_VOWELS:
                if pending:
                    out.append(pending + IAST_VOWELS[tok][1])
                    pending = ""
                else:
                    out.append(IAST_VOWELS[tok][0])
            else:
                if pending:
                    out.append(pending + "्")
                pending = IAST_CONSONANTS[tok]
            i += len(tok)
            continue
        ch = text[i]
        if ch in "ṃṁ":
            if pending:
                out.append(pending + "ं")
                pending = ""
            else:
                out.append("ं")
        elif ch == "ḥ":
            if pending:
                out.append(pending + "ः")
                pending = ""
            else:
                out.append("ः")
        elif ch in "'’‘":
            if pending:
                out.append(pending + "्")
                pending = ""
            out.append("ऽ")
        else:
            if pending:
                out.append(pending + "्")
                pending = ""
            out.append(ch)
        i += 1
    if pending:
        out.append(pending + "्")
    return "".join(out)


_NASAL_CLASSES = [
    ("ṅ", "kkhggh"), ("ñ", "cchjjh"), ("ṇ", "ṭṭhḍḍh"),
    ("n", "tthddh"), ("m", "pphbbh"),
]


def norm_for_compare(iast):
    """Normalize an IAST string for reading-level comparison.

    Homorganic nasal + stop sequences are folded to anusvara so that
    saṃ-/sam- and aṅga-/aṃga- type spelling conventions compare equal.
    """
    out = (
        iast.replace(" ", "")
        .replace("'", "")
        .replace("’", "")
        .replace("|", "")
        .replace("-", "")
        .replace(",", "")
        .replace(".", "")
        .lower()
    )
    import re

    for nasal, stops in _NASAL_CLASSES:
        out = re.sub(nasal + f"(?=[{stops}])", "ṃ", out)
    return out
