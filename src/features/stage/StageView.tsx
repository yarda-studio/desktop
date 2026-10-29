import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNow } from "../../lib/clock";
import { listenPresentation, type PresentState } from "../../lib/presentation";
import { api, type ChapterText, type VerseText } from "../../lib/tauri";
import { formatRemaining, remainingMs, type CountdownPayload } from "../countdown/model";
import { listenCountdown } from "../countdown/relay";

interface Block { label: string; text: string }

function verseText(v: VerseText | undefined): string {
  return v ? v.spans.filter((s) => !s.is_footnote && !s.is_title).map((s) => s.text).join("").replace(/\s+/g, " ").trim() : "";
}

/** What the worship team should read right now, and what comes after it. */
function describe(state: PresentState | null, chapter: ChapterText | null): { current: Block | null; next: Block | null } {
  if (!state) return { current: null, next: null };
  if (state.slideDoc) {
    const text = state.slideDoc.elements.filter((e) => e.kind === "text").map((e) => e.text.trim()).filter(Boolean).join("\n");
    return { current: { label: state.slideDoc.title, text }, next: state.next ?? null };
  }
  if (state.slide) {
    return { current: state.slide.text ? { label: state.slide.label, text: state.slide.text } : null, next: state.next ?? null };
  }
  const verses = chapter?.verses ?? [];
  const at = verses.findIndex((v) => v.verse === state.verse);
  if (at < 0) return { current: null, next: null };
  const ref = (v: VerseText) => `${v.book} ${v.chapter}:${v.verse}`;
  const following = verses[at + 1];
  return {
    current: { label: ref(verses[at]), text: verseText(verses[at]) },
    next: following ? { label: ref(following), text: verseText(following) } : null,
  };
}

/** Largest font size (px, up to `max`) at which `text` still fits a w × h box. */
function fitFont(text: string, w: number, h: number, max: number): number {
  if (!text || w <= 0 || h <= 0) return max;
  const lines = text.split("\n");
  // Bold text averages about 0.6em per character, and word wrapping wastes some of
  // each line, so estimate generously: it is better to be a little small than clipped.
  for (let size = max; size > 12; size *= 0.94) {
    const perLine = Math.max(1, Math.floor(w / (size * 0.6)));
    const count = lines.reduce((n, l) => n + Math.max(1, Math.ceil((l.length * 1.1) / perLine)), 0);
    if (count * size * 1.25 <= h * 0.95) return size;
  }
  return 12;
}

function useBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...box };
}

function TextPanel({ title, block, max, emptyText, accent }: { title: string; block: Block | null; max: number; emptyText: string; accent?: boolean }) {
  const { ref, w, h } = useBox();
  const text = block?.text ?? "";
  const size = fitFont(text, w, h, max);
  return (
    <section className={`min-h-0 flex flex-col rounded-2xl p-5 ${accent ? "bg-white/10" : "bg-white/5"}`} aria-label={title}>
      <div className="flex items-baseline justify-between gap-4 shrink-0">
        <h2 className="text-[clamp(12px,1.6vh,18px)] font-semibold tracking-wide uppercase text-white/55">{title}</h2>
        {block?.label && <p className="truncate text-[clamp(12px,1.8vh,20px)] text-white/55">{block.label}</p>}
      </div>
      <div ref={ref} className="flex-1 min-h-0 overflow-hidden flex items-center">
        {text
          ? <p className="m-0 w-full whitespace-pre-wrap font-semibold text-white" style={{ fontSize: size, lineHeight: 1.25 }}>{text}</p>
          : <p className="m-0 w-full text-center text-white/30 text-[clamp(14px,2.4vh,26px)]">{emptyText}</p>}
      </div>
    </section>
  );
}

/**
 * The worship team's confidence screen: what is on the output now, what comes
 * next, the time of day and any running countdown. It receives the same relayed
 * state as the output window and only reads it — nothing here changes the show.
 */
export default function StageView() {
  const [state, setState] = useState<PresentState | null>(null);
  const [chapter, setChapter] = useState<ChapterText | null>(null);
  const [countdown, setCountdown] = useState<CountdownPayload | null>(null);
  const now = useNow(true);

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => listenPresentation(setState), []);
  useEffect(() => listenCountdown(setCountdown), []);

  useEffect(() => {
    if (!state || state.slide || state.slideDoc) return;
    api.getChapter(state.primaryModule, state.book, state.chapter).then(setChapter).catch(() => setChapter(null));
  }, [state?.primaryModule, state?.book, state?.chapter, state?.slide, state?.slideDoc]); // eslint-disable-line react-hooks/exhaustive-deps

  const { current, next } = describe(state, chapter);
  const timerActive = !!countdown && countdown.status !== "idle";
  const left = countdown ? remainingMs(countdown, now) : 0;
  const urgent = timerActive && countdown!.status === "running" && left <= 60_000;

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col gap-[1.5vh] p-[1.5vh] select-none overflow-hidden">
      <header className="shrink-0 flex items-center gap-6">
        <p className="m-0 font-semibold tabular-nums text-[clamp(28px,7vh,80px)] leading-none" aria-label="Time of day">
          {new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </p>
        <div className="flex-1 flex items-center gap-3 min-w-0">
          {state?.emergency && <span className="rounded-full bg-red-500/20 text-red-300 px-3 py-1 text-[clamp(12px,1.8vh,20px)]">Standby screen is showing</span>}
          {!state?.emergency && state?.black && <span className="rounded-full bg-white/15 text-white/80 px-3 py-1 text-[clamp(12px,1.8vh,20px)]">Output is black</span>}
        </div>
        {timerActive && (
          <div className="text-right">
            {countdown!.title && <p className="m-0 text-[clamp(12px,1.8vh,20px)] text-white/55 truncate">{countdown!.title}</p>}
            <p
              className={`m-0 font-semibold tabular-nums leading-none text-[clamp(28px,7vh,80px)] ${urgent ? "text-red-400" : countdown!.status === "paused" ? "text-white/50" : "text-white"}`}
              aria-label="Countdown"
            >
              {formatRemaining(left)}
            </p>
          </div>
        )}
      </header>

      <main className="flex-1 min-h-0 grid grid-rows-[3fr_1fr] gap-[1.5vh]">
        <TextPanel title="Now" block={current} max={200} emptyText="Nothing on the output" accent />
        <TextPanel title="Next" block={next} max={72} emptyText="Nothing after this" />
      </main>
    </div>
  );
}
