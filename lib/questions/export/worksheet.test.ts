import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFFICULTY_GLYPHS,
  HOMEWORK_SEED_OFFSET,
  buildWorksheet,
  generatePair,
  isUncopyable,
  problemTypeSequence,
  reproduce,
  reproducesExactly,
  toWorksheetQuestion,
  type WorksheetBlueprint,
} from './worksheet.ts';
import { GENERATORS } from '../generators/index.ts';
import { factorTheoremFindK } from '../generators/mhf4u/u3-factor-theorem-find-k.ts';

/** A realistic Unit 3 lesson: five slots, mixed difficulty. */
const BLUEPRINT: WorksheetBlueprint = {
  courseCode: 'MHF4U',
  title: 'MHF4U — Polynomial equations and inequalities',
  entries: [
    { generatorId: 'mhf4u-u3-factor-theorem-verify-factor-d1' },
    { generatorId: 'mhf4u-u3-remainder-theorem-evaluate-d2' },
    { generatorId: 'mhf4u-u3-factor-theorem-find-k-d2' },
    { generatorId: 'mhf4u-u3-factor-fully-cubic-d2' },
    { generatorId: 'mhf4u-u3-solve-polynomial-inequality-factored-d2' },
  ],
};

// --- single-question conversion -----------------------------------------------

test('worksheet: converts an instance into the sheet shape', () => {
  const instance = factorTheoremFindK.generate(0);
  const question = toWorksheetQuestion(instance, 1);

  assert.equal(question.number, 1);
  assert.equal(question.stem, instance.stem);
  assert.equal(question.choices.length, 4);
  assert.deepEqual(question.choices.map((c) => c.label), ['A', 'B', 'C', 'D']);
  assert.deepEqual(
    question.choices.map((c) => c.latex),
    instance.choices.map((c) => c.latex),
    'choice order must be preserved — re-ordering would break the answer key',
  );
  assert.equal(question.solution, instance.solution);
  assert.equal(question.conceptTag, instance.conceptTag);
});

test('worksheet: the answer letter points at the correct choice', () => {
  for (let seed = 0; seed < 50; seed += 1) {
    const instance = factorTheoremFindK.generate(seed);
    const question = toWorksheetQuestion(instance, 1);
    const index = 'ABCD'.indexOf(question.answer);
    assert.equal(
      instance.choices[index].isCorrect,
      true,
      `seed ${seed}: answer ${question.answer} is not the correct choice`,
    );
  }
});

test('worksheet: carries the house difficulty glyph', () => {
  const question = toWorksheetQuestion(factorTheoremFindK.generate(0), 1);
  assert.equal(question.difficulty, 2);
  assert.equal(question.difficultyGlyph, '■■');
  assert.deepEqual(DIFFICULTY_GLYPHS, { 1: '■', 2: '■■', 3: '■■■' });
});

test('worksheet: records provenance for every question', () => {
  const question = toWorksheetQuestion(factorTheoremFindK.generate(7), 1);
  assert.deepEqual(question.source, {
    generatorId: 'mhf4u-u3-factor-theorem-find-k-d2',
    seed: 7,
    problemTypeId: 'mhf4u-u3-factor-theorem-find-k',
  });
});

test('worksheet: rejects an instance with no correct choice', () => {
  const instance = factorTheoremFindK.generate(0);
  const broken = {
    ...instance,
    choices: instance.choices.map((choice) => ({ ...choice, isCorrect: false })),
  };
  assert.throws(() => toWorksheetQuestion(broken, 1), /no correct choice/);
});

// --- building a sheet ----------------------------------------------------------

test('worksheet: builds a sheet with one question per blueprint entry', () => {
  const sheet = buildWorksheet(BLUEPRINT, { kind: 'in-class', startSeed: 0 });
  assert.equal(sheet.kind, 'in-class');
  assert.equal(sheet.courseCode, 'MHF4U');
  assert.equal(sheet.questions.length, BLUEPRINT.entries.length);
  assert.deepEqual(sheet.questions.map((q) => q.number), [1, 2, 3, 4, 5]);
});

test('worksheet: question n uses seed startSeed + n', () => {
  const sheet = buildWorksheet(BLUEPRINT, { kind: 'in-class', startSeed: 100 });
  assert.deepEqual(sheet.seeds, [100, 101, 102, 103, 104]);
  assert.deepEqual(sheet.questions.map((q) => q.source.seed), [100, 101, 102, 103, 104]);
});

test('worksheet: keeps blueprint order', () => {
  const sheet = buildWorksheet(BLUEPRINT, { kind: 'in-class', startSeed: 0 });
  assert.deepEqual(
    sheet.questions.map((q) => q.source.generatorId),
    BLUEPRINT.entries.map((e) => e.generatorId),
  );
});

test('worksheet: groups questions into sections by taxonomy unit', () => {
  const sheet = buildWorksheet(BLUEPRINT, { kind: 'in-class', startSeed: 0 });
  assert.equal(sheet.sections.length, 1, 'every entry is Unit 3');
  assert.equal(sheet.sections[0].title, 'Polynomial equations and inequalities');
  assert.equal(sheet.sections[0].questions.length, 5);
  assert.equal(sheet.sections[0].outcomes.length, 5, 'one outcome per distinct problem type');
});

test('worksheet: rejects an unregistered generator id', () => {
  assert.throws(
    () =>
      buildWorksheet(
        { ...BLUEPRINT, entries: [{ generatorId: 'not-a-generator' }] },
        { kind: 'in-class', startSeed: 0 },
      ),
    /Unknown generator/,
  );
});

test('worksheet: a sheet is fully described by its blueprint plus one seed', () => {
  const first = buildWorksheet(BLUEPRINT, { kind: 'in-class', startSeed: 42 });
  const second = buildWorksheet(BLUEPRINT, { kind: 'in-class', startSeed: 42 });
  assert.deepEqual(first, second);
});

// --- paired generation ---------------------------------------------------------

test('worksheet: a pair mirrors problem types exactly', () => {
  const { inClass, homework } = generatePair(BLUEPRINT);
  assert.deepEqual(
    problemTypeSequence(homework),
    problemTypeSequence(inClass),
    'the homework must test the same types in the same order',
  );
});

test('worksheet: a pair is uncopyable by construction', () => {
  const pair = generatePair(BLUEPRINT);
  assert.equal(pair.uncopyable, true);
  for (let index = 0; index < pair.inClass.questions.length; index += 1) {
    assert.notEqual(
      pair.homework.questions[index].stem,
      pair.inClass.questions[index].stem,
      `question ${index + 1} is identical on both sheets`,
    );
  }
});

test('worksheet: the two sheets draw from disjoint seeds', () => {
  const pair = generatePair(BLUEPRINT);
  const overlap = pair.inClass.seeds.filter((seed) => pair.homework.seeds.includes(seed));
  assert.deepEqual(overlap, [], 'a shared seed would reproduce the same question');
  assert.ok(Math.min(...pair.homework.seeds) >= HOMEWORK_SEED_OFFSET);
});

test('worksheet: uncopyability holds across many starting seeds', () => {
  for (let startSeed = 0; startSeed < 60; startSeed += 1) {
    const pair = generatePair(BLUEPRINT, startSeed);
    assert.ok(pair.uncopyable, `startSeed ${startSeed} produced a copyable pair`);
  }
});

test('worksheet: the homework can step up to a different generator per slot', () => {
  const stepped: WorksheetBlueprint = {
    ...BLUEPRINT,
    entries: [
      {
        generatorId: 'mhf4u-u3-factor-theorem-verify-factor-d1',
        homeworkGeneratorId: 'mhf4u-u3-factor-theorem-find-k-d2',
      },
    ],
  };
  const pair = generatePair(stepped);
  assert.equal(pair.inClass.questions[0].difficulty, 1);
  assert.equal(pair.homework.questions[0].difficulty, 2);
  assert.equal(
    pair.homework.questions[0].source.generatorId,
    'mhf4u-u3-factor-theorem-find-k-d2',
  );
});

test('worksheet: generatePair rejects an empty blueprint', () => {
  assert.throws(() => generatePair({ ...BLUEPRINT, entries: [] }), /at least one entry/);
});

test('worksheet: isUncopyable catches an identical counterpart', () => {
  const sheet = buildWorksheet(BLUEPRINT, { kind: 'in-class', startSeed: 0 });
  const twin = buildWorksheet(BLUEPRINT, { kind: 'homework', startSeed: 0 });
  assert.equal(isUncopyable(sheet, twin), false, 'the same seeds must not read as distinct');
});

test('worksheet: isUncopyable catches a reworded prompt with identical options', () => {
  const sheet = buildWorksheet(BLUEPRINT, { kind: 'in-class', startSeed: 0 });
  const reworded = {
    ...sheet,
    questions: sheet.questions.map((question) => ({ ...question, stem: `${question.stem} ` })),
  };
  assert.equal(
    isUncopyable(sheet, reworded),
    false,
    'same options with a tweaked prompt is still the same question',
  );
});

test('worksheet: isUncopyable rejects mismatched lengths', () => {
  const sheet = buildWorksheet(BLUEPRINT, { kind: 'in-class', startSeed: 0 });
  const short = { ...sheet, questions: sheet.questions.slice(0, 2) };
  assert.equal(isUncopyable(sheet, short), false);
});

// --- reproducibility -----------------------------------------------------------

test('worksheet: a sheet reproduces exactly from its recorded provenance', () => {
  // The property that makes a printed worksheet an artifact rather than a
  // one-off: months later, the same generator and seed give the same questions.
  const pair = generatePair(BLUEPRINT, 7);
  assert.ok(reproducesExactly(pair.inClass));
  assert.ok(reproducesExactly(pair.homework));
});

test('worksheet: reproduce returns the same instances the sheet was built from', () => {
  const sheet = buildWorksheet(BLUEPRINT, { kind: 'in-class', startSeed: 3 });
  const rebuilt = reproduce(sheet);
  assert.equal(rebuilt.length, sheet.questions.length);
  rebuilt.forEach((instance, index) => {
    assert.equal(instance.stem, sheet.questions[index].stem);
    assert.equal(instance.seed, sheet.questions[index].source.seed);
  });
});

// --- the whole registry --------------------------------------------------------

test('worksheet: every registered generator can be put on a sheet', () => {
  const everything: WorksheetBlueprint = {
    courseCode: 'MHF4U',
    title: 'Everything',
    entries: GENERATORS.map((generator) => ({ generatorId: generator.id })),
  };
  const pair = generatePair(everything);
  assert.equal(pair.inClass.questions.length, GENERATORS.length);
  assert.ok(pair.uncopyable);
  for (const question of pair.inClass.questions) {
    assert.ok(question.stem.length > 0);
    assert.equal(question.choices.length, 4);
    assert.ok(question.solution.length >= 2);
    assert.ok('ABCD'.includes(question.answer));
  }
});
