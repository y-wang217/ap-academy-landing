import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from './rng.ts';

test('rng: same seed produces an identical stream', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  for (let i = 0; i < 200; i += 1) {
    assert.equal(a.next(), b.next());
  }
});

test('rng: different seeds diverge', () => {
  const a = createRng(1);
  const b = createRng(2);
  const streamA = Array.from({ length: 20 }, () => a.next());
  const streamB = Array.from({ length: 20 }, () => b.next());
  assert.notDeepEqual(streamA, streamB);
});

test('rng: seed 0 is a usable seed', () => {
  const rng = createRng(0);
  const values = Array.from({ length: 50 }, () => rng.int(1, 10));
  assert.equal(values.length, 50);
  assert.ok(values.every((v) => v >= 1 && v <= 10));
  // A degenerate generator would return the same value forever.
  assert.ok(new Set(values).size > 1);
});

test('rng: next() stays in [0, 1)', () => {
  const rng = createRng(7);
  for (let i = 0; i < 5000; i += 1) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `next() returned ${v}`);
  }
});

test('rng: rejects a non-integer seed', () => {
  assert.throws(() => createRng(1.5), TypeError);
});

test('rng: int is inclusive on both ends', () => {
  const rng = createRng(99);
  const seen = new Set<number>();
  for (let i = 0; i < 5000; i += 1) {
    const v = rng.int(-2, 2);
    assert.ok(Number.isInteger(v), `int() returned non-integer ${v}`);
    assert.ok(v >= -2 && v <= 2, `int() returned out-of-range ${v}`);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [-2, -1, 0, 1, 2]);
});

test('rng: int with min === max returns that value', () => {
  const rng = createRng(3);
  assert.equal(rng.int(4, 4), 4);
});

test('rng: int rejects an inverted range and non-integer bounds', () => {
  const rng = createRng(3);
  assert.throws(() => rng.int(5, 1), RangeError);
  assert.throws(() => rng.int(0.5, 3), TypeError);
});

test('rng: intExcluding never returns an excluded value', () => {
  const rng = createRng(21);
  for (let i = 0; i < 2000; i += 1) {
    const v = rng.intExcluding(-3, 3, [0, 2, -1]);
    assert.ok(![0, 2, -1].includes(v), `intExcluding returned excluded ${v}`);
    assert.ok(v >= -3 && v <= 3);
  }
});

test('rng: intExcluding falls back to an exhaustive scan on a dense exclusion set', () => {
  const rng = createRng(5);
  // Only 7 survives; rejection sampling will not find it within 64 tries reliably.
  const excluded = Array.from({ length: 100 }, (_, i) => i).filter((n) => n !== 7);
  for (let i = 0; i < 20; i += 1) {
    assert.equal(rng.intExcluding(0, 99, excluded), 7);
  }
});

test('rng: intExcluding throws when nothing is left', () => {
  const rng = createRng(5);
  assert.throws(() => rng.intExcluding(1, 3, [1, 2, 3]), RangeError);
});

test('rng: nonZeroInt never returns zero', () => {
  const rng = createRng(404);
  const seen = new Set<number>();
  for (let i = 0; i < 5000; i += 1) {
    const v = rng.nonZeroInt(-3, 3);
    assert.notEqual(v, 0);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [-3, -2, -1, 1, 2, 3]);
});

test('rng: nonZeroInt throws on the range [0, 0]', () => {
  const rng = createRng(1);
  assert.throws(() => rng.nonZeroInt(0, 0), RangeError);
});

test('rng: pick covers every element and rejects an empty array', () => {
  const rng = createRng(88);
  const items = ['a', 'b', 'c', 'd'];
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i += 1) seen.add(rng.pick(items));
  assert.equal(seen.size, 4);
  assert.throws(() => rng.pick([]), RangeError);
});

test('rng: shuffle is a permutation and does not mutate its input', () => {
  const rng = createRng(2024);
  const source = [1, 2, 3, 4, 5, 6, 7, 8];
  const frozen = source.slice();
  for (let i = 0; i < 200; i += 1) {
    const out = rng.shuffle(source);
    assert.deepEqual(source, frozen, 'shuffle mutated its input');
    assert.deepEqual(out.slice().sort((a, b) => a - b), frozen);
  }
});

test('rng: shuffle actually reorders and reaches every position', () => {
  const rng = createRng(31);
  const source = [0, 1, 2, 3];
  // Track which positions element 0 lands in — Fisher-Yates should reach all four.
  const positions = new Set<number>();
  let anyReordered = false;
  for (let i = 0; i < 500; i += 1) {
    const out = rng.shuffle(source);
    positions.add(out.indexOf(0));
    if (out.join(',') !== source.join(',')) anyReordered = true;
  }
  assert.equal(positions.size, 4);
  assert.ok(anyReordered);
});

test('rng: shuffle handles empty and single-element arrays', () => {
  const rng = createRng(1);
  assert.deepEqual(rng.shuffle([]), []);
  assert.deepEqual(rng.shuffle(['only']), ['only']);
});

test('rng: sign returns only 1 and -1, and returns both', () => {
  const rng = createRng(6);
  const seen = new Set<number>();
  for (let i = 0; i < 500; i += 1) {
    const s = rng.sign();
    assert.ok(s === 1 || s === -1, `sign() returned ${s}`);
    seen.add(s);
  }
  assert.equal(seen.size, 2);
});

test('rng: helper methods are reproducible as a whole sequence', () => {
  const run = (): string => {
    const rng = createRng(555);
    return [
      rng.int(1, 100),
      rng.nonZeroInt(-9, 9),
      rng.pick(['x', 'y', 'z']),
      rng.shuffle([1, 2, 3, 4]).join(''),
      rng.sign(),
      rng.intExcluding(0, 5, [3]),
    ].join('|');
  };
  assert.equal(run(), run());
});
