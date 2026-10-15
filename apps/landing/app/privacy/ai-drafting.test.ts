import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AI_DRAFTING_SECTION, ANTHROPIC_PROVIDER_LINE } from './ai-drafting.ts';

const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const body = AI_DRAFTING_SECTION.paragraphs.join('\n');

test('ai drafting: heading', () => {
  assert.equal(AI_DRAFTING_SECTION.heading, 'AI drafting in the Student Tracker');
});

test('ai drafting: states what is sent, to whom, why, storage and names', () => {
  for (const word of ['Anthropic', 'API', 'photos', 'PDFs', 'transcripts', 'grade level', 'goal', 'marks',
    'checks', 'saves', 'database', 'organization', 'quote', 'do not keep']) {
    assert.ok(body.includes(word), `missing "${word}"`);
  }
  assert.match(body, /does not remove names from photos or PDFs/);
  assert.ok(!body.includes('with the name removed'));
});

test('ai drafting: terms link', () => {
  assert.equal(AI_DRAFTING_SECTION.termsUrl, 'https://www.anthropic.com/legal/commercial-terms');
  assert.ok(page.includes('target="_blank"'));
  assert.ok(page.includes('rel="noopener noreferrer"'));
});

test('ai drafting: headings run 1 to 13 and AI drafting is 5, after sharing', () => {
  const heads = [...page.matchAll(/<h2[^>]*>(\d+)\. ([^<]*)<\/h2>/g)].map((m) => [Number(m[1]), m[2]]);
  assert.deepEqual(heads.map((h) => h[0]), Array.from({ length: heads.length }, (_, i) => i + 1));
  const h = [...page.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
  assert.ok(h.some((t) => t.startsWith('5. ') && t.includes('{')) || page.includes('{AI_DRAFTING_SECTION.heading}'));
  assert.equal(page.match(/<section>/g)?.length, 13);
  assert.ok(page.indexOf('How we share your information') < page.indexOf('AI_DRAFTING_SECTION.heading'));
  assert.ok(page.indexOf('AI_DRAFTING_SECTION.heading') < page.indexOf('A note about students and minors'));
  assert.ok(page.includes('6. A note about students'));
  assert.ok(page.includes('13. Contact us'));
});

test('ai drafting: provider line is rendered in section 4', () => {
  assert.match(ANTHROPIC_PROVIDER_LINE, /Anthropic/);
  const s4 = page.slice(page.indexOf('How we share your information'), page.indexOf('AI_DRAFTING_SECTION.heading'));
  assert.ok(s4.includes('ANTHROPIC_PROVIDER_LINE'));
});

test('ai drafting: no em or en dashes in new copy', () => {
  const all = [AI_DRAFTING_SECTION.heading, body, AI_DRAFTING_SECTION.termsLabel, ANTHROPIC_PROVIDER_LINE].join('\n');
  assert.ok(!/[–—]/.test(all));
});

test('ai drafting: last updated is no longer the stale date', () => {
  assert.ok(!page.includes('January 1, 2026'));
});
