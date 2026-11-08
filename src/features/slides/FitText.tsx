import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { fitFloor, largestFit } from "./fitSize";

/**
 * The text of one box on a slide. With `autoFit` it is drawn at the largest size
 * up to `maxPx` that fits inside its parent box (the parent has a fixed size and
 * clips), measured in the real page so it is right on every output. Without it,
 * it is drawn at `maxPx` as before.
 *
 * `fitKey` stands for anything in `style` that changes how the text lays out
 * (font, weight), so a change to it fits again.
 */
export default function FitText({ text, maxPx, autoFit, fitKey, style }: {
  text: string;
  maxPx: number;
  autoFit: boolean;
  fitKey: string;
  style: CSSProperties;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [fitted, setFitted] = useState<number | null>(null);

  useLayoutEffect(() => {
    const p = ref.current;
    const box = p?.parentElement;
    if (!autoFit || !p || !box) {
      setFitted(null);
      return;
    }
    const fit = () => {
      const fits = (px: number) => {
        p.style.fontSize = `${px}px`;
        // 0.5px of slack: scroll sizes are rounded.
        return p.scrollHeight <= box.clientHeight + 0.5 && p.scrollWidth <= box.clientWidth + 0.5;
      };
      const best = largestFit(fits, fitFloor(maxPx), maxPx);
      // Leave the page showing the answer, whether or not React needs to write it.
      p.style.fontSize = `${best}px`;
      setFitted(best);
    };
    fit();
    // The box changes size when the window or the stage does.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [autoFit, maxPx, text, fitKey]);

  return (
    <p ref={ref} className="m-0 whitespace-pre-wrap" style={{ ...style, fontSize: autoFit ? (fitted ?? maxPx) : maxPx }}>
      {text}
    </p>
  );
}
