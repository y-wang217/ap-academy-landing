/**
 * Every number a tuning pass would touch. Nothing in `lib/lesson/` logic
 * carries a literal that belongs here; a test or a reviewer finding one in
 * `play.ts` or `check.ts` should move it, not tune it in place.
 */

/**
 * How many entries a student gets at a Together blank before the answer is
 * revealed and the script moves on. After the first wrong entry the hint is
 * shown; after the last, the answer.
 */
export const TOGETHER_TRIES_BEFORE_REVEAL = 2;

/**
 * Fresh Solo sets a free account may draw per problem type per day (spec
 * section 3). Unused in Stage 0: the gate is server-side and lands in Stage 2.
 * It lives here now so Stage 2 does not invent the number in logic.
 */
export const FREE_SOLO_SETS_PER_DAY = 1;

/**
 * Maximum decimal places accepted in a `rational` blank entry. `0.5` and
 * `0.125` parse; `0.3333` does not, because a student who truncates a
 * repeating decimal has not given the exact answer the question asked for.
 */
export const MAX_DECIMAL_PLACES = 3;
