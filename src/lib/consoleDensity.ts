export type ConsolePreset = "balanced" | "compact";

export const BALANCED_COMPACTNESS = 40;
export const COMPACT_COMPACTNESS = 80;
export const DEFAULT_CONSOLE_COMPACTNESS = BALANCED_COMPACTNESS;

export const COMPACTNESS_STORAGE_KEY = "scriptura.console.compactness";
export const LEGACY_DENSITY_STORAGE_KEY = "scriptura.console.density";
export const SPLIT_COLUMNS_STORAGE_KEY = "scriptura.console.splitColumns";

export const CONSOLE_PRESET_OPTIONS: {
  id: ConsolePreset;
  value: number;
  label: string;
  description: string;
}[] = [
  { id: "balanced", value: BALANCED_COMPACTNESS, label: "Balanced", description: "Comfortable breathing room around panels and verses" },
  { id: "compact", value: COMPACT_COMPACTNESS, label: "Compact", description: "Tighter spacing to fit more verses and rows on smaller or split screens" },
];

export function clampCompactness(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CONSOLE_COMPACTNESS;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function presetForCompactness(value: number): ConsolePreset | "custom" {
  const n = clampCompactness(value);
  if (n === BALANCED_COMPACTNESS) return "balanced";
  if (n === COMPACT_COMPACTNESS) return "compact";
  return "custom";
}

export function compactnessLabel(value: number): string {
  const n = clampCompactness(value);
  if (n === BALANCED_COMPACTNESS) return `Balanced (${n}%)`;
  if (n === COMPACT_COMPACTNESS) return `Compact (${n}%)`;
  return `Custom (${n}%)`;
}

export function readConsoleCompactness(storage?: Pick<Storage, "getItem">): number {
  try {
    const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    const raw = store?.getItem(COMPACTNESS_STORAGE_KEY);
    if (raw !== null && raw !== undefined) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return clampCompactness(parsed);
    }
    // Migrate from the earlier discrete density key if present.
    const legacy = store?.getItem(LEGACY_DENSITY_STORAGE_KEY);
    if (legacy === "comfortable") return BALANCED_COMPACTNESS;
    if (legacy === "balanced") return COMPACT_COMPACTNESS;
    if (legacy === "compact") return 95;
    return DEFAULT_CONSOLE_COMPACTNESS;
  } catch {
    return DEFAULT_CONSOLE_COMPACTNESS;
  }
}

export function writeConsoleCompactness(value: number, storage?: Pick<Storage, "setItem">): void {
  try {
    const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    store?.setItem(COMPACTNESS_STORAGE_KEY, String(clampCompactness(value)));
  } catch {
    // Storage unavailable — preference stays in memory for this session.
  }
}

export function readSplitConsoleColumns(storage?: Pick<Storage, "getItem">): boolean {
  try {
    const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    const raw = store?.getItem(SPLIT_COLUMNS_STORAGE_KEY);
    if (raw === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function writeSplitConsoleColumns(split: boolean, storage?: Pick<Storage, "setItem">): void {
  try {
    const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    store?.setItem(SPLIT_COLUMNS_STORAGE_KEY, String(split));
  } catch {
    // ignore
  }
}

type AnchorStops = readonly [number, number, number, number]; // [0, 40 (Balanced), 80 (Compact), 100]

function sampleStops(compactness: number, stops: AnchorStops): number {
  const c = clampCompactness(compactness);
  if (c <= 40) return stops[0] + ((stops[1] - stops[0]) * c) / 40;
  if (c <= 80) return stops[1] + ((stops[2] - stops[1]) * (c - 40)) / 40;
  return stops[2] + ((stops[3] - stops[2]) * (c - 80)) / 20;
}

const px = (n: number) => `${n.toFixed(2).replace(/\.?0+$/, "")}px`;
const num = (n: number) => n.toFixed(3).replace(/\.?0+$/, "");

const VAR_STOPS: Record<string, { stops: AnchorStops; unit: "px" | "num" }> = {
  "--c-shell-pad":       { stops: [12, 10, 6, 4],       unit: "px" },
  "--c-shell-gap":       { stops: [12, 10, 6, 4],       unit: "px" },
  "--c-radius":          { stops: [18, 16, 12, 10],     unit: "px" },
  "--c-topbar-h":        { stops: [46, 44, 40, 38],     unit: "px" },
  "--c-hdr-px":          { stops: [16, 14, 10, 8],      unit: "px" },
  "--c-hdr-py":          { stops: [10, 8, 6, 5],        unit: "px" },
  "--c-hdr-text":        { stops: [13.5, 13, 12.5, 12], unit: "px" },
  "--c-list-pad":        { stops: [12, 10, 8, 6],       unit: "px" },
  "--c-list-gap":        { stops: [8, 6, 4, 3],         unit: "px" },
  "--c-card-px":         { stops: [14, 12, 10, 8],      unit: "px" },
  "--c-card-py":         { stops: [10, 8, 6, 4.5],      unit: "px" },
  "--c-card-gap":        { stops: [12, 10, 8, 6],       unit: "px" },
  "--c-card-title":      { stops: [12.5, 12, 11.5, 11], unit: "px" },
  "--c-card-text":       { stops: [13.5, 13, 13, 12.5], unit: "px" },
  "--c-card-strongs-lh": { stops: [1.85, 1.8, 1.55, 1.45], unit: "num" },
  "--c-sched-list-px":   { stops: [14, 12, 8, 6],       unit: "px" },
  "--c-sched-list-py":   { stops: [10, 8, 6, 4],        unit: "px" },
  "--c-sched-card-px":   { stops: [12, 10, 8, 7],       unit: "px" },
  "--c-sched-card-py":   { stops: [8, 6, 6, 4.5],       unit: "px" },
  "--c-sched-title":     { stops: [13, 12.5, 12, 11.5], unit: "px" },
  "--c-sched-sub":       { stops: [12.5, 12, 11.5, 11], unit: "px" },
  "--c-plan-pt":         { stops: [12, 10, 8, 6],       unit: "px" },
  "--c-plan-px":         { stops: [14, 12, 8, 6],       unit: "px" },
  "--c-plan-sum-py":     { stops: [10, 8, 6, 4.5],      unit: "px" },
  "--c-toolbar-h":       { stops: [48, 45, 38, 35],     unit: "px" },
  "--c-toolbar-px":      { stops: [14, 12, 10, 8],      unit: "px" },
  "--c-toolbar-py":      { stops: [8, 6, 4, 3],         unit: "px" },
  "--c-verse-list-px":   { stops: [10, 8, 6, 4],        unit: "px" },
  "--c-verse-list-py":   { stops: [10, 8, 6, 4],        unit: "px" },
  "--c-verse-mb":        { stops: [6, 4, 2, 1],         unit: "px" },
  "--c-verse-px":        { stops: [14, 12, 10, 8],      unit: "px" },
  "--c-verse-py":        { stops: [10, 8, 4, 3],        unit: "px" },
  "--c-verse-gap":       { stops: [12, 10, 8, 6],       unit: "px" },
  "--c-verse-num":       { stops: [12.5, 12, 11.5, 11], unit: "px" },
  "--c-verse-text":      { stops: [14.5, 14, 13, 12.5], unit: "px" },
  "--c-verse-lh":        { stops: [1.4, 1.375, 1.375, 1.3], unit: "num" },
  "--c-verse-strongs-lh":{ stops: [1.95, 1.9, 1.5, 1.42], unit: "num" },
  "--c-table-px":        { stops: [14, 12, 10, 8],      unit: "px" },
  "--c-table-py":        { stops: [9, 8, 6, 4.5],       unit: "px" },
  "--c-table-text":      { stops: [13.5, 13, 12.5, 12], unit: "px" },
  "--c-search-mx":       { stops: [14, 12, 10, 8],      unit: "px" },
  "--c-search-mt":       { stops: [12, 10, 8, 6],       unit: "px" },
  "--c-search-mb":       { stops: [10, 8, 6, 4],        unit: "px" },
  "--c-search-h":        { stops: [36, 34, 32, 28],     unit: "px" },
  "--c-footer-h":        { stops: [46, 44, 36, 33],     unit: "px" },
  "--c-footer-px":       { stops: [14, 12, 10, 8],      unit: "px" },
  "--c-stage-pad":       { stops: [18, 16, 10, 8],      unit: "px" },
  "--c-strip-full-px":   { stops: [18, 16, 12, 10],     unit: "px" },
  "--c-strip-full-py":   { stops: [14, 12, 8, 6],       unit: "px" },
  "--c-strip-cmp-px":    { stops: [14, 12, 10, 8],      unit: "px" },
  "--c-strip-cmp-py":    { stops: [8, 6, 6, 4],         unit: "px" },
  "--c-golive-h":        { stops: [34, 32, 28, 25],     unit: "px" },
  "--c-golive-px":       { stops: [14, 12, 8, 7],       unit: "px" },
  "--c-golive-text":     { stops: [13.5, 13, 12, 11.5], unit: "px" },
};

export function consoleCssVars(compactness: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, def] of Object.entries(VAR_STOPS)) {
    const val = sampleStops(compactness, def.stops);
    out[key] = def.unit === "px" ? px(val) : num(val);
  }
  return out;
}

export function applyConsoleCompactness(compactness: number): void {
  if (typeof document === "undefined") return;
  const style = document.documentElement.style;
  for (const [k, v] of Object.entries(consoleCssVars(compactness))) {
    style.setProperty(k, v);
  }
}

export interface OutputStripConfig {
  compactBelow: number;
  minimalBelow: number;
  narrowBelow: number;
  thumbFull: string;
  thumbCompact: string;
}

export function outputStripConfig(compactness: number): OutputStripConfig {
  const scale = sampleStops(compactness, [1.08, 1, 0.82, 0.74]);
  const fullMin = Math.round(104 * scale);
  const fullPct = Math.round(sampleStops(compactness, [40, 38, 34, 30]));
  const fullMax = Math.round(144 * scale);
  const cmpMin = Math.round(68 * scale);
  const cmpPct = Math.round(sampleStops(compactness, [28, 25, 28, 26]));
  const cmpMax = Math.round(92 * scale);

  return {
    compactBelow: Math.round(sampleStops(compactness, [560, 540, 500, 470])),
    minimalBelow: Math.round(sampleStops(compactness, [320, 310, 240, 215])),
    narrowBelow: Math.round(sampleStops(compactness, [250, 240, 155, 140])),
    thumbFull: `clamp(${fullMin}px, ${fullPct}%, ${fullMax}px)`,
    thumbCompact: `clamp(${cmpMin}px, ${cmpPct}%, ${cmpMax}px)`,
  };
}

export interface ColumnLayoutClasses {
  tabsHide: string;
  handleShow: string;
  scheduleShow: string;
  previewShow: string;
  liveShow: string;
  scheduleSize: string;
  liveSize: string;
  goLiveLabel: string;
}

/**
 * Static Tailwind class sets for whether the 3 console columns (Schedule | Preview | Live)
 * stay side-by-side on split-screen windows (down to 660px) or collapse into tabs below 880px.
 */
export function columnLayoutClasses(
  pane: "schedule" | "preview" | "live",
  splitColumns: boolean,
): ColumnLayoutClasses {
  if (splitColumns) {
    return {
      tabsHide: "min-[660px]:hidden",
      handleShow: "hidden min-[660px]:contents",
      scheduleShow: `${pane === "schedule" ? "flex" : "hidden"} min-[660px]:flex`,
      previewShow: `${pane === "preview" ? "flex" : "hidden"} min-[660px]:flex`,
      liveShow: `${pane === "live" ? "flex" : "hidden"} min-[660px]:flex`,
      scheduleSize: "w-full min-[660px]:w-[var(--pane-w)] shrink min-w-0 min-[660px]:max-w-[30%]",
      liveSize: "w-full min-[660px]:w-[var(--pane-w)] shrink min-w-0 min-[660px]:max-w-[36%]",
      goLiveLabel: "hidden sm:inline min-[660px]:hidden min-[960px]:inline",
    };
  }
  return {
    tabsHide: "min-[880px]:hidden",
    handleShow: "hidden min-[880px]:contents",
    scheduleShow: `${pane === "schedule" ? "flex" : "hidden"} min-[880px]:flex`,
    previewShow: `${pane === "preview" ? "flex" : "hidden"} min-[880px]:flex`,
    liveShow: `${pane === "live" ? "flex" : "hidden"} min-[880px]:flex`,
    scheduleSize: "w-full min-[880px]:w-[var(--pane-w)] shrink min-w-0 min-[880px]:max-w-[32%]",
    liveSize: "w-full min-[880px]:w-[var(--pane-w)] shrink min-w-0 min-[880px]:max-w-[38%]",
    goLiveLabel: "hidden sm:inline min-[880px]:hidden min-[960px]:inline",
  };
}
