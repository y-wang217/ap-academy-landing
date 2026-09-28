import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fatalFindings, validateLesson, type LessonFindingCode } from './validate.ts';
import { lesson as shipped } from '../../content/lessons/mhf4u-u3-polynomial-equations.ts';
import { fromInt } from '../questions/rational.ts';
import type { Lesson } from './types.ts';

/** Deep-ish copy of the shipped lesson to mutate into a failing fixture. */
function fixture(mutate: (lesson: Lesson) => void): Lesson {
  const copy: Lesson = {
    ...shipped,
    testMap: { ...shipped.testMap, entries: shipped.testMap.entries.map((e) => ({ ...e, traps: [...e.traps] })) },
    workedSet: shipped.workedSet.map((entry) => ({
      ...entry,
      script: { steps: entry.script.steps.map((step) => ({ ...step, blank: step.blank ? { ...step.blank } : undefined })) },
    })),
  };
  mutate(copy);
  return copy;
}

function codes(lesson: Lesson): LessonFindingCode[] {
  return fatalFindings(validateLesson(lesson)).map((f) => f.code);
}

// --- the shipped lesson -----------------------------------------------------------

test('the shipped Unit 3 lesson has zero fatal findings', () => {
  const findings = validateLesson(shipped);
  assert.deepEqual(fatalFindings(findings), [], JSON.stringify(findings, null, 2));
});

test('the shipped lesson has no warnings either: map and set agree', () => {
  assert.deepEqual(validateLesson(shipped), []);
});

test('the shipped lesson lists all 15 Unit 3 problem types, one built', () => {
  assert.equal(shipped.testMap.entries.length, 15);
  assert.deepEqual(
    shipped.testMap.entries.filter((e) => e.status === 'built').map((e) => e.problemTypeId),
    ['mhf4u-u3-factor-theorem-find-k'],
  );
});

test('the shipped script has 4 to 6 steps, at least 3 with blanks', () => {
  for (const entry of shipped.workedSet) {
    const steps = entry.script.steps;
    assert.ok(steps.length >= 4 && steps.length <= 6, `${entry.problemTypeId} has ${steps.length} steps`);
    assert.ok(steps.filter((s) => s.blank).length >= 3);
  }
});

// --- every fatal rule has a failing fixture ------------------------------------------

test('fatal: unknown problem type on the test map', () => {
  const lesson = fixture((l) => {
    l.testMap.entries[0].problemTypeId = 'mhf4u-u3-does-not-exist';
  });
  assert.ok(codes(lesson).includes('UNKNOWN_PROBLEM_TYPE'));
});

test('fatal: unknown problem type in the worked set', () => {
  const lesson = fixture((l) => {
    l.workedSet[0].problemTypeId = 'mhf4u-u3-does-not-exist';
  });
  assert.ok(codes(lesson).includes('UNKNOWN_PROBLEM_TYPE'));
});

test('fatal: a built test-map entry with no registered generator', () => {
  const lesson = fixture((l) => {
    const entry = l.testMap.entries.find((e) => e.problemTypeId === 'mhf4u-u3-remainder-theorem-evaluate')!;
    entry.status = 'built';
  });
  assert.ok(codes(lesson).includes('NO_GENERATOR'));
});

test('fatal: a worked-set entry naming an unregistered generator', () => {
  const lesson = fixture((l) => {
    l.workedSet[0].generatorId = 'mhf4u-u3-factor-theorem-find-k-d9';
  });
  assert.ok(codes(lesson).includes('NO_GENERATOR'));
});

test('fatal: stem drift, the content-hash rule, names the problem type', () => {
  const lesson = fixture((l) => {
    l.workedSet[0].stem = 'A different question entirely.';
  });
  const drift = fatalFindings(validateLesson(lesson)).filter((f) => f.code === 'STEM_DRIFT');
  assert.equal(drift.length, 1);
  assert.match(drift[0].message, /mhf4u-u3-factor-theorem-find-k/);
  assert.match(drift[0].message, /seed 0/);
});

test('fatal: a changed seed is also stem drift', () => {
  const lesson = fixture((l) => {
    l.workedSet[0].seed = 1;
  });
  assert.ok(codes(lesson).includes('STEM_DRIFT'));
});

test('fatal: a script with zero blanks', () => {
  const lesson = fixture((l) => {
    for (const step of l.workedSet[0].script.steps) delete step.blank;
  });
  assert.ok(codes(lesson).includes('NO_BLANKS'));
});

test('fatal: an exact blank whose answer is empty', () => {
  const lesson = fixture((l) => {
    l.workedSet[0].script.steps[0].blank = { kind: 'exact', prompt: '?', answer: '   ', hint: 'h' };
  });
  assert.ok(codes(lesson).includes('EMPTY_ANSWER'));
});

test('fatal: a choice blank whose answer index is out of range', () => {
  const lesson = fixture((l) => {
    l.workedSet[0].script.steps[4].blank = { kind: 'choice', prompt: '?', options: ['0', '1'], answer: 2, hint: 'h' };
  });
  assert.ok(codes(lesson).includes('EMPTY_ANSWER'));
});

test('fatal: a choice blank with no options', () => {
  const lesson = fixture((l) => {
    l.workedSet[0].script.steps[4].blank = { kind: 'choice', prompt: '?', options: [], answer: 0, hint: 'h' };
  });
  assert.ok(codes(lesson).includes('EMPTY_ANSWER'));
});

test('fatal: a rational blank with no answer', () => {
  const lesson = fixture((l) => {
    // Simulates a lesson file that forgot the value; the cast is the point.
    l.workedSet[0].script.steps[0].blank = { kind: 'rational', prompt: '?', answer: undefined as never, hint: 'h' };
  });
  assert.ok(codes(lesson).includes('EMPTY_ANSWER'));
});

test('fatal: duplicate step ids', () => {
  const lesson = fixture((l) => {
    l.workedSet[0].script.steps[2].id = l.workedSet[0].script.steps[0].id;
  });
  assert.ok(codes(lesson).includes('DUPLICATE_STEP_ID'));
});

test('fatal: empty hint, prompt, say, title', () => {
  assert.ok(codes(fixture((l) => { l.workedSet[0].script.steps[0].blank!.hint = ''; })).includes('EMPTY_FIELD'));
  assert.ok(codes(fixture((l) => { l.workedSet[0].script.steps[0].blank!.prompt = ' '; })).includes('EMPTY_FIELD'));
  assert.ok(codes(fixture((l) => { l.workedSet[0].script.steps[1].say = ''; })).includes('EMPTY_FIELD'));
  assert.ok(codes(fixture((l) => { l.title = ''; })).includes('EMPTY_FIELD'));
});

test('fatal: unknown course or unit', () => {
  assert.ok(codes(fixture((l) => { l.courseCode = 'MCV4U'; })).includes('UNKNOWN_COURSE'));
  assert.ok(codes(fixture((l) => { l.unitId = 'mhf4u-u9-nothing'; })).includes('UNKNOWN_UNIT'));
  assert.ok(codes(fixture((l) => { l.testMap.unitId = 'mhf4u-u2-polynomial-functions'; })).includes('UNKNOWN_UNIT'));
});

test('validateLesson never throws, even when a generator would', () => {
  const lesson = fixture((l) => {
    l.workedSet[0].seed = 1.5; // createRng rejects a non-integer seed
  });
  let findings: ReturnType<typeof validateLesson> = [];
  assert.doesNotThrow(() => {
    findings = validateLesson(lesson);
  });
  assert.ok(findings.some((f) => f.code === 'STEM_DRIFT'));
});

// --- warnings ----------------------------------------------------------------------

test('warning: a built test-map entry with no worked-set entry', () => {
  const lesson = fixture((l) => {
    l.workedSet = [];
  });
  const findings = validateLesson(lesson);
  assert.ok(findings.some((f) => f.code === 'MAP_WITHOUT_SET' && f.severity === 'warning'));
  assert.deepEqual(fatalFindings(findings), []);
});

test('warning: a worked-set entry not on the test map', () => {
  const lesson = fixture((l) => {
    l.testMap.entries = l.testMap.entries.filter((e) => e.problemTypeId !== 'mhf4u-u3-factor-theorem-find-k');
  });
  const findings = validateLesson(lesson);
  assert.ok(findings.some((f) => f.code === 'SET_WITHOUT_MAP' && f.severity === 'warning'));
  assert.deepEqual(fatalFindings(findings), []);
});

test('a valid rational blank passes', () => {
  const lesson = fixture((l) => {
    l.workedSet[0].script.steps[0].blank = { kind: 'rational', prompt: 'r = ?', answer: fromInt(-3), hint: 'sign' };
  });
  assert.deepEqual(codes(lesson), []);
});
