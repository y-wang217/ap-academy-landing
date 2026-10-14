import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GET, dynamic } from './route.ts';

test('health: GET returns 200 with the body exactly "ok"', async () => {
  const res = GET();
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
});

test('health: the body is plain text', () => {
  assert.equal(GET().headers.get('content-type'), 'text/plain; charset=utf-8');
});

test('health: never cached and never prerendered', () => {
  assert.equal(GET().headers.get('cache-control'), 'no-store');
  assert.equal(dynamic, 'force-dynamic');
});

test('health: kept out of search results', () => {
  assert.equal(GET().headers.get('x-robots-tag'), 'noindex');
});

test('health: the route imports nothing, so it answers even when Supabase is down', () => {
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s/m);
});
