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

---

## Session B: Taxonomy registry

Built the typed registry mapping MHF4U's curriculum to generator slots, plus the
coverage tooling that reports what is built versus what is missing. No new
generators.

**Status: green.** `npm run build`, `npm run test:questions` (260 tests),
`npm run verify:questions`, and `npm run coverage:questions` all pass.

### Commands added

```bash
npm run coverage:questions                    # the work queue — read this first
npm run coverage:questions -- --gaps all      # every gap, not just the first 20
npm run coverage:questions -- --json          # machine-readable
```

Always exits 0, including on a usage error. It is a report, not a gate.

### Files shipped

| File | What it is |
|---|---|
| `taxonomy/types.ts` | `Course`, `Unit`, `ProblemType`, `ProblemTypeStatus`. TSDoc on every export. |
| `taxonomy/mhf4u.ts` | The MHF4U course tree as data. 8 units, 118 problem types, all `provisional`. |
| `taxonomy/index.ts` | `getCourse`, `getUnit`, `getProblemType`, `getCourseForUnit`, `allProblemTypes`, `allUnits`, `validateCourse`, `validateAllCourses`. |
| `taxonomy/coverage.ts` | `buildCoverageReport(courseCode, generators?)` — the taxonomy joined against the generator registry. |
| `taxonomy/import.ts` | `reconcileExtractedBank`, `formatReconciliation`. The tooling for tomorrow morning. |
| `cli/coverage.ts` | The `coverage:questions` CLI. |
| `taxonomy/*.test.ts` (3 files) | 77 further tests. |

Session A's `types.ts` was **not modified**. Session A's reference generator was
touched only to align its ids — see guess B2.

### `coverage:questions` output

Verbatim, trimmed to the first 20 gaps for length. Run with `-- --gaps all` for
the rest.

```
MHF4U — Advanced Functions, Grade 12, University Preparation
1 generator registered against 118 problem types.
Status: 0 confirmed, 118 provisional, 0 rejected.
6 excluded from coverage (non-parameterizable or rejected), leaving 112 in scope.

#  UNIT                                    TYPES  EXCL  SCOPE  BUILT  FULL  COVERAGE
-  --------------------------------------  -----  ----  -----  -----  ----  --------
1  Characteristics of functions               16     1     15      0     0        0%
2  Polynomial functions                       14     1     13      0     0        0%
3  Polynomial equations and inequalities      15     0     15      1     1        7%
4  Rational functions                         14     1     13      0     0        0%
5  Trigonometric functions                    16     1     15      0     0        0%
6  Trigonometric identities and equations     14     1     13      0     0        0%
7  Exponential and logarithmic functions      17     0     17      0     0        0%
8  Combining functions                        12     1     11      0     0        0%
-  --------------------------------------  -----  ----  -----  -----  ----  --------
   TOTAL                                     118     6    112      1     1        1%

Covered problem types
  [x] u3  mhf4u-u3-factor-theorem-find-k
        Find k given a known factor
        tiers declared 2 | built 2 | missing -
        generators: mhf4u-u3-factor-theorem-find-k-d2

Gaps (111 total, showing 20, in unit order)
  Unit 1 — Characteristics of functions
    [ ] mhf4u-u1-domain-range-from-equation                  tiers 1,2
    [ ] mhf4u-u1-interval-notation-conversion                tiers 1
    [ ] mhf4u-u1-evaluate-function-notation                  tiers 1,2
    [ ] mhf4u-u1-solve-function-notation-equation            tiers 2
    [ ] mhf4u-u1-find-inverse-algebraically                  tiers 2
    [ ] mhf4u-u1-inverse-domain-restriction                  tiers 3
    [ ] mhf4u-u1-verify-inverse-by-composition               tiers 2
    [ ] mhf4u-u1-single-transformation-of-parent             tiers 1
    [ ] mhf4u-u1-combined-transformation-mapping             tiers 2
    [ ] mhf4u-u1-write-equation-from-transformations         tiers 2
    [ ] mhf4u-u1-transformed-point-image                     tiers 2
    [ ] mhf4u-u1-classify-even-odd-algebraically             tiers 2
    [ ] mhf4u-u1-average-rate-of-change                      tiers 1,2
    [ ] mhf4u-u1-instantaneous-rate-of-change-estimate       tiers 2,3
    [ ] mhf4u-u1-compare-average-vs-instantaneous            tiers 3
  Unit 2 — Polynomial functions
    [ ] mhf4u-u2-degree-and-leading-coefficient              tiers 1
    [ ] mhf4u-u2-end-behaviour-from-equation                 tiers 1,2
    [ ] mhf4u-u2-end-behaviour-to-degree-sign                tiers 2
    [ ] mhf4u-u2-zeros-from-factored-form                    tiers 1
    [ ] mhf4u-u2-multiplicity-and-graph-behaviour            tiers 2
  ... and 91 more. Use --gaps all to see them.

1 of 112 in-scope problem types have a generator (1%). 1 covers every declared difficulty tier.
```

The `[x]` / `[~]` markers mean fully covered / partially covered. A `[~]` in the
gap list is a type with a generator at some tiers but not all.

### Counts

- **118 problem types** across 8 units, every one `status: 'provisional'`.
- **6 marked non-parameterizable**, excluded from the coverage denominator,
  leaving **112 in scope**. One is covered.

The six, with the reason each:

| Problem type | Why excluded |
|---|---|
| `mhf4u-u1-domain-range-from-graph` | Input is a graph. Blocked on tooling, not mathematics. |
| `mhf4u-u2-sketch-from-factored-form` | Output is a sketch; a multiple-choice version needs four candidate graph images. |
| `mhf4u-u4-sketch-rational` | Output is a sketch. Same blocker. |
| `mhf4u-u5-graph-sinusoidal` | Output is a graph. Same blocker. |
| `mhf4u-u6-prove-trig-identity` | Needs a written multi-step justification; no single final answer to put in four options. Genuinely bespoke. |
| `mhf4u-u8-graph-of-sum` | Both input and output are graphs. Same blocker. |

Five of the six are one blocker, not five: **no graph-rendering pipeline
exists.** If graphs ever become renderable, five slots come back into scope at
once. Only the identity proof is bespoke in the sense the brief meant.

### Guesses I made

**B1. Branch.** The brief said `feat/taxonomy-registry` off `main`, run after
Session A merged. This session's harness binds all work to
`claude/question-harness-foundation-syito2` and forbids pushing elsewhere, so
Session B is **stacked on Session A's branch**, not branched from `main`.
Session A was complete and verified first. `main` was never touched.

**B2. Id convention forced a change to Session A's generator.** The brief
specifies namespaced problem-type ids (`mhf4u-u3-factor-theorem-find-k`), but
Session A's generator declared `problemTypeId: 'factor-theorem-find-k'`. Left
alone, the coverage join would have matched nothing. Resolved by:

- `ProblemType.id` = `mhf4u-u3-factor-theorem-find-k`
- `Generator.problemTypeId` = the same, so the join works
- `Generator.id` = `mhf4u-u3-factor-theorem-find-k-**d2**`

The `-d<tier>` suffix exists because `Generator` declares a single `Difficulty`,
so one problem type spanning tiers 1 and 2 needs two generators. Session A's
`types.ts` was not modified. Nothing has shipped, so no stored attempt was
orphaned — but this is the last moment that is true.

**B3. Problem-type ids are namespaced by unit *number*, not unit slug.** So
`mhf4u-u3-factor-theorem-find-k`, not
`mhf4u-u3-polynomial-equations-factor-theorem-find-k`. The unit number makes them
unique; the descriptive slug adds length without information.

**B4. Unit ordering is teaching order, and `strand` records the curriculum
grouping separately.** The brief's eight units are a course-outline sequence, not
the Ontario strand order (which is A: exponential/log, B: trigonometric, C:
polynomial/rational, D: characteristics). Both are recorded so the report can be
read either way.

**B5. Granularity target: ~14 types per unit, 118 total.** Erring fine as
instructed. Some neighbours are plausibly one slot — the three log-equation
types, the two sketch-adjacent rational types. Merging is trivial; splitting
after generators exist is not.

**B6. Graph-dependent types are `parameterizable: false`.** Arguably wrong: the
*mathematics* is parameterizable, it is the *rendering* that is blocked. Marked
false so they leave the denominator and stop reading as work nobody is doing,
with the reason in `notes`. If you disagree, flipping six booleans moves them
back into scope.

**B7. `validateCourse` requires a reason on every non-parameterizable type.**
Not in the brief. Added because an exclusion with no explanation is
indistinguishable from a mistake once the tree is large.

**B8. Coverage is "at least one generator", fully-covered is "every declared
tier".** Both are reported. `coverageRatio` uses the looser one, so early
progress is visible.

**B9. `rejected` types are excluded from the denominator too.** The brief only
said to exclude non-parameterizable ones, but a rejected type is by definition
not work to do.

**B10. Gap ordering: untouched types before partial tier gaps, within each
unit.** Starting a type is worth more than adding its second tier.

**B11. The importer scopes matching to the resolved unit.** Falls back to the
whole course when the source unit heading does not resolve. Without this, a
rational-functions question matches the unit-3 factor theorem slot on the word
"factor".

**B12. The importer reports `unitWasExtracted` on every uncovered slot.** Not in
the brief, and the most useful field in the output: a slot that got nothing from
a section that *was* extracted is evidence the guess was wrong; a slot in a unit
nobody extracted is unexamined and means nothing.

**B13. `buildCoverageReport` and `reconcileExtractedBank` throw on an unknown
course code**, while the accessors return `undefined`. A report for a
non-existent course is a caller mistake, not an empty result. The CLIs catch it
and still exit 0.

**B14. Two matcher thresholds are guesses:** `MATCH_FLOOR = 0.25` (deliberately
low — a weak suggestion dismissed in two seconds costs less than a missed match
found by scrolling) and `MIN_TEXT_TERMS_FOR_MATCH = 2`.

### Open questions for Charlie

These are in addition to Session A's, which still stand.

1. **The tree is a guess and needs your eyes, not just the extraction.** 118
   types written from the standard course structure. The extraction will confirm
   what the textbook covers; it will not tell you what *you* teach. Units 1 and 8
   are the ones I am least sure about — both are "characteristics of functions"
   in the curriculum document and courses split them differently.
2. **Is the graph-rendering blocker worth solving?** Five of six exclusions are
   one missing capability. If MHF4U questions are meaningfully graph-based, that
   is the highest-leverage thing not currently on any list.
3. **Should `mhf4u-u5-sinusoidal-word-problem-model` be one slot or several?**
   Marked parameterizable with a note. Fine if the scenario is templated and only
   numbers vary; if the textbook varies the scenario itself (tides, Ferris
   wheels, temperature), it should be one type per context.
4. **`mhf4u-u1-compare-average-vs-instantaneous`** may be a written-justification
   question rather than a multiple-choice one. Included as MC pending a look at
   how the textbook asks it.
5. **How many generators per problem type do you actually want?** 112 in-scope
   types at one generator each is 112 generators. If a tutor needs 20 questions
   per lesson, a much smaller set of high-variety generators may serve better.
   Worth deciding before Session C works down the queue.
6. **Does the `-d<tier>` generator id suffix stay?** It follows from
   `Generator` carrying a single `Difficulty` (Session A open question 5). If
   that changes to a difficulty parameter, the suffix should go — and that is
   easier now than after 100 generators exist.

### How to reconcile the extracted bank

Tomorrow morning, with an extracted bank in hand. About ten minutes.

1. **Shape the bank into `ExtractedQuestion[]`.** Three fields per row:
   `unitLabel`, `outcome`, `questionText`, all free text exactly as they appear in
   the source. Do not clean them up — the matcher normalizes. There is
   deliberately no file parser, so write a throwaway script or paste a literal.

2. **Put it in a scratch file** — anywhere; nothing here needs it committed.

   ```ts
   // scratch/reconcile.ts
   import { reconcileExtractedBank, formatReconciliation } from '../lib/questions/taxonomy/import.ts';

   const bank = [
     { unitLabel: 'Polynomial Equations', outcome: 'Factor theorem', questionText: '...' },
     // ...
   ];

   console.log(formatReconciliation(reconcileExtractedBank('MHF4U', bank)));
   ```

3. **Run it:** `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scratch/reconcile.ts`

4. **Check the unresolved unit headings first.** Anything under "Source unit
   headings that did not resolve" means those questions were matched against the
   whole course instead of one unit, so their matches are weaker. Either fix the
   heading in your input or accept the looser matching.

5. **Work the "extracted outcomes with no slot" list.** For each one:
   - It has a **near miss** listed → usually the same topic under different
     wording. Confirm the existing slot rather than adding a new one.
   - It has **no near miss** → a topic the guess missed. Add a `ProblemType` to
     the right unit in `mhf4u.ts`. New ids are free.

6. **Work the "slots with no extracted questions, in units that WERE extracted"
   list.** These are the guesses that look wrong. For each:
   - The textbook genuinely does not cover it → set `status: 'rejected'` and add
     a `notes` line saying why. **Do not delete it** — a deleted guess gets made
     again next time.
   - The extraction just missed it → leave `provisional` and move on.
   Ignore the unexamined count at the bottom; those units were not extracted.

7. **Mark everything that matched as `status: 'confirmed'`.** This is the only
   step that must be done by hand. Nothing sets `confirmed` automatically, by
   design — a machine match is a suggestion.

8. **Re-run the tests:** `npm run test:questions`. `validateCourse` will catch a
   duplicate id, an orphan `unitId`, a broken unit order, or a new
   non-parameterizable type with no reason. There is also a test asserting every
   MHF4U type is `provisional` — **it will fail once you start confirming
   things.** That is the intended signal, not a bug. Update or delete it then.

9. **Re-run `npm run coverage:questions`.** The denominator will have moved. That
   table is Session C's work queue.

10. **Commit the edited `mhf4u.ts`** with a note saying which textbook sections
    the confirmations came from, so the next reconciliation knows what has already
    been checked.

---

## Session C: Lesson engine

Built the headless lesson engine under `lib/lesson/`, one real lesson under
`content/lessons/`, and the gates around both. A scripted student plays Watch,
Together and Solo of MHF4U Unit 3 under `node --test` with no DOM, no React,
no Supabase, no video. Stage 0 of `docs/spec/ap-academy-diy-build-spec.md`;
prompt at `docs/spec/stage-0-lesson-engine.md`.

**Status: green.** `npm run build`, `npm run test:questions` (322 tests),
`npm run test:lesson` (52 tests), `npm run verify:questions`, and
`npm run validate:lessons` all pass. No new dependencies. No route, no
component, no table, no video.

### Commands added

```bash
npm run test:lesson        # 52 tests, under a second
npm run validate:lessons   # every lesson under content/lessons/, exit 1 on a fatal
```

`validate:lessons` also runs on `prebuild`, after `validate-sat-words.mjs`, so
a generator change that drifts a recorded worked set fails the build.

`npm run test:lesson`, verbatim (summary lines; the full TAP is 52 `ok`):

```
ok 1 - lib/lesson imports only from lib/questions, node builtins and itself
ok 2 - the boundary check actually catches each forbidden import
ok 3 - relative imports are resolved from the importing file, not string-matched
ok 4 - only test files may import the shipped lessons
ok 5 - rational: 1/2 equals 0.5 equals 2/4
ok 6 - rational: 0.333 does not equal 1/3
ok 7 - rational: integers, negatives, and sign errors
ok 8 - rational: rejects what it cannot parse rather than throwing
ok 9 - parseRationalEntry: decimal places are exact, not float
ok 10 - choice: compares an index
ok 11 - exact: compares after whitespace normalization only
ok 12 - exact: a run of spaces collapses to one space, so "a  b" equals "a b"
ok 13 - checkAnswer: the index of the correct choice, and nothing else
ok 14 - lib/lesson and lib/questions contain no calls to the banned global RNG
ok 15 - Watch emits no attempts and returns
ok 16 - 'done' straight away plays nothing
ok 17 - Together, played perfectly: one correct attempt per blank, every step revealed in order
ok 18 - Together, wrong once then right: the hint is shown, two attempts on that step
ok 19 - Together, wrong twice: two wrong attempts, then the script moves on
ok 20 - Together checks blanks with the real checker: 0.5-style equivalents pass
ok 21 - Solo at three fixed seeds: attempts carry those seeds and the right correct flags
ok 22 - Solo does not touch the worked-set seed
ok 23 - the same policy run twice produces identical attempt lists
ok 24 - Solo throws on an unregistered generator rather than guessing
ok 25 - no attempts: empty progress, not zeros
ok 26 - Together attempts do not change progress
ok 27 - Solo attempts count, and the last one sets correctAtLast
ok 28 - Together attempts mixed in are ignored, not counted
ok 29 - progress is per problem type
ok 30 - the progress shape carries exactly two fields and no score
ok 31 - the shipped Unit 3 lesson has zero fatal findings
ok 32 - the shipped lesson has no warnings either: map and set agree
ok 33 - the shipped lesson lists all 15 Unit 3 problem types, one built
ok 34 - the shipped script has 4 to 6 steps, at least 3 with blanks
ok 35 - fatal: unknown problem type on the test map
ok 36 - fatal: unknown problem type in the worked set
ok 37 - fatal: a built test-map entry with no registered generator
ok 38 - fatal: a worked-set entry naming an unregistered generator
ok 39 - fatal: stem drift, the content-hash rule, names the problem type
ok 40 - fatal: a changed seed is also stem drift
ok 41 - fatal: a script with zero blanks
ok 42 - fatal: an exact blank whose answer is empty
ok 43 - fatal: a choice blank whose answer index is out of range
ok 44 - fatal: a choice blank with no options
ok 45 - fatal: a rational blank with no answer
ok 46 - fatal: duplicate step ids
ok 47 - fatal: empty hint, prompt, say, title
ok 48 - fatal: unknown course or unit
ok 49 - validateLesson never throws, even when a generator would
ok 50 - warning: a built test-map entry with no worked-set entry
ok 51 - warning: a worked-set entry not on the test map
ok 52 - a valid rational blank passes
# tests 52
# pass 52
# fail 0
```

`npm run validate:lessons`, verbatim:

```
mhf4u-u3-polynomial-equations.ts  PASS  (mhf4u-u3-polynomial-equations: 1 worked, 15 on the test map, 0 fatal, 0 warn)

PASS — 1 lesson validated, 0 warnings.
```

`npm run test:questions`: `# tests 322 / # pass 322 / # fail 0`. Unchanged
from Session B except that the no-`Math.random` scan now also runs from
`lib/lesson/`.

`npm run verify:questions`, verbatim (unchanged from Session B):

```
mhf4u-u3-factor-theorem-find-k-d2  PASS    500/500  475 (95.0%)  A:125 B:140 C:123 D:112  0 fatal, 0 warn

PASS — 1 generator verified, 0 warnings.
```

`npm run build`: see "Build output" at the end of this section.

### Files shipped

| File | What it is |
|---|---|
| `lib/lesson/types.ts` | **The contract.** `Lesson`, `TestMap`, `TestMapEntry`, `WorkedSetEntry`, `StepScript`, `Step`, `Blank`, `Mode`, `Attempt`, `LessonProgress`, `StudentPolicy`. TSDoc on every export. |
| `lib/lesson/tuning.ts` | `TOGETHER_TRIES_BEFORE_REVEAL = 2`, `FREE_SOLO_SETS_PER_DAY = 1` (unused until Stage 2), `MAX_DECIMAL_PLACES = 3`. |
| `lib/lesson/check.ts` | `checkBlank`, `checkAnswer`, `parseRationalEntry`. On top of `equivalence.ts` and `rational.ts`. |
| `lib/lesson/play.ts` | `playLesson(lesson, policy)`. The one loop for all three modes. |
| `lib/lesson/progress.ts` | `progressFrom(attempts)`. Pure. |
| `lib/lesson/validate.ts` | `validateLesson(lesson): Finding[]`, `fatalFindings`. Seven fatal codes, two warning codes. |
| `lib/lesson/cli/validate-lessons.ts` | The `validate:lessons` CLI. Discovers lesson files by directory scan. |
| `lib/lesson/boundaries.test.ts` | Reads every file under `lib/lesson/`, fails on React, `next/*`, `@supabase/*`, `app/`, `components/`, or a relative import that leaves `lib/lesson` and `lib/questions`. Self-tests its own catches. |
| `lib/lesson/no-math-random.test.ts` | Sibling of the `lib/questions/` scan; this one covers **both** directories. |
| `lib/lesson/{check,play,progress,validate}.test.ts` | 48 further tests. |
| `content/lessons/mhf4u-u3-polynomial-equations.ts` | The lesson. Test map of all 15 Unit 3 types, one `built`; one worked-set entry at seed 0 with a five-step script. |
| `docs/spec/ap-academy-diy-build-spec.md` | The founding spec, verbatim. |
| `docs/spec/stage-0-lesson-engine.md` | This stage's prompt, verbatim. |
| `CLAUDE.md` | New `## /learn and lib/lesson` section: the five invariants, in the prompt's wording. |
| `package.json` | `test:lesson`, `validate:lessons`; `prebuild` runs the latter. |

### The step script format

A `WorkedSetEntry` is one fixed question plus its solution as steps. Each
`Step` has a permanent `id`, a `say` (what appears when the step is revealed,
LaTeX without `$`, tutor voice), and optionally a `Blank`. A step with no blank
is narration. A blank has a `prompt`, a `hint` (shown after the first wrong
entry), and one of three `kind`s: `rational` (answer is a `Rational`),
`choice` (answer is an index into `options`), `exact` (answer is a string
compared after whitespace normalization).

Together mode reveals steps in order. At a blank the student enters something;
wrong once shows the hint and gives one more try; wrong twice reveals the
answer and moves on. Every entry is an `Attempt` with the step's id.

The shipped script, as a student reads it in Together mode. Generator
`mhf4u-u3-factor-theorem-find-k-d2`, seed 0 (r = -3, a = 1, b = 2, k = 24):

> **Given that (x + 3) divides f(x) = x^3 + x^2 + 2x + k exactly, determine k.**
>
> **Step 1.** Start with what the word "factor" buys you. If (x + 3) is a
> factor of f(x), then f(x) comes out to exactly zero at the root of that
> factor. That is the factor theorem, and it is the whole question. Everything
> after this is arithmetic.
> *Blank:* What value of x makes (x + 3) equal to zero? `[ ]`
> *Hint (after one wrong entry):* Set the factor itself to zero: x + 3 = 0. Watch the sign.
> *Answer (after two):* -3
>
> **Step 2.** So substitute x = -3 into f(x) = x^3 + x^2 + 2x + k and set the
> result equal to zero: (-3)^3 + (1)(-3)^2 + (2)(-3) + k = 0.
> *(narration, no blank)*
>
> **Step 3.** Work the three known terms one at a time. (-3)^3 = -27. Then
> (1)(-3)^2 = 9. And (2)(-3) = -6.
> *Blank:* Add them up: -27 + 9 + (-6) = ? `[ ]`
> *Hint:* Two negatives and one positive. -27 + 9 is -18, then take away 6 more.
> *Answer:* -24
>
> **Step 4.** So the equation is now -24 + k = 0. Move the -24 across the
> equals sign.
> *Blank:* k = ? `[ ]`
> *Hint:* Moving -24 to the other side flips its sign. You are solving for k, not reporting the -24.
> *Answer:* 24
>
> **Step 5.** Check it back. Having (x + 3) as a factor means f(-3) is exactly
> zero, so put k = 24 into what you already computed.
> *Blank:* With k = 24, f(-3) = -24 + 24 = ?  `( ) 0   ( ) 24   ( ) -24   ( ) 48`
> *Hint:* You already found the first three terms add to -24. Add k to that.
> *Answer:* 0

Steps 1, 3 and 4 each target one of the generator's three named
misconceptions (`sign_error_on_root`, `arithmetic_sign_slip`,
`solved_for_wrong_variable`), so a student who would pick the wrong option in
Solo meets the same mistake as a blank in Together first.

### What `check.ts` accepts and rejects

| kind | entry | verdict | why |
|---|---|---|---|
| rational | `24`, `+24`, `024` | integer, exact | |
| rational | `-24`, `-24.0`, `-48/2` | equals -24 | fraction and decimal parse to the same `Rational` |
| rational | `1/2`, `0.5`, `.5`, `2/4`, `0.500`, ` 1 / 2 ` | all equal 1/2 | `areEquivalent` on reduced form |
| rational | `0.333` against 1/3 | **wrong** | 333/1000 is not 1/3; no tolerance |
| rational | `0.3333`, `0.1234` | **wrong** | more than `MAX_DECIMAL_PLACES` (3) |
| rational | `1/0` | **wrong** | zero denominator |
| rational | `\frac{1}{2}`, `1 1/2`, `1e3`, `2x`, `abc`, `.`, empty | **wrong** | not an accepted form; never throws |
| choice | `2` when answer is 2 | right | index comparison |
| choice | `-24` when option 2 reads `-24` | **wrong** | the entry is the index, not the option text |
| choice | `B`, empty, out of range | **wrong** | |
| exact | `\frac{1}{2}`, `  \frac{1}{2}  ` | equals `\frac{1}{2}` | trim and collapse whitespace runs |
| exact | `0.5`, `\frac{2}{4}` against `\frac{1}{2}` | **wrong** | no value-level equivalence on `exact` |
| exact | `x=2` against `x = 2` | **wrong** | whitespace is collapsed, not deleted (same rule as `areLatexIdentical`) |
| Solo (`checkAnswer`) | the index of the correct choice | right | |
| Solo (`checkAnswer`) | option text, empty, out of range | **wrong** | |

Not accepted anywhere: free-form algebra, mixed numbers, percentages, LaTeX in
a rational blank. A step whose answer would need any of those is narration.

### Deviations from the prompt, dated

All 2026-09-28.

1. **`Blank` is a discriminated union, not `kind` beside a loose `answer`.**
   Approved at Stop 1. A `rational` blank cannot carry a string answer and
   `checkBlank` cannot reach the wrong arm.
2. **`choice` blanks carry `options: LatexString[]`.** Approved at Stop 1. An
   index needs something to index into; the prompt's sketch did not name it.
3. **`Attempt.at` is a 0-based position in the session, not a timestamp.**
   Approved at Stop 1. `lib/lesson/` has no clock, and the prompt's own test
   requires two runs of the same policy to produce identical attempt lists.
   Stage 2 stamps wall time when it stores.
4. **`StudentPolicy.reveal?(step)` added.** Approved at Stop 1. Optional; the
   Stage 1 UI needs to be told about narration steps through the same loop.
   Tests use it to assert reveal order.
5. **`checkAnswer` takes the index of the chosen option, not a typed value.**
   Every generator produces four-option multiple choice and `Choice.value` is
   the generator's, so Solo answers by index, entered as a string exactly like
   a `choice` blank. Typed numeric answers against `choices[i].value` are an
   addition for when a generator is not multiple choice, not a different
   function.
6. **Test files under `lib/lesson/` may import `content/lessons/`.** The
   invariant says `lib/lesson/` imports from `lib/questions/` only. The
   prompt also requires `validate.test.ts` to prove the shipped lesson passes
   and `play.test.ts` to play it, which is impossible without importing it.
   `boundaries.test.ts` allows `../../content/lessons/` from `*.test.ts` only
   and has a test asserting a source file cannot do the same.
7. **`no-math-random` is a sibling test, not an extension.** The
   `lib/lesson/` copy scans both directories, so one test covers both as the
   invariant requires. The `lib/questions/` original is untouched.
8. **`MAX_DECIMAL_PLACES` added to `tuning.ts`.** The prompt fixes "at most 3
   places" in prose; a number a tuning pass could touch goes in `tuning.ts`.
9. **`validate.ts` has more fatal codes than the prompt lists.** `UNKNOWN_UNIT`,
   `UNKNOWN_COURSE` and `EMPTY_FIELD` in addition to the six named. A lesson
   claiming a unit that does not exist is as broken as one claiming a problem
   type that does not exist.
10. **No second generator.** The set mechanics (ordered entries, per-entry seed
    and script, Solo iterating entries at fresh seeds) are proved with one
    entry plus fixtures. A second generator would have been an hour of
    generator work to prove nothing the tests do not already prove.

### What Stage 1 needs

Fields in `content/lessons/mhf4u-u3-polynomial-equations.ts` Charlie fills by
hand, from the prose test map (spec section 10):

- `testMap.summary`: the placeholder paragraph, replaced with the half-page.
- `testMap.entries[*].typicalMarks`: all 15 are `0`.
- `testMap.entries[*].traps`: all 15 are `[]`. One to three each.
- `videoRef`: `null` until the seed 0 question is recorded. Once it is,
  `{ kind: 'youtube', id: '...' }`, and the seed is frozen for good.

Things the engine could not decide:

- **The Solo entry format in the browser.** `checkAnswer` takes an option
  index because every generator is four-option multiple choice. If Stage 1
  wants a typed box instead of four buttons, it needs a `checkAnswer` arm
  that parses against `choices[i].value` (a `QValue`, not only a `Rational`).
  Not built.
- **Whether narration steps need their own "next" click.** `reveal(step)` is
  called for every step; the UI decides whether narration auto-advances.
- **Vercel's Node version.** `validate:lessons` runs on `prebuild` and needs
  Node 22.6+ type stripping, which is what the container has (22.22.2). If the
  Vercel project pins an older Node, the build fails at `prebuild` with a
  syntax error on the first `.ts` import; the fix is the project's Node
  setting, not the script.
- **Together records attempts against the worked-set seed.** That is by
  design (the seed identifies the question), but Stage 2's `lesson_attempts`
  table should expect many rows sharing `(generatorId, seed)` with different
  `stepId`s.
- **The 14 `coming` types have no generators.** `coverage:questions` is the
  work queue, exactly as before. Nothing in Stage 1 depends on them beyond
  rendering the test map.

### Build output

`npm run build`, verbatim (trimmed to the parts this session touches):

```
> ap-academy-landing@0.1.0 prebuild
> node scripts/validate-sat-words.mjs && npm run validate:lessons

sat-words.json OK — 991 entries, 252 v, 266 n, 472 adj, 1 adv, 12 twin-guarded words.

> ap-academy-landing@0.1.0 validate:lessons
> node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/lesson/cli/validate-lessons.ts

mhf4u-u3-polynomial-equations.ts  PASS  (mhf4u-u3-polynomial-equations: 1 worked, 15 on the test map, 0 fatal, 0 warn)

PASS — 1 lesson validated, 0 warnings.

  Creating an optimized production build ...
✓ Compiled successfully in 5.5s
  Running TypeScript ...
✓ Generating static pages using 3 workers (19/19) in 410.4ms
```

Exit 0. No new route appears, as intended.

**Lint.** `npx eslint lib/lesson content/lessons` exits 0. `npm run lint` on
the whole repo exits 1 with 17 pre-existing `react/no-unescaped-entities`
errors in `app/how-it-works/page.tsx` and `app/privacy/page.tsx`, plus two
warnings. None are in files this branch touches (`git diff origin/main --
app/` is empty). They predate Session A and are left alone: fixing copy pages
is outside a headless engine stage.
