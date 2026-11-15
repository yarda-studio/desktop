import { useRef, type ReactNode } from "react";
import { useSlidingIndicator, GLIDE_EASE } from "../hooks/useSlidingIndicator";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional extra: native tooltip and accessible name when the label is only an icon. */
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers ("Plan or schedule"). */
  ariaLabel: string;
  /**
   * "solid"  the selected option is a filled primary pill with light text (main switchers).
   * "soft"   the selected option is a tinted pill with primary text (quiet, secondary switchers).
   */
  variant?: "solid" | "soft";
  /** Classes for the track (the row that holds the options): spacing, background, width. */
  className?: string;
  /** Classes for every option button: padding, shape, text size and weight. */
  itemClassName?: string;
  /** Extra classes only on the chosen option / only on the others (defaults give the usual text colours). */
  activeItemClassName?: string;
  idleItemClassName?: string;
  /** Replaces the highlight's shape and colour, e.g. "rounded-full bg-secondary-container". */
  indicatorClassName?: string;
  /** Options share the width equally (like a tab bar) instead of sizing to their label. */
  stretch?: boolean;
}

/**
 * The app's one switcher: a row of options where the highlight glides to the chosen one.
 * Use it for any "pick exactly one of a few" control (tabs, view modes, alignments) so every
 * switcher moves the same way, with the same timing, and respects reduced motion.
 */
export default function SegmentedControl<T extends string>({
  options, value, onChange, ariaLabel, variant = "solid", className = "", itemClassName = "px-3 py-1.5 rounded-md text-[13px] font-semibold",
  activeItemClassName, idleItemClassName = "text-on-surface-variant hover:text-primary", indicatorClassName, stretch = false,
}: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useSlidingIndicator(ref, value);

  const pill = indicatorClassName ?? (variant === "solid"
    ? "rounded-md bg-primary shadow-xs"
    : "rounded-md border border-primary/[0.18] bg-primary/[0.12]");
  const activeText = activeItemClassName ?? (variant === "solid" ? "text-on-primary" : "text-primary");

  return (
    <div ref={ref} role="tablist" aria-label={ariaLabel} className={`relative ${stretch ? "flex w-full" : "inline-flex"} items-center ${className}`}>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 ${pill} ${box.animate ? "transition-[transform,width,height] motion-reduce:transition-none" : ""}`}
        style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h, opacity: box.visible ? 1 : 0, transitionDuration: `${box.duration}ms`, transitionTimingFunction: GLIDE_EASE }}
      />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={o.ariaLabel}
            title={o.title}
            disabled={o.disabled}
            data-active={on ? "true" : undefined}
            onClick={() => onChange(o.value)}
            className={`relative z-10 flex items-center justify-center gap-1.5 whitespace-nowrap font-body-ui transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${stretch ? "flex-1" : ""} ${itemClassName} ${
              on ? activeText : idleItemClassName
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
