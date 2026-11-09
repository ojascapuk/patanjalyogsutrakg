"""Extract attributed classical Sanskrit commentary from vendored HTML snapshots.

Requires beautifulsoup4. Never changes the canonical corpus. Source Book III
has 55 sutras: source 3.22–55 correspond to atlas 3.23–56.
"""
import hashlib
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString

ROOT = Path(__file__).resolve().parent.parent
NUMBERS = str.maketrans("०१२३४५६७८९", "0123456789")


def build():
    passages, sources = {}, []
    for chapter, expected in enumerate([51, 55, 55, 34], 1):
        path = ROOT / f"data/sources/vyasa-bhashya-{chapter}.html"
        soup = BeautifulSoup(path.read_text(), "html.parser")
        roots = [tag for tag in soup.find_all("strong")
                 if re.search(r"॥\s*[०-९0-9]+\s*॥", tag.get_text())]
        assert len(roots) == expected, (chapter, len(roots))
        sources.append({"chapter": chapter, "url": f"https://thevyasa.in/yoga{chapter}/",
                        "file": str(path.relative_to(ROOT)),
                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        for number, root in enumerate(roots, 1):
            sutra = root.get_text(" ", strip=True)
            found = int(re.search(r"॥\s*([०-९0-9]+)\s*॥", sutra)[1].translate(NUMBERS))
            assert number == found, (chapter, number, found)
            fragments = []
            for item in root.next_elements:
                if item in root.descendants:
                    continue
                if getattr(item, "name", None) == "strong" and item in roots:
                    break
                if isinstance(item, NavigableString):
                    fragments.append(str(item))
            text = re.sub(r"\s+", " ", " ".join(fragments)).strip()
            # Keep this commentary's final numbered danda; exclude the next
            # sutra's introductory question and site navigation.
            if not text:
                continue
            end = re.search(rf"॥\s*{number}(?:\s*॥|(?=\s))", text.translate(NUMBERS))
            assert end, (chapter, number, "missing commentary end")
            text = text[:end.end()]
            atlas_number = number + (chapter == 3 and number >= 22)
            passages[f"{chapter}.{atlas_number}"] = {
                "text": text, "sourceSutra": sutra,
                "sourceReference": f"{chapter}.{number}",
                "url": f"https://thevyasa.in/yoga{chapter}/",
            }
    assert len(passages) == 190
    result = {"author": "व्यासः", "title": "व्यासभाष्यम्", "language": "sa",
              "source": "The Vyasa — classical Sanskrit text, public domain",
              "retrieved": "2026-11-09", "sources": sources,
              "note": "अत्र भाष्यस्य जालप्रतिलिपिः प्रदर्श्यते; प्रतिलिपिदोषाः सम्भवन्ति। मूलसूत्रपाठः पृथक् संरक्षितः।",
              "numbering": "तृतीयपादे स्रोतसः २२–५५ = अस्य ग्रन्थस्य २३–५६। ३.२२ विषये पृथग्भाष्यं नास्ति।",
              "passages": passages}
    (ROOT / "data/sanskrit-commentary.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"Aligned {len(passages)} Sanskrit commentary entries; atlas 3.22 has no separate source entry.")


if __name__ == "__main__":
    build()
