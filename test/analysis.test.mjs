import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const read = (name) => readFile(new URL(`../data/${name}.json`, import.meta.url), "utf8").then(JSON.parse);
const analysis = await read("word-analysis");
const commentary = await read("sanskrit-commentary");
const corpus = await read("corpus");

test("Sanskrit explanations cover the corpus without shifting Book III", () => {
  assert.equal(Object.keys(commentary.passages).length, 190);
  for (const p of corpus.passages) {
    assert.ok(commentary.passages[p.reference]?.text || analysis.passages[p.reference].meaning_sa, p.reference);
  }
  assert.equal(commentary.passages["3.22"], undefined);
  assert.equal(commentary.passages["3.23"].sourceReference, "3.22");
  assert.equal(commentary.passages["3.56"].sourceReference, "3.55");
  assert.match(commentary.passages["1.3"].text, /स्वरूपप्रतिष्ठा/);
  assert.doesNotMatch(commentary.passages["1.3"].text, /वृत्तिसारूप्यमितरत्र/);
});

test("compound components do not acquire invented nominative endings", () => {
  const first = analysis.passages["1.1"].tokens[1];
  assert.equal(first.words[0].pada, "yoga");
  assert.equal(first.words[0].kind, "compound-member");
  const second = analysis.passages["1.2"].tokens[1];
  assert.equal(second.words[1].pada, "vṛtti");
  assert.match(second.samasa.vigraha_devanagari, /तासां निरोधः/);
});

test("contextual cases and feminine agreement override a guessed parse", () => {
  const seer = analysis.passages["1.3"].tokens.flatMap(t => t.words).find(w => w.pada === "draṣṭuḥ");
  assert.match(seer.grammar_sa, /षष्ठी/);
  assert.doesNotMatch(seer.grammar_sa, /पञ्चमी/);
  const five = analysis.passages["1.5"].tokens.flatMap(t => t.words).find(w => w.pada === "pañcatayyaḥ");
  assert.match(five.grammar_sa, /बहुवचनम्, स्त्रीलिङ्गम्/);
  assert.match(analysis.passages["1.5"].tokens[2].grammar_sa, /स्त्रीलिङ्गम्/);
  assert.equal(analysis.passages["1.4"].tokens[0].samasa.type_sa, "तृतीया-तत्पुरुष");
});

test("sandhi is an explicit boundary rule, not guessed inflected pieces", () => {
  assert.deepEqual(analysis.passages["1.1"].sandhiReviewed[0], {
    parts_sa: "योग + अनुशासनम्", joined_sa: "योगानुशासनम्",
    rule_sa: "सवर्णदीर्घसन्धिः — अ + अ = आ।",
  });
  assert.match(analysis.passages["1.3"].sandhiReviewed[0].rule_sa, /पूर्वरूप/);
  for (const passage of Object.values(analysis.passages)) {
    for (const token of passage.tokens) assert.notEqual(token.samasa?.confidence, "derived");
  }
});

test("regeneration preserves context corrections, alternatives, and memo isolation", () => {
  const script = `
import sys
sys.path.insert(0, 'scripts')
import build_word_analysis as b
assert 'प्रथमा/द्वितीया' in b.grammar_text('nom/acc', 'sg', 'n')[1]
assert 'षष्ठी/सप्तमी' in b.grammar_text('gen/loc', 'du', 'm/n')[1]
x = b.segment('yogānuśāsanam')
x[0]['pada'] = 'corrupted'
assert b.segment('yogānuśāsanam')[0]['pada'] != 'corrupted'
assert b.analyze_passage('yogānuśāsanam')[0]['words'][0]['pada'] == 'yoga'
assert b.PARADIGMS['ī_f'][0] == 'ī'
assert b.PARADIGMS['ī_f'][6] == 'yām'
`;
  const result = spawnSync("python3", ["-c", script], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
