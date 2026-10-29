import { create } from "zustand";
import { nextClockTime, remainingMs, type CountdownPayload, type CountdownStatus } from "./model";

export type CountdownMode = "duration" | "clock";

interface Config {
  title: string;
  mode: CountdownMode;
  /** Length for "duration" mode, in minutes. */
  minutes: number;
  /** Target for "clock" mode, "HH:MM". */
  clock: string;
}

interface CountdownState extends Config {
  status: CountdownStatus;
  endsAt: number;
  remainingMs: number;
  /** Whether the timer takes over the output screen. */
  show: boolean;

  setConfig: (patch: Partial<Config>) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  setShow: (show: boolean) => void;
  /** Called by the main window's timer; marks a running timer finished once it reaches zero. */
  checkFinished: (now: number) => void;
}

const STORAGE_KEY = "scriptura.countdown.config";
const DEFAULT_CONFIG: Config = { title: "Service starts in", mode: "duration", minutes: 5, clock: "10:00" };

function loadConfig(): Config {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (raw && typeof raw === "object") {
      return {
        title: typeof raw.title === "string" ? raw.title : DEFAULT_CONFIG.title,
        mode: raw.mode === "clock" ? "clock" : "duration",
        minutes: Number.isFinite(raw.minutes) ? Math.min(600, Math.max(0, raw.minutes)) : DEFAULT_CONFIG.minutes,
        clock: typeof raw.clock === "string" && /^\d{1,2}:\d{2}$/.test(raw.clock) ? raw.clock : DEFAULT_CONFIG.clock,
      };
    }
  } catch { /* storage unavailable or corrupt: use defaults */ }
  return DEFAULT_CONFIG;
}

function saveConfig(c: Config) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* not critical */ }
}

export const useCountdown = create<CountdownState>((set, get) => ({
  ...loadConfig(),
  status: "idle",
  endsAt: 0,
  remainingMs: 0,
  show: false,

  setConfig: (patch) => {
    set(patch);
    const { title, mode, minutes, clock } = get();
    saveConfig({ title, mode, minutes, clock });
  },

  start: () => {
    const { mode, minutes, clock } = get();
    const now = Date.now();
    const endsAt = mode === "clock" ? nextClockTime(clock, now) : now + minutes * 60_000;
    if (endsAt === null || endsAt <= now) return;
    set({ status: "running", endsAt, remainingMs: endsAt - now, show: true });
  },

  pause: () => {
    const s = get();
    if (s.status !== "running") return;
    set({ status: "paused", remainingMs: remainingMs(s, Date.now()) });
  },

  resume: () => {
    const s = get();
    if (s.status !== "paused" || s.remainingMs <= 0) return;
    set({ status: "running", endsAt: Date.now() + s.remainingMs });
  },

  reset: () => set({ status: "idle", endsAt: 0, remainingMs: 0, show: false }),

  setShow: (show) => set({ show }),

  checkFinished: (now) => {
    const s = get();
    if (s.status === "running" && now >= s.endsAt) set({ status: "finished", remainingMs: 0 });
  },
}));

export function selectPayload(s: CountdownState): CountdownPayload {
  return { show: s.show && s.status !== "idle", status: s.status, title: s.title, endsAt: s.endsAt, remainingMs: s.remainingMs };
}
