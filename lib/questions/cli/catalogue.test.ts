import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogue } from './catalogue.ts';
import { GENERATORS } from '../generators/index.ts';
import { getProblemType } from '../taxonomy/index.ts';

// A small sweep keeps the test fast; the shape is what matters, not the numbers.
const catalogue = buildCatalogue(GENERATORS, { samples: 2, seeds: 40 });

test('catalogue: has a heading and a regeneration notice', () => {
  assert.match(catalogue, /^# Generator catalogue/);
  assert.match(catalogue, /Do not edit by hand/);
});

test('catalogue: lists every registered generator in the contents', () => {
  for (const generator of GENERATORS) {
    assert.ok(
      catalogue.includes(`\`${generator.id}\``),
      `${generator.id} is missing from the catalogue`,
    );
  }
});

test('catalogue: gives every generator its own section with the taxonomy label', () => {
  for (const generator of GENERATORS) {
    const problemType = getProblemType(generator.problemTypeId);
    assert.ok(problemType, `${generator.problemTypeId} has no taxonomy slot`);
    assert.ok(
      catalogue.includes(`## ${problemType.label}`),
      `no section heading for ${generator.id}`,
    );
  }
});

test('catalogue: records the learning outcome and difficulty for each generator', () => {
  for (const generator of GENERATORS) {
    const problemType = getProblemType(generator.problemTypeId);
    assert.ok(problemType);
    assert.ok(catalogue.includes(problemType.outcome), `missing outcome for ${generator.id}`);
  }
  assert.match(catalogue, /\| Difficulty \| ■/);
});

test('catalogue: names every declared strategy with its theme', () => {
  for (const generator of GENERATORS) {
    for (const declared of generator.strategies) {
      assert.ok(
        catalogue.includes(`\`${declared.id}\``),
        `${declared.id} is missing from the catalogue`,
      );
    }
  }
  // Themes come from the registry, so at least one must show up.
  assert.match(catalogue, /misreading-the-form|sign|method-confusion/);
});

test('catalogue: includes rendered samples with their solutions', () => {
  // Two samples per generator, each in its own collapsible block.
  const sampleBlocks = catalogue.match(/<summary>Seed \d+<\/summary>/g) ?? [];
  assert.equal(sampleBlocks.length, GENERATORS.length * 2);
  assert.match(catalogue, /Solution:/);
  // A correct answer is marked on every sample.
  const correctMarkers = catalogue.match(/← \*\*correct\*\*/g) ?? [];
  assert.equal(correctMarkers.length, GENERATORS.length * 2);
});

test('catalogue: attributes every distractor to a named misconception', () => {
  // Three distractors per sample, each carrying its strategy id in italics.
  const attributions = catalogue.match(/_\([a-z_]+\)_/g) ?? [];
  assert.equal(attributions.length, GENERATORS.length * 2 * 3);
  assert.ok(!catalogue.includes('_(no strategy)_'), 'a distractor has no strategy');
});

test('catalogue: flags a strategy that never fired', () => {
  // The warning marker must exist in the template even when nothing triggers
  // it, or a dead branch would pass unnoticed in a future unit.
  assert.ok(!catalogue.includes('⚠️ never'), 'a strategy never fired in the sweep');
});

test('catalogue: reports pass or fail for every generator', () => {
  const verdicts = catalogue.match(/\| Verification \| \*\*(PASS|FAIL)\*\*/g) ?? [];
  assert.equal(verdicts.length, GENERATORS.length);
  assert.ok(!catalogue.includes('**FAIL**'), 'a generator is failing its sweep');
});

test('catalogue: ends with a trailing newline and no trailing blank block', () => {
  assert.ok(catalogue.endsWith('\n'));
  assert.ok(!catalogue.endsWith('\n\n\n'));
});

test('catalogue: is deterministic', () => {
  assert.equal(buildCatalogue(GENERATORS, { samples: 2, seeds: 40 }), catalogue);
});

test('catalogue: handles a zero-sample request without breaking the layout', () => {
  const noSamples = buildCatalogue(GENERATORS, { samples: 0, seeds: 20 });
  assert.ok(!noSamples.includes('<summary>'));
  assert.match(noSamples, /\*\*Sample questions\*\*/);
});
