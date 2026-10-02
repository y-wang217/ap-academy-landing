import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The global RNG is banned in `lib/lesson/` for the same reason it is banned
 * in `lib/questions/`: a Solo set drawn from it cannot be replayed, and a
 * test run twice would not produce the same attempt list. The policy owns
 * randomness (`StudentPolicy.nextSeed`); the engine never draws.
 *
 * Sibling of `lib/questions/no-math-random.test.ts`. This one scans both
 * directories, so one test covers both, as CLAUDE.md requires.
 */
const NEEDLE = ['Math', '.', 'random'].join('');

const LESSON_ROOT = fileURLToPath(new URL('.', import.meta.url));
const QUESTIONS_ROOT = fileURLToPath(new URL('../questions/', import.meta.url));

function collectTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectTsFiles(full, acc);
    else if (entry.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

/** Blanks out block and line comments, preserving line numbering. */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

test('lib/lesson and lib/questions contain no calls to the banned global RNG', () => {
  const roots = [LESSON_ROOT, QUESTIONS_ROOT];
  const offences: string[] = [];
  for (const root of roots) {
    const files = collectTsFiles(root);
    assert.ok(files.length > 0, `found no TypeScript files under ${root}`);
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'));
      code.split('\n').forEach((line, index) => {
        if (line.includes(NEEDLE)) {
          offences.push(`${relative(LESSON_ROOT, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }
  }
  assert.deepEqual(
    offences,
    [],
    `The global RNG is banned. Use createRng(seed) from lib/questions/rng.ts, or let the policy supply the seed.\n${offences.join('\n')}`,
  );
});
