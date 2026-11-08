import { useEffect, useState } from "react";
import { open as openLink } from "@tauri-apps/plugin-shell";
import { ndiApi } from "./api";
import { summarise, type NdiStatus } from "./ndiLogic";

const NDI_SITE = "https://ndi.video";
const TOOLS_URL = "https://ndi.video/tools/";

function msg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong";
}

/**
 * Send the presentation window out as an NDI source, for vMix, OBS, Wirecast or
 * NDI Monitor. It uses the NDI Tools the user has installed; without them this
 * says how to get them and nothing else in the app is affected. The link to
 * ndi.video and the trademark line are part of NDI's terms of use.
 */
export default function NdiSection() {
  const [status, setStatus] = useState<NdiStatus | null>(null);
  const [name, setName] = useState("Yarda");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the status fresh while this is on screen: who is receiving, whether a frame failed.
  useEffect(() => {
    let alive = true;
    const refresh = () => ndiApi.status().then((s) => { if (alive) setStatus(s); }).catch(() => {});
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  async function toggle() {
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(status.running ? await ndiApi.stop() : await ndiApi.start(name));
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  const summary = status ? summarise(status) : null;
  const canUse = status !== null && status.supported && status.available;

  return (
    <>
      <div className="px-3 py-1.5 bg-surface-container-low border-y border-outline-variant">
        <span className="font-body-ui font-medium text-[12px] text-on-surface-variant">NDI (vMix, Wirecast, OBS…)</span>
      </div>
      <div className="px-3 py-2.5 space-y-2.5">
        {summary && (
          <p className={`font-body-ui text-[12px] leading-relaxed ${summary.problem ? "text-error" : "text-on-surface-variant"}`} role={summary.problem ? "alert" : "status"}>
            {summary.line}
          </p>
        )}
        {status?.supported && !status.available && (
          <button onClick={() => void openLink(TOOLS_URL).catch(() => {})} className="w-full h-8 rounded-md ctl font-body-ui text-[12px] text-on-surface">
            Get NDI Tools
          </button>
        )}
        {canUse && (
          <div className="space-y-2">
            <label className="block">
              <span className="field-label">Source name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                maxLength={64}
                aria-label="NDI source name"
                className="field-input"
              />
            </label>
            <button onClick={() => void toggle()} disabled={busy} className="w-full h-8 rounded-md ctl font-body-ui text-[12px] text-on-surface disabled:opacity-40">
              {status.running ? "Stop NDI output" : "Start NDI output"}
            </button>
            <p className="font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
              Sends the presentation window, so it has to be open and not minimised. It is a picture without transparency; for keying over video use the transparent web output above.
            </p>
          </div>
        )}
        {error && <p className="font-body-ui text-[12px] text-error" role="alert">{error}</p>}
        <p className="font-body-ui text-[11px] text-on-surface-variant leading-relaxed">
          NDI® is a registered trademark of Vizrt NDI AB.{" "}
          <button onClick={() => void openLink(NDI_SITE).catch(() => {})} className="underline">ndi.video</button>
        </p>
      </div>
    </>
  );
}
