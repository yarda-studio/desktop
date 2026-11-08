import { memo, useMemo } from "react";
import type { PresentationTheme } from "../../lib/tauri";
import type { SlidePage } from "./api";
import SlideStage from "./SlideStage";

const FRAME = { w: 1920, h: 1080 };

/**
 * A small live rendering of one page: the real slide renderer on a 1080p frame,
 * scaled down. Memoised on the page object, so a list only re-renders the
 * thumbnails whose page actually changed. The theme should have no background
 * video: one playing video per thumbnail would be heavy.
 */
const PageThumb = memo(function PageThumb({ page, title, theme, width }: {
  page: SlidePage;
  title: string;
  theme: PresentationTheme | null;
  width: number;
}) {
  const slide = useMemo(() => ({ title, background: page.background, elements: page.elements }), [title, page]);
  return (
    <div className="relative overflow-hidden rounded-sm bg-black" style={{ width, height: (width * FRAME.h) / FRAME.w }}>
      <div
        className="pointer-events-none absolute left-0 top-0 select-none"
        style={{ width: FRAME.w, height: FRAME.h, transform: `scale(${width / FRAME.w})`, transformOrigin: "top left" }}
        aria-hidden
      >
        <SlideStage slide={slide} theme={theme} stage={FRAME} />
      </div>
    </div>
  );
});

export default PageThumb;
