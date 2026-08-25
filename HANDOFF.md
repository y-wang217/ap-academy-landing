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
