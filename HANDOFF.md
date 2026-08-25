# Question Generation Harness — Handoff

## Session A: Foundation layer

Built the contract, the arithmetic, the validator, and the verification runner
that every future generator compiles against. No UI, no database, no content
beyond one reference generator.

**Status: green.** `npm run build`, `npm run test:questions` (183 tests), and
`npm run verify:questions` all pass.

---

### Commands

```bash
npm run test:questions          # 183 tests, ~4s
npm run verify:questions        # sweep every registered generator, 500 seeds
npm run build                   # Next.js build, includes typecheck
```

The verify CLI takes arguments after a `--` separator:

```bash
npm run verify:questions -- mhf4u-u3-factor-theorem-find-k   # one generator
npm run verify:questions -- --seeds 2000                     # wider sweep
npm run verify:questions -- --json                           # machine-readable
npm run verify:questions -- --help
```

Exit code is non-zero only on **fatal** findings. Warnings print but do not fail.

---

### Test runner: which path was taken

**Path 1 — Node native type stripping.** No compile step, no temp directory, no
new dependencies.

Node here is **v22.22.2**, and `process.features.typescript === 'strip'`, so
`node --test` runs `*.test.ts` directly. Verified before committing to it.

Two consequences worth knowing before you write a test file:

1. **Relative imports must carry the `.ts` extension** — `import { createRng }
   from './rng.ts'`. Node's loader does not resolve extensionless specifiers for
   stripped TypeScript. This required adding `"allowImportingTsExtensions": true`
   to `tsconfig.json` (legal because the repo already sets `"noEmit": true`).
   That is the only change made outside `lib/questions/`, other than
   `package.json` scripts.
2. **Only erasable syntax works.** No `enum`, no `namespace`, no parameter
   properties (`constructor(private x: number)`). Type-only imports need the
   `type` keyword: `import { type Rational, add } from './rational.ts'`. None of
   this is a restriction the code was straining against.

Scripts pass `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`. The repo's
`package.json` has no `"type": "module"`, so Node prints a reparse warning for
every `.ts` file it loads. Adding `"type": "module"` would have been a
repo-wide change with Next.js implications; suppressing the warning on two
scripts is the narrower fix.

---

### What shipped, file by file

All under `lib/questions/`.

| File | What it is |
|---|---|
| `types.ts` | **The contract.** `Generator`, `QuestionInstance`, `Choice`, `DistractorStrategy`, `UnitId`, `ProblemTypeId`, `Difficulty`, `LatexString`. TSDoc on every export states the invariant downstream code relies on. Read this file as the spec. |
| `rng.ts` | Seeded `mulberry32` behind an `Rng` interface: `int`, `intExcluding`, `nonZeroInt`, `pick`, `shuffle` (Fisher–Yates, non-mutating), `sign`, `next`. All ranges **inclusive on both ends** — no half-open variant is offered, because that is where off-by-one bugs come from. |
| `rational.ts` | Exact arithmetic over `bigint`. `add`, `sub`, `mul`, `div`, `neg`, `abs`, `pow`, `inverse`, `equals`, `compare`, `isInteger`, `isZero`, `signOf`, `fromInt`, `fromFraction`, `toLatex`, `toString`, `toNumber`. |
| `equivalence.ts` | `areEquivalent`, `areLatexIdentical`, `normalizeLatex`, `isTriviallyDistinguishable`, `explainTriviality`, and the `TRIVIALITY_HEURISTICS` registry. |
| `validate.ts` | `validateInstance(instance, generator, options?) → ValidationResult`. All eight rules. Also exports `parseRationalLatex`. |
| `verify.ts` | `verifyGenerator(generator, seedCount = 500, options?)`, `verifyAll`, `formatPercent`, and the `VARIETY_FLOOR` / `POSITION_BIAS_LIMIT` / `MAX_REPORTED_FAILURES` constants. |
| `cli/verify.ts` | The `verify:questions` CLI. |
| `generators/index.ts` | The registry: `GENERATORS`, `getGenerator(id)`, `generatorIds()`. Hand-maintained typed array — no filesystem scanning, no dynamic imports. |
| `generators/mhf4u/u3-factor-theorem-find-k.ts` | The reference generator. **Copy this to start a new one.** |
| `*.test.ts` (6 files) | 183 tests, colocated. |

Root-level: this file. `tsconfig.json` gained one compiler option;
`package.json` gained two scripts.

#### Design decisions worth knowing

**Floating point is banned from anything a student sees.** `0.1 + 0.2` renders
as `0.30000000000000004`, and one such answer choice destroys trust in the
product. Every number reaching a stem, choice, or solution step goes through
`Rational`. `toNumber` exists but is documented as diagnostics-only.

**`Math.random` is banned across `lib/questions/`.** `no-math-random.test.ts`
scans the tree with comments blanked out and fails on any occurrence. Verified
in both directions — it passes clean and fails on an introduced violation. It
caught its own test title during development, which is a good sign.

**The triviality heuristics are deliberately crude and structured to be
retuned.** `TRIVIALITY_HEURISTICS` is a named list where each entry has an `id`,
a `description`, an `enabled` flag, and a `test`. Thresholds are exported
constants (`MAGNITUDE_RATIO_LIMIT = 100`, `LENGTH_RATIO_LIMIT = 3`). Disabling
or retuning one is a one-line change here, not a validator rewrite. There is a
test asserting the toggle actually works.

**The length heuristic counts digits, not LaTeX characters.** `\frac{1}{2}` is
11 characters of markup but reads as two digits on the page; counting markup
would flag every fraction sitting next to an integer.

**Fatal vs. warning.** `verify.ts` grades findings. Non-determinism, an invalid
instance, and a crash are fatal — the generator is broken. Low variety, answer
position bias, and an unused strategy are warnings — the generator works but the
questions are weak. Only fatal findings affect the exit code. The brief said
"flag" for the latter three without specifying severity; treating them as
build-breaking would make the command unusable as a gate.

---

### Verification output for the reference generator

`npm run verify:questions`, verbatim:

```
Verifying 1 generator across 500 seeds each.

GENERATOR                       RESULT  VALID    VARIETY      ANSWER POSITIONS         FINDINGS
------------------------------  ------  -------  -----------  -----------------------  ---------------
mhf4u-u3-factor-theorem-find-k  PASS    500/500  475 (95.0%)  A:125 B:140 C:123 D:112  0 fatal, 0 warn

mhf4u-u3-factor-theorem-find-k  —  PASS
------------------------------------------
  seeds swept        500 (0..499)
  valid instances    500/500
  crashes            0
  distinct stems     475 (95.0%)
  answer positions   A 125 (25.0%)   B 140 (28.0%)   C 123 (24.6%)   D 112 (22.4%)
  strategy coverage
    sign_error_on_root             500
    arithmetic_sign_slip           500
    solved_for_wrong_variable      500
  findings           none

PASS — 1 generator verified, 0 warnings.
```

A sample question, seed 0:

```
Given that (x + 3) divides f(x) = x^3 + x^2 + 2x + k exactly, determine k.

  12  (arithmetic_sign_slip)
  24  ← correct
 -24  (solved_for_wrong_variable)
 -42  (sign_error_on_root)
```

---

### Two defects the harness caught while being built

Worth recording, because they are the argument for the harness existing.

1. **The verify test fixture collided at `k = 1`.** A fixture generator built
   distractors as `-k`, `k+1`, `k*2`. At `k = 1`, `k+1` and `k*2` are both `2` —
   a four-option question with three real options. Found on the first run against
   500 seeds, not by reading the code.
2. **`FALLBACK_PARAMS` in the reference generator was wrong.** It was written as
   `r = 2, a = 3, b = -4` with a comment claiming it was verified. It was not:
   `-P(r)` and `-P(-r)` are equal exactly when `b = -r²`, so the
   `sign_error_on_root` distractor was identical to the correct answer. Both are
   now regression tests.

---

### Guesses I made

Ambiguities resolved without asking, per the operating rules.

1. **Branch name.** The brief said `feat/question-harness`. This session's
   harness binds it to `claude/question-harness-foundation-syito2` and forbids
   pushing elsewhere, so all work is on that branch. `main` was never touched.
2. **`npm ci` was run.** `node_modules` was completely absent at session start,
   so `npm run build` was impossible. The rule bars *new* dependencies;
   `npm ci` is lockfile-exact and cannot add anything. `package-lock.json` is
   unchanged.
3. **`allowImportingTsExtensions: true` added to `tsconfig.json`.** Required by
   the Node type-stripping path. The only non-additive change outside
   `lib/questions/`.
4. **`BigInt()` constants instead of `bigint` literals.** The repo targets
   ES2017, where `0n` is a compile error. Rather than bump `target` — a
   repo-wide change with Next.js build implications — `rational.ts` uses named
   `BigInt(0)` / `BigInt(1)` constants. Documented in the file so nobody
   "cleans it up" into literals and breaks the build.
5. **`Choice` gets no `value` field, so values are parsed back from LaTeX.**
   `types.ts` was specified exactly and I did not change it. Rules 3 and 4 need
   numeric values, so `parseRationalLatex` inverts `Rational.toLatex` over the
   forms it can emit (bare integers, `\frac{a}{b}`, leading minus). A choice it
   cannot parse — an expression, a solution pair — is **left alone** rather than
   passed or failed. See open question 2.
6. **`zeroIsPlausible` is passed explicitly, not inferred.**
   `DistractorStrategy` carries only `id` and `label`, so nothing machine-readable
   says whether a misconception can legitimately produce zero. Rather than
   sniff strategy ids for the substring "zero", it is an explicit option on
   `validateInstance`, defaulting to `false`. See open question 1.
7. **`areLatexIdentical` collapses whitespace runs rather than deleting
   whitespace.** So `\frac{1} {2}` and `\frac{1}{2}` do **not** compare equal.
   Deleting whitespace outright would wrongly merge the distinct prose fragments
   `"a b"` and `"ab"`. Costs nothing in practice since both sides come from
   `toLatex`, whose output is byte-identical for a given value.
8. **Placeholder scanning uses word boundaries.** `\bnull\b` rather than a
   substring scan, so a stem containing "annulled" is not rejected. Tested.
9. **Extra exports beyond the brief.** `rational.ts` also exports `inverse`,
   `isZero`, `signOf`, `toString`, `toNumber`, `ZERO`, `ONE`.
   `equivalence.ts` also exports `explainTriviality` and `normalizeLatex`.
   `verify.ts` also exports `verifyAll`. All additive.
10. **Reference generator difficulty is 2 (■■).** It is the standard textbook
    exercise: substitute, evaluate, solve. Not a judgement about MHF4U as a
    whole.
11. **Three stem phrasings.** With one phrasing the parameter space gave ~74%
    variety across 500 seeds — above the 60% floor but not comfortably. Three
    phrasings put it at 95%. This is a technique worth copying, not a
    requirement.
12. **Parameter bounds: `r ∈ [-4, 4] \ {0}`, `a, b ∈ [-7, 7] \ {0}`.** Root
    bounded so `r³` stays mentally computable; coefficients wide enough that 500
    seeds do not exhaust the space. 1272 of 1568 tuples are usable.
13. **Reading of `arithmetic_sign_slip` vs `solved_for_wrong_variable`.** The
    brief's descriptions overlap, since "returns `f(r)` rather than `k`" is a
    sign flip and so is a sign slip. Resolved as: `solved_for_wrong_variable`
    reports `P(r)` instead of `-P(r)` (forgot to move it across the equals sign);
    `arithmetic_sign_slip` drops the sign on the `bx` term while evaluating.
    Distinct values, both real student errors.
14. **`__testing` export on the reference generator.** Internals exposed for
    tests, explicitly marked as not part of the contract.
15. **Verify severity split** — see "Fatal vs. warning" above.

---

### Open questions for Charlie

1. **Should `DistractorStrategy` carry a `canProduceZero` flag?** Right now,
   whether zero is a plausible distractor is passed per-validation-call rather
   than declared on the strategy that produces it. Declaring it on the strategy
   is the better home. It is a one-field change to `types.ts` and a small change
   to `validate.ts`, but it modifies the contract, so I left it.
2. **Should `Choice` carry its exact value alongside its rendering?** Parsing
   LaTeX back into a `Rational` works, but it means the value-level checks
   silently do not apply to any choice that is not a plain number — an expression,
   a coordinate pair, a solution set. The moment a generator emits choices like
   `x = 2 \text{ or } x = -3`, rules 3 and 4 stop protecting it. An optional
   `value?: Rational` on `Choice` would fix this permanently.
3. **Are `VARIETY_FLOOR = 0.6` and `POSITION_BIAS_LIMIT = 0.4` the right
   numbers?** Both are the brief's figures, and both are judgement calls awaiting
   real usage. The floor in particular depends on how many questions a student
   sees per topic.
4. **Should warnings gate CI?** Currently no. If these questions go straight to
   print without a human reading them, low variety probably should block.
5. **One generator per difficulty, or a difficulty parameter?** `Generator`
   declares a single `Difficulty`, so an easy and a hard version of the same
   problem type are two registered generators sharing a `problemTypeId`. That is
   workable and keeps verification simple, but it needs confirming before
   generators multiply.
6. **How do generated questions reach a worksheet?** Nothing here renders to
   LaTeX documents or connects to the existing worksheet pipeline. Out of scope
   for this session, but it is the next real integration.

---

### How to add a new generator

The reference generator is the template. This procedure takes about an hour for
a problem type you already understand.

1. **Copy the reference file.**
   ```bash
   cp lib/questions/generators/mhf4u/u3-factor-theorem-find-k.ts \
      lib/questions/generators/mhf4u/u4-vertical-asymptotes.ts
   ```

2. **Change the three ids at the top.** `GENERATOR_ID`, `UNIT_ID`,
   `PROBLEM_TYPE_ID`. Slug-cased, namespaced: `mhf4u-u4-vertical-asymptotes`.
   **These are permanent** — stored student attempts will reference them, so
   pick them properly now rather than renaming later.

3. **Define the parameter type.** Replace `PolynomialParams` with whatever your
   question is parameterized by. Keep it a plain interface of numbers.

4. **Write the solver.** The function that turns parameters into the correct
   answer. Use `Rational` throughout — `add`, `mul`, `pow`, `div` from
   `rational.ts`. Do not reach for `number` arithmetic on anything a student will
   see, even if the values happen to be integers.

5. **Declare the misconceptions.** Fill in `STRATEGIES` with at least three.
   Each needs a `snake_case` id and a human-readable label. Name the *mistake*,
   not the wrong answer: `sign_error_on_root`, not `wrong_answer_1`.

6. **Implement each misconception in `buildDistractors`.** Each distractor must
   be the value a student *actually arrives at* by making that specific mistake.
   This is the part that matters. A random number near the answer teaches
   nothing, and `verify.ts` will not catch it — only you can.

7. **Write `isUsable`.** The constraints that make a parameter tuple worth
   printing: no two options equal, no bare zero on the paper, no degenerate
   collapse (a zero leading coefficient, a root of 0). Use `areEquivalent` and
   `isTriviallyDistinguishable` from `equivalence.ts` rather than hand-rolling.
   Rejecting here means a bad tuple is never emitted, instead of being emitted
   and then reported.

8. **Pick a real `FALLBACK_PARAMS` and test it.** Add
   `assert.ok(__testing.isUsable(FALLBACK_PARAMS))` to your test file. Do not
   skip this — the reference generator shipped a broken fallback and only that
   assertion caught it.

9. **Write the stem renderer.** Watch the details that make a question look
   machine-made: `1x^2`, `+ -3`, `(x - -4)`. The reference generator's
   `renderTerm` and `renderFactor` handle these; adapt them. Add two or three
   phrasings if the parameter space is narrow.

10. **Write the solution steps in tutor voice.** Say *why* before *what*. "Start
    with what the word factor buys you" before the substitution. A student
    reading only algebra learns to imitate; a student reading the reason learns
    to choose the method next time. Minimum two steps; the reference uses five.

11. **Register it** in `lib/questions/generators/index.ts`: import it and add it
    to `GENERATORS`. One line.

12. **Run the harness.**
    ```bash
    npm run verify:questions -- <your-generator-id>
    ```
    Fix every fatal finding. Then read the warnings: low variety means widen the
    parameter space or add phrasings; position bias means you are not shuffling
    through the seeded rng; an unused strategy means a dead branch in
    `buildDistractors`.

13. **Copy the reference test file** and adapt it. At minimum: the 500-seed
    verification sweep, a check that the correct answer actually satisfies the
    defining equation, and a check that each distractor equals what its
    misconception yields.

14. **Confirm green:** `npm run test:questions && npm run verify:questions && npm run build`.

**Things that will bite you:**

- Import specifiers need `.ts` extensions.
- `Math.random` fails the test suite. Everything comes from `createRng(seed)`.
- `generate` must be **total** — never throw for any non-negative integer seed.
  Use a rejection loop with a fallback, not an exception.
- `generate` must be **pure**. No module-level mutable state, no `Date`. The
  determinism check compares serialized output byte for byte.
- The number of `rng` calls is part of the generator's identity. Inserting one
  extra `rng.int()` early changes every value after it. That is fine, but it
  means every previously generated seed produces a different question.
