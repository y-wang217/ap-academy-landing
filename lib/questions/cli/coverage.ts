/**
 * `npm run coverage:questions [course-code] [--json] [--gaps N]`
 *
 * Prints what is built versus what is missing, per unit. **Always exits 0** —
 * this is a report, not a gate. On day one coverage is 1 of 112, and that is a
 * starting point rather than a failure.
 *
 * The gap list at the bottom is the work queue, ordered by unit.
 */

import { buildCoverageReport, type CoverageReport } from '../taxonomy/coverage.ts';
import { COURSES } from '../taxonomy/index.ts';

const DEFAULT_COURSE = 'MHF4U';
const DEFAULT_GAP_LIMIT = 20;

interface CliArgs {
  courseCode: string;
  json: boolean;
  gapLimit: number;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    courseCode: DEFAULT_COURSE,
    json: false,
    gapLimit: DEFAULT_GAP_LIMIT,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--gaps' || arg.startsWith('--gaps=')) {
      const raw = arg.startsWith('--gaps=') ? arg.slice('--gaps='.length) : argv[++i];
      const value = raw === 'all' ? Number.MAX_SAFE_INTEGER : Number(raw);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error(`--gaps needs a non-negative integer or "all", got ${JSON.stringify(raw)}`);
      }
      args.gapLimit = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown flag ${JSON.stringify(arg)}. Try --help.`);
    } else {
      args.courseCode = arg;
    }
  }
  return args;
}

const USAGE = `
Usage: npm run coverage:questions [-- <course-code>] [-- --json] [-- --gaps N]

  <course-code>   Course to report on. Default: ${DEFAULT_COURSE}.
  --gaps N        Show N gaps, or "all". Default: ${DEFAULT_GAP_LIMIT}.
  --json          Emit the raw report as JSON.
  --help          Show this message.

Known courses:
${COURSES.map((course) => `  ${course.code}  ${course.label}`).join('\n')}
`.trim();

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function padStart(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(0)}%`;
}

/** `[1, 2]` renders as `1,2`; an empty list as `-`. */
function tiers(values: number[]): string {
  return values.length === 0 ? '-' : values.join(',');
}

function renderUnitTable(report: CoverageReport): string {
  const headers = ['#', 'UNIT', 'TYPES', 'EXCL', 'SCOPE', 'BUILT', 'FULL', 'COVERAGE'];
  const rows = report.units.map((unit) => [
    String(unit.order),
    unit.label,
    String(unit.total),
    String(unit.excluded),
    String(unit.inScope),
    String(unit.covered),
    String(unit.fullyCovered),
    `${percent(unit.coverageRatio)}`,
  ]);
  rows.push([
    '',
    'TOTAL',
    String(report.totals.total),
    String(report.totals.excluded),
    String(report.totals.inScope),
    String(report.totals.covered),
    String(report.totals.fullyCovered),
    percent(report.totals.coverageRatio),
  ]);

  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column].length)),
  );
  const numeric = new Set([0, 2, 3, 4, 5, 6, 7]);
  const line = (cells: string[]): string =>
    cells
      .map((cell, column) =>
        numeric.has(column) ? padStart(cell, widths[column]) : pad(cell, widths[column]),
      )
      .join('  ')
      .trimEnd();

  const separator = widths.map((width) => '-'.repeat(width)).join('  ');
  const body = rows.map(line);
  const totalRow = body.pop() as string;
  return [line(headers), separator, ...body, separator, totalRow].join('\n');
}

function renderCoveredDetail(report: CoverageReport): string {
  const covered = report.units.flatMap((unit) =>
    unit.problemTypes
      .filter((coverage) => coverage.covered)
      .map((coverage) => ({ unit, coverage })),
  );
  if (covered.length === 0) {
    return 'Covered problem types\n  (none yet)';
  }
  const lines = ['Covered problem types'];
  for (const { unit, coverage } of covered) {
    const mark = coverage.fullyCovered ? '[x]' : '[~]';
    lines.push(
      `  ${mark} u${unit.order}  ${coverage.problemTypeId}`,
      `        ${coverage.label}`,
      `        tiers declared ${tiers(coverage.declaredDifficulties)} | built ${tiers(coverage.coveredDifficulties)} | missing ${tiers(coverage.missingDifficulties)}`,
      `        generators: ${coverage.generatorIds.join(', ')}`,
    );
  }
  return lines.join('\n');
}

function renderGaps(report: CoverageReport, limit: number): string {
  if (report.gaps.length === 0) {
    return 'Gaps\n  None — every in-scope problem type has a generator.';
  }
  const shown = report.gaps.slice(0, limit);
  const lines = [`Gaps (${report.gaps.length} total, showing ${shown.length}, in unit order)`];
  let currentUnit = '';
  for (const gap of shown) {
    if (gap.unitId !== currentUnit) {
      currentUnit = gap.unitId;
      lines.push(`  Unit ${gap.unitOrder} — ${gap.unitLabel}`);
    }
    const marker = gap.entirelyMissing ? ' ' : '~';
    lines.push(
      `    [${marker}] ${pad(gap.problemTypeId, 52)} tiers ${tiers(gap.missingDifficulties)}`,
    );
  }
  if (report.gaps.length > shown.length) {
    lines.push(`  ... and ${report.gaps.length - shown.length} more. Use --gaps all to see them.`);
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
    // Even a usage error exits 0: this command must never break a build.
    return 0;
  }

  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  let report: CoverageReport;
  try {
    report = buildCoverageReport(args.courseCode);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`Known courses: ${COURSES.map((c) => c.code).join(', ')}`);
    return 0;
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  const { totals } = report;
  console.log(`${report.courseCode} — ${report.courseLabel}`);
  console.log(
    `${totals.generatorsRegistered} generator${totals.generatorsRegistered === 1 ? '' : 's'} registered against ${totals.total} problem types.`,
  );
  console.log(
    `Status: ${totals.confirmed} confirmed, ${totals.provisional} provisional, ${totals.rejected} rejected.`,
  );
  console.log(
    `${totals.excluded} excluded from coverage (non-parameterizable or rejected), leaving ${totals.inScope} in scope.`,
  );
  console.log('');
  console.log(renderUnitTable(report));
  console.log('');
  console.log(renderCoveredDetail(report));
  console.log('');
  console.log(renderGaps(report, args.gapLimit));

  if (report.orphanGenerators.length > 0) {
    console.log('');
    console.log('Orphan generators — problemTypeId matches nothing in the taxonomy:');
    for (const orphan of report.orphanGenerators) {
      console.log(`  ${orphan.generatorId}  ->  ${JSON.stringify(orphan.problemTypeId)}`);
    }
    console.log('  These contribute to no coverage. Check for a typo or a drifted slug.');
  }

  console.log('');
  console.log(
    `${totals.covered} of ${totals.inScope} in-scope problem types have a generator (${percent(totals.coverageRatio)}). ${totals.fullyCovered} ${totals.fullyCovered === 1 ? 'covers' : 'cover'} every declared difficulty tier.`,
  );
  return 0;
}

process.exitCode = main();
