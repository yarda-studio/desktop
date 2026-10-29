import { create } from "zustand";
import { stepsFor, type TourDepth, type TourStep, type TourWorkspace } from "./steps";

// Feature-scoped on purpose: onboarding state has no business living in the
// global app store, and a bug here shouldn't be able to disturb it.
type Phase = "idle" | "welcome" | "tour";

interface OnboardingState {
  phase: Phase;
  steps: TourStep[];
  index: number;
  openWelcome: () => void;
  startTour: (workspace: TourWorkspace, depth: TourDepth) => void;
  next: () => void;
  back: () => void;
  close: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  phase: "idle",
  steps: [],
  index: 0,
  openWelcome: () => set({ phase: "welcome" }),
  startTour: (workspace, depth) => set({ phase: "tour", steps: stepsFor(workspace, depth), index: 0 }),
  next: () => {
    const { index, steps } = get();
    if (index >= steps.length - 1) set({ phase: "idle" });
    else set({ index: index + 1 });
  },
  back: () => set((s) => ({ index: Math.max(0, s.index - 1) })),
  close: () => set({ phase: "idle" }),
}));
