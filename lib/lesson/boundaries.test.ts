import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `lib/lesson/` imports from `lib/questions/` only. Never from `app/`, never
 * React, never `next/*`, never `@supabase/*`. A lesson must run headless
 * under `node --test`, and one stray import from the UI layer would drag the
 * whole framework in. Asserted here rather than by convention.
 */

const LESSON_ROOT = fileURLToPath(new URL('.', import.meta.url));

/** Import specifiers that may not appear anywhere under `lib/lesson/`. */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /^react(\/|$)/, why: 'React' },
  { pattern: /^react-dom(\/|$)/, why: 'React' },
  { pattern: /^next(\/|$)/, why: 'next/*' },
  { pattern: /^@supabase\//, why: '@supabase/*' },
  { pattern: /(^|\/)app\//, why: 'app/' },
  { pattern: /(^|\/)components\//, why: 'components/' },
  { pattern: /^@\/app\//, why: 'app/ via the @ alias' },
];

/** Relative imports must stay inside `lib/lesson/` or point into `lib/questions/`. */
const ALLOWED_RELATIVE = /^(\.\/|\.\.\/questions\/)/;

/**
 * Test files only may also import the shipped lessons under `content/lessons/`,
 * because `validate.test.ts` has to prove the shipped lesson passes and
 * `play.test.ts` has to play it. Source files may not: a lesson is input to the
 * engine, never a dependency of it.
 */
const ALLOWED_RELATIVE_IN_TESTS = /^\.\.\/\.\.\/content\/lessons\//;

/** Matches `import ... from 'x'`, `import 'x'`, `export ... from 'x'`, and `import('x')`. */
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;

function collectTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectTsFiles(full, acc);
    else if (entry.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

function specifiersIn(source: string): string[] {
  const out: string[] = [];
  let match = IMPORT_SPECIFIER.exec(source);
  while (match !== null) {
    out.push(match[1]);
    match = IMPORT_SPECIFIER.exec(source);
  }
  IMPORT_SPECIFIER.lastIndex = 0;
  return out;
}

/**
 * `file` is relative to `lib/lesson/`, e.g. `cli/validate-lessons.ts`.
 * Relative specifiers are resolved against the file's own directory and then
 * re-expressed relative to `lib/lesson/`, so `../validate.ts` from `cli/` reads
 * as `./validate.ts` and `../questions/rng.ts` from a subdirectory is caught.
 */
function offencesIn(file: string, source: string): string[] {
  const offences: string[] = [];
  const fileDir = posix.dirname(file);
  for (const specifier of specifiersIn(source)) {
    const forbidden = FORBIDDEN.find(({ pattern }) => pattern.test(specifier));
    if (forbidden) {
      offences.push(`${file}: imports ${JSON.stringify(specifier)} (${forbidden.why})`);
      continue;
    }
    if (specifier.startsWith('node:')) continue;
    if (!specifier.startsWith('.')) continue;
    const fromRoot = posix.normalize(posix.join(fileDir, specifier));
    const resolved = fromRoot.startsWith('.') ? fromRoot : `./${fromRoot}`;
    if (file.endsWith('.test.ts') && ALLOWED_RELATIVE_IN_TESTS.test(resolved)) continue;
    if (!ALLOWED_RELATIVE.test(resolved)) {
      offences.push(`${file}: relative import ${JSON.stringify(specifier)} leaves lib/lesson and lib/questions`);
    }
  }
  return offences;
}

test('lib/lesson imports only from lib/questions, node builtins and itself', () => {
  const files = collectTsFiles(LESSON_ROOT);
  assert.ok(files.length > 0, 'found no TypeScript files to scan');
  const offences = files.flatMap((file) =>
    offencesIn(relative(LESSON_ROOT, file), readFileSync(file, 'utf8')),
  );
  assert.deepEqual(offences, [], `Forbidden imports in lib/lesson:\n${offences.join('\n')}`);
});

/**
 * Builds an import statement at run time, so this file's own source never
 * contains a forbidden specifier for the scan above to trip on.
 */
const Q = String.fromCharCode(39);
const imp = (specifier: string): string => `import { x } from ${Q}${specifier}${Q};`;
const dyn = (specifier: string): string => `const m = await import(${Q}${specifier}${Q});`;
const reexp = (specifier: string): string => `export { z } from ${Q}${specifier}${Q};`;

test('the boundary check actually catches each forbidden import', () => {
  const cases = [
    imp('react'),
    imp('react-dom/client'),
    imp('next/link'),
    imp('@supabase/ssr'),
    imp('../../app/learn/page.tsx'),
    imp('@/app/config.ts'),
    imp('../analytics.ts'),
    imp('../../content/lessons/mhf4u-u3-polynomial-equations.ts'),
    reexp('../../components/Hero.tsx'),
    dyn('next/navigation'),
  ];
  for (const source of cases) {
    assert.ok(offencesIn('fixture.ts', source).length > 0, `not caught: ${source}`);
  }
  for (const source of [
    imp('../questions/rng.ts'),
    imp('./types.ts'),
    imp('node:test'),
  ]) {
    assert.deepEqual(offencesIn('fixture.ts', source), [], `wrongly caught: ${source}`);
  }
});

test('relative imports are resolved from the importing file, not string-matched', () => {
  assert.deepEqual(offencesIn('cli/validate-lessons.ts', imp('../validate.ts')), []);
  assert.deepEqual(offencesIn('cli/validate-lessons.ts', imp('../../questions/rng.ts')), []);
  assert.ok(offencesIn('cli/validate-lessons.ts', imp('../../analytics.ts')).length > 0);
  assert.ok(offencesIn('cli/validate-lessons.ts', imp('../../../content/lessons/x.ts')).length > 0);
});

test('only test files may import the shipped lessons', () => {
  const source = imp('../../content/lessons/mhf4u-u3-polynomial-equations.ts');
  assert.deepEqual(offencesIn('validate.test.ts', source), []);
  assert.ok(offencesIn('validate.ts', source).length > 0);
});
