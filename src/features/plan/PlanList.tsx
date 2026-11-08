import { useState } from "react";
import type { PlanItem, PlanKind } from "./api";
import { formatDuration, itemDetail, makeItem, parseDuration } from "./planLogic";
import { usePlan } from "./planStore";

const KIND_ICON: Record<PlanKind, string> = {
  verse: "menu_book",
  song: "music_note",
  slide: "slideshow",
  countdown: "timer",
  black: "visibility_off",
  note: "sticky_note_2",
};

/** The editable running order, plus the cues that are not a song, slide or verse. */
export default function PlanList() {
  const items = usePlan((s) => s.items);
  const activeIndex = usePlan((s) => s.activeIndex);
  const { activate, move, remove, update, add, clear, resetClock } = usePlan.getState();
  const [confirmClear, setConfirmClear] = useState(false);
  const [countdownText, setCountdownText] = useState<string | null>(null);

  function addCountdown() {
    const secs = parseDuration(countdownText ?? "");
    if (!secs) return; // empty or unreadable: leave the field for the operator to fix
    add(makeItem("countdown", { title: `Countdown ${formatDuration(secs)}`, duration_secs: secs }));
    setCountdownText(null);
  }

  return (
    <div className="flex flex-col">
      {items.length === 0 ? (
        <p className="px-4 py-5 text-center font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
          The plan is empty. Use “Add to plan” on a song, a slide or a verse, or add a cue below.
        </p>
      ) : (
        <ol className="p-1.5 space-y-1">
          {items.map((item, i) => (
            <Row
              key={item.id}
              item={item}
              index={i}
              active={i === activeIndex}
              first={i === 0}
              last={i === items.length - 1}
              onActivate={() => void activate(i)}
              onMove={(dir) => move(item.id, dir)}
              onRemove={() => remove(item.id)}
              onChange={(patch) => update(item.id, patch)}
            />
          ))}
        </ol>
      )}

      <div className="shrink-0 flex flex-wrap items-center gap-1.5 border-t border-outline-variant px-3 py-2">
        <button onClick={() => add(makeItem("note", { title: "Note" }))} className="ctl flex items-center gap-1 rounded-md px-2 py-1 font-body-ui text-[12px] text-on-surface">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">sticky_note_2</span>Add note
        </button>
        <button onClick={() => add(makeItem("black"))} className="ctl flex items-center gap-1 rounded-md px-2 py-1 font-body-ui text-[12px] text-on-surface">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">visibility_off</span>Add black screen
        </button>
        {countdownText === null ? (
          <button onClick={() => setCountdownText("5")} className="ctl flex items-center gap-1 rounded-md px-2 py-1 font-body-ui text-[12px] text-on-surface">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">timer</span>Add countdown
          </button>
        ) : (
          <span className="flex items-center gap-1">
            <input
              autoFocus
              value={countdownText}
              onChange={(e) => setCountdownText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCountdown(); if (e.key === "Escape") setCountdownText(null); }}
              aria-label="Countdown length in minutes, or m:ss"
              placeholder="min"
              className="field w-16 rounded-md px-2 py-1 font-metadata-mono text-[12px] text-on-surface outline-none"
            />
            <button onClick={addCountdown} className="btn-primary rounded-md px-2 py-1 font-body-ui text-[12px]">Add</button>
            <button onClick={() => setCountdownText(null)} className="ctl rounded-md px-2 py-1 font-body-ui text-[12px] text-on-surface">Cancel</button>
          </span>
        )}
        <span className="flex-1" />
        <button onClick={resetClock} className="ghost rounded-md px-2 py-1 font-body-ui text-[12px] text-on-surface-variant" title="Stop the clock and forget the current step. The screen is left as it is.">
          Reset clock
        </button>
        {confirmClear ? (
          <>
            <button onClick={() => { clear(); setConfirmClear(false); }} className="rounded-md bg-error px-2 py-1 font-body-ui text-[12px] text-on-error">Clear plan</button>
            <button onClick={() => setConfirmClear(false)} className="ctl rounded-md px-2 py-1 font-body-ui text-[12px] text-on-surface">Keep</button>
          </>
        ) : (
          <button onClick={() => setConfirmClear(true)} disabled={items.length === 0} className="ghost rounded-md px-2 py-1 font-body-ui text-[12px] text-on-surface-variant hover:text-error disabled:opacity-30 disabled:pointer-events-none">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ item, index, active, first, last, onActivate, onMove, onRemove, onChange }: {
  item: PlanItem;
  index: number;
  active: boolean;
  first: boolean;
  last: boolean;
  onActivate: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onChange: (patch: Partial<PlanItem>) => void;
}) {
  const [lengthText, setLengthText] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const detail = itemDetail(item);

  function commitLength() {
    if (lengthText === null) return;
    const parsed = parseDuration(lengthText);
    if (parsed !== undefined) onChange({ duration_secs: parsed });
    setLengthText(null); // unreadable text is dropped and the old length shown again
  }

  return (
    <li className={`group relative rounded-lg border ${active ? "row-selected border-primary/40" : "border-outline-variant/50"}`}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className={`w-5 shrink-0 text-right font-metadata-mono text-[12px] ${active ? "font-bold text-primary" : "text-on-surface-variant"}`}>{index + 1}</span>
        <button
          onClick={onActivate}
          title="Put this step on the screen"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-current={active}
        >
          <span className="material-symbols-outlined shrink-0 text-[16px] text-on-surface-variant" aria-hidden="true">{KIND_ICON[item.kind]}</span>
          <span className="min-w-0">
            <span className={`block truncate font-body-ui text-[13px] font-semibold ${active ? "text-primary" : "text-on-surface"}`}>{item.title}</span>
            {detail && <span className="block truncate font-body-ui text-[11px] text-on-surface-variant">{detail}</span>}
          </span>
        </button>
        {active && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-error" title="On screen" />}
        <input
          value={lengthText ?? (item.duration_secs ? formatDuration(item.duration_secs) : "")}
          onChange={(e) => setLengthText(e.target.value)}
          onBlur={commitLength}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setLengthText(null); }}
          aria-label={`Planned length of ${item.title}`}
          placeholder="length"
          className="field w-14 shrink-0 rounded-md px-1.5 py-0.5 text-center font-metadata-mono text-[12px] text-on-surface outline-none"
        />
        {/* The step's tools float over the row on hover instead of holding space in it, so a narrow column keeps its titles. */}
        <span className="absolute right-[4.25rem] top-1/2 flex -translate-y-1/2 rounded-md bg-surface-container shadow-sm opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Icon icon="edit_note" title={noteOpen ? "Hide note" : "Note for the operator"} onClick={() => setNoteOpen((o) => !o)} />
          <Icon icon="arrow_upward" title="Move up" disabled={first} onClick={() => onMove(-1)} />
          <Icon icon="arrow_downward" title="Move down" disabled={last} onClick={() => onMove(1)} />
          <Icon icon="close" title="Remove from plan" onClick={onRemove} />
        </span>
      </div>
      {(noteOpen || item.note) && (
        <input
          value={item.note}
          onChange={(e) => onChange({ note: e.target.value })}
          aria-label={`Note for ${item.title}`}
          placeholder="Private note for the operator"
          className="mx-2 mb-1.5 w-[calc(100%-1rem)] rounded-md bg-transparent px-2 py-1 font-body-ui text-[12px] italic text-on-surface-variant outline-none focus:bg-surface-container-low"
        />
      )}
    </li>
  );
}

function Icon({ icon, title, onClick, disabled }: { icon: string; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} className="ghost rounded p-0.5 text-secondary disabled:pointer-events-none disabled:opacity-30">
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
    </button>
  );
}
