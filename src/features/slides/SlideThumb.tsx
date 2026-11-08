import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/app";
import { slidesApi, type SlideDoc } from "./api";
import { createDocCache } from "./docCache";
import PageThumb from "./PageThumb";

// Shared by every thumbnail, so the library and the schedule reuse each other's loads.
const docs = createDocCache<SlideDoc>((id) => slidesApi.get(id));

/** Height is 9/16 of the width, the shape of the slide. */
export function thumbHeight(width: number): number {
  return (width * 9) / 16;
}

/**
 * The first page of a slide, drawn by the real slide renderer. It loads only
 * once it has scrolled into view, and again whenever the slide is saved
 * (`updatedAt` changes). If the slide can't be read it stays a plain dark box,
 * so a bad slide never breaks the list around it.
 */
export default function SlideThumb({ id, updatedAt, width }: { id: number; updatedAt: number; width: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [doc, setDoc] = useState<SlideDoc | null>(null);
  const theme = useAppStore((s) => s.activePresentationTheme);
  const stillTheme = useMemo(() => (theme ? { ...theme, background_video: null } : null), [theme]);

  useEffect(() => {
    const el = holder.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); observer.disconnect(); }
    }, { rootMargin: "120px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen) return;
    let cancelled = false;
    docs.get(id, updatedAt).then((d) => { if (!cancelled) setDoc(d); }).catch(() => { if (!cancelled) setDoc(null); });
    return () => { cancelled = true; };
  }, [seen, id, updatedAt]);

  return (
    <div ref={holder} className="shrink-0" style={{ width, height: thumbHeight(width) }} aria-hidden>
      {doc ? <PageThumb page={doc.pages[0]} title={doc.title} theme={stillTheme} width={width} /> : <div className="h-full w-full rounded-sm bg-black" />}
    </div>
  );
}
