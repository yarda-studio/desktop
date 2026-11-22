import OutputPreview from "../../components/OutputPreview";
import { columnLayoutClasses } from "../../lib/consoleDensity";
import { useAppStore } from "../../store/app";
import { useSlidesLive } from "./liveStore";
import PageChips from "./PageChips";
import { useSlidePresentState } from "./useSlideOutput";

export default function PreviewPanel({ stage, className = "flex" }: { stage: { w: number; h: number }; className?: string }) {
  const { previewSlide, previewPage, setPreviewPage, live, livePage, goLive } = useSlidesLive();
  const splitConsoleColumns = useAppStore((s) => s.splitConsoleColumns);
  const layout = columnLayoutClasses("preview", splitConsoleColumns);
  const outputState = useSlidePresentState(previewSlide, previewPage);
  const alreadyLive = !!previewSlide && live?.id === previewSlide.id && live.updated_at === previewSlide.updated_at && livePage === previewPage;

  return (
    <section className={`${className} flex-1 min-w-0 flex-col overflow-hidden panel rounded-[var(--c-radius,16px)]`}>
      <div className="shrink-0 flex items-center gap-2 px-[var(--c-hdr-px,14px)] py-[var(--c-hdr-py,8px)] border-b border-outline-variant">
        <h2 className="min-w-0 flex-1 font-body-ui text-[length:var(--c-hdr-text,13px)] font-bold text-on-surface truncate">
          Preview{" "}
          {previewSlide && <span className="font-normal text-on-surface-variant">— {previewSlide.title}</span>}
        </h2>
        <button
          onClick={() => void goLive()}
          disabled={!previewSlide || alreadyLive}
          className="flex items-center gap-1 px-[var(--c-golive-px,12px)] !min-h-0 h-[var(--c-golive-h,32px)] rounded-md btn-primary font-body-ui !text-[length:var(--c-golive-text,13px)] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shrink-0"
          title="Send the previewed slide live (or double-click it in the schedule)"
          aria-label="Go Live"
        >
          <span className="material-symbols-outlined text-[15px]">play_arrow</span>
          <span className={layout.goLiveLabel}>Go Live</span>
        </button>
      </div>
      <div className="flex-1 min-h-0 p-[var(--c-stage-pad,16px)] flex items-center justify-center">
        {previewSlide
          ? <OutputPreview state={outputState} chapter={null} parallelChapter={null} stage={stage} outputOpen />
          : <p className="text-center font-body-ui text-[12px] text-on-surface-variant">Select a scheduled slide to preview it.</p>}
      </div>
      {previewSlide && previewSlide.pages.length > 1 && (
        <div className="shrink-0 border-t border-outline-variant px-4 py-2">
          <PageChips count={previewSlide.pages.length} index={previewPage} onSelect={setPreviewPage} />
        </div>
      )}
    </section>
  );
}
