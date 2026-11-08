import { useLayoutEffect, useRef, useState } from "react";

/** How much room the strip's column has: it shrinks the strip so what is above it keeps its space. */
type Room = "full" | "compact" | "minimal";

/** Column heights (px) below which the strip gives up its title and shrinks, then drops its thumbnail. */
const COMPACT_BELOW = 560;
const MINIMAL_BELOW = 330;

function roomFor(columnHeight: number): Room {
  if (columnHeight < MINIMAL_BELOW) return "minimal";
  if (columnHeight < COMPACT_BELOW) return "compact";
  return "full";
}

/** The strip's column (its parent) height, kept current as the window or the panes are resized. */
function useColumnRoom(ref: React.RefObject<HTMLElement>): Room {
  const [room, setRoom] = useState<Room>("full");
  useLayoutEffect(() => {
    const column = ref.current?.parentElement;
    if (!column) return;
    const update = () => setRoom(roomFor(column.getBoundingClientRect().height));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(column);
    return () => observer.disconnect();
  }, [ref]);
  return room;
}

const THUMB_WIDTH: Record<Room, string> = {
  full: "clamp(110px, 40%, 144px)",
  compact: "clamp(80px, 30%, 104px)",
  minimal: "0",
};

/**
 * Bottom strip of the Preview and Live panels: a thumbnail of the output, what it shows, and slide arrows.
 * It adapts to its column: with less height it drops its title and shrinks the thumbnail, and in a very
 * short column it keeps only the label and the arrows, so whatever sits above it keeps its room.
 */
export default function OutputStrip({ title, label, slide, slides, onSlide, stage, children }: {
  title: string;
  label: string;
  slide: number;
  slides: number;
  onSlide: (n: number) => void;
  stage: { w: number; h: number };
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const room = useColumnRoom(rootRef);
  const full = room === "full";
  const minimal = room === "minimal";

  return (
    <div ref={rootRef} className={`shrink-0 border-t border-outline-variant px-4 ${full ? "py-3" : "py-2"}`}>
      {full && <p className="font-body-ui text-[12px] font-bold text-on-surface-variant mb-3">{title}</p>}
      <div className={`flex items-center ${full ? "gap-4" : "gap-3"}`}>
        {!minimal && (
          <div className="shrink-0 rounded-md overflow-hidden" style={{ width: THUMB_WIDTH[room], aspectRatio: `${stage.w} / ${stage.h}` }}>
            {children}
          </div>
        )}
        <div className={`min-w-0 flex-1 flex ${minimal ? "items-center gap-3" : "flex-col gap-1.5"}`}>
          <p className="font-body-ui text-[12px] text-on-surface truncate min-w-0" title={label}>{minimal ? `${title}: ${label}` : label}</p>
          <p className="font-body-ui text-[12px] text-on-surface-variant whitespace-nowrap">Slide {slides === 0 ? 0 : slide + 1} of {slides}</p>
          <div className={`flex ctl rounded-md overflow-hidden ${minimal ? "ml-auto shrink-0" : "self-start"}`}>
            <button onClick={() => onSlide(Math.max(0, slide - 1))} disabled={slide <= 0} className="px-2 py-1 disabled:opacity-35 hover:bg-on-surface/10" aria-label="Previous slide">
              <span className="material-symbols-outlined !text-[18px]">chevron_left</span>
            </button>
            <button onClick={() => onSlide(Math.min(slides - 1, slide + 1))} disabled={slide >= slides - 1} className="px-2 py-1 border-l border-outline-variant disabled:opacity-35 hover:bg-on-surface/10" aria-label="Next slide">
              <span className="material-symbols-outlined !text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
