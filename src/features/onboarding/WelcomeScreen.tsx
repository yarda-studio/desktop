import { useMemo, useRef, useState } from "react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { stepsFor, type TourDepth, type TourWorkspace } from "./steps";

interface Props {
  /** `depth` is null when the user chose to skip the tour. */
  onDone: (workspace: TourWorkspace, depth: TourDepth | null) => void;
}

const MODES: { id: TourWorkspace; icon: string; title: string; tagline: string; points: string[] }[] = [
  {
    id: "study", icon: "menu_book", title: "Personal study",
    tagline: "For reading and studying on your own.",
    points: ["Read and compare translations", "Strong's, commentary and cross-references", "Notes, bookmarks and search history"],
  },
  {
    id: "presentation", icon: "live_tv", title: "Presentation",
    tagline: "For putting scripture and songs on a screen.",
    points: ["Live Show console with a schedule", "Audience output on a second display", "Themes, songs and instant black screen"],
  },
];

const MINUTES: Record<TourDepth, string> = { essentials: "about 4 min", full: "about 10 min" };

export default function WelcomeScreen({ onDone }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Esc is deliberately ignored here: one stray keypress shouldn't dismiss the
  // only first-run screen. "Skip for now" is the explicit way out.
  useDialogA11y(ref, true, () => {});

  const [mode, setMode] = useState<TourWorkspace | null>(null);
  const [depth, setDepth] = useState<TourDepth>("essentials");
  const counts = useMemo(() => ({
    essentials: mode ? stepsFor(mode, "essentials").length : 0,
    full: mode ? stepsFor(mode, "full").length : 0,
  }), [mode]);

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-6 overflow-y-auto">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="w-full max-w-[760px] glass glass-strong rounded-3xl p-8 my-auto"
      >
        <div className="text-center mb-7">
          <p className="font-headline-md text-headline-md font-bold text-primary select-none">Yarda</p>
          <h1 id="welcome-title" className="font-headline-md text-headline-md text-on-surface mt-2">
            How will you use Yarda?
          </h1>
          <p className="font-body-ui text-body-ui text-on-surface-variant mt-1.5">
            Pick the one that fits best. You can switch any time in Settings.
          </p>
        </div>

        <div role="radiogroup" aria-label="Mode" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MODES.map((m) => {
            const selected = mode === m.id;
            return (
              <button
                key={m.id}
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(m.id)}
                className={`text-left rounded-2xl p-5 transition-colors border ${
                  selected ? "ctl-active border-primary" : "ctl border-outline-variant"
                }`}
              >
                <span className="material-symbols-outlined text-[28px] text-primary" aria-hidden="true">{m.icon}</span>
                <span className="block font-headline-sm text-headline-sm text-on-surface mt-2">{m.title}</span>
                <span className="block font-body-ui text-[13px] text-on-surface-variant mt-0.5">{m.tagline}</span>
                <ul className="mt-3 space-y-1.5">
                  {m.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 font-body-ui text-[13px] text-on-surface">
                      <span className="material-symbols-outlined text-[16px] text-primary mt-px" aria-hidden="true">check</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <div className={`mt-6 transition-opacity ${mode ? "opacity-100" : "opacity-40 pointer-events-none"}`} aria-hidden={!mode}>
          <p className="font-body-ui font-medium text-[13px] text-on-surface mb-2">Want a guided tour?</p>
          <div role="radiogroup" aria-label="Tour length" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(["essentials", "full"] as const).map((d) => (
              <button
                key={d}
                role="radio"
                aria-checked={depth === d}
                disabled={!mode}
                onClick={() => setDepth(d)}
                className={`text-left rounded-xl px-4 py-3 border transition-colors ${
                  depth === d ? "ctl-active border-primary" : "ctl border-outline-variant"
                }`}
              >
                <span className="block font-body-ui text-[14px] font-semibold text-on-surface">
                  {d === "essentials" ? "Essentials" : "Full tour"}
                </span>
                <span className="block font-body-ui text-[12px] text-on-surface-variant mt-0.5">
                  {d === "essentials" ? "Hands-on practice with the parts you'll use every day" : "Hands-on practice with every feature and shortcut"}
                  {mode && ` · ${counts[d]} steps, ${MINUTES[d]}`}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-7 flex items-center justify-between gap-3 flex-wrap">
          <button
            disabled={!mode}
            onClick={() => mode && onDone(mode, null)}
            className="px-3 py-2 rounded-lg font-body-ui text-[13px] font-medium text-on-surface-variant hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Skip the tour
          </button>
          <button
            disabled={!mode}
            onClick={() => mode && onDone(mode, depth)}
            className="px-6 py-2.5 btn-primary font-body-ui text-body-ui font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode ? "Start" : "Choose how you'll use it"}
          </button>
        </div>
      </div>
    </div>
  );
}
