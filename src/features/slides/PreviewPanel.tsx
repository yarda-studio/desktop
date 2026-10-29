import OutputPreview from "../../components/OutputPreview";
import { useSlidesLive } from "./liveStore";
import { useSlidePresentState } from "./useSlideOutput";

export default function PreviewPanel({ stage }: { stage: { w: number; h: number } }) {
  const { previewSlide, live, goLive } = useSlidesLive();
  const outputState = useSlidePresentState(previewSlide);
  const alreadyLive = !!previewSlide && live?.id === previewSlide.id && live.updated_at === previewSlide.updated_at;

  return (
    <section className="flex-1 min-w-0 flex flex-col overflow-hidden panel rounded-3xl">
      <div className="shrink-0 flex items-center gap-3 px-3.5 py-2 border-b border-outline-variant">
        <h2 className="min-w-0 flex-1 font-body-ui text-[13px] font-bold text-on-surface truncate">
          Preview{" "}
          {previewSlide && <span className="font-normal text-on-surface-variant">— {previewSlide.title}</span>}
        </h2>
        <button
          onClick={() => void goLive()}
          disabled={!previewSlide || alreadyLive}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md btn-primary font-body-ui text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          title="Send the previewed slide live (or double-click it in the schedule)"
        >
          <span className="material-symbols-outlined text-[16px]">play_arrow</span>
          Go Live
        </button>
      </div>
      <div className="flex-1 min-h-0 p-4 flex items-center justify-center">
        {previewSlide
          ? <OutputPreview state={outputState} chapter={null} parallelChapter={null} stage={stage} outputOpen />
          : <p className="text-center font-body-ui text-[12px] text-on-surface-variant">Select a scheduled slide to preview it.</p>}
      </div>
    </section>
  );
}
