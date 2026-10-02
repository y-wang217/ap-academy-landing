import wordData from "./sat-words.json";

export type Pos = "n" | "v" | "adj" | "adv";

export type SatWord = {
  id: number;
  word: string;
  pos: Pos;
  definition: string;
  senses: number;
  distractorIds: number[];
};

export const WORDS = wordData as SatWord[];

/** Human-readable part of speech, shown on the card and in the quiz stem. */
export const POS_LABEL: Record<Pos, string> = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
};

const byId = new Map<number, SatWord>(WORDS.map((w) => [w.id, w]));

export function wordById(id: number): SatWord | undefined {
  return byId.get(id);
}

/** A random word, optionally avoiding the one currently on screen. */
export function randomWord(exclude?: SatWord): SatWord {
  if (WORDS.length < 2) return WORDS[0];
  let next = WORDS[Math.floor(Math.random() * WORDS.length)];
  while (exclude && next.id === exclude.id) {
    next = WORDS[Math.floor(Math.random() * WORDS.length)];
  }
  return next;
}

/** Fisher-Yates. Returns a new array; never mutates the input. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Sample `count` distractors from the word's six precomputed candidates, so the
 * same word doesn't always present identical wrong answers. The candidates are
 * already same-POS and collision-checked at build time — no definition ever
 * duplicates the correct answer or another option.
 */
export function sampleDistractors(word: SatWord, count = 3): SatWord[] {
  const candidates = word.distractorIds
    .map((id) => byId.get(id))
    .filter((w): w is SatWord => w !== undefined);
  return shuffle(candidates).slice(0, count);
}

export type QuizQuestion = {
  word: SatWord;
  options: SatWord[];
};

/** One question: the word plus four shuffled options, one of them correct. */
export function buildQuestion(exclude?: SatWord): QuizQuestion {
  const word = randomWord(exclude);
  return { word, options: shuffle([word, ...sampleDistractors(word)]) };
}
