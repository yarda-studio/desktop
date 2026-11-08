import { useEffect, useMemo, useRef } from "react";
import type { PresentationTheme } from "../../lib/tauri";
import type { SlidePage } from "./api";
import { MAX_PAGES } from "./pages";
import PageThumb from "./PageThumb";

const THUMB_W = 116;

interface Props {
  pages: SlidePage[];
  title: string;
  index: number;
  theme: PresentationTheme | null;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}

/** The editor's page rail: thumbnails of every page, plus add / duplicate / reorder / delete for the selected one. */
export default function PageStrip({ pages, title, index, theme, onSelect, onAdd, onDuplicate, onRemove, onMove }: Props) {
  // Thumbnails don't play the theme's background video; one video per page would be heavy.
  const stillTheme = useMemo(() => (theme ? { ...theme, background_video: null } : null), [theme]);
  const selectedRef = useRef<HTMLLIElement>(null);
  useEffect(() => { selectedRef.current?.scrollIntoView({ block: "nearest" }); }, [index]);

  const atCap = pages.length >= MAX_PAGES;
  const tool = "flex h-8 items-center justify-center rounded ghost text-on-surface disabled:pointer-events-none disabled:opacity-30";

  return (
    <nav aria-label="Pages" className="flex w-[148px] shrink-0 flex-col border-r border-outline-variant">
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {pages.map((page, i) => {
          const selected = i === index;
          return (
            <li key={page.id} ref={selected ? selectedRef : undefined} className="flex items-start gap-1.5">
              <span className={`mt-0.5 w-4 shrink-0 text-right font-metadata-mono text-[11px] ${selected ? "font-bold text-primary" : "text-on-surface-variant"}`}>{i + 1}</span>
              <button
                onClick={() => onSelect(i)}
                aria-label={`Page ${i + 1} of ${pages.length}`}
                aria-current={selected}
                className={`rounded-md p-0.5 ring-2 ${selected ? "ring-primary" : "ring-transparent hover:ring-white/40"}`}
              >
                <PageThumb page={page} title={title} theme={stillTheme} width={THUMB_W} />
              </button>
            </li>
          );
        })}
      </ul>
      <div role="toolbar" aria-label="Page actions" className="grid shrink-0 grid-cols-5 gap-0.5 border-t border-outline-variant p-1.5">
        <button onClick={onAdd} disabled={atCap} title={atCap ? `A slide can have ${MAX_PAGES} pages` : "Add a page after this one"} aria-label="Add page" className={tool}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
        </button>
        <button onClick={() => onDuplicate(index)} disabled={atCap} title="Duplicate this page" aria-label="Duplicate page" className={tool}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">content_copy</span>
        </button>
        <button onClick={() => onMove(index, -1)} disabled={index <= 0} title="Move this page up" aria-label="Move page up" className={tool}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_upward</span>
        </button>
        <button onClick={() => onMove(index, 1)} disabled={index >= pages.length - 1} title="Move this page down" aria-label="Move page down" className={tool}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_downward</span>
        </button>
        <button onClick={() => onRemove(index)} disabled={pages.length <= 1} title="Delete this page" aria-label="Delete page" className={`${tool} text-error`}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>
        </button>
      </div>
    </nav>
  );
}
