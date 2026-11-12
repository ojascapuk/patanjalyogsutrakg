import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const analysis = JSON.parse(await readFile(new URL("../data/word-analysis.json", import.meta.url), "utf8"));
const corpus = JSON.parse(await readFile(new URL("../data/corpus.json", import.meta.url), "utf8"));

test("all 196 readings provide bilingual prose, explicit words, and meaningful lexical glosses", () => {
  let count = 0;
  for (const passage of corpus.passages) {
    const a = analysis.passages[passage.reference];
    assert.equal(a.sourceIast, passage.iast);
    assert.match(a.meaning_sa, /[अ-ह]/u);
    assert.match(a.meaning_en, /[a-z]/iu);
    assert.deepEqual(a.padaccheda, a.tokens.map(t => t.surface));
    for (const token of a.tokens) {
      assert.equal(token.segmentationTentative, undefined);
      for (const word of token.words) {
        count++;
        assert.ok(word.meaning_sa.trim(), `${passage.reference}: ${word.lemma}`);
        assert.ok(word.meaning.trim(), `${passage.reference}: ${word.lemma}`);
        assert.doesNotMatch(word.meaning, /not yet analyzed|TODO|placeholder/i);
        if (word.meaning === "unknown") assert.equal(word.lemma, "ajñāta");
        if (word.kind === "compound-member") {
          assert.equal(word.pada, word.lemma, `${passage.reference}: no invented inflections`);
          assert.equal(word.grammarTentative, undefined);
          assert.ok(token.samasa?.vigraha_devanagari);
          assert.ok(token.samasa?.vigraha_en);
          assert.deepEqual(token.samasa.parts, token.words.map(w => w.lemma));
        }
      }
    }
  }
  assert.equal(count, analysis.stats.words);
});

test("known false segmentations are replaced by the intended lexical members", () => {
  const lemmas = ref => analysis.passages[ref].tokens.flatMap(t => t.words.map(w => w.lemma));
  assert.deepEqual(analysis.passages["1.18"].tokens[1].words.map(w => w.lemma), ["saṃskāra", "śeṣa"]);
  assert.deepEqual(analysis.passages["3.15"].tokens[0].words.map(w => w.lemma), ["krama", "anyatva"]);
  assert.ok(lemmas("1.30").includes("ālasya"));
  assert.ok(!lemmas("1.30").includes("asya"));
  assert.ok(lemmas("2.47").includes("ananta"));
  assert.ok(!lemmas("2.47").includes("anta"));
  assert.ok(lemmas("3.17").includes("ruta"));
  assert.ok(!lemmas("3.17").includes("ajñāna"));
  assert.ok(lemmas("4.25").includes("nivṛtti"));
  assert.ok(!lemmas("4.25").includes("vṛtti"));
  assert.deepEqual(analysis.passages["3.55"].padaccheda.slice(-5), ["akramam", "ca", "iti", "vivekajam", "jñānam"]);
  const prefix = analysis.passages["3.20"].tokens.find(t => t.surface === "sālambanam").words[0];
  assert.match(prefix.meaning, /with/);
  assert.doesNotMatch(prefix.meaning, /that; he/);
});

test("restored padas recompose to the source and reject the observed śeṣa/eṣa error", () => {
  const script = `
import json, sys
sys.path[:0] = ['scripts', 'lib']
from reading_sandhi import compose_to_source
a = json.load(open('data/word-analysis.json'))
c = json.load(open('data/corpus.json'))
for p in c['passages']:
    compose_to_source(a['passages'][p['reference']]['padaccheda'], p['iast'])
try:
    compose_to_source(['saṃskāraḥ', 'eṣaḥ'], 'saṃskāraśeṣaḥ')
except ValueError:
    pass
else:
    raise AssertionError('False śeṣa/eṣa segmentation accepted')
assert a['passages']['1.3']['padaccheda'][-1] == 'avasthānam'
assert a['passages']['2.29']['padaccheda'][-2:] == ['aṣṭau', 'aṅgāni']
assert a['passages']['4.12']['padaccheda'][2] == 'asti'
`;
  const result = spawnSync("python3", ["-c", script], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("regeneration exactly preserves the reading data across Python hash seeds", () => {
  const script = `
import json, pathlib, tempfile, sys
sys.path.insert(0, 'scripts')
import build_word_analysis as b
root = pathlib.Path.cwd()
with tempfile.TemporaryDirectory(prefix='atlas-readings-', dir='/tmp') as d:
    b.ROOT = pathlib.Path(d)
    (b.ROOT / 'data').mkdir()
    (b.ROOT / 'data/corpus.json').write_bytes((root / 'data/corpus.json').read_bytes())
    b.main()
    assert (b.ROOT / 'data/word-analysis.json').read_bytes() == (root / 'data/word-analysis.json').read_bytes()
`;
  for (const seed of ["1", "29"]) {
    const result = spawnSync("python3", ["-c", script], {
      cwd: new URL("..", import.meta.url), encoding: "utf8", env: { ...process.env, PYTHONHASHSEED: seed },
    });
    assert.equal(result.status, 0, result.stderr);
  }
});
