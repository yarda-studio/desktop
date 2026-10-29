import { useEffect, useRef, useState } from "react";
import type { SlideKind, SlideSummary } from "./api";
import { useSlidesLive } from "./liveStore";
import { useSlidesStore } from "./slidesStore";

const KINDS: Record<SlideKind, { label: string; icon: string }> = {
  announcement: { label: "Announcement", icon: "campaign" },
  freeform: { label: "Free-form", icon: "dashboard_customize" },
};
const GRID = "grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]";

export default function SlideLibrary() {
  const { slides, query, setQuery, loading, libraryError, selectedId, select, openEditor, newSlide, refresh, remove } = useSlidesStore();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setConfirmDelete(false); }, [selectedId]);

  const selected = slides.find((s) => s.id === selectedId) ?? null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (slides.length === 0) return;
    const i = slides.findIndex((r) => r.id === selectedId);
    if (e.key === "ArrowDown") { e.preventDefault(); select(slides[Math.min(slides.length - 1, i + 1)].id); }
    else if (e.key === "ArrowUp") { e.preventDefault(); select(slides[Math.max(0, i - 1)].id); }
    else if (e.key === "Enter" && selectedId !== null) { e.preventDefault(); void useSlidesLive.getState().addToSchedule(selectedId); }
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
        <label className="field flex flex-1 items-center gap-2 rounded-md px-2.5 h-9">
          <span className="material-symbols-outlined text-[18px] text-secondary" aria-hidden="true">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search slide titles"
            aria-label="Search slide titles"
            className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-body-ui text-on-surface"
          />
        </label>
        <button onClick={() => newSlide("announcement")} className="flex items-center gap-1.5 h-9 px-3 rounded-md ctl font-body-ui text-[13px] text-on-surface shrink-0">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">campaign</span>New announcement
        </button>
        <button onClick={() => newSlide("freeform")} className="flex items-center gap-1.5 h-9 px-3 rounded-md ctl font-body-ui text-[13px] text-on-surface shrink-0">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">dashboard_customize</span>New free-form
        </button>
      </div>

      <div role="row" className={`${GRID} border-y border-outline-variant bg-surface-container-low/60 shrink-0`}>
        {["Title", "Type", "Modified"].map((h) => (
          <span key={h} className="px-3 py-2 font-body-ui text-[13px] text-on-surface border-r border-outline-variant last:border-r-0">{h}</span>
        ))}
      </div>

      <div role="grid" tabIndex={0} onKeyDown={onKeyDown} aria-label="Slides" className="flex-1 min-h-0 overflow-y-auto outline-none">
        {libraryError && <p className="m-4 text-[12px] text-error font-body-ui">{libraryError}</p>}
        {!libraryError && slides.length === 0 && !loading && (
          <p className="m-4 text-[12px] text-on-surface-variant font-body-ui leading-relaxed">
            {query ? "No slides match." : "No slides yet. Create an announcement or a free-form slide above."}
          </p>
        )}
        {slides.map((s) => (
          <Row key={s.id} slide={s} selected={s.id === selectedId} onSelect={() => select(s.id)} onOpen={() => void useSlidesLive.getState().addToSchedule(s.id)} />
        ))}
      </div>

      <div className="h-11 shrink-0 flex items-center gap-1 px-3 border-t border-outline-variant bg-surface-container-lowest/40">
        <button onClick={() => selected && void openEditor(selected.id)} disabled={!selected} className="flex items-center gap-1 px-2 py-1 rounded-md ghost font-body-ui text-[13px] text-on-surface disabled:opacity-30 disabled:pointer-events-none">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>Edit
        </button>
        <button onClick={() => selected && void useSlidesLive.getState().addToSchedule(selected.id)} disabled={!selected} className="flex items-center gap-1 px-2 py-1 rounded-md ghost font-body-ui text-[13px] text-on-surface disabled:opacity-30 disabled:pointer-events-none">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">playlist_add</span>Add to schedule
        </button>
        {confirmDelete ? (
          <>
            <button onClick={() => { if (selected) void remove(selected.id); setConfirmDelete(false); }} className="px-2 py-1 rounded-md font-body-ui text-[13px] bg-error text-on-error">Delete slide</button>
            <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded-md ghost font-body-ui text-[13px] text-on-surface">Keep</button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} disabled={!selected} className="flex items-center gap-1 px-2 py-1 rounded-md ghost font-body-ui text-[13px] text-on-surface disabled:opacity-30 disabled:pointer-events-none">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>Delete
          </button>
        )}
        <span className="flex-1 text-center font-body-ui text-[13px] text-on-surface-variant">
          {slides.length} {slides.length === 1 ? "slide" : "slides"}
        </span>
      </div>
    </div>
  );
}

function Row({ slide, selected, onSelect, onOpen }: { slide: SlideSummary; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (selected) ref.current?.scrollIntoView({ block: "nearest" }); }, [selected]);
  const kind = KINDS[slide.kind];
  return (
    <div
      ref={ref}
      role="row"
      aria-selected={selected}
      onClick={onSelect}
      onDoubleClick={onOpen}
      title="Double-click to add to the schedule"
      className={`${GRID} cursor-default select-none ${selected ? "row-selected" : "hover:bg-surface-container-low"}`}
    >
      <span className="px-3 py-2 font-body-ui text-[13px] text-on-surface truncate">{slide.title}</span>
      <span className="px-3 py-2 font-body-ui text-[13px] text-on-surface-variant truncate flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{kind.icon}</span>{kind.label}
      </span>
      <span className="px-3 py-2 font-body-ui text-[13px] text-on-surface-variant truncate">{new Date(slide.updated_at).toLocaleDateString()}</span>
    </div>
  );
}
