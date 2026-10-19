import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IRIS_SECTION, GOOGLE_PROVIDER_LINE } from './iris.ts';
import { ANTHROPIC_PROVIDER_LINE } from './ai-drafting.ts';

const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const source = readFileSync(new URL('./iris.ts', import.meta.url), 'utf8');
const paras = IRIS_SECTION.paragraphs;
const body = paras.join('\n');

test('iris: module exports a heading and paragraphs, with no imports', () => {
  assert.equal(IRIS_SECTION.heading, 'Iris, our parent email assistant');
  assert.ok(Array.isArray(paras) && paras.length > 0);
  assert.ok(!/^\s*import\b/m.test(source));
});

test('iris: rendered as section 6, after AI drafting and before students', () => {
  assert.ok(page.includes('6. {IRIS_SECTION.heading}'));
  assert.ok(page.includes('IRIS_SECTION.paragraphs.map'));
  assert.ok(page.indexOf('AI_DRAFTING_SECTION.heading') < page.indexOf('IRIS_SECTION.heading'));
  assert.ok(page.indexOf('IRIS_SECTION.heading') < page.indexOf('A note about students and minors'));
});

test('iris fact 1: mail to charlie@apacademy.ca is read by the Student Tracker', () => {
  assert.match(paras[0], /charlie@apacademy\.ca/);
  assert.match(paras[0], /read/);
  assert.match(paras[0], /AP Academy Student Tracker/);
});

test('iris fact 2: name, email address and message text go to Anthropic', () => {
  const p = paras.find((t) => t.includes('Anthropic'));
  assert.ok(p, 'no Anthropic paragraph');
  for (const word of ['name', 'email address', 'text of your message', 'work out the request', 'draft a reply']) {
    assert.ok(p.includes(word), `missing "${word}"`);
  }
});

test('iris fact 3: drafts and escalations are copied to Notion for the phone', () => {
  const p = paras.find((t) => t.includes('Notion'));
  assert.ok(p, 'no Notion paragraph');
  assert.match(p, /draft or an escalation/);
  assert.match(p, /phone/);
});

test('iris fact 4: an automatic reply says so', () => {
  assert.match(body, /sent automatically says so in its text/);
});

test('iris fact 5: messages, drafts and sent replies are deleted after 90 days', () => {
  assert.match(body, /messages, drafts and sent replies are deleted after 90 days/);
});

test('iris fact 6: earlier deletion by emailing charlie@apacademy.ca', () => {
  const p = paras.find((t) => /delete/.test(t) && /sooner|earlier/i.test(t));
  assert.ok(p, 'no earlier deletion paragraph');
  assert.match(p, /charlie@apacademy\.ca/);
});

test('iris: provider lines name Iris and are rendered in section 4', () => {
  assert.match(GOOGLE_PROVIDER_LINE, /Google/);
  assert.match(GOOGLE_PROVIDER_LINE, /Iris/);
  assert.match(ANTHROPIC_PROVIDER_LINE, /Anthropic/);
  assert.match(ANTHROPIC_PROVIDER_LINE, /AI drafting/);
  assert.match(ANTHROPIC_PROVIDER_LINE, /Iris/);
  const s4 = page.slice(page.indexOf('How we share your information'), page.indexOf('AI_DRAFTING_SECTION.heading'));
  assert.ok(s4.includes('{GOOGLE_PROVIDER_LINE}'));
  assert.ok(s4.includes('{ANTHROPIC_PROVIDER_LINE}'));
  assert.ok(!s4.includes('Google (email and related services),'));
});

test('iris: last updated moved to the build date', () => {
  assert.ok(!page.includes('October 15, 2026'));
  assert.ok(!page.includes('Last updated: October 16, 2026'));
  assert.match(page, /Last updated: \w+ \d{1,2}, 2026/);
});

test('iris: no em or en dashes in new copy', () => {
  const all = [IRIS_SECTION.heading, body, GOOGLE_PROVIDER_LINE, ANTHROPIC_PROVIDER_LINE].join('\n');
  assert.ok(!/[–—]/.test(all));
});
