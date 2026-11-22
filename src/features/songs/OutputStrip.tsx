import { useLayoutEffect, useRef, useState } from "react";
import { outputStripConfig, type OutputStripConfig } from "../../lib/consoleDensity";
import { useAppStore } from "../../store/app";

/** How much room the strip's column has: it shrinks the strip so what is above it keeps its space. */
type Room = "full" | "compact" | "minimal";

function roomFor(columnHeight: number, columnWidth: number, cfg: OutputStripConfig): Room {
  if (columnHeight < cfg.minimalBelow || columnWidth < cfg.narrowBelow) return "minimal";
  if (columnHeight < cfg.compactBelow) return "compact";
  return "full";
}

/** The strip's column (its parent) size, kept current as the window or the panes are resized. */
function useColumnRoom(ref: React.RefObject<HTMLElement>, cfg: OutputStripConfig): Room {
  const [room, setRoom] = useState<Room>("full");
  useLayoutEffect(() => {
    const column = ref.current?.parentElement;
    if (!column) return;
    const update = () => {
      const rect = column.getBoundingClientRect();
      setRoom(roomFor(rect.height, rect.width, cfg));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(column);
    return () => observer.disconnect();
  }, [ref, cfg.compactBelow, cfg.minimalBelow, cfg.narrowBelow]);
  return room;
}

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
  const compactness = useAppStore((s) => s.consoleCompactness);
  const cfg = outputStripConfig(compactness);
  const rootRef = useRef<HTMLDivElement>(null);
  const room = useColumnRoom(rootRef, cfg);
  const full = room === "full";
  const minimal = room === "minimal";
  const thumbWidth = full ? cfg.thumbFull : room === "compact" ? cfg.thumbCompact : "0";

  return (
    <div
      ref={rootRef}
      className="shrink-0 border-t border-outline-variant"
      style={{
        paddingInline: full ? "var(--c-strip-full-px, 16px)" : "var(--c-strip-cmp-px, 12px)",
        paddingBlock: full ? "var(--c-strip-full-py, 12px)" : "var(--c-strip-cmp-py, 6px)",
      }}
    >
      {full && <p className="font-body-ui text-[11.5px] font-bold text-on-surface-variant mb-1.5">{title}</p>}
      <div className={`flex items-center ${full ? "gap-2.5" : "gap-2"}`}>
        {!minimal && (
          <div className="shrink-0 rounded-md overflow-hidden" style={{ width: thumbWidth, aspectRatio: `${stage.w} / ${stage.h}` }}>
            {children}
          </div>
        )}
        <div className={`min-w-0 flex-1 flex ${minimal ? "items-center gap-2" : "flex-col gap-0.5"}`}>
          <p className="font-body-ui text-[11.5px] font-medium text-on-surface truncate min-w-0" title={label}>{label}</p>
          {!minimal && (
            <p className="font-body-ui text-[11px] text-on-surface-variant whitespace-nowrap">Slide {slides === 0 ? 0 : slide + 1} of {slides}</p>
          )}
          <div className={`flex ctl rounded-md overflow-hidden ${minimal ? "ml-auto shrink-0" : "self-start mt-0.5"}`}>
            <button onClick={() => onSlide(Math.max(0, slide - 1))} disabled={slide <= 0} className="px-1.5 py-0.5 disabled:opacity-35 hover:bg-on-surface/10" aria-label="Previous slide">
              <span className="material-symbols-outlined !text-[16px]">chevron_left</span>
            </button>
            <button onClick={() => onSlide(Math.min(slides - 1, slide + 1))} disabled={slide >= slides - 1} className="px-1.5 py-0.5 border-l border-outline-variant disabled:opacity-35 hover:bg-on-surface/10" aria-label="Next slide">
              <span className="material-symbols-outlined !text-[16px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
