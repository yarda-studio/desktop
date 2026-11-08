import { useFirstRunSetup, type SetupStep } from "./useFirstRunSetup";

interface Props {
  required: string[];
  installed: string[];
  onComplete: () => void;
  /** Lets someone offline reach the Modules screen instead of being stuck here. */
  onSkip: () => void;
}

function StepIcon({ status }: { status: SetupStep["status"] }) {
  if (status === "done") return <span className="material-symbols-outlined text-[18px] text-primary">check_circle</span>;
  if (status === "error") return <span className="material-symbols-outlined text-[18px] text-error">error</span>;
  if (status === "active") return <span className="material-symbols-outlined text-[18px] text-primary animate-spin">progress_activity</span>;
  return <span className="material-symbols-outlined text-[18px] text-on-surface-variant/60">radio_button_unchecked</span>;
}

export default function FirstRunSetup({ required, installed, onComplete, onSkip }: Props) {
  const { steps, phase, overall, message, retry } = useFirstRunSetup(required, installed, onComplete);
  const failed = phase === "failed";

  return (
    // No top bar here, so the empty background is what drags the window (see tauri.conf.json: no native title bar).
    <div data-tauri-drag-region className="fixed inset-0 z-[100] ambient flex items-center justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-[520px] my-auto" role="status" aria-live="polite">
        <div className="text-center mb-8">
          <p className="font-headline-md text-headline-md font-bold text-primary select-none">Yarda</p>
          <p className="font-body-ui text-body-ui text-on-surface-variant mt-3 leading-relaxed">
            Yarda is a free, open-source Bible study app, and it works offline once your library is in place.
            Study the text, follow words back to the Greek and Hebrew, and present it on screen at church.
          </p>
        </div>

        <div className="glass glass-strong rounded-2xl p-6">
          <h1 className="font-headline-sm text-headline-sm text-on-surface">
            {failed ? "We couldn't finish setting up" : "Setting up your library"}
          </h1>
          <p className="font-body-ui text-[13px] text-on-surface-variant mt-1">
            {failed
              ? "Check your internet connection, then try again."
              : "This only happens once. Yarda opens as soon as everything has downloaded."}
          </p>

          <div
            className="mt-5 h-2 rounded-full bg-on-surface/10 overflow-hidden"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={overall}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ease-out ${failed ? "bg-error" : "bg-primary"}`}
              style={{ width: `${overall}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 font-body-ui text-[12px] text-on-surface-variant">
            <span className="truncate pr-3">{failed ? "Stopped" : message}</span>
            <span className="tabular-nums">{overall}%</span>
          </div>

          <ul className="mt-5 space-y-2.5">
            {steps.map((s) => (
              <li key={s.id} className="flex items-center gap-3 font-body-ui text-[14px] text-on-surface">
                <StepIcon status={s.status} />
                <span className="flex-1">{s.label}</span>
                {s.status === "active" && (
                  <span className="text-[12px] text-on-surface-variant tabular-nums">{s.progress}%</span>
                )}
              </li>
            ))}
          </ul>

          {failed && (
            <div className="mt-6 flex items-center gap-3">
              <button onClick={retry} className="px-5 py-2 btn-primary font-body-ui text-[13px] font-medium rounded-lg">
                Try again
              </button>
              <button onClick={onSkip} className="px-3 py-2 font-body-ui text-[13px] text-on-surface-variant hover:text-on-surface">
                Set up later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
