import { copyFile, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("dist/", root);
const files = [
  "index.html",
  "styles.css",
  "app.js",
  "lib/iast.js",
  "lib/graph3d.js",
  "data/corpus.json",
  "data/concepts.json",
  "data/word-analysis.json",
  "data/source-audit.json",
];

await rm(output, { recursive: true, force: true });
for (const file of files) {
  const destination = new URL(file, output);
  await mkdir(new URL(".", destination), { recursive: true });
  await copyFile(new URL(file, root), destination);
}
console.log(`Built ${files.length} static files in dist/.`);
