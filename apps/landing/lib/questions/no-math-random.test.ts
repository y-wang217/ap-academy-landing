import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The global RNG is banned across `lib/questions/`. A generator that uses it is
 * no longer reproducible from its seed, which silently breaks the promise that a
 * printed worksheet can be regenerated and that its answer key still matches.
 *
 * The needle is built by concatenation so that this file does not itself contain
 * the literal it is looking for.
 */
const NEEDLE = ['Math', '.', 'random'].join('');

const QUESTIONS_ROOT = fileURLToPath(new URL('.', import.meta.url));

function collectTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsFiles(full, acc);
    } else if (entry.endsWith('.ts')) {
      acc.push(full);
    }
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
      // Keep newlines so reported line numbers stay accurate.
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

test('lib/questions contains no calls to the banned global RNG', () => {
  const files = collectTsFiles(QUESTIONS_ROOT);
  assert.ok(files.length > 0, 'found no TypeScript files to scan');

  const offences: string[] = [];
  for (const file of files) {
    const code = stripComments(readFileSync(file, 'utf8'));
    code.split('\n').forEach((line, index) => {
      if (line.includes(NEEDLE)) {
        offences.push(`${relative(QUESTIONS_ROOT, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    offences,
    [],
    `The global RNG is banned in lib/questions. Use createRng(seed) from rng.ts.\n${offences.join('\n')}`,
  );
});

test('the comment stripper the ban relies on actually works', () => {
  const banned = `${NEEDLE}()`;
  assert.ok(!stripComments(`// ${banned}`).includes(NEEDLE));
  assert.ok(!stripComments(`/* ${banned} */`).includes(NEEDLE));
  assert.ok(!stripComments(`/**\n * ${banned}\n */`).includes(NEEDLE));
  assert.ok(stripComments(`const x = ${banned};`).includes(NEEDLE));
  assert.ok(stripComments(`const x = 1; // ok\nconst y = ${banned};`).includes(NEEDLE));
  // Line numbering must survive stripping, or offence reports point at the wrong line.
  assert.equal(stripComments('/* a\nb */\nreal').split('\n').length, 3);
});
