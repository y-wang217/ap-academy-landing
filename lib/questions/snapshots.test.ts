import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAPSHOT_SEEDS,
  SNAPSHOT_VERSION,
  buildSnapshot,
  readSnapshot,
  serializeSnapshot,
  type GeneratorSnapshot,
  type SnapshotFile,
} from './snapshots.ts';
import { GENERATORS } from './generators/index.ts';
import { bigintSafeReplacer } from './verify.ts';

// Explicitly annotated: TypeScript only narrows through an assertion function
// (assert.ok) when the narrowed name carries a declared type.
const committed: SnapshotFile | null = readSnapshot();
const current = buildSnapshot(GENERATORS);

test('snapshots: a committed snapshot exists', () => {
  assert.ok(
    committed !== null,
    'No golden snapshot found. Run `npm run snapshots:questions` and commit the result.',
  );
});

test('snapshots: the snapshot format version matches', () => {
  assert.ok(committed);
  assert.equal(
    committed.version,
    SNAPSHOT_VERSION,
    'The snapshot format changed. Regenerate with `npm run snapshots:questions`.',
  );
  assert.deepEqual(committed.seeds, SNAPSHOT_SEEDS);
});

test('snapshots: every registered generator is in the snapshot', () => {
  assert.ok(committed);
  const snapshotIds = committed.generators.map((entry) => entry.generatorId).sort();
  const registryIds = GENERATORS.map((generator) => generator.id).sort();
  assert.deepEqual(
    snapshotIds,
    registryIds,
    'The registry and the snapshot disagree about which generators exist. Run `npm run snapshots:questions`.',
  );
});

test('snapshots: generator output is byte-identical to the committed snapshot', () => {
  assert.ok(committed);
  // Compared per generator so a failure names the one that moved, rather than
  // dumping the whole file as one diff.
  for (const currentEntry of current.generators) {
    // Annotated for the same reason as `committed`: assert.ok only narrows a
    // name that has a declared type.
    const committedEntry: GeneratorSnapshot | undefined = committed.generators.find(
      (candidate) => candidate.generatorId === currentEntry.generatorId,
    );
    assert.ok(committedEntry, `${currentEntry.generatorId} is not in the snapshot`);
    // The live side carries real bigints and the committed side carries their
    // tagged string form, so the live side goes through the same replacer the
    // snapshot was written with before comparing.
    assert.equal(
      JSON.stringify(currentEntry, bigintSafeReplacer, 2),
      JSON.stringify(committedEntry, null, 2),
      [
        `${currentEntry.generatorId} no longer produces its snapshotted output.`,
        '',
        'If this change was intended, regenerate with `npm run snapshots:questions`',
        'and commit the new snapshot alongside the change that caused it.',
        'If it was not, something reworded a stem, reordered choices, or moved an',
        'answer without meaning to.',
      ].join('\n'),
    );
  }
});

test('snapshots: declared metadata is frozen too', () => {
  assert.ok(committed);
  for (const generator of GENERATORS) {
    const entry: GeneratorSnapshot | undefined = committed.generators.find(
      (candidate) => candidate.generatorId === generator.id,
    );
    assert.ok(entry);
    assert.equal(entry.unitId, generator.unitId, `${generator.id} changed unit`);
    assert.equal(
      entry.problemTypeId,
      generator.problemTypeId,
      `${generator.id} changed problem type — this orphans stored attempts`,
    );
    assert.equal(entry.difficulty, generator.difficulty, `${generator.id} changed difficulty`);
    assert.deepEqual(
      entry.strategyIds,
      generator.strategies.map((s) => s.id),
      `${generator.id} changed its declared strategies`,
    );
  }
});

test('snapshots: each snapshotted instance is well formed', () => {
  assert.ok(committed);
  for (const entry of committed.generators) {
    assert.equal(entry.instances.length, SNAPSHOT_SEEDS.length, entry.generatorId);
    entry.instances.forEach((instance, index) => {
      assert.equal(instance.seed, SNAPSHOT_SEEDS[index], `${entry.generatorId} seed mismatch`);
      assert.equal(instance.choices.length, 4, `${entry.generatorId} seed ${instance.seed}`);
      assert.equal(
        instance.choices.filter((choice) => choice.isCorrect).length,
        1,
        `${entry.generatorId} seed ${instance.seed}`,
      );
      assert.ok(instance.solution.length >= 2, `${entry.generatorId} seed ${instance.seed}`);
    });
  }
});

test('snapshots: serialization is stable and diff-friendly', () => {
  // Two builds must serialize identically, or the snapshot would churn on every
  // regeneration and its diffs would be meaningless.
  assert.equal(serializeSnapshot(buildSnapshot(GENERATORS)), serializeSnapshot(current));
  const serialized = serializeSnapshot(current);
  assert.ok(serialized.endsWith('\n'));
  // Pretty-printed, so a change shows as a few lines rather than one long one.
  assert.ok(serialized.includes('\n  '), 'snapshot is not pretty-printed');
});

test('snapshots: bigint values survive the round trip', () => {
  // Choice.value holds Rationals built from bigint, which plain JSON.stringify
  // throws on. They are tagged as strings ending in "n".
  const serialized = serializeSnapshot(current);
  assert.match(serialized, /"num": "-?\d+n"/);
  assert.doesNotThrow(() => JSON.parse(serialized));
});
