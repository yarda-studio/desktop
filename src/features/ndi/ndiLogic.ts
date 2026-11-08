/** What the backend reports about NDI output (see src-tauri/src/commands/ndi.rs). */
export interface NdiStatus {
  /** This build can capture the output window on this operating system. */
  supported: boolean;
  /** NDI Tools is installed. */
  available: boolean;
  running: boolean;
  name: string;
  connections: number;
  frames: number;
  error: string | null;
}

export type NdiPhase = "unsupported" | "missing" | "off" | "running";

export interface NdiSummary {
  phase: NdiPhase;
  /** One line for the panel. */
  line: string;
  /** True when the line is a problem rather than information. */
  problem: boolean;
}

/** Turn the raw status into what the panel says. */
export function summarise(status: NdiStatus): NdiSummary {
  if (!status.supported) {
    return { phase: "unsupported", line: "NDI output is available on Mac for now. Windows is next.", problem: false };
  }
  if (!status.available) {
    return {
      phase: "missing",
      line: "NDI Tools isn't installed on this computer. Install it from ndi.video, then come back here.",
      problem: false,
    };
  }
  if (!status.running) {
    return { phase: "off", line: "Off. Turn it on to show the output as an NDI source on your network.", problem: false };
  }
  if (status.error) return { phase: "running", line: status.error, problem: true };
  const n = status.connections;
  const watching = n === 0 ? "Nothing is receiving it yet." : `${n} ${n === 1 ? "program is" : "programs are"} receiving it.`;
  return { phase: "running", line: `Sending "${status.name}". ${watching}`, problem: false };
}
