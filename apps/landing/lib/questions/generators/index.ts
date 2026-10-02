/**
 * The generator registry.
 *
 * A hand-maintained typed array — deliberately not a filesystem scan and not a
 * dynamic import. Three reasons: it type-checks (a generator that stops
 * satisfying `Generator` breaks the build rather than the CLI), it works
 * unchanged under bundling, and adding a generator is a visible line in a diff
 * that a reviewer can see.
 *
 * To register a new generator: import it and add it to `GENERATORS`. That is the
 * whole step. `verify:questions` picks it up automatically.
 */

import type { Generator } from '../types.ts';
import { factorTheoremFindK } from './mhf4u/u3-factor-theorem-find-k.ts';

/** Every generator in the codebase, in registration order. */
export const GENERATORS: Generator[] = [factorTheoremFindK];

/**
 * Looks up a generator by its `id`, or returns `undefined`.
 *
 * Used by the `verify:questions` CLI to resolve its optional generator-id
 * argument.
 */
export function getGenerator(id: string): Generator | undefined {
  return GENERATORS.find((generator) => generator.id === id);
}

/** Every registered generator id, for CLI help text and error messages. */
export function generatorIds(): string[] {
  return GENERATORS.map((generator) => generator.id);
}
