/**
 * The size search behind "shrink text to fit". Pure, with the measuring passed
 * in, so the rule can be tested without a browser; FitText.tsx supplies the
 * measuring.
 */

/** Auto-fit never shrinks text below this share of its set size. */
export const MIN_FIT_RATIO = 0.2;

/** The smallest size auto-fit will use for text set at `maxPx`. */
export function fitFloor(maxPx: number): number {
  return Math.min(maxPx, Math.max(8, maxPx * MIN_FIT_RATIO));
}

/**
 * The largest size from `min` to `max` for which `fits` is true, to within
 * `precision` pixels. `max` when it already fits; `min` when even that does not
 * (the text is then clipped, but stays as big as the floor allows).
 */
export function largestFit(fits: (px: number) => boolean, min: number, max: number, precision = 0.5): number {
  if (fits(max)) return max;
  if (!fits(min)) return min;
  let low = min; // always fits
  let high = max; // never fits
  while (high - low > precision) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}
