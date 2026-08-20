/**
 * Validates app/sat/sat-words.json against the guarantees the word list is built
 * to hold. Runs on `prebuild`, so a regeneration that breaks any of them fails
 * the build rather than shipping broken quiz questions.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const words = JSON.parse(
  readFileSync(join(here, "..", "app", "sat", "sat-words.json"), "utf8")
);

const ALLOWED_POS = new Set(["n", "v", "adj", "adv"]);
/** adv folds into adj: there is exactly one adverb and it can't draw six of its own. */
const pool = (pos) => (pos === "adv" ? "adj" : pos);

const failures = [];
const fail = (msg) => failures.push(msg);

if (!Array.isArray(words) || words.length === 0) {
  fail("word list is not a non-empty array");
}

const byId = new Map();
const seenWords = new Map();
const defOwners = new Map();

for (const w of words) {
  if (byId.has(w.id)) fail(`duplicate id ${w.id} (${w.word})`);
  byId.set(w.id, w);

  if (seenWords.has(w.word)) fail(`duplicate word "${w.word}"`);
  seenWords.set(w.word, w);

  if (!ALLOWED_POS.has(w.pos)) fail(`"${w.word}" has invalid pos "${w.pos}"`);
  if (typeof w.definition !== "string" || w.definition.trim() === "") {
    fail(`"${w.word}" has an empty definition`);
  }
  if (/\((?:n|v|adj|adv)\.\)/.test(w.definition)) {
    fail(`"${w.word}" still carries a POS tag in its definition text`);
  }
  if (w.senses === 2 && !w.definition.includes(";")) {
    fail(`"${w.word}" claims two senses but has no ";" separator`);
  }

  const owners = defOwners.get(w.definition) ?? [];
  owners.push(w.word);
  defOwners.set(w.definition, owners);
}

// Definition twins are allowed to exist (the source genuinely has six pairs),
// but the distractor picker below must never offer one as a wrong answer.
const twins = new Map();
for (const [definition, owners] of defOwners) {
  if (owners.length > 1) {
    for (const owner of owners) {
      twins.set(owner, owners.filter((o) => o !== owner));
    }
    console.log(`  note: definition twins — ${owners.join(" / ")} ("${definition}")`);
  }
}

for (const w of words) {
  const ids = w.distractorIds;
  if (!Array.isArray(ids) || ids.length !== 6) {
    fail(`"${w.word}" has ${ids?.length ?? 0} distractors, expected 6`);
    continue;
  }
  if (new Set(ids).size !== 6) fail(`"${w.word}" has duplicate distractor ids`);
  if (ids.includes(w.id)) fail(`"${w.word}" lists itself as a distractor`);

  const definitions = new Set([w.definition]);
  for (const id of ids) {
    const other = byId.get(id);
    if (!other) {
      fail(`"${w.word}" references missing distractor id ${id}`);
      continue;
    }
    if (pool(other.pos) !== pool(w.pos)) {
      fail(`"${w.word}" (${w.pos}) draws distractor "${other.word}" (${other.pos})`);
    }
    if (other.definition === w.definition) {
      fail(`"${w.word}" offers definition-twin "${other.word}" as a distractor`);
    }
    if (definitions.has(other.definition)) {
      fail(`"${w.word}" has two distractors sharing the text "${other.definition}"`);
    }
    definitions.add(other.definition);
  }
}

const posCounts = words.reduce((acc, w) => {
  acc[w.pos] = (acc[w.pos] ?? 0) + 1;
  return acc;
}, {});

if (failures.length > 0) {
  console.error(`\nsat-words.json FAILED validation (${failures.length} problems):`);
  for (const f of failures.slice(0, 25)) console.error(`  - ${f}`);
  if (failures.length > 25) console.error(`  ...and ${failures.length - 25} more`);
  process.exit(1);
}

console.log(
  `sat-words.json OK — ${words.length} entries, ` +
    `${Object.entries(posCounts)
      .map(([p, n]) => `${n} ${p}`)
      .join(", ")}, ${twins.size} twin-guarded words.`
);
