/**
 * The Live Show console owns the logic for stepping the live scripture (split
 * verse parts, chapter boundaries), so it registers a stepper here while it is
 * mounted and the phone remote calls it. Keeps the remote from reaching into the
 * console's internals.
 */
type Stepper = (delta: 1 | -1) => void | Promise<void>;

let stepper: Stepper | null = null;

export function registerScriptureStepper(fn: Stepper): () => void {
  stepper = fn;
  return () => { if (stepper === fn) stepper = null; };
}

export function stepScripture(delta: 1 | -1): void | Promise<void> {
  return stepper?.(delta);
}
