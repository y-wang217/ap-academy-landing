/**
 * `npm run verify:questions [generator-id] [--seeds N] [--json]`
 *
 * Sweeps every registered generator (or one named generator) and prints a
 * human-readable report. Exits non-zero if any generator recorded a fatal
 * finding, so this is safe to put in front of a commit or in CI.
 *
 * Warnings — low variety, answer-position bias, an unused strategy — are printed
 * but do not affect the exit code. They mean "these questions are weak", not
 * "this generator is broken", and the difference matters when the command is the
 * gate on a build.
 */

import { GENERATORS, generatorIds, getGenerator } from '../generators/index.ts';
import { formatPercent, verifyGenerator, type VerificationReport } from '../verify.ts';
import type { Generator } from '../types.ts';

const DEFAULT_SEED_COUNT = 500;

interface CliArgs {
  generatorId?: string;
  seedCount: number;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { seedCount: DEFAULT_SEED_COUNT, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--seeds') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`--seeds needs a positive integer, got ${JSON.stringify(argv[i + 1])}`);
      }
      args.seedCount = value;
      i += 1;
    } else if (arg.startsWith('--seeds=')) {
      const value = Number(arg.slice('--seeds='.length));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`--seeds needs a positive integer, got ${JSON.stringify(arg)}`);
      }
      args.seedCount = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown flag ${JSON.stringify(arg)}. Try --help.`);
    } else {
      args.generatorId = arg;
    }
  }
  return args;
}

const USAGE = `
Usage: npm run verify:questions [-- <generator-id>] [-- --seeds N] [-- --json]

  <generator-id>   Verify only this generator. Default: all registered.
  --seeds N        Sweep seeds 0..N-1. Default: ${DEFAULT_SEED_COUNT}.
  --json           Emit the raw reports as JSON instead of a table.
  --help           Show this message.

Registered generators:
${generatorIds().map((id) => `  ${id}`).join('\n') || '  (none)'}
`.trim();

/** Pads a cell to `width`, so the summary table lines up without a dependency. */
function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function padStart(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

function renderSummaryTable(reports: VerificationReport[]): string {
  const headers = ['GENERATOR', 'RESULT', 'VALID', 'VARIETY', 'ANSWER POSITIONS', 'FINDINGS'];
  const rows = reports.map((report) => {
    const fatal = report.findings.filter((f) => f.severity === 'fatal').length;
    const warnings = report.findings.filter((f) => f.severity === 'warning').length;
    return [
      report.generatorId,
      report.passed ? 'PASS' : 'FAIL',
      `${report.validCount}/${report.seedCount}`,
      `${report.distinctStems} (${formatPercent(report.varietyRatio)})`,
      report.answerPositionCounts
        .map((count, index) => `${'ABCD'[index]}:${count}`)
        .join(' '),
      `${fatal} fatal, ${warnings} warn`,
    ];
  });

  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column].length)),
  );

  const line = (cells: string[]): string =>
    cells.map((cell, column) => (column === 0 ? pad(cell, widths[column]) : pad(cell, widths[column]))).join('  ').trimEnd();

  const separator = widths.map((width) => '-'.repeat(width)).join('  ');
  return [line(headers), separator, ...rows.map(line)].join('\n');
}

function renderDetail(report: VerificationReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`${report.generatorId}  —  ${report.passed ? 'PASS' : 'FAIL'}`);
  lines.push('-'.repeat(Math.max(24, report.generatorId.length + 12)));
  lines.push(`  seeds swept        ${report.seedCount} (0..${report.seedCount - 1})`);
  lines.push(`  valid instances    ${report.validCount}/${report.seedCount}`);
  lines.push(`  crashes            ${report.crashCount}`);
  lines.push(
    `  distinct stems     ${report.distinctStems} (${formatPercent(report.varietyRatio)})`,
  );
  const placed = report.answerPositionCounts.reduce((sum, n) => sum + n, 0);
  lines.push(
    `  answer positions   ${report.answerPositionCounts
      .map(
        (count, index) =>
          `${'ABCD'[index]} ${count} (${placed > 0 ? formatPercent(count / placed) : 'n/a'})`,
      )
      .join('   ')}`,
  );
  const strategyEntries = Object.entries(report.strategyCounts);
  if (strategyEntries.length > 0) {
    lines.push('  strategy coverage');
    for (const [id, count] of strategyEntries) {
      lines.push(`    ${pad(id, 28)} ${padStart(String(count), 5)}${count === 0 ? '   <-- never produced' : ''}`);
    }
  }

  if (report.findings.length === 0) {
    lines.push('  findings           none');
    return lines.join('\n');
  }

  lines.push('  findings');
  for (const finding of report.findings) {
    const label = finding.severity === 'fatal' ? 'FATAL' : 'warn ';
    const seed = finding.seed === undefined ? '' : ` [seed ${finding.seed}]`;
    lines.push(`    ${label} ${finding.code}${seed}`);
    lines.push(`          ${finding.message}`);
    for (const error of finding.errors ?? []) {
      lines.push(`            - ${error.code} at ${error.path || 'instance'}: ${error.message}`);
    }
  }
  return lines.join('\n');
}

function main(): number {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('');
    console.error(USAGE);
    return 2;
  }

  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  let targets: Generator[];
  if (args.generatorId === undefined) {
    targets = GENERATORS;
  } else {
    const generator = getGenerator(args.generatorId);
    if (!generator) {
      console.error(`No generator with id ${JSON.stringify(args.generatorId)}.`);
      console.error(`Registered: ${generatorIds().join(', ') || '(none)'}`);
      return 2;
    }
    targets = [generator];
  }

  if (targets.length === 0) {
    console.error('No generators are registered in lib/questions/generators/index.ts.');
    return 2;
  }

  const reports = targets.map((generator) => verifyGenerator(generator, args.seedCount));

  if (args.json) {
    console.log(JSON.stringify(reports, null, 2));
    return reports.every((report) => report.passed) ? 0 : 1;
  }

  console.log(`Verifying ${targets.length} generator${targets.length === 1 ? '' : 's'} across ${args.seedCount} seeds each.`);
  console.log('');
  console.log(renderSummaryTable(reports));
  for (const report of reports) {
    console.log(renderDetail(report));
  }

  const failed = reports.filter((report) => !report.passed);
  const warnings = reports.reduce(
    (sum, report) => sum + report.findings.filter((f) => f.severity === 'warning').length,
    0,
  );
  console.log('');
  if (failed.length > 0) {
    console.log(
      `FAIL — ${failed.length} of ${reports.length} generators have fatal findings: ${failed.map((r) => r.generatorId).join(', ')}`,
    );
    return 1;
  }
  console.log(
    `PASS — ${reports.length} generator${reports.length === 1 ? '' : 's'} verified, ${warnings} warning${warnings === 1 ? '' : 's'}.`,
  );
  return 0;
}

process.exitCode = main();
