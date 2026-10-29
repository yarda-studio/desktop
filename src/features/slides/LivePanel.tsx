import OutputPreview from "../../components/OutputPreview";
import { useAppStore } from "../../store/app";
import { useSlidesLive } from "./liveStore";
import { useSlidePresentState } from "./useSlideOutput";

export default function LivePanel({ width, stage }: { width: number; stage: { w: number; h: number } }) {
  const { live, schedule, stepLive, clearLive } = useSlidesLive();
  const presentationActive = useAppStore((s) => s.presentationActive);
  const liveBlack = useAppStore((s) => s.liveBlack);
  const liveEmergency = useAppStore((s) => s.liveEmergency);
  const outputState = useSlidePresentState(live);
  const at = live?.id != null ? schedule.findIndex((s) => s.id === live.id) : -1;

  return (
    <section style={{ width }} className="shrink-0 flex flex-col overflow-hidden panel rounded-3xl">
      <div className="shrink-0 flex items-center gap-3 px-3.5 py-2.5 border-b border-outline-variant">
        <h2 className="font-body-ui text-[13px] font-bold text-on-surface">Live</h2>
        {presentationActive && (
          <span className="flex items-center gap-1 font-body-ui font-medium text-[12px] text-error">
            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
            On air
          </span>
        )}
        <span className="flex-1" />
        {live && (
          <button onClick={clearLive} className="ghost px-1.5 py-0.5 min-h-6 rounded font-body-ui font-medium text-[12px] text-on-surface-variant" title="Clear this panel (use BLACK in the top bar to blank the screen)">
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 p-3 flex flex-col gap-2">
        {(liveBlack || liveEmergency) && (
          <div className="px-3 py-2 text-center ctl rounded-lg">
            <p className="font-body-ui text-[12px] text-on-surface-variant">
              {liveEmergency ? "Standby screen is showing on the output." : "Output is cut to black."}
            </p>
          </div>
        )}
        <div className="flex-1 min-h-0 flex items-center justify-center">
          {live
            ? <OutputPreview state={outputState} chapter={null} parallelChapter={null} stage={stage} outputOpen={presentationActive} showCountdown />
            : <p className="text-center font-body-ui text-[12px] text-on-surface-variant">Nothing live. Send a slide from Preview.</p>}
        </div>
      </div>

      <div className="shrink-0 border-t border-outline-variant px-4 py-3 flex items-center gap-3">
        <p className="min-w-0 flex-1 font-body-ui text-[12px] text-on-surface truncate" title={live?.title}>{live ? live.title : "Nothing live"}</p>
        <div className="flex ctl rounded-md overflow-hidden shrink-0">
          <button onClick={() => void stepLive(-1)} disabled={!live || at <= 0} className="px-2 py-1 disabled:opacity-35 hover:bg-on-surface/10" aria-label="Previous scheduled slide" title="Previous scheduled slide (Page Up)">
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <button onClick={() => void stepLive(1)} disabled={!live || at < 0 || at >= schedule.length - 1} className="px-2 py-1 border-l border-outline-variant disabled:opacity-35 hover:bg-on-surface/10" aria-label="Next scheduled slide" title="Next scheduled slide (Page Down)">
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>
    </section>
  );
}
