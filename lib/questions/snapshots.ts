/**
 * Golden snapshots: the full output of seeds 0–4 for every generator, frozen
 * into a committed file.
 *
 * Verification proves a generator is *sound*. Snapshots prove it has not
 * *changed*. Those are different questions, and only the second one catches a
 * refactor that silently rewords a stem, reorders choices, or shifts an answer
 * — none of which any validity rule would notice, because the new output is
 * just as valid as the old.
 *
 * The workflow is deliberately two-step: the test compares, and regenerating is
 * a separate explicit command. A snapshot that updates itself on failure proves
 * nothing at all.
 *
 *     npm run snapshots:questions        # regenerate, deliberately
 *     npm run test:questions             # compare
 *
 * When a diff appears, read it. If the change was intended, regenerate and
 * commit the new snapshot alongside the change that caused it — the diff is the
 * record of what a refactor did to the questions.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GENERATORS } from './generators/index.ts';
import { bigintSafeReplacer } from './verify.ts';
import type { Generator, QuestionInstance } from './types.ts';

/** Seeds locked into the snapshot. Small enough to read in a diff. */
export const SNAPSHOT_SEEDS = [0, 1, 2, 3, 4];

/** Where the committed snapshot lives. */
export const SNAPSHOT_PATH = fileURLToPath(new URL('./__snapshots__/generators.json', import.meta.url));

/** One generator's frozen output. */
export interface GeneratorSnapshot {
  generatorId: string;
  unitId: string;
  problemTypeId: string;
  difficulty: number;
  strategyIds: string[];
  instances: QuestionInstance[];
}

/** The whole snapshot file. */
export interface SnapshotFile {
  /**
   * Bumped by hand when the snapshot *format* changes, as opposed to the
   * content. Lets a future session tell "the generators changed" from "the
   * snapshot shape changed".
   */
  version: number;
  seeds: number[];
  generators: GeneratorSnapshot[];
}

export const SNAPSHOT_VERSION = 1;

/** Builds the current snapshot from the live registry. */
export function buildSnapshot(generators: Generator[] = GENERATORS): SnapshotFile {
  return {
    version: SNAPSHOT_VERSION,
    seeds: SNAPSHOT_SEEDS,
    generators: generators.map((generator) => ({
      generatorId: generator.id,
      unitId: generator.unitId,
      problemTypeId: generator.problemTypeId,
      difficulty: generator.difficulty,
      strategyIds: generator.strategies.map((entry) => entry.id),
      instances: SNAPSHOT_SEEDS.map((seed) => generator.generate(seed)),
    })),
  };
}

/**
 * Serializes a snapshot.
 *
 * Pretty-printed on purpose: the file exists to be read as a diff, and a
 * minified blob would show every change as one unreadable line. `bigintSafeReplacer`
 * is required because `Choice.value` carries `Rational`s built from `bigint`.
 */
export function serializeSnapshot(snapshot: SnapshotFile): string {
  return `${JSON.stringify(snapshot, bigintSafeReplacer, 2)}\n`;
}

/** Reads the committed snapshot, or `null` when it has never been written. */
export function readSnapshot(path: string = SNAPSHOT_PATH): SnapshotFile | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SnapshotFile;
  } catch {
    return null;
  }
}
