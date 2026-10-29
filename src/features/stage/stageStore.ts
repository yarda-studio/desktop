import { create } from "zustand";

/** Whether the stage display window is open. Kept in step with the window by useStageWindow. */
export const useStageStore = create<{ active: boolean; setActive: (active: boolean) => void }>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
