import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/app";
import { KeyCombo } from "./keys";
import { useTourTasks } from "./useTourTasks";
import type { TourStep } from "./steps";

interface Props {
  step: TourStep;
  index: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}

interface Box { left: number; top: number; width: number; height: number }

const PAD = 6;       // breathing room around the spotlight
const MARGIN = 16;   // minimum distance from the window edge
const GAP = 14;      // distance between spotlight and card
const GIVE_UP_MS = 1500; // how long to wait for a target before showing the card centred

function sameBox(a: Box | null, b: Box | null) {
  if (!a || !b) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

function measure(target: string): Box | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
}

type Side = NonNullable<TourStep["placement"]>;

/** Puts the card beside the spotlight on the preferred side if it fits, else whichever side has room. */
function place(box: Box | null, cw: number, ch: number, prefer?: Side): { left: number; top: number } {
  const vw = window.innerWidth, vh = window.innerHeight;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  if (!box) return { left: (vw - cw) / 2, top: Math.max(MARGIN, (vh - ch) / 2) };

  const cx = clamp(box.left + box.width / 2 - cw / 2, MARGIN, vw - cw - MARGIN);
  const cy = clamp(box.top + box.height / 2 - ch / 2, MARGIN, vh - ch - MARGIN);
  const spots: Record<Side, { fits: boolean; at: { left: number; top: number } }> = {
    bottom: { fits: box.top + box.height + GAP + ch <= vh - MARGIN, at: { left: cx, top: box.top + box.height + GAP } },
    top: { fits: box.top - GAP - ch >= MARGIN, at: { left: cx, top: box.top - GAP - ch } },
    right: { fits: box.left + box.width + GAP + cw <= vw - MARGIN, at: { left: box.left + box.width + GAP, top: cy } },
    left: { fits: box.left - GAP - cw >= MARGIN, at: { left: box.left - GAP - cw, top: cy } },
  };
  const order: Side[] = [...(prefer ? [prefer] : []), "bottom", "top", "right", "left"];
  const hit = order.find((s) => spots[s].fits);
  if (hit) return spots[hit].at;
  // Target fills most of the window — sit over its lower part rather than off-screen.
  return { left: (vw - cw) / 2, top: vh - ch - 24 };
}

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);

export default function TourCoach({ step, index, total, onNext, onBack, onClose }: Props) {
  const [box, setBox] = useState<Box | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [size, setSize] = useState({ w: 400, h: 260 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const last = index === total - 1;
  const tasks = step.tasks ?? [];
  const progress = useTourTasks(step);
  const hasTasks = tasks.length > 0;

  // Bring the screen the step is about into view. The tour owns navigation while
  // it runs; Settings and focus mode would hide the anchors, so close them.
  // onLeave undoes whatever the step's tasks opened (sheets, panels).
  useEffect(() => {
    const s = useAppStore.getState();
    if (s.settingsOpen) s.setSettingsOpen(false);
    if (s.isFullscreen) s.setIsFullscreen(false);
    if (step.view) s.setView(step.view);
    step.onEnter?.();
    return () => step.onLeave?.();
  }, [step]);

  // If the first task is typing, land the cursor in that input so the user can just start.
  const firstTyping = (() => {
    const first = tasks[0]?.done;
    const d = Array.isArray(first) ? first[0] : first;
    return d?.kind === "type" ? d.selector : null;
  })();

  // Views mount a tick after setView, and layouts shift (resizable panes, window
  // resize), so track the anchor by polling instead of measuring once.
  useEffect(() => {
    setBox(null);
    setGaveUp(false);
    const target = step.target;
    let focused = false;
    const started = Date.now();
    let scrolled = false;
    let ticks = 0;
    const tick = () => {
      ticks++;
      // Wait one beat before focusing: a step's setup can swap the very input we'd focus.
      if (firstTyping && !focused && ticks > 1) {
        const el = document.querySelector<HTMLElement>(firstTyping);
        const input = el && (el.matches("input,textarea") ? el : el.querySelector<HTMLElement>("input,textarea"));
        if (input) { focused = true; input.focus({ preventScroll: true }); }
      }
      if (!target) return;
      const next = measure(target);
      if (next && !scrolled) {
        scrolled = true;
        document.querySelector(`[data-tour="${target}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      setBox((prev) => (sameBox(prev, next) ? prev : next));
      if (!next && Date.now() - started > GIVE_UP_MS) setGaveUp(true);
    };
    tick();
    const id = window.setInterval(tick, 150);
    return () => window.clearInterval(id);
  }, [step, firstTyping]);

  // Esc leaves the tour — unless Esc belongs to something else right now: a text
  // field (clears it), focus mode, or an open sheet/menu (closes it).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e as KeyboardEvent & { fromTour?: boolean }).fromTour) return;
      if (isTyping(document.activeElement) || useAppStore.getState().isFullscreen) return;
      const foreign = Array.from(document.querySelectorAll('[role="dialog"]')).some((d) => d !== cardRef.current);
      if (foreign) return;
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep keyboard users on the card as it moves from step to step (unless the step wants the input).
  useEffect(() => { if (!firstTyping) nextRef.current?.focus({ preventScroll: true }); }, [step, firstTyping]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
  });

  const spot = step.target && box && !gaveUp ? box : null;
  const pos = place(spot, size.w, size.h, step.placement);
  const move = useCallback(() => (last ? onClose() : onNext()), [last, onClose, onNext]);
  const pending = hasTasks && !progress.complete;

  return (
    <>
      {spot ? (
        <div
          aria-hidden="true"
          className="fixed z-[85] rounded-2xl pointer-events-none transition-[left,top,width,height] duration-200 ease-out motion-reduce:transition-none"
          style={{
            left: spot.left - PAD, top: spot.top - PAD,
            width: spot.width + PAD * 2, height: spot.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.9)",
          }}
        />
      ) : (
        // No target: dim the page but let clicks through, so tasks stay doable.
        <div aria-hidden="true" className="fixed inset-0 z-[85] bg-black/55 pointer-events-none" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        className="fixed z-[210] w-[400px] max-w-[calc(100vw-32px)] glass glass-strong rounded-2xl p-5 transition-[left,top] duration-200 ease-out motion-reduce:transition-none"
        style={{ left: pos.left, top: pos.top }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-body-ui tabular-nums text-[12px] text-on-surface-variant">
            Step {index + 1} of {total}
          </span>
          <button onClick={onClose} className="font-body-ui text-[12px] font-medium text-on-surface-variant hover:text-on-surface">
            {last ? "Close" : "Skip tour"}
          </button>
        </div>
        <div className="h-1 rounded-full bg-outline-variant mb-4 overflow-hidden" aria-hidden="true">
          <div className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>

        <h2 id="tour-title" className="font-headline-sm text-headline-sm text-on-surface">{step.title}</h2>
        <p className="font-body-ui text-[13px] leading-relaxed text-on-surface-variant mt-1.5">{step.body}</p>

        {step.shortcuts && (
          <ul className="mt-3 space-y-1.5">
            {step.shortcuts.map((s) => (
              <li key={s.label + s.keys.join()} className="flex items-center justify-between gap-3">
                <span className="font-body-ui text-[13px] text-on-surface">{s.label}</span>
                <KeyCombo keys={s.keys} />
              </li>
            ))}
          </ul>
        )}

        {hasTasks && (
          <div className="mt-4 rounded-xl field px-3 py-2.5" aria-live="polite">
            <p className="font-body-ui font-medium text-[12px] text-on-surface-variant mb-1.5">Your turn</p>
            <ol className="space-y-1.5">
              {tasks.map((task, i) => {
                const done = i < progress.index;
                const current = i === progress.index;
                return (
                  <li key={task.prompt} className={`flex items-start gap-2 font-body-ui text-[13px] ${done ? "text-on-surface-variant" : current ? "text-on-surface font-medium" : "text-on-surface-variant"}`}>
                    <span
                      className={`material-symbols-outlined text-[18px] shrink-0 ${done ? "text-primary" : current ? "text-primary" : "text-outline"}`}
                      aria-hidden="true"
                    >
                      {done ? "check_circle" : current ? "arrow_circle_right" : "radio_button_unchecked"}
                    </span>
                    <span className={done ? "line-through decoration-outline" : ""}>{task.prompt}</span>
                    <span className="sr-only">{done ? "(done)" : current ? "(current)" : ""}</span>
                  </li>
                );
              })}
            </ol>
            {progress.complete && (
              <p className="mt-2 font-body-ui font-medium text-[13px] text-primary">Nice — that's it. Press Next when you're ready.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-5">
          <button
            onClick={onBack}
            disabled={index === 0}
            className="px-3 py-1.5 rounded-lg ctl font-body-ui text-[13px] font-medium text-on-surface disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <button
            ref={nextRef}
            onClick={move}
            className={`px-5 py-1.5 rounded-lg font-body-ui text-[13px] font-medium ${pending ? "ctl text-on-surface" : "btn-primary"}`}
          >
            {last ? "Finish" : pending ? "Skip step" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}
