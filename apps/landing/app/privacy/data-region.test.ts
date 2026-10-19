import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The Supabase project runs in us-west-2 (Oregon). These checks keep the
// privacy page and the docs saying so (REQ-29).
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

const REGION = /\b(east|canada|canadian) region\b/i;
const ADR_0001 = 'docs/adr/0001-monorepo-shared-identity.md';
const ADR_0012 = 'apps/tracker/docs/decisions/0012-minimal-pii-region-magic-link.md';
const ADR_0013 = 'apps/tracker/docs/decisions/0013-workspace-overrides.md';
const TRACKER_CLAUDE = 'apps/tracker/CLAUDE.md';

function markdownFiles(rel: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, rel))) {
    const child = `${rel}/${name}`;
    if (statSync(join(root, child)).isDirectory()) {
      if (name !== 'spec') out.push(...markdownFiles(child));
    } else if (name.endsWith('.md')) {
      out.push(child);
    }
  }
  return out;
}

test('privacy: service providers name Supabase in the United States', () => {
  const item = page.match(/<li><strong>Service providers<\/strong>[\s\S]*?<\/li>/)?.[0];
  assert.ok(item, 'Service providers item not found');
  assert.ok(item.includes('Supabase'), 'Supabase not named');
  assert.ok(item.includes('United States'), 'United States not named');
});

test('privacy: last updated is the pinned date', () => {
  assert.ok(page.includes('Last updated: October 19, 2026'));
});

test('docs: no stale region claims outside superseded text', () => {
  const files = [
    ...markdownFiles('docs'),
    ...markdownFiles('apps/tracker/docs'),
    'CLAUDE.md',
    'apps/landing/CLAUDE.md',
    TRACKER_CLAUDE,
  ].filter((f) => existsSync(join(root, f)));
  const bad: string[] = [];
  for (const file of files) {
    if (file === ADR_0012) continue;
    read(file).split('\n').forEach((line, i) => {
      if (REGION.test(line) && !/superseded/i.test(line)) bad.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('docs: the actual region is named', () => {
  for (const file of [ADR_0001, ADR_0013, TRACKER_CLAUDE]) {
    assert.ok(read(file).includes('us-west-2'), `${file} does not name us-west-2`);
  }
});

test('docs: one correction line per corrected ADR', () => {
  for (const file of [ADR_0001, ADR_0013]) {
    const lines = read(file).split('\n').filter((l) => l.startsWith('Correction (2026-10-16):'));
    assert.equal(lines.length, 1, `${file} needs exactly one correction line`);
    assert.ok(lines[0].includes('us-west-2'));
    assert.ok(lines[0].includes('unchanged'));
    assert.ok(!REGION.test(lines[0]), 'correction line repeats the old region phrase');
  }
});
