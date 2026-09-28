/**
 * `validate:lessons`: loads every lesson under `content/lessons/`, runs
 * `validateLesson`, prints every finding, and exits non-zero on a fatal.
 *
 * Runs on `prebuild` beside `validate-sat-words.mjs`, so a generator change
 * that drifts a recorded worked set fails the build instead of shipping a
 * Together script that no longer matches its question.
 *
 * Usage:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/lesson/cli/validate-lessons.ts
 *
 * Lesson files are discovered by directory scan and loaded by dynamic import
 * of a computed path, so this file has no static import from `content/` and
 * the boundary test stays honest about what `lib/lesson/` depends on.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fatalFindings, validateLesson, type Finding } from '../validate.ts';
import type { Lesson } from '../types.ts';

const LESSONS_DIR = fileURLToPath(new URL('../../../content/lessons/', import.meta.url));

function isLesson(value: unknown): value is Lesson {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Lesson).id === 'string' &&
    Array.isArray((value as Lesson).workedSet)
  );
}

function formatFinding(finding: Finding): string {
  const tag = finding.severity === 'fatal' ? 'FATAL' : 'warn ';
  return `  ${tag}  ${finding.code}  ${finding.path}\n         ${finding.message}`;
}

async function main(): Promise<number> {
  const files = readdirSync(LESSONS_DIR)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort();

  if (files.length === 0) {
    console.error(`No lesson files found under ${LESSONS_DIR}`);
    return 1;
  }

  let fatalTotal = 0;
  let warningTotal = 0;

  for (const file of files) {
    const loaded = (await import(pathToFileURL(join(LESSONS_DIR, file)).href)) as Record<string, unknown>;
    const exported = loaded.default ?? loaded.lesson;
    if (!isLesson(exported)) {
      console.log(`${file}\n  FATAL  NOT_A_LESSON\n         File does not export a Lesson as default or as \`lesson\`.`);
      fatalTotal += 1;
      continue;
    }

    const findings = validateLesson(exported);
    const fatals = fatalFindings(findings);
    const warnings = findings.length - fatals.length;
    fatalTotal += fatals.length;
    warningTotal += warnings;

    const verdict = fatals.length === 0 ? 'PASS' : 'FAIL';
    console.log(
      `${file}  ${verdict}  (${exported.id}: ${exported.workedSet.length} worked, ${exported.testMap.entries.length} on the test map, ${fatals.length} fatal, ${warnings} warn)`,
    );
    for (const finding of findings) console.log(formatFinding(finding));
  }

  console.log('');
  console.log(
    fatalTotal === 0
      ? `PASS — ${files.length} lesson${files.length === 1 ? '' : 's'} validated, ${warningTotal} warning${warningTotal === 1 ? '' : 's'}.`
      : `FAIL — ${fatalTotal} fatal finding${fatalTotal === 1 ? '' : 's'} across ${files.length} lesson${files.length === 1 ? '' : 's'}.`,
  );
  return fatalTotal === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (thrown) => {
    console.error(thrown instanceof Error ? thrown.stack ?? thrown.message : String(thrown));
    process.exitCode = 1;
  },
);
