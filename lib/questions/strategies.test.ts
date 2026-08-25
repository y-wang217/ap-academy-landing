import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_STRATEGIES,
  STRATEGIES,
  isRegisteredStrategy,
  strategiesByTheme,
  strategiesFor,
  strategy,
  type StrategyTheme,
} from './strategies.ts';
import { GENERATORS } from './generators/index.ts';

const THEMES: StrategyTheme[] = [
  'sign',
  'law-misapplication',
  'incomplete',
  'misreading-the-form',
  'method-confusion',
  'domain-and-restrictions',
];

// --- registry shape -----------------------------------------------------------

test('strategies: every entry is keyed by its own id', () => {
  // A key that disagrees with its id would make strategy() return the wrong
  // entry and silently mislabel a misconception in reporting.
  for (const [key, entry] of Object.entries(STRATEGIES)) {
    assert.equal(entry.id, key, `key ${key} holds an entry with id ${entry.id}`);
  }
});

test('strategies: ids are snake_case and unique', () => {
  const ids = ALL_STRATEGIES.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate strategy id');
  for (const id of ids) {
    assert.match(id, /^[a-z0-9]+(_[a-z0-9]+)*$/, `${id} is not snake_case`);
  }
});

test('strategies: every entry has a real label naming the mistake', () => {
  for (const entry of ALL_STRATEGIES) {
    assert.ok(entry.label.length > 15, `${entry.id} has a thin label: ${entry.label}`);
    assert.ok(!entry.label.endsWith('.'), `${entry.id} label should not end with a period`);
    // A label that just restates the id teaches nobody anything.
    assert.notEqual(entry.label.toLowerCase().replace(/[^a-z]/g, ''), entry.id.replace(/_/g, ''));
  }
});

test('strategies: every entry carries a known theme', () => {
  for (const entry of ALL_STRATEGIES) {
    assert.ok(THEMES.includes(entry.theme), `${entry.id} has unknown theme ${entry.theme}`);
  }
});

test('strategies: every theme is used by at least one entry', () => {
  for (const theme of THEMES) {
    assert.ok(strategiesByTheme(theme).length > 0, `theme ${theme} has no entries`);
  }
});

test('strategies: themes partition the registry', () => {
  const total = THEMES.reduce((sum, theme) => sum + strategiesByTheme(theme).length, 0);
  assert.equal(total, ALL_STRATEGIES.length);
});

// --- accessors ----------------------------------------------------------------

test('strategies: strategy() resolves a known id', () => {
  const found = strategy('sign_error_on_root');
  assert.equal(found.id, 'sign_error_on_root');
  assert.equal(found.theme, 'sign');
});

test('strategies: isRegisteredStrategy distinguishes real ids from invented ones', () => {
  assert.ok(isRegisteredStrategy('sign_error_on_root'));
  assert.ok(isRegisteredStrategy('dropped_a_root'));
  assert.ok(!isRegisteredStrategy('off_by_one'));
  assert.ok(!isRegisteredStrategy('wrong_answer_2'));
  assert.ok(!isRegisteredStrategy(''));
});

test('strategies: isRegisteredStrategy is not fooled by inherited object properties', () => {
  // A naive `id in STRATEGIES` check would return true for these.
  assert.ok(!isRegisteredStrategy('toString'));
  assert.ok(!isRegisteredStrategy('constructor'));
  assert.ok(!isRegisteredStrategy('hasOwnProperty'));
});

test('strategies: strategiesFor returns plain DistractorStrategy objects', () => {
  const declared = strategiesFor('sign_error_on_root', 'dropped_a_root');
  assert.deepEqual(
    declared.map((entry) => entry.id),
    ['sign_error_on_root', 'dropped_a_root'],
  );
  for (const entry of declared) {
    // The theme is registry bookkeeping and must not leak into the contract.
    assert.deepEqual(Object.keys(entry).sort(), ['id', 'label']);
  }
});

test('strategies: strategiesFor preserves the order it was given', () => {
  const forward = strategiesFor('sign_error_on_root', 'dropped_a_root', 'reported_quotient_only');
  const backward = strategiesFor('reported_quotient_only', 'dropped_a_root', 'sign_error_on_root');
  assert.deepEqual(
    forward.map((e) => e.id).reverse(),
    backward.map((e) => e.id),
  );
});

// --- the property the registry exists for -------------------------------------

test('strategies: every registered generator declares only registry ids', () => {
  // This is the whole point. An id declared outside the registry aggregates
  // nowhere, so a student making that mistake is invisible in reporting.
  for (const generator of GENERATORS) {
    for (const declared of generator.strategies) {
      assert.ok(
        isRegisteredStrategy(declared.id),
        `${generator.id} declares unregistered strategy ${JSON.stringify(declared.id)}`,
      );
    }
  }
});

test('strategies: every registered generator uses the registry label verbatim', () => {
  // If a generator overrides a label, the same misconception reads differently
  // in two places in the curation UI.
  for (const generator of GENERATORS) {
    for (const declared of generator.strategies) {
      if (!isRegisteredStrategy(declared.id)) continue;
      assert.equal(
        declared.label,
        strategy(declared.id).label,
        `${generator.id} overrides the label for ${declared.id}`,
      );
    }
  }
});

test('strategies: shared misconceptions are genuinely shared across generators', () => {
  // sign_error_on_root is the same mental slip in several Unit 3 questions.
  // If this ever drops to one, someone has forked it under a new name.
  const usage = new Map<string, string[]>();
  for (const generator of GENERATORS) {
    for (const declared of generator.strategies) {
      usage.set(declared.id, [...(usage.get(declared.id) ?? []), generator.id]);
    }
  }
  const shared = usage.get('sign_error_on_root') ?? [];
  assert.ok(
    shared.length >= 4,
    `sign_error_on_root is only used by ${shared.length} generator(s): ${shared.join(', ')}`,
  );
});

test('strategies: no registry entry is dead across the whole registry', () => {
  // Every id should be reachable from some generator, or it is a name nobody
  // uses. Reported rather than asserted strictly, since a new unit may land
  // entries ahead of the generators that use them.
  const used = new Set(GENERATORS.flatMap((g) => g.strategies.map((s) => s.id)));
  const unused = ALL_STRATEGIES.filter((entry) => !used.has(entry.id)).map((e) => e.id);
  assert.deepEqual(
    unused,
    [],
    `registry entries no generator uses: ${unused.join(', ')}. Remove them or wire them up.`,
  );
});

// --- the distinction the registry is meant to preserve ------------------------

test('strategies: the two leading-coefficient errors stay separate and explain why', () => {
  // These produce similar-looking wrong answers from different mistakes, which
  // is exactly the pair most likely to be wrongly merged later.
  const omitted = strategy('omitted_leading_coefficient');
  const ignored = strategy('ignored_the_leading_coefficient');
  assert.notEqual(omitted.id, ignored.id);
  assert.ok(omitted.notes && omitted.notes.includes('ignored_the_leading_coefficient'));
  assert.ok(ignored.notes && ignored.notes.includes('omitted_leading_coefficient'));
});

test('strategies: entries with notes explain a distinction, not just restate the label', () => {
  for (const entry of ALL_STRATEGIES) {
    if (!entry.notes) continue;
    assert.ok(entry.notes.length > 40, `${entry.id} has a thin note`);
  }
});
