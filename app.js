import { toDevanagari } from "./lib/iast.js";
import { Graph3D, LAYOUTS } from "./lib/graph3d.js";

const byId = (id) => document.getElementById(id);
const loadJSON = async (path) => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Could not load ${path}`);
  return r.json();
};

const [corpus, concepts, wordAnalysis, audit] = await Promise.all([
  loadJSON("/data/corpus.json"),
  loadJSON("/data/concepts.json"),
  loadJSON("/data/word-analysis.json"),
  loadJSON("/data/source-audit.json"),
]);

const passages = corpus.passages;
const chapters = corpus.edition.chapters;
const passageByRef = new Map(passages.map((p) => [p.reference, p]));
const passageById = new Map(passages.map((p) => [p.id, p]));
const conceptById = new Map(concepts.map((c) => [c.id, c]));

let activeView = "verses";
let activePassage = null;
let activeConcept = null;
let detailTab = "meaning";
let graph3d = null;

/* ---------- helpers ---------- */

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

function normalized(v) {
  return v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

function westernNumerals(v) {
  return v.replace(/[०-९]/gu, (d) => String("०१२३४५६७८९".indexOf(d)));
}

function expandReferences(ranges) {
  const out = [];
  for (const range of ranges) {
    const [start, end = start] = range.split("-").map((r) => {
      const [c, v] = r.split(".").map(Number);
      return { c, v };
    });
    for (let v = start.v; v <= end.v; v++) out.push(`${start.c}.${v}`);
  }
  return out;
}

const expandedPassages = new Map(concepts.map((c) => [c.id, expandReferences(c.passages)]));
const refsByConcept = new Map();
for (const c of concepts) {
  for (const ref of expandedPassages.get(c.id)) {
    const list = refsByConcept.get(ref) ?? [];
    list.push(c);
    refsByConcept.set(ref, list);
  }
}

/* ---------- lemma concordance (searchable strings + hyperlinks) ---------- */

const lemmaIndex = new Map(); // normalized key -> {lemma, devanagari, meaning, refs:Set}
for (const p of passages) {
  const analysis = wordAnalysis.passages[p.reference];
  if (!analysis) continue;
  for (const token of analysis.tokens) {
    for (const w of token.words) {
      const key = normalized(w.lemma);
      if (!lemmaIndex.has(key)) {
        lemmaIndex.set(key, {
          lemma: w.lemma,
          devanagari: iastToDevaSafe(w.lemma),
          meaning: w.meaning,
          refs: new Set(),
        });
      }
      lemmaIndex.get(key).refs.add(p.reference);
    }
  }
}

function iastToDevaSafe(text) {
  try { return toDevanagari(text); } catch { return text; }
}

/* ---------- view switching ---------- */

function setView(view) {
  activeView = view;
  document.querySelectorAll(".tabs [role=tab]").forEach((tab) => {
    const selected = tab.dataset.view === view;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.hidden = panel.id !== `panel-${view}`;
  });
  if (view === "concepts") renderConceptList();
  if (view === "verses") renderVerseList();
}

function openPassage(reference, updateHash = true) {
  const passage = passageByRef.get(reference);
  if (!passage) return;
  activePassage = passage;
  activeConcept = null;
  detailTab = "meaning";
  if (updateHash) history.replaceState(null, "", `#${reference}`);
  graph3d?.setSelected(`passage:${passage.id}`);
  renderReader();
  if (activeView === "verses") renderVerseList();
}

function openConcept(id, updateHash = true) {
  const concept = conceptById.get(id);
  if (!concept) return;
  activeConcept = concept;
  activePassage = null;
  if (updateHash) history.replaceState(null, "", `#concept-${id}`);
  graph3d?.setSelected(`concept:${id}`);
  renderReader();
  renderConceptList();
}

/* ---------- reader ---------- */

function scriptToggle(container) {
  const wrap = node("div", undefined, "script-toggle");
  wrap.setAttribute("aria-label", "Sanskrit reading script");
  for (const [mode, label] of [["devanagari", "देवनागरी"], ["iast", "IAST"]]) {
    const b = node("button", label);
    b.type = "button";
    b.dataset.script = mode;
    b.setAttribute("aria-pressed", String(scriptMode() === mode));
    b.addEventListener("click", () => setScriptMode(mode));
    wrap.append(b);
  }
  container.append(wrap);
}

function scriptMode() {
  return localStorage.getItem("patanjali-atlas-script") ?? "devanagari";
}

function setScriptMode(mode) {
  localStorage.setItem("patanjali-atlas-script", mode);
  renderReader();
  renderVerseList();
}

function displayPassage(container, passage) {
  if (scriptMode() === "devanagari") {
    const d = node("p", passage.devanagari, "sanskrit");
    d.lang = "sa-Deva";
    const i = node("p", passage.iast, "iast-line");
    i.lang = "sa-Latn";
    container.append(d, i);
  } else {
    const i = node("p", passage.iast, "sanskrit");
    i.lang = "sa-Latn";
    const d = node("p", passage.devanagari, "iast-line");
    d.lang = "sa-Deva";
    container.append(i, d);
  }
}

function renderReader() {
  const container = byId("reader-content");
  container.replaceChildren();
  const inner = node("div", undefined, "reader-inner");
  container.append(inner);
  if (activeConcept) { renderConceptReader(inner, activeConcept); return; }
  if (!activePassage) {
    const empty = node("div", undefined, "reader-empty");
    empty.append(node("span", "योग", "empty-symbol"));
    empty.append(node("p", "Choose a sūtra from the graph or library — or search a Sanskrit word, reference, or concept."));
    inner.append(empty);
    return;
  }
  renderPassageReader(inner, activePassage);
}

function renderPassageReader(inner, passage) {
  const chapter = chapters[passage.chapter - 1];
  inner.append(node("div", "सूत्रम् · selected sūtra", "reader-label"));
  inner.append(node("h2", `${passage.reference} · ${chapter.name}`));
  inner.append(node("p", `${chapter.devanagari} · Pāda ${passage.chapter} of 4`, "reader-meta"));
  scriptToggle(inner);
  displayPassage(inner, passage);

  const actions = node("div", undefined, "reader-nav");
  const copy = node("button", "Copy + citation");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    const text = `${passage.devanagari}\n${passage.iast}\n— Yoga Sūtra ${passage.reference}; ${passage.translation.author} (1912): “${passage.translation.text}”`;
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = "Copied";
      setTimeout(() => { copy.textContent = "Copy + citation"; }, 1600);
    } catch { copy.textContent = "Copy unavailable"; }
  });
  const prev = passages[passages.indexOf(passage) - 1];
  const next = passages[passages.indexOf(passage) + 1];
  const prevB = node("button", prev ? `← ${prev.reference}` : "Beginning");
  prevB.type = "button"; prevB.disabled = !prev;
  prevB.addEventListener("click", () => prev && openPassage(prev.reference));
  const nextB = node("button", next ? `${next.reference} →` : "End");
  nextB.type = "button"; nextB.disabled = !next;
  nextB.addEventListener("click", () => next && openPassage(next.reference));
  actions.append(copy, prevB, nextB);
  inner.append(actions);

  const tabs = node("div", undefined, "detail-tabs");
  for (const [id, label] of [
    ["meaning", "Meaning"], ["words", "Words · शब्दाः"], ["sandhi", "Sandhi · सन्धिः"],
    ["samasa", "Samāsa · समासः"], ["sources", "Sources"],
  ]) {
    const b = node("button", label);
    b.type = "button";
    b.setAttribute("aria-selected", String(detailTab === id));
    b.addEventListener("click", () => { detailTab = id; renderReader(); });
    tabs.append(b);
  }
  inner.append(tabs);
  const body = node("div", undefined, "detail-body");
  inner.append(body);
  if (detailTab === "meaning") renderMeaning(body, passage);
  if (detailTab === "words") renderWords(body, passage);
  if (detailTab === "sandhi") renderSandhi(body, passage);
  if (detailTab === "samasa") renderSamasa(body, passage);
  if (detailTab === "sources") renderPassageSources(body, passage);
}

function renderMeaning(body, passage) {
  if (passage.translation.text) {
    body.append(node("p", `“${passage.translation.text}”`, "translation"));
    const byline = node("p", undefined, "translation-byline");
    const link = node("a", `${passage.translation.author}, ${passage.translation.work} (${passage.translation.year}) — public domain`);
    link.href = corpus.edition.sources.find((s) => s.role.includes("English"))?.url ?? "#";
    link.target = "_blank"; link.rel = "noopener noreferrer";
    byline.append(link);
    body.append(byline);
  } else {
    body.append(node("p", "Johnston's edition omits this sūtra (YS 3.22); no public-domain translation is included here rather than inventing one."));
  }
  const attached = refsByConcept.get(passage.reference) ?? [];
  if (attached.length) {
    body.append(node("h3", "Curated concepts"));
    const list = node("div", undefined, "reference-list");
    attached.forEach((c) => {
      const b = node("button", `${c.devanagari} · ${c.name}`, "chip deva");
      b.type = "button";
      b.addEventListener("click", () => openConcept(c.id));
      list.append(b);
    });
    body.append(list);
  }
}

function renderWords(body, passage) {
  const analysis = wordAnalysis.passages[passage.reference];
  if (!analysis) { body.append(node("p", "Word analysis unavailable.")); return; }
  analysis.tokens.forEach((token, ti) => {
    const block = node("div", undefined, "token-block");
    const head = node("div", undefined, "token-head");
    head.append(node("span", token.devanagari, "token-surface"));
    head.append(node("span", token.surface, "token-iast"));
    head.append(node("span", `pada ${ti + 1}/${analysis.tokens.length}`, "token-index"));
    block.append(head);
    for (const w of token.words) {
      const card = node("div", undefined, "word-card");
      const wh = node("div", undefined, "word-head");
      wh.append(node("span", w.devanagari, "pada-deva"));
      wh.append(node("span", `${w.pada} · ${w.lemma}`, "pada-iast"));
      wh.append(node("span", w.confidence, `confidence ${w.confidence}`));
      card.append(wh);
      card.append(node("p", w.meaning, "meaning"));
      if (w.grammar_sa || w.grammar_en) {
        const g = node("div", undefined, "grammar");
        if (w.grammar_sa) { const s = node("span", w.grammar_sa, "grammar-sa"); s.lang = "sa"; g.append(s); }
        if (w.grammar_en) g.append(node("span", w.grammar_en, "grammar-en"));
        card.append(g);
      }
      if (w.sandhiWithPrevious) {
        card.append(node("p", `सन्धिः — ${w.sandhiWithPrevious}`, "sandhi-note"));
      }
      const entry = lemmaIndex.get(normalized(w.lemma));
      if (entry && entry.refs.size > 1) {
        const occ = node("div", undefined, "occurrences");
        occ.append(node("span", "also in: "));
        [...entry.refs].filter((r) => r !== passage.reference).slice(0, 12).forEach((r) => {
          const b = node("button", r, "chip");
          b.type = "button";
          b.addEventListener("click", () => openPassage(r));
          occ.append(b);
        });
        card.append(occ);
      }
      block.append(card);
    }
    body.append(block);
  });
}

function renderSandhi(body, passage) {
  const analysis = wordAnalysis.passages[passage.reference];
  const rows = [];
  for (const token of analysis?.tokens ?? []) {
    if (token.sandhi) rows.push({ token, rule: token.sandhi.note });
    token.words.forEach((w, i) => {
      if (i > 0 && w.sandhiWithPrevious) {
        rows.push({ token, rule: w.sandhiWithPrevious, join: `${token.words[i - 1].pada} + ${w.pada}` });
      }
    });
  }
  if (!rows.length) {
    body.append(node("p", "This sūtra has no external or internal sandhi joins to display — words appear in their pada forms."));
    return;
  }
  for (const r of rows) {
    const row = node("div", undefined, "analysis-row");
    row.append(node("span", r.token.devanagari, "row-surface"));
    row.append(node("span", ` (${r.token.surface})`, "vigraha-iast"));
    if (r.join) row.append(node("span", `पदच्छेदः — ${r.join}`, "rule"));
    row.append(node("span", r.rule, "rule"));
    body.append(row);
  }
}

function renderSamasa(body, passage) {
  const analysis = wordAnalysis.passages[passage.reference];
  const rows = (analysis?.tokens ?? []).filter((t) => t.samasa);
  if (!rows.length) {
    body.append(node("p", "No compound in this sūtra — every word stands alone."));
    return;
  }
  for (const t of rows) {
    const s = t.samasa;
    const row = node("div", undefined, "analysis-row");
    row.append(node("span", t.devanagari, "row-surface"));
    row.append(node("span", ` (${t.surface})`, "vigraha-iast"));
    row.append(node("span", `${s.type} — ${s.type_en}`, "samasa-type"));
    const vg = node("span", `समासविग्रहः — ${s.vigraha_devanagari}`, "vigraha-deva");
    vg.lang = "sa";
    row.append(vg);
    row.append(node("span", s.vigraha, "vigraha-iast"));
    row.append(node("span", s.vigraha_en, "rule"));
    if (s.confidence === "derived") {
      row.append(node("span", "Automatic segmentation — treat as an aid, not a settled analysis.", "rule"));
    }
    body.append(row);
  }
}

function renderPassageSources(body, passage) {
  body.append(node("h3", "Text witnesses"));
  for (const src of corpus.edition.sources.filter((s) => !s.role.includes("English"))) {
    const p = node("p");
    const link = node("a", `${src.name} — ${src.detail}`);
    link.href = src.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    p.append(link);
    body.append(p);
  }
  const chk = audit.checks.gretilVsSanskritDocuments;
  const variant = chk.genuineReadingVariants?.[passage.reference];
  if (variant) {
    body.append(node("p", `Witness variant at ${passage.reference}: ${variant}.`, "verify-note"));
  } else if (passage.reference === "3.22") {
    body.append(node("p", audit.numbering.note, "verify-note"));
  } else {
    body.append(node("p", `This sūtra's letters agree exactly between the GRETIL and SanskritDocuments witnesses (see Sources & verification).`, "verify-ok"));
  }
}

function renderConceptReader(inner, concept) {
  inner.append(node("div", "अवधारणा · curated concept", "reader-label"));
  inner.append(node("h2", concept.name));
  const original = node("p", `${concept.devanagari} · ${concept.iast}`, "devanagari");
  original.lang = "sa";
  inner.append(original);
  inner.append(node("p", concept.meaning, "concept-definition"));
  inner.append(node("h3", "Sūtras"));
  const refs = node("div", undefined, "reference-list");
  expandedPassages.get(concept.id).forEach((ref) => {
    const b = node("button", ref, "chip");
    b.type = "button";
    b.addEventListener("click", () => { setView("verses"); openPassage(ref); });
    refs.append(b);
  });
  inner.append(refs);
  inner.append(node("h3", "Related concepts"));
  const related = node("div", undefined, "reference-list");
  concept.related.forEach((id) => {
    const item = conceptById.get(id);
    if (!item) return;
    const b = node("button", `${item.devanagari} · ${item.name}`, "chip deva");
    b.type = "button";
    b.addEventListener("click", () => openConcept(id));
    related.append(b);
  });
  inner.append(related);
  const link = node("a", "Background reading on Wikipedia ↗");
  link.href = concept.wikipedia;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "external-link";
  inner.append(link);
}

/* ---------- lists ---------- */

function renderConceptList() {
  const list = byId("concept-list");
  const query = normalized(byId("search").value.trim());
  const filtered = concepts.filter((c) =>
    !query || normalized(`${c.name} ${c.iast} ${c.devanagari} ${c.meaning}`).includes(query));
  byId("concept-count").textContent = `${filtered.length} concepts`;
  list.replaceChildren();
  if (!filtered.length) { list.append(node("p", "No concepts match this search.", "empty-state")); return; }
  filtered.forEach((c) => {
    const b = node("button", undefined, "concept-card");
    b.type = "button";
    b.setAttribute("aria-current", String(activeConcept?.id === c.id));
    b.append(node("strong", c.name));
    const d = node("span", c.devanagari, "devanagari"); d.lang = "sa";
    b.append(d, node("span", `${c.iast} · ${expandedPassages.get(c.id).length} sūtras`, "card-meta"));
    b.addEventListener("click", () => openConcept(c.id));
    list.append(b);
  });
}

function renderVerseList() {
  const list = byId("verse-list");
  const queryRaw = byId("search").value.trim();
  const query = normalized(queryRaw);
  const chapter = byId("library-filter").value;
  const lemmaRefs = query ? (lemmaIndex.get(query)?.refs ?? new Set()) : new Set();
  const matchingConceptRefs = new Set(
    concepts
      .filter((c) => normalized(`${c.name} ${c.iast} ${c.devanagari} ${c.meaning}`).includes(query))
      .flatMap((c) => expandedPassages.get(c.id)));
  const filtered = passages.filter((p) => {
    if (chapter !== "all" && p.chapter !== Number(chapter)) return false;
    if (!query) return true;
    return p.reference === westernNumerals(queryRaw)
      || normalized(p.iast).includes(query)
      || normalized(p.devanagari).includes(query)
      || normalized(p.translation.text).includes(query)
      || lemmaRefs.has(p.reference)
      || matchingConceptRefs.has(p.reference);
  });
  list.replaceChildren();
  if (!filtered.length) { list.append(node("p", "No sūtras match this search.", "empty-state")); return; }
  filtered.forEach((p) => {
    const b = node("button", undefined, "verse-card");
    b.type = "button";
    b.setAttribute("aria-current", String(activePassage?.id === p.id));
    const top = node("span", undefined, "verse-card-top");
    top.append(node("span", `${p.reference} · ${chapters[p.chapter - 1].name}`));
    top.append(node("span", `${toDevaDigits(p.reference)}`));
    b.append(top);
    const deva = node("span", p.devanagari, "verse-snippet");
    deva.lang = "sa-Deva";
    b.append(deva);
    const iast = node("span", p.iast, "verse-snippet iast");
    iast.lang = "sa-Latn";
    b.append(iast);
    b.addEventListener("click", () => openPassage(p.reference));
    list.append(b);
  });
}

function toDevaDigits(ref) {
  return "YS " + ref.replace(/\d/g, (d) => "०१२३४५६७८९"[Number(d)]);
}

/* ---------- sources panel ---------- */

function renderSourceDetails() {
  const d = byId("source-details");
  d.replaceChildren();
  d.append(node("p", "The sūtra text in this atlas is built from two independent public-domain Sanskrit witnesses fetched from the internet and compared letter-by-letter. No modern copyrighted edition is used."));

  d.append(node("h3", "Witnesses (hyperlinked)"));
  for (const src of audit.sources) {
    const p = node("p");
    const link = node("a", src.name);
    link.href = src.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    p.append(link, document.createTextNode(` — ${src.detail} · retrieved ${src.retrieved}`));
    d.append(p);
    d.append(node("p", `sha256 ${src.sha256}`, "hash"));
  }

  d.append(node("h3", "Verification results"));
  const chk = audit.checks.gretilVsSanskritDocuments;
  const table = node("table", undefined, "verify-table");
  const thead = node("tr");
  thead.append(node("th", "Check"), node("th", "Result"));
  table.append(thead);
  const row1 = node("tr");
  row1.append(node("td", "GRETIL ↔ SanskritDocuments letter-level agreement"));
  const r1 = node("td");
  r1.append(node("span", `${chk.matched} of 195 compared sūtras identical`, "verify-ok"));
  row1.append(r1);
  table.append(row1);
  const row2 = node("tr");
  row2.append(node("td", "Genuine reading variants (recorded, not hidden)"));
  row2.append(node("td", Object.entries(chk.genuineReadingVariants ?? {})
    .map(([k, v]) => `${k}: ${v}`).join("; ") || "none"));
  table.append(row2);
  const row3 = node("tr");
  row3.append(node("td", "Comparison method"));
  row3.append(node("td", chk.method));
  table.append(row3);
  d.append(table);

  d.append(node("h3", "Numbering note (YS 3.22)"));
  d.append(node("p", audit.numbering.note));
  d.append(node("p", audit.numbering.johnstonBook3));

  d.append(node("h3", "Superseded draft"));
  d.append(node("p", audit.checks.supersededDraftTranscription.note));
  d.append(node("p", `${audit.checks.supersededDraftTranscription.differingPassages.length} of 196 draft readings differed from the canonical text at letter level (mostly external sandhi / compound spacing).`));

  d.append(node("h3", "Grammar analysis scope"));
  const stats = wordAnalysis.stats;
  d.append(node("p", `${stats.words} word entries generated across 196 sūtras: ${stats.curated} hand-curated (pronouns, verbs, irregular stems), ${stats.words - stats.curated} derived from a declension lexicon and sandhi segmenter. ${stats.tokensUnresolved} tokens unresolved. Derived analyses are marked and should be verified against a commentary before scholarly use.`));

  d.append(node("h3", "Further reading"));
  const extras = [
    ["Vivekananda — Raja Yoga (1896, public domain)", "https://www.gutenberg.org/ebooks/73847"],
    ["Patañjali — Wikipedia", "https://en.wikipedia.org/wiki/Pata%C3%B1jali"],
    ["Yoga Sutras of Patanjali — Wikipedia", "https://en.wikipedia.org/wiki/Yoga_Sutras_of_Patanjali"],
  ];
  const ul = node("ul");
  for (const [label, url] of extras) {
    const li = node("li");
    const a = node("a", label + " ↗");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    li.append(a);
    ul.append(li);
  }
  d.append(ul);
}

/* ---------- graph ---------- */

function buildGraphData() {
  const nodes = [{ id: "text:yoga-sutras", type: "text", label: "योगसूत्राणि", sublabel: "Yoga Sūtras" }];
  const edges = [];
  chapters.forEach((ch) => {
    nodes.push({ id: `chapter:${ch.id}`, type: "chapter", chapter: ch.number, label: `${ch.name}`, sublabel: `${ch.devanagari} · ${ch.passageCount}` });
    edges.push({ source: "text:yoga-sutras", target: `chapter:${ch.id}`, relationship: "organizes", basis: "Four pādas" });
  });
  passages.forEach((p) => {
    nodes.push({ id: `passage:${p.id}`, type: "passage", chapter: p.chapter, verse: p.verse, label: p.reference });
    edges.push({ source: `chapter:${p.chapterId}`, target: `passage:${p.id}`, relationship: "contains", basis: "numbered sūtra" });
  });
  const conceptChapter = (c) => {
    const counts = [0, 0, 0, 0];
    expandedPassages.get(c.id).forEach((r) => { counts[Number(r.split(".")[0]) - 1]++; });
    return counts.indexOf(Math.max(...counts)) + 1;
  };
  concepts.forEach((c) => {
    nodes.push({ id: `concept:${c.id}`, type: "concept", chapter: conceptChapter(c), label: c.devanagari, sublabel: c.name });
    expandedPassages.get(c.id).forEach((ref) => {
      const p = passageByRef.get(ref);
      if (p) edges.push({ source: `passage:${p.id}`, target: `concept:${c.id}`, relationship: "attests", basis: `topic at ${ref}` });
    });
    c.related.forEach((rel) => edges.push({ source: `concept:${c.id}`, target: `concept:${rel}`, relationship: "relatedTo", basis: "editorial relation" }));
  });
  return { nodes, edges };
}

function initGraph() {
  const canvas = byId("graph3d");
  const announcer = byId("graph-announcer");
  graph3d = new Graph3D(canvas, {
    onSelect: (id) => {
      byId("search").value = "";
      if (id.startsWith("passage:")) {
        const p = passageById.get(id.slice(8));
        if (p) { setView("verses"); openPassage(p.reference); }
      } else if (id.startsWith("concept:")) {
        setView("concepts");
        openConcept(id.slice(8));
      } else if (id.startsWith("chapter:")) {
        const ch = chapters.find((c) => `chapter:${c.id}` === id);
        if (ch) { byId("chapter-filter").value = String(ch.number); byId("chapter-filter").dispatchEvent(new Event("change")); }
      } else if (id === "text:yoga-sutras") {
        byId("chapter-filter").value = "all"; byId("chapter-filter").dispatchEvent(new Event("change"));
      }
    },
    onAnnounce: (msg) => { announcer.textContent = msg; },
  });
  const { nodes, edges } = buildGraphData();
  graph3d.setData(nodes, edges);

  const layoutSelect = byId("layout-select");
  LAYOUTS.forEach((l) => layoutSelect.append(new Option(l.label, l.id)));
  layoutSelect.value = graph3d.layout;
  layoutSelect.addEventListener("change", () => graph3d.setLayout(layoutSelect.value));
  byId("chapter-filter").addEventListener("change", (e) => graph3d.setChapterFilter(e.target.value === "all" ? "all" : Number(e.target.value)));
  byId("show-passages").addEventListener("change", (e) => graph3d.setShowPassages(e.target.checked));
  byId("auto-rotate").addEventListener("change", (e) => graph3d.setAutoRotate(e.target.checked));

  const jump = byId("node-jump");
  const og1 = node("optgroup"); og1.label = "Concepts";
  concepts.forEach((c) => og1.append(new Option(`${c.devanagari} ${c.name}`, `concept:${c.id}`)));
  const og2 = node("optgroup"); og2.label = "Pādas";
  chapters.forEach((ch) => og2.append(new Option(`${ch.devanagari} · ${ch.name}`, `chapter:${ch.id}`)));
  jump.append(og1, og2);
  jump.addEventListener("change", () => {
    if (!jump.value) return;
    byId("search").value = "";
    graph3d.setSelected(jump.value);
    const id = jump.value;
    jump.value = "";
    if (id.startsWith("concept:")) { setView("concepts"); openConcept(id.slice(8)); }
    else if (id.startsWith("chapter:")) {
      const ch = chapters.find((c) => `chapter:${c.id}` === id);
      if (ch) { byId("chapter-filter").value = String(ch.number); byId("chapter-filter").dispatchEvent(new Event("change")); }
    }
  });

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    byId("auto-rotate").checked = false;
    graph3d.setAutoRotate(false);
  }
}

/* ---------- export ---------- */

function renderExport() {
  const { nodes, edges } = buildGraphData();
  const exportData = {
    corpus,
    concepts,
    wordAnalysis: "data/word-analysis.json (inline copy below)",
    graph: { nodes, edges },
    sourceAudit: audit,
  };
  const blob = new Blob([JSON.stringify({ ...exportData, wordAnalysis }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = node("a");
  a.href = url;
  a.download = "patanjali-yoga-sutra-atlas.json";
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- theme ---------- */

function applyTheme(mode) {
  localStorage.setItem("patanjali-atlas-theme", mode);
  const isDark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  document.querySelectorAll('input[name="theme"]').forEach((i) => { i.checked = i.value === mode; });
  graph3d?.refreshTheme();
}

/* ---------- search ---------- */

function onSearch() {
  const raw = byId("search").value.trim();
  const ref = westernNumerals(raw);
  if (/^[1-4]\.\d{1,2}$/.test(ref) && passageByRef.has(ref)) {
    setView("verses");
    byId("library-filter").value = "all";
    openPassage(ref);
    return;
  }
  if (!raw) {
    if (activeView === "concepts") renderConceptList();
    else if (activeView === "verses") renderVerseList();
    return;
  }
  const nq = normalized(raw);
  const exactConcept = concepts.find((c) =>
    [c.name, c.iast, c.devanagari].some((v) => normalized(v) === nq));
  if (exactConcept && activeView !== "verses") {
    setView("concepts");
    openConcept(exactConcept.id);
    return;
  }
  if (activeView !== "verses") setView("verses");
  renderVerseList();
}

/* ---------- boot ---------- */

document.querySelectorAll(".tabs [role=tab]").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
  tab.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const tabs = [...document.querySelectorAll(".tabs [role=tab]")];
    const next = tabs[(tabs.indexOf(tab) + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    next.focus();
    setView(next.dataset.view);
  });
});
byId("search").addEventListener("input", onSearch);
byId("library-filter").addEventListener("change", renderVerseList);
byId("export-button").addEventListener("click", renderExport);
byId("footer-sources").addEventListener("click", () => setView("sources"));
document.querySelectorAll('input[name="theme"]').forEach((i) =>
  i.addEventListener("change", () => applyTheme(i.value)));
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if ((localStorage.getItem("patanjali-atlas-theme") ?? "system") === "system") applyTheme("system");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !["INPUT", "TEXTAREA", "CANVAS", "SELECT"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    byId("search").focus();
  }
});

renderConceptList();
renderVerseList();
renderSourceDetails();
renderReader();
initGraph();
applyTheme(localStorage.getItem("patanjali-atlas-theme") ?? "system");

const initialHash = decodeURIComponent(location.hash.slice(1));
if (passageByRef.has(initialHash)) { setView("verses"); openPassage(initialHash, false); }
else if (initialHash.startsWith("concept-") && conceptById.has(initialHash.slice(8))) {
  setView("concepts"); openConcept(initialHash.slice(8), false);
}
window.addEventListener("hashchange", () => {
  const h = decodeURIComponent(location.hash.slice(1));
  if (passageByRef.has(h)) { setView("verses"); openPassage(h, false); }
  else if (h.startsWith("concept-") && conceptById.has(h.slice(8))) { setView("concepts"); openConcept(h.slice(8), false); }
});
