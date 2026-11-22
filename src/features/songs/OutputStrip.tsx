import { useLayoutEffect, useRef, useState } from "react";

/** How much room the strip's column has: it shrinks the strip so what is above it keeps its space. */
type Room = "full" | "compact" | "minimal";

/** Column heights (px) below which the strip gives up its title and shrinks, then drops its thumbnail. */
const COMPACT_BELOW = 540;
const MINIMAL_BELOW = 310;
const NARROW_BELOW = 240;

function roomFor(columnHeight: number, columnWidth: number): Room {
  if (columnHeight < MINIMAL_BELOW || columnWidth < NARROW_BELOW) return "minimal";
  if (columnHeight < COMPACT_BELOW) return "compact";
  return "full";
}

/** The strip's column (its parent) size, kept current as the window or the panes are resized. */
function useColumnRoom(ref: React.RefObject<HTMLElement>): Room {
  const [room, setRoom] = useState<Room>("full");
  useLayoutEffect(() => {
    const column = ref.current?.parentElement;
    if (!column) return;
    const update = () => {
      const rect = column.getBoundingClientRect();
      setRoom(roomFor(rect.height, rect.width));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(column);
    return () => observer.disconnect();
  }, [ref]);
  return room;
}

const THUMB_WIDTH: Record<Room, string> = {
  full: "clamp(104px, 38%, 144px)",
  compact: "clamp(68px, 25%, 92px)",
  minimal: "0",
};

/**
 * Bottom strip of the Preview and Live panels: a thumbnail of the output, what it shows, and slide arrows.
 * It adapts to its column: with less height it drops its title and shrinks the thumbnail, and in a very
 * short or narrow column it keeps only the label and the arrows, so whatever sits above it keeps its room.
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
    <div ref={rootRef} className={`shrink-0 border-t border-outline-variant ${full ? "px-4 py-3" : "px-3 py-1.5"}`}>
      {full && <p className="font-body-ui text-[12px] font-bold text-on-surface-variant mb-2.5">{title}</p>}
      <div className={`flex items-center ${full ? "gap-3.5" : "gap-2.5"}`}>
        {!minimal && (
          <div className="shrink-0 rounded-md overflow-hidden" style={{ width: THUMB_WIDTH[room], aspectRatio: `${stage.w} / ${stage.h}` }}>
            {children}
          </div>
        )}
        <div className={`min-w-0 flex-1 flex ${minimal ? "items-center gap-2" : "flex-col gap-1"}`}>
          <p className="font-body-ui text-[12px] text-on-surface truncate min-w-0" title={label}>{minimal ? label : label}</p>
          {!minimal && (
            <p className="font-body-ui text-[11.5px] text-on-surface-variant whitespace-nowrap">Slide {slides === 0 ? 0 : slide + 1} of {slides}</p>
          )}
          <div className={`flex ctl rounded-md overflow-hidden ${minimal ? "ml-auto shrink-0" : "self-start"}`}>
            <button onClick={() => onSlide(Math.max(0, slide - 1))} disabled={slide <= 0} className="px-1.5 py-0.5 disabled:opacity-35 hover:bg-on-surface/10" aria-label="Previous slide">
              <span className="material-symbols-outlined !text-[18px]">chevron_left</span>
            </button>
            <button onClick={() => onSlide(Math.min(slides - 1, slide + 1))} disabled={slide >= slides - 1} className="px-1.5 py-0.5 border-l border-outline-variant disabled:opacity-35 hover:bg-on-surface/10" aria-label="Next slide">
              <span className="material-symbols-outlined !text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
