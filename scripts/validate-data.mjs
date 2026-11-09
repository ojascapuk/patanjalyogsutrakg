import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8").then(JSON.parse);
const corpus = await read("data/corpus.json");
const concepts = await read("data/concepts.json");
const analysis = await read("data/word-analysis.json");
const audit = await read("data/source-audit.json");

const expected = [51, 55, 56, 34];
if (corpus.passages.length !== 196) throw new Error(`Expected 196 passages; found ${corpus.passages.length}`);

for (let ch = 1; ch <= 4; ch += 1) {
  const list = corpus.passages.filter((p) => p.chapter === ch);
  if (list.length !== expected[ch - 1]) throw new Error(`Chapter ${ch}: expected ${expected[ch - 1]}`);
  list.forEach((p, i) => {
    if (p.verse !== i + 1) throw new Error(`Bad verse number at ${p.reference}`);
    for (const field of ["devanagari", "iast"]) {
      if (!p[field]) throw new Error(`Missing ${field} at ${p.reference}`);
    }
    if (p.reference !== "3.22" && !p.translation.text) {
      throw new Error(`Missing public-domain translation at ${p.reference}`);
    }
  });
}

const chk = audit.checks.gretilVsSanskritDocuments;
if (!chk || chk.matched < 185) throw new Error("Witness cross-check missing or degraded");
if (analysis.stats.tokensUnresolved !== 0) {
  throw new Error(`${analysis.stats.tokensUnresolved} unresolved word tokens`);
}
for (const p of corpus.passages) {
  const a = analysis.passages[p.reference];
  if (!a || !a.tokens.length) throw new Error(`Missing word analysis at ${p.reference}`);
}

const refs = new Set(corpus.passages.map((p) => p.reference));
const ids = new Set(concepts.map((c) => c.id));
for (const c of concepts) {
  for (const rel of c.related) if (!ids.has(rel)) throw new Error(`Unknown related concept ${rel} on ${c.id}`);
  for (const range of c.passages) {
    const [start, end = start] = range.split("-");
    const [sc, sv] = start.split(".").map(Number);
    const [, ev] = end.split(".").map(Number);
    for (let v = sv; v <= ev; v += 1) {
      if (!refs.has(`${sc}.${v}`)) throw new Error(`Unknown passage ${sc}.${v} on ${c.id}`);
    }
  }
}

console.log(`Validated ${corpus.passages.length} passages, ${concepts.length} concepts, ${analysis.stats.words} word entries.`);
console.log(`Witness agreement: ${chk.matched}/${chk.matched + chk.mismatched} sūtras letter-identical.`);
