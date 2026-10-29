import { useAppStore } from "../../store/app";
import { useOnboardingStore } from "./store";
import type { TourDepth } from "./steps";

/** The two "replay" buttons for Settings → Help. Tours the workspace the app is currently in. */
export default function TourReplayButtons({ onStart }: { onStart?: () => void }) {
  const workspace = useAppStore((s) => s.workspace);
  const startTour = useOnboardingStore((s) => s.startTour);

  const go = (depth: TourDepth) => {
    onStart?.();
    startTour(workspace, depth);
  };

  return (
    <div className="flex gap-1.5">
      <button onClick={() => go("essentials")} className="set-ctl ctl text-on-surface-variant">Essentials</button>
      <button onClick={() => go("full")} className="set-ctl ctl text-on-surface-variant">Full tour</button>
    </div>
  );
}
