import type { SlideDocPayload, SlideElementData } from "../../lib/presentation";

export type CountdownStatus = "idle" | "running" | "paused" | "finished";

/** What the output windows need to draw the timer. Times are absolute, so the
 * windows count down on their own without being sent a message every second. */
export interface CountdownPayload {
  /** Whether the timer is currently taking over the output screen. */
  show: boolean;
  status: CountdownStatus;
  title: string;
  /** Epoch ms the timer reaches zero (while running). */
  endsAt: number;
  /** Time left when paused. */
  remainingMs: number;
}

export function remainingMs(c: CountdownPayload, now: number): number {
  if (c.status === "running") return Math.max(0, c.endsAt - now);
  if (c.status === "paused") return Math.max(0, c.remainingMs);
  return 0;
}

/** "4:05", "0:09", or "1:02:03" once an hour or more is left. Rounds up, so it
 * reads 0:00 only when the time is really up. */
export function formatRemaining(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Whole-screen timer as a slide, so it picks up the theme's backdrop and font like any other slide. */
export function countdownSlide(c: CountdownPayload, now: number, color: string): SlideDocPayload {
  const box = (patch: Partial<SlideElementData>): SlideElementData => ({
    id: "", kind: "text", x: 6, y: 0, w: 88, h: 0, text: "", font_size: 64, color, align: "center", bold: true, image: null, ...patch,
  });
  const elements = [box({ id: "time", y: 30, h: 40, text: formatRemaining(remainingMs(c, now)), font_size: 300 })];
  if (c.title.trim()) elements.unshift(box({ id: "title", y: 14, h: 16, text: c.title, font_size: 72, bold: false }));
  return { title: c.title || "Countdown", background: "theme", elements };
}

/** Epoch ms of the next time the wall clock reads `hhmm` ("HH:MM"), today or tomorrow. */
export function nextClockTime(hhmm: string, now: number): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const target = new Date(now);
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (target.getTime() <= now + 1000) target.setDate(target.getDate() + 1);
  return target.getTime();
}
