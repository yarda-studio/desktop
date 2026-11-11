import { create } from "zustand";

/** How many Live Show search filters are active, published by the search bar for other views (e.g. the shortcuts overlay). */
export const useSearchFilterStore = create<{ count: number; setCount: (n: number) => void }>((set) => ({
  count: 0,
  setCount: (count) => set({ count }),
}));
