import { useEffect, useRef, useState } from "react";
import { useWebOutput } from "../features/remote/webOutput";
import type { usePresentationOutput } from "../hooks/usePresentationOutput";
import type { useStageWindow } from "../features/stage/useStageWindow";

interface Props {
  output: ReturnType<typeof usePresentationOutput>;
  stage: ReturnType<typeof useStageWindow>;
  onClose: () => void;
}

/** Dropdown opened from the top bar's Outputs button — pick which monitor the
 * presentation window goes to, or close it. Single-monitor setups skip the
 * picker and just show status, since there's nothing to choose. */
export default function OutputsPanel({ output, stage, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { presentationActive, monitors, lastMonitorIndex, open, close } = output;
  const web = useWebOutput();

  useEffect(() => { void useWebOutput.getState().refresh(); }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 glass rounded-xl min-w-[240px] overflow-hidden"
    >
      <div className="px-3 py-1.5 bg-surface-container-low border-b border-outline-variant">
        <span className="font-body-ui font-medium text-[12px] text-on-surface-variant ">Present on…</span>
      </div>
      {monitors.length === 0 ? (
        <div className="px-3 py-2.5 font-body-ui text-[13px] text-on-surface-variant">No displays detected</div>
      ) : (
        monitors.map((m) => {
          const active = presentationActive && (lastMonitorIndex ?? monitors.find((mm) => mm.is_primary)?.index) === m.index;
          return (
            <button
              key={m.index}
              onClick={() => { open(m.index); onClose(); }}
              className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 font-body-ui text-body-ui text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span className="flex items-center gap-1.5">
                {active && <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0" />}
                {m.name ?? `Display ${m.index + 1}`}
              </span>
              <span className="font-metadata-mono text-[12px] text-on-surface-variant shrink-0">
                {m.is_primary ? "Primary · " : ""}{m.width}×{m.height}
              </span>
            </button>
          );
        })
      )}
      <div className="px-3 py-1.5 bg-surface-container-low border-y border-outline-variant">
        <span className="font-body-ui font-medium text-[12px] text-on-surface-variant">Stage display (for the worship team) on…</span>
      </div>
      {monitors.length === 0 ? (
        <div className="px-3 py-2.5 font-body-ui text-[13px] text-on-surface-variant">No displays detected</div>
      ) : (
        monitors.map((m) => (
          <button
            key={m.index}
            onClick={() => { void stage.open(m.index); onClose(); }}
            className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 font-body-ui text-body-ui text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <span>{m.name ?? `Display ${m.index + 1}`}</span>
            <span className="font-metadata-mono text-[12px] text-on-surface-variant shrink-0">{m.is_primary ? "Primary" : `${m.width}×${m.height}`}</span>
          </button>
        ))
      )}
      {stage.active && (
        <button
          onClick={() => { void stage.close(); onClose(); }}
          className="w-full text-left px-3 py-2 font-body-ui text-[13px] text-error hover:bg-error-container/20 transition-colors border-t border-outline-variant"
        >
          Close stage display
        </button>
      )}
      {presentationActive && (
        <button
          onClick={() => { close(); onClose(); }}
          className="w-full text-left px-3 py-2 font-body-ui text-[13px] text-error hover:bg-error-container/20 transition-colors border-t border-outline-variant"
        >
          Stop output
        </button>
      )}
      <div className="px-3 py-1.5 bg-surface-container-low border-y border-outline-variant">
        <span className="font-body-ui font-medium text-[12px] text-on-surface-variant">Video mixer (OBS, vMix…)</span>
      </div>
      <div className="px-3 py-2.5 space-y-2.5">
        <label className="flex items-start gap-2 font-body-ui text-[13px] text-on-surface">
          <input type="checkbox" checked={web.status.enabled} disabled={web.busy} onChange={(e) => void web.setEnabled(e.target.checked)} className="accent-primary mt-0.5" />
          <span>
            Serve the output as a web page
            <span className="block text-[12px] text-on-surface-variant">Add it as a Browser Source. Off until you turn it on.</span>
          </span>
        </label>
        {web.status.enabled && (
          <div className="space-y-2">
            <LinkRow label="Output" url={web.status.output_url} />
            <LinkRow label="Output, transparent" url={web.status.alpha_url} hint="Only the text, for keying over video." />
            <LinkRow label="Stage display" url={web.status.stage_url} />
            <p className="font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
              Anyone with a link can see your output, and the connection isn't encrypted, so use a network you trust. In OBS set the source to 1920×1080.
            </p>
            <button onClick={() => void web.resetAccess()} disabled={web.busy} className="w-full h-8 rounded-md ctl font-body-ui text-[12px] text-on-surface disabled:opacity-40">
              Reset links
            </button>
          </div>
        )}
        {web.error && <p className="font-body-ui text-[12px] text-error" role="alert">{web.error}</p>}
      </div>
    </div>
  );
}

/** A link that selects itself on focus, with a Copy button. */
function LinkRow({ label, url, hint }: { label: string; url: string | null; hint?: string }) {
  const [copied, setCopied] = useState(false);
  if (!url) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the field is still selectable */
    }
  }
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="flex gap-1.5">
        <input readOnly value={url} aria-label={`${label} link`} onFocus={(e) => e.currentTarget.select()} className="field-input font-metadata-mono !text-[11px] min-w-0 flex-1" />
        <button onClick={() => void copy()} className="shrink-0 px-2.5 rounded-md ctl font-body-ui text-[12px] text-on-surface">{copied ? "Copied" : "Copy"}</button>
      </div>
      {hint && <p className="mt-0.5 font-body-ui text-[12px] text-on-surface-variant">{hint}</p>}
    </div>
  );
}
