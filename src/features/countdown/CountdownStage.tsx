import { useNow } from "../../lib/clock";
import type { PresentationTheme } from "../../lib/tauri";
import SlideStage from "../slides/SlideStage";
import { countdownSlide, type CountdownPayload } from "./model";

/** What the output screen shows while the countdown has taken it over. */
export default function CountdownStage({ countdown, theme, stage }: {
  countdown: CountdownPayload;
  theme: PresentationTheme | null;
  stage: { w: number; h: number };
}) {
  const now = useNow(countdown.status === "running");
  return <SlideStage slide={countdownSlide(countdown, now, theme?.text_color ?? "#ffffff")} theme={theme} stage={stage} />;
}
