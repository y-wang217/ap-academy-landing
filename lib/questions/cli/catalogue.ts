/**
 * `npm run catalogue:questions [-- --out docs/generator-catalogue.md] [-- --samples N]`
 *
 * Emits a Markdown catalogue of every registered generator: what it asks, what
 * misconceptions it expresses, how it scored on its sweep, and a few fully
 * rendered sample questions with their worked solutions.
 *
 * This exists because "are these questions any good?" is not a question you can
 * answer by reading generator source. It is a question you answer by reading
 * questions. The catalogue turns a code review into a document someone can skim
 * over breakfast, or hand to another tutor for a second opinion.
 *
 * Always exits 0. It is a report.
 */

import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GENERATORS } from '../generators/index.ts';
import { formatPercent, verifyGenerator, type VerificationReport } from '../verify.ts';
import { getProblemType, getUnit } from '../taxonomy/index.ts';
import { isRegisteredStrategy, strategy } from '../strategies.ts';
import type { Generator, QuestionInstance } from '../types.ts';

const DEFAULT_OUT = 'docs/generator-catalogue.md';
const DEFAULT_SAMPLES = 3;
const DEFAULT_SEEDS = 500;

interface CliArgs {
  out: string;
  samples: number;
  seeds: number;
  stdout: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    out: DEFAULT_OUT,
    samples: DEFAULT_SAMPLES,
    seeds: DEFAULT_SEEDS,
    stdout: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--stdout') args.stdout = true;
    else if (arg === '--out') args.out = argv[++i] ?? DEFAULT_OUT;
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--samples') args.samples = Number(argv[++i]);
    else if (arg.startsWith('--samples=')) args.samples = Number(arg.slice('--samples='.length));
    else if (arg === '--seeds') args.seeds = Number(argv[++i]);
    else if (arg.startsWith('--seeds=')) args.seeds = Number(arg.slice('--seeds='.length));
  }
  return args;
}

const USAGE = `
Usage: npm run catalogue:questions [-- --out PATH] [-- --samples N] [-- --seeds N] [-- --stdout]

  --out PATH    Where to write the catalogue. Default: ${DEFAULT_OUT}
  --samples N   Sample questions per generator. Default: ${DEFAULT_SAMPLES}
  --seeds N     Seeds to sweep for the statistics. Default: ${DEFAULT_SEEDS}
  --stdout      Print to stdout instead of writing a file.
  --help        Show this message.
`.trim();

/** Wraps a LaTeX fragment for display in Markdown. */
function math(latex: string): string {
  return `\`${latex}\``;
}

/** ■, ■■, ■■■ — the house difficulty convention. */
function difficultyGlyph(difficulty: number): string {
  return '■'.repeat(difficulty);
}

function renderSample(instance: QuestionInstance, index: number): string[] {
  const lines: string[] = [];
  lines.push(`<summary>Seed ${instance.seed}</summary>`);
  lines.push('');
  lines.push(`**${instance.stem}**`);
  lines.push('');
  instance.choices.forEach((choice, choiceIndex) => {
    const letter = 'ABCD'[choiceIndex] ?? '?';
    const marker = choice.isCorrect ? ' ← **correct**' : '';
    const attribution = choice.isCorrect
      ? ''
      : ` _(${choice.strategyId ?? 'no strategy'})_`;
    lines.push(`- **${letter}.** ${math(choice.latex)}${marker}${attribution}`);
  });
  lines.push('');
  lines.push('Solution:');
  lines.push('');
  instance.solution.forEach((step, stepIndex) => {
    lines.push(`${stepIndex + 1}. ${step}`);
  });
  lines.push('');
  void index;
  return lines;
}

function renderGenerator(
  generator: Generator,
  report: VerificationReport,
  samples: number,
): string[] {
  const lines: string[] = [];
  const problemType = getProblemType(generator.problemTypeId);
  const unit = getUnit(generator.unitId);

  lines.push(`## ${problemType?.label ?? generator.problemTypeId}`);
  lines.push('');
  lines.push(`\`${generator.id}\``);
  lines.push('');

  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(`| Unit | ${unit ? `${unit.order}. ${unit.label}` : generator.unitId} |`);
  lines.push(`| Problem type | \`${generator.problemTypeId}\` |`);
  lines.push(`| Difficulty | ${difficultyGlyph(generator.difficulty)} (${generator.difficulty}) |`);
  if (problemType) {
    lines.push(`| Learning outcome | ${problemType.outcome} |`);
    lines.push(`| Taxonomy status | ${problemType.status} |`);
  }
  lines.push(
    `| Verification | ${report.passed ? '**PASS**' : '**FAIL**'} — ${report.validCount}/${report.seedCount} valid, ${report.distinctStems} distinct stems (${formatPercent(report.varietyRatio)}) |`,
  );
  lines.push(
    `| Answer positions | ${report.answerPositionCounts
      .map((count, index) => `${'ABCD'[index]} ${formatPercent(count / Math.max(1, report.seedCount))}`)
      .join(' · ')} |`,
  );
  if (report.findings.length > 0) {
    lines.push(
      `| Findings | ${report.findings.map((f) => `${f.severity}: ${f.code}`).join('; ')} |`,
    );
  }
  lines.push('');

  lines.push('**Misconceptions expressed**');
  lines.push('');
  lines.push('| Strategy | Theme | What the student did | Times produced |');
  lines.push('|---|---|---|---|');
  for (const declared of generator.strategies) {
    const registered = isRegisteredStrategy(declared.id) ? strategy(declared.id) : undefined;
    const count = report.strategyCounts[declared.id] ?? 0;
    lines.push(
      `| \`${declared.id}\` | ${registered?.theme ?? '—'} | ${declared.label} | ${count}${count === 0 ? ' ⚠️ never' : ''} |`,
    );
  }
  lines.push('');

  lines.push('**Sample questions**');
  lines.push('');
  for (let seed = 0; seed < samples; seed += 1) {
    let instance: QuestionInstance;
    try {
      instance = generator.generate(seed);
    } catch (thrown) {
      lines.push(`> Seed ${seed} threw: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
      lines.push('');
      continue;
    }
    lines.push('<details>');
    lines.push(...renderSample(instance, seed));
    lines.push('</details>');
    lines.push('');
  }
  return lines;
}

/** Builds the whole catalogue as a Markdown string. */
export function buildCatalogue(
  generators: Generator[] = GENERATORS,
  options: { samples?: number; seeds?: number } = {},
): string {
  const samples = options.samples ?? DEFAULT_SAMPLES;
  const seeds = options.seeds ?? DEFAULT_SEEDS;
  const reports = generators.map((generator) => verifyGenerator(generator, seeds));

  const lines: string[] = [];
  lines.push('# Generator catalogue');
  lines.push('');
  lines.push(
    '_Generated by `npm run catalogue:questions`. Do not edit by hand — regenerate it._',
  );
  lines.push('');
  lines.push(
    `${generators.length} generator${generators.length === 1 ? '' : 's'}, each swept across ${seeds} seeds.`,
  );
  lines.push('');
  lines.push(
    'This is the document to read when the question is "are these any good?". Each entry shows what the generator asks, which student mistakes its distractors are built from, how it scored, and a few real questions with their worked solutions.',
  );
  lines.push('');

  // Contents, so a long catalogue stays navigable.
  lines.push('## Contents');
  lines.push('');
  generators.forEach((generator, index) => {
    const problemType = getProblemType(generator.problemTypeId);
    const report = reports[index];
    lines.push(
      `- ${problemType?.label ?? generator.problemTypeId} — \`${generator.id}\` (${report.passed ? 'pass' : 'FAIL'}, ${formatPercent(report.varietyRatio)} variety)`,
    );
  });
  lines.push('');

  generators.forEach((generator, index) => {
    lines.push('---');
    lines.push('');
    lines.push(...renderGenerator(generator, reports[index], samples));
  });

  return `${lines.join('\n').trimEnd()}\n`;
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (!Number.isInteger(args.samples) || args.samples < 0) {
    console.error(`--samples needs a non-negative integer, got ${args.samples}`);
    return 0;
  }
  if (!Number.isInteger(args.seeds) || args.seeds <= 0) {
    console.error(`--seeds needs a positive integer, got ${args.seeds}`);
    return 0;
  }

  const markdown = buildCatalogue(GENERATORS, { samples: args.samples, seeds: args.seeds });

  if (args.stdout) {
    console.log(markdown);
    return 0;
  }
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, markdown, 'utf8');
  console.log(
    `Wrote ${args.out} — ${GENERATORS.length} generators, ${args.samples} samples each, swept across ${args.seeds} seeds.`,
  );
  return 0;
}

/**
 * Run `main` only when this file is the process entry point.
 *
 * Without this, importing anything from a CLI module executes it — the
 * catalogue test imports `buildCatalogue` and would silently rewrite
 * `docs/generator-catalogue.md` on every test run. A test suite that mutates
 * tracked files is a test suite nobody trusts.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isEntryPoint()) {
  process.exitCode = main();
}
