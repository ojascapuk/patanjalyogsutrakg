import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { toDevanagari } from "../lib/iast.js";

// A small DOM fixture exercises the real reader functions without a browser.
// It checks content structure, not browser layout or event/navigation behavior.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this._text = ""; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent ?? String(c)).join(" "); }
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener() {}
}
const data = {};
for (const file of ["corpus", "concepts", "word-analysis", "source-audit", "sanskrit-commentary"]) {
  data[`/data/${file}.json`] = JSON.parse(await readFile(new URL(`../data/${file}.json`, import.meta.url), "utf8"));
}
const source = (await readFile(new URL("../app.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .split("/* ---------- boot ---------- */")[0];
const context = vm.createContext({
  toDevanagari,
  document: { createElement: tag => new Element(tag) },
  fetch: async path => ({ ok: true, json: async () => data[path] }),
});
await vm.runInContext(`(async () => { ${source}
  globalThis.reader = { renderMeaning, renderWords, renderSandhi, renderSamasa };
})()`, context);
const corpus = data["/data/corpus.json"];
const analysis = data["/data/word-analysis.json"];

test("Sanskrit and English passage meanings are visible outside disclosure sections", () => {
  for (const passage of corpus.passages) {
    const body = new Element("div");
    context.reader.renderMeaning(body, passage);
    const direct = body.children.filter(c => c.tagName === "p").map(c => c.textContent);
    assert.ok(direct.includes(analysis.passages[passage.reference].meaning_sa), passage.reference);
    assert.ok(direct.includes(analysis.passages[passage.reference].meaning_en), passage.reference);
    const historical = body.children.find(c => c.tagName === "details" && c.textContent.includes("Charles Johnston"));
    assert.ok(historical, passage.reference);
    if (passage.translation.text) assert.ok(historical.textContent.includes(passage.translation.text));
  }
});

test("every lexical card exposes both meanings and compound expansions directly", () => {
  for (const passage of corpus.passages) {
    const body = new Element("div");
    context.reader.renderWords(body, passage);
    const blocks = body.children.filter(c => c.className === "token-block");
    assert.equal(blocks.length, analysis.passages[passage.reference].tokens.length);
    for (const [i, block] of blocks.entries()) {
      const token = analysis.passages[passage.reference].tokens[i];
      const cards = block.children.filter(c => c.className === "word-card");
      assert.equal(cards.length, token.words.length);
      for (const [j, card] of cards.entries()) {
        const word = token.words[j];
        const direct = card.children.filter(c => c.tagName === "p").map(c => c.textContent);
        assert.ok(direct.includes(word.meaning_sa), `${passage.reference} ${word.lemma}`);
        assert.ok(direct.includes(word.meaning), `${passage.reference} ${word.lemma}`);
      }
      if (token.samasa) {
        assert.ok(block.textContent.includes(token.samasa.vigraha_devanagari));
        assert.ok(block.textContent.includes(token.samasa.vigraha_en));
      }
    }
    assert.ok(!body.textContent.includes("undefined"), passage.reference);
  }
});

test("Sandhi and Samasa render for the complete corpus, including passages without external sandhi", () => {
  for (const passage of corpus.passages) {
    const sandhi = new Element("div"), samasa = new Element("div");
    context.reader.renderSandhi(sandhi, passage);
    context.reader.renderSamasa(samasa, passage);
    assert.ok(sandhi.textContent.includes(analysis.passages[passage.reference].padaccheda_sa));
    assert.ok(!sandhi.textContent.includes("undefined"), passage.reference);
    assert.ok(!samasa.textContent.includes("undefined"), passage.reference);
  }
});
