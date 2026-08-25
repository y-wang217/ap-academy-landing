/**
 * `npm run snapshots:questions`
 *
 * Regenerates the golden snapshot at `lib/questions/__snapshots__/generators.json`.
 *
 * Deliberately a separate command from the test that checks it. A snapshot that
 * refreshes itself whenever it fails proves nothing — the whole value is that
 * updating it is an explicit act someone has to justify in a commit.
 */

import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GENERATORS } from '../generators/index.ts';
import {
  SNAPSHOT_PATH,
  SNAPSHOT_SEEDS,
  buildSnapshot,
  readSnapshot,
  serializeSnapshot,
} from '../snapshots.ts';

function main(): number {
  const previous = readSnapshot();
  const snapshot = buildSnapshot(GENERATORS);
  const serialized = serializeSnapshot(snapshot);

  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, serialized, 'utf8');

  const previousIds = new Set((previous?.generators ?? []).map((entry) => entry.generatorId));
  const currentIds = snapshot.generators.map((entry) => entry.generatorId);
  const added = currentIds.filter((id) => !previousIds.has(id));
  const removed = [...previousIds].filter((id) => !currentIds.includes(id));

  console.log(
    `Wrote ${SNAPSHOT_PATH.replace(`${process.cwd()}/`, '')} — ${currentIds.length} generators × ${SNAPSHOT_SEEDS.length} seeds.`,
  );
  if (previous === null) {
    console.log('No previous snapshot existed; this is the first one.');
  } else {
    if (added.length > 0) console.log(`Added: ${added.join(', ')}`);
    if (removed.length > 0) console.log(`Removed: ${removed.join(', ')}`);
    console.log('Review the diff before committing — it is the record of what changed.');
  }
  return 0;
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isEntryPoint()) {
  process.exitCode = main();
}
