// Whether the first-run welcome has been shown. Kept in localStorage on purpose:
// it's a per-device UI flag, not user data, and keeping it out of the preferences
// table means onboarding can't touch (or be broken by) the backend schema.
const KEY = "scriptura.onboarding.v1";

/**
 * Fails closed: if storage is unreadable we'd rather skip the welcome than show it
 * on every single launch. (A tour that can't remember it ran is worse than none.)
 */
export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(KEY) === "done";
  } catch {
    return true;
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(KEY, "done");
  } catch { /* ignore — see hasSeenOnboarding */ }
}
