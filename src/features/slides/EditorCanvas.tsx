import { useEffect, useRef, useState } from "react";
import type { PresentationTheme } from "../../lib/tauri";
import type { SlideDoc, SlideElement } from "./api";
import SlideStage from "./SlideStage";

const FRAME = { w: 1920, h: 1080 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Props {
  slide: SlideDoc;
  theme: PresentationTheme | null;
  /** Free-form slides can be arranged by dragging; announcements are a fixed layout. */
  editable: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<SlideElement>) => void;
}

/**
 * The slide at editing size: the real SlideStage, scaled to fit, with a box
 * over each element that can be dragged to move or resized from its corner.
 * Positions are stored as % of the slide, so the drag maths works in percent too.
 */
export default function EditorCanvas({ slide, theme, editable, selectedId, onSelect, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = (width * FRAME.h) / FRAME.w;

  function beginDrag(e: React.PointerEvent, el: SlideElement, mode: "move" | "resize") {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(el.id);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, ex: el.x, ey: el.y, ew: el.w, eh: el.h };
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - start.x) / width) * 100;
      const dy = ((ev.clientY - start.y) / height) * 100;
      if (mode === "move") {
        onChange(el.id, { x: clamp(start.ex + dx, 0, 100 - start.ew), y: clamp(start.ey + dy, 0, 100 - start.eh) });
      } else {
        onChange(el.id, { w: clamp(start.ew + dx, 2, 100 - start.ex), h: clamp(start.eh + dy, 2, 100 - start.ey) });
      }
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }

  function onKeyDown(e: React.KeyboardEvent, el: SlideElement) {
    const step = e.shiftKey ? 5 : 1;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    onChange(el.id, { x: clamp(el.x + dx, 0, 100 - el.w), y: clamp(el.y + dy, 0, 100 - el.h) });
  }

  return (
    <div
      ref={hostRef}
      className="relative w-full aspect-video overflow-hidden bg-black rounded-sm ring-1 ring-outline-variant shadow-lg"
      onPointerDown={() => onSelect(null)}
    >
      {width > 0 && (
        <div
          className="absolute top-0 left-0 pointer-events-none select-none"
          style={{ width: FRAME.w, height: FRAME.h, transform: `scale(${width / FRAME.w})`, transformOrigin: "top left" }}
          aria-hidden
        >
          <SlideStage slide={slide} theme={theme} stage={FRAME} />
        </div>
      )}
      {editable && slide.elements.map((el) => {
        const selected = el.id === selectedId;
        return (
          <div
            key={el.id}
            tabIndex={0}
            role="button"
            aria-label={`${el.kind === "image" ? "Picture" : "Text box"}${selected ? " (selected)" : ""}. Arrow keys move it.`}
            onPointerDown={(e) => beginDrag(e, el, "move")}
            onFocus={() => onSelect(el.id)}
            onKeyDown={(e) => onKeyDown(e, el)}
            className={`absolute cursor-move outline-none touch-none ${selected ? "ring-2 ring-primary" : "ring-1 ring-white/25 hover:ring-white/60"}`}
            style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` }}
          >
            {selected && (
              <span
                onPointerDown={(e) => beginDrag(e, el, "resize")}
                className="absolute -right-1.5 -bottom-1.5 h-3.5 w-3.5 rounded-sm bg-primary ring-2 ring-white cursor-nwse-resize touch-none"
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
