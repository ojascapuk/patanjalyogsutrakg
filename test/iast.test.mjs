import test from "node:test";
import assert from "node:assert/strict";
import { toDevanagari } from "../lib/iast.js";

test("renders aspirated, retroflex, and palatal Sanskrit consonants", () => {
  assert.equal(toDevanagari("yogaś cittavṛttinirodhaḥ"), "योगश् चित्तवृत्तिनिरोधः");
});

test("preserves source word boundaries and maps avagraha", () => {
  assert.equal(toDevanagari("tadā draṣṭuḥ svarūpe 'vasthānam"), "तदा द्रष्टुः स्वरूपे ऽवस्थानम्");
});

test("matches the corpus Devanagari witness for representative sūtras", async () => {
  const corpus = JSON.parse(
    await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../data/corpus.json", import.meta.url), "utf8")),
  );
  // Orthographic conventions that legitimately differ between the two witnesses:
  // spacing, final virāma, avagraha+अ collapse (2.29), anusvara+अ junction (3.22).
  const squash = (s) => {
    let out = s.replace(/[\s्]+/g, "").replace(/ऽअ/g, "ऽ").replace(/(ऽ[^ऽ]*)वअ/g, "$1व");
    // fold independent vowel letters onto a preceding consonant (word-join orthography)
    const matra = { अ: "", आ: "ा", इ: "ि", ई: "ी", उ: "ु", ऊ: "ू", ऋ: "ृ", ए: "े", ऐ: "ै", ओ: "ो", औ: "ौ" };
    out = out.replace(/([क-ह])ऽ?([अआइईउऊऋएऐओऔ])/g, (m, cons, v) => cons + matra[v]);
    return out;
  };
  for (const ref of ["1.1", "2.29", "3.22", "4.34"]) {
  const p = corpus.passages.find((x) => x.reference === ref);
  assert.equal(squash(toDevanagari(p.iast)), squash(p.devanagari), `IAST→Deva mismatch at ${ref}`);
  }
});
