const vowels = new Map([
  ["a", ["अ", ""]],
  ["ā", ["आ", "ा"]],
  ["i", ["इ", "ि"]],
  ["ī", ["ई", "ी"]],
  ["u", ["उ", "ु"]],
  ["ū", ["ऊ", "ू"]],
  ["ṛ", ["ऋ", "ृ"]],
  ["ṝ", ["ॠ", "ॄ"]],
  ["ḷ", ["ऌ", "ॢ"]],
  ["e", ["ए", "े"]],
  ["ai", ["ऐ", "ै"]],
  ["o", ["ओ", "ो"]],
  ["au", ["औ", "ौ"]],
]);

const consonants = new Map([
  ["kh", "ख"], ["gh", "घ"], ["ch", "छ"], ["jh", "झ"], ["ṭh", "ठ"],
  ["ḍh", "ढ"], ["th", "थ"], ["dh", "ध"], ["ph", "फ"], ["bh", "भ"],
  ["k", "क"], ["g", "ग"], ["ṅ", "ङ"], ["c", "च"], ["j", "ज"],
  ["ñ", "ञ"], ["ṭ", "ट"], ["ḍ", "ड"], ["ṇ", "ण"], ["t", "त"],
  ["d", "द"], ["n", "न"], ["p", "प"], ["b", "ब"], ["m", "म"],
  ["y", "य"], ["r", "र"], ["l", "ल"], ["v", "व"], ["ś", "श"],
  ["ṣ", "ष"], ["s", "स"], ["h", "ह"], ["ḻ", "ळ"],
]);

const tokens = [...vowels.keys(), ...consonants.keys()].sort((a, b) => b.length - a.length);
const vowelMarks = new Map([...vowels].map(([key, [, mark]]) => [key, mark]));

export function toDevanagari(text) {
  let output = "";
  let pendingConsonant = "";
  let index = 0;

  const flushConsonant = () => {
    if (pendingConsonant) output += `${pendingConsonant}्`;
    pendingConsonant = "";
  };

  while (index < text.length) {
    const remaining = text.slice(index);
    const token = tokens.find((candidate) => remaining.startsWith(candidate));
    if (token) {
      if (vowels.has(token)) {
        if (pendingConsonant) {
          output += pendingConsonant + vowelMarks.get(token);
          pendingConsonant = "";
        } else {
          output += vowels.get(token)[0];
        }
      } else {
        flushConsonant();
        pendingConsonant = consonants.get(token);
      }
      index += token.length;
      continue;
    }

    const char = text[index];
    if (char === "ṃ" || char === "ṁ") {
      flushConsonant();
      output += "ं";
    } else if (char === "ḥ") {
      flushConsonant();
      output += "ः";
    } else if (char === "'" || char === "’" || char === "‘") {
      flushConsonant();
      output += "ऽ";
    } else if (/\s/u.test(char) || /[.,;:!?।॥()[\]{}–—-]/u.test(char)) {
      flushConsonant();
      output += char;
    } else {
      flushConsonant();
      output += char;
    }
    index += 1;
  }
  flushConsonant();
  return output;
}
