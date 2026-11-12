"""Bounded external-sandhi fidelity check for the explicit atlas readings.

This composes *recorded* padas; it never chooses a word split or a lemma.
The supported rules cover this corpus, not every Sanskrit sandhi situation.
"""
import re
from transliterate import norm_for_compare

VOWELS = "aāiīuūṛṝḷeo"
VOICED = "gghjḍdnbmṅñṇyrlvhaāiīuūṛeo"


def joins(left, right):
    out = [(left + right, None)]
    if left == "saḥ" and right[0] not in VOWELS:
        out.append(("sa" + right, "सः इत्यस्य विसर्गलोपः।"))
    if left.endswith("punaḥ") and right[0] in VOICED:
        out.append((left[:-1] + "r" + right, "पुनः इत्यस्य रेफादेशः — पुनर्।"))
    if left.endswith("ḥ"):
        base = left[:-1]
        first = right[0]
        if first in {"c", "ś"}:
            out.append((base + "ś" + right, "विसर्गस्य शकारादेशः।"))
        if first == "t":
            out.append((base + "s" + right, "विसर्गस्य सकारादेशः।"))
        if first in {"ṭ", "ṣ"}:
            out.append((base + "ṣ" + right, "विसर्गस्य षकारादेशः।"))
        if first in VOICED:
            if left.endswith("aḥ"):
                if right.startswith("a") and not right.startswith(("ai", "au")):
                    out.append((left[:-2] + "o'" + right[1:], "अः + अ → ओऽ; पूर्वरूपसन्धिः।"))
                if first not in VOWELS:
                    out.append((left[:-2] + "o" + right, "अः इत्यस्य घोषवति परे ओकारादेशः।"))
                if first in VOWELS:
                    out.append((base + right, "अकारपूर्वविसर्गस्य स्वरे परे लोपः।"))
            elif left.endswith("āḥ"):
                out.append((base + right, "आकारपूर्वविसर्गस्य घोषवति परे लोपः।"))
            else:
                out.append((base + "r" + right, "विसर्गस्य रेफादेशः।"))
    if left.endswith("t"):
        first = right[0]
        if first in VOICED:
            out.append((left[:-1] + "d" + right, "जश्त्वम् — त् इत्यस्य दकारादेशः।"))
        if first == "j":
            out.append((left[:-1] + "j" + right, "श्चुत्वम् — त् + ज् → ज्ज्।"))
        if first == "n":
            out.append((left[:-1] + "n" + right, "अनुनासिकसन्धिः — त् + न् → न्न्।"))
        if first == "l":
            out.append((left[:-1] + "l" + right, "त् + ल् → ल्ल्।"))
        if first == "c":
            out.append((left[:-1] + "c" + right, "श्चुत्वम् — त् + च् → च्च्।"))
    if left.endswith("m") and right[0] not in VOWELS:
        out.append((left[:-1] + "ṃ" + right, "व्यञ्जने परे मकारस्य अनुस्वारः।"))
    # Longest vowel first so that ai/au are not read as initial a.
    lv = next((v for v in ("ai", "au", *VOWELS) if left.endswith(v)), None)
    rv = next((v for v in ("ai", "au", *VOWELS) if right.startswith(v)), None)
    if lv and rv:
        prefix, suffix = left[:-len(lv)], right[len(rv):]
        if (lv, rv) in {(a, b) for a in "aā" for b in "aā"}:
            out.append((prefix + "ā" + suffix, "सवर्णदीर्घसन्धिः — अ/आ + अ/आ → आ।"))
        for group, combined in (("iī", "e"), ("uū", "o"), ("ṛṝ", "ar")):
            if lv in "aā" and rv in group:
                out.append((prefix + combined + suffix, "गुणसन्धिः।"))
        if lv in "aā" and rv in ("e", "ai", "o", "au"):
            out.append((prefix + ("ai" if rv in ("e", "ai") else "au") + suffix, "वृद्धिसन्धिः।"))
        for group, glide in (("iī", "y"), ("uū", "v"), ("ṛṝ", "r")):
            if lv in group and rv not in group:
                out.append((prefix + glide + right, "यण्सन्धिः।"))
        if lv in ("e", "o") and rv == "a":
            out.append((left + "'" + suffix, "पूर्वरूपसन्धिः — अकारलोपः अवग्रहेण सूचितः।"))
        if lv in ("ai", "au"):
            out.append((prefix + ("āy" if lv == "ai" else "āv") + right, "अयादिसन्धिः।"))
    return out


def letters(text):
    return norm_for_compare(re.sub(r"\s+", "", text))


def compose_to_source(padas, source):
    """Find a rule-supported recomposition, retaining boundary explanations."""
    target = letters(source)
    states = [(padas[0], [])]
    for left_pada, right_pada in zip(padas, padas[1:]):
        next_states = {}
        for text, rules in states:
            for combined, rule in joins(text, right_pada):
                # Only the current word's ending can change at the next boundary.
                if target.startswith(letters(combined)[:-4]):
                    event = {"left": left_pada, "right": right_pada, "rule_sa": rule} if rule else None
                    next_states.setdefault(combined, rules + ([event] if event else []))
        states = list(next_states.items())
    for combined, rules in states:
        if letters(combined) == target:
            return rules
    raise ValueError(f"Recorded padas do not recompose to source: {' | '.join(padas)} != {source}")
