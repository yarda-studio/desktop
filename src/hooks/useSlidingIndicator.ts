import { useLayoutEffect, useRef, useState, type RefObject } from "react";

export interface IndicatorBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** false until the first measurement, and when nothing is active: render hidden, no transition. */
  visible: boolean;
  /** false on a placement that should simply appear in place (first ever, or a different layout). */
  animate: boolean;
  /** How long the glide should take, in ms: longer for longer moves so every jump is readable. */
  duration: number;
}

type Rect = Pick<IndicatorBox, "x" | "y" | "w" | "h">;

const HIDDEN: IndicatorBox = { x: 0, y: 0, w: 0, h: 0, visible: false, animate: false, duration: 0 };

/** 220ms floor, about 1.2ms per pixel travelled, capped at 480ms: a one-tab hop is ~320ms, the longest jump ~460ms. Always long enough to follow with the eye, never long enough to make you wait. */
export const glideDuration = (from: Rect, to: Rect) => Math.round(Math.min(480, 220 + (Math.abs(to.x - from.x) + Math.abs(to.y - from.y)) * 1.2));
/** The easing every highlight uses: eases in a touch, then settles, so the whole path is visible (unlike a hard ease-out, which spends most of the move in its first frames). */
export const GLIDE_EASE = "cubic-bezier(0.4, 0.05, 0.15, 1)";

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** Last position of each named highlight, so a copy that remounts (a nav rendered inside each screen) can glide on from where the previous one was. */
const lastPlaced = new Map<string, Rect>();

const prevInit = (key?: string): Rect | null => (key ? lastPlaced.get(key) ?? null : null);

/**
 * Where to draw a highlight so it sits behind whichever child of `containerRef` is marked
 * `data-active="true"`. Because it measures the real element, it works for tabs of different
 * widths and for vertical lists alike, and it re-measures when the container resizes (a window
 * resize, a sidebar that expands, a font that finishes loading).
 *
 * The caller positions an absolutely placed element with `transform: translate(x, y)` and
 * `width`/`height`, and gives it a CSS transition on those properties while `animate` is true.
 *
 * `memoryKey`: pass a stable name when the component holding the highlight is remounted as the
 * user moves around (the side navigation is drawn inside every screen). The new copy then starts
 * where the old one ended and slides to the new item, instead of appearing in place. Use a
 * different key per layout, since a highlight cannot meaningfully glide between two different shapes.
 */
export function useSlidingIndicator(containerRef: RefObject<HTMLElement | null>, activeKey: string | number | null, memoryKey?: string): IndicatorBox {
  const [box, setBox] = useState<IndicatorBox>(() => {
    const prev = memoryKey ? lastPlaced.get(memoryKey) : undefined;
    return prev ? { ...prev, visible: true, animate: false, duration: 0 } : HIDDEN;
  });
  const placed = useRef(box.visible);
  const settling = useRef(false);
  const latest = useRef<Rect | null>(null);
  const firstRun = useRef(true);
  const shown = useRef<Rect | null>(prevInit(memoryKey));

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let raf1 = 0;
    let raf2 = 0;
    let timer = 0;

    const apply = (next: IndicatorBox) => {
      const from = shown.current;
      const withDuration = next.visible && next.animate && from ? { ...next, duration: glideDuration(from, next) } : next;
      shown.current = next.visible ? { x: next.x, y: next.y, w: next.w, h: next.h } : null;
      setBox((prev) => (prev.visible === withDuration.visible && prev.animate === withDuration.animate && sameRect(prev, withDuration) ? prev : withDuration));
    };

    const measure = () => {
      const active = container.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) {
        placed.current = false;
        latest.current = null;
        apply(HIDDEN);
        return;
      }
      const rect: Rect = { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight };
      latest.current = rect;
      if (memoryKey) lastPlaced.set(memoryKey, rect);
      // Holding the old position for one painted frame is what lets the browser animate away from it.
      if (settling.current) return;
      apply({ ...rect, visible: true, animate: placed.current, duration: 0 });
      placed.current = true;
    };

    // Remounted next to a remembered position: paint there first, then slide to the real one.
    const prev = memoryKey ? lastPlaced.get(memoryKey) : undefined;
    const active = container.querySelector<HTMLElement>('[data-active="true"]');
    if (firstRun.current && prev && active && placed.current && !settling.current) {
      const target: Rect = { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight };
      if (!sameRect(prev, target)) {
        settling.current = true;
        latest.current = target;
        if (memoryKey) lastPlaced.set(memoryKey, target);
        // Two animation frames guarantees the old position was painted; the timer is a safety net for
        // windows that are not painting (hidden, minimised) so the highlight can never stay stuck.
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          settling.current = false;
          const l = latest.current;
          if (l) apply({ ...l, visible: true, animate: true, duration: 0 });
        };
        raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(finish); });
        timer = window.setTimeout(finish, 90);
      }
    }

    firstRun.current = false;
    if (!settling.current) measure();
    if (typeof ResizeObserver === "undefined") return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); window.clearTimeout(timer); settling.current = false; };
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
      settling.current = false;
    };
  }, [containerRef, activeKey, memoryKey]);

  return box;
}
