import SegmentedControl from "./SegmentedControl";

export type ConsolePane = "schedule" | "preview" | "live";

interface Props {
  pane: ConsolePane;
  onChange: (pane: ConsolePane) => void;
  scheduleCount: number;
  liveActive: boolean;
}

/**
 * Compact pane switcher shown below 880px in the presentation console tabs
 * (Scriptures, Slides, Songs), letting the active column use the full width
 * instead of squeezing all three columns side by side.
 */
export default function ConsolePaneTabs({ pane, onChange, scheduleCount, liveActive }: Props) {
  return (
    <SegmentedControl
      ariaLabel="Console panel"
      value={pane}
      onChange={onChange}
      stretch
      options={[
        {
          value: "schedule",
          label: (
            <>
              <span>Schedule</span>
              {scheduleCount > 0 && (
                <span className="rounded-full bg-on-surface/10 px-1.5 text-[11px] font-semibold leading-[16px]">
                  {scheduleCount}
                </span>
              )}
            </>
          ),
        },
        { value: "preview", label: "Preview" },
        {
          value: "live",
          label: (
            <>
              <span>Live</span>
              {liveActive && <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse shrink-0" />}
            </>
          ),
        },
      ]}
      className="min-[880px]:hidden shrink-0 rounded-xl panel p-1 gap-1"
      itemClassName="py-1 rounded-lg text-[12px] font-semibold"
      indicatorClassName="rounded-lg bg-primary shadow-xs"
    />
  );
}
