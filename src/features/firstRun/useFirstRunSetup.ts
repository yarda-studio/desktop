import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../../lib/tauri";

export type StepStatus = "pending" | "active" | "done" | "error";

export interface SetupStep {
  id: string;
  label: string;
  status: StepStatus;
  /** 0-100. */
  progress: number;
}

export type SetupPhase = "running" | "failed" | "complete";

export const SETUP_LABELS: Record<string, string> = {
  KJV: "King James Bible",
  StrongsGreek: "Strong's Greek lexicon",
  StrongsHebrew: "Strong's Hebrew lexicon",
};

/**
 * Installs the modules the app cannot open without, one at a time, and reports
 * progress from the backend's `module-install-progress` events. Modules already
 * on disk are passed in `installed` so a half-finished earlier attempt resumes
 * instead of starting over.
 */
export function useFirstRunSetup(required: string[], installed: string[], onComplete: () => void) {
  const [steps, setSteps] = useState<SetupStep[]>(() =>
    required.map((id) => ({
      id,
      label: SETUP_LABELS[id] ?? id,
      status: installed.includes(id) ? "done" : "pending",
      progress: installed.includes(id) ? 100 : 0,
    })),
  );
  const [phase, setPhase] = useState<SetupPhase>("running");
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("Getting started…");
  const doneRef = useRef(new Set(installed));
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  const patch = useCallback((id: string, next: Partial<SetupStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)));
  }, []);

  useEffect(() => {
    const unlisten = listen<{ module_id: string; progress: number; message: string }>(
      "module-install-progress",
      (e) => {
        const { module_id, progress, message: msg } = e.payload;
        if (!required.includes(module_id)) return;
        // 100 is only marked done once install_module resolves, below.
        patch(module_id, { progress: Math.min(progress, 99) });
        setMessage(msg);
      },
    );
    return () => { unlisten.then((f) => f()); };
  }, [required, patch]);

  useEffect(() => {
    let cancelled = false;
    setPhase("running");
    (async () => {
      for (const id of required) {
        if (doneRef.current.has(id)) continue;
        patch(id, { status: "active", progress: 0 });
        try {
          await api.installModule(id);
          if (cancelled) return;
          doneRef.current.add(id);
          patch(id, { status: "done", progress: 100 });
        } catch (e) {
          console.error(`[first-run ${id}]`, e);
          if (cancelled) return;
          patch(id, { status: "error" });
          setPhase("failed");
          return;
        }
      }
      if (!cancelled) {
        setPhase("complete");
        completeRef.current();
      }
    })();
    return () => { cancelled = true; };
    // `attempt` re-runs the sequence; modules finished earlier are skipped via doneRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = useCallback(() => {
    // Anything that finished before the failure is already on disk.
    setSteps((prev) => prev.map((s) => (s.status === "done" ? s : { ...s, status: "pending", progress: 0 })));
    setAttempt((n) => n + 1);
  }, []);

  const overall = steps.length
    ? Math.round(steps.reduce((sum, s) => sum + s.progress, 0) / steps.length)
    : 100;

  return { steps, phase, overall, message, retry };
}
