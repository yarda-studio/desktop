import { useEffect, useRef } from "react";
import { useRemoteStore } from "./remoteStore";

/** Dropdown from the top bar's Remote button: turn the phone remote on and pair a phone. */
export default function RemotePanel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { status, busy, error, setEnabled, resetAccess } = useRemoteStore();

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="dialog" aria-label="Phone remote" className="absolute right-0 top-full mt-1 z-50 glass rounded-xl w-[320px] p-4 space-y-4">
      <label className="flex items-start gap-3 font-body-ui text-[13px] text-on-surface">
        <input type="checkbox" checked={status.enabled} disabled={busy} onChange={(e) => void setEnabled(e.target.checked)} className="accent-primary mt-0.5" />
        <span>
          Control from a phone on this network
          <span className="block text-[12px] text-on-surface-variant">Next / back, black, standby and the timer from a phone browser. Off until you turn it on.</span>
        </span>
      </label>

      {status.enabled && status.url && (
        <div className="space-y-3">
          {status.qr_svg && (
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(status.qr_svg)}`}
              alt="QR code that opens the remote on your phone"
              className="mx-auto h-[200px] w-[200px] rounded-lg bg-white"
            />
          )}
          <p className="font-body-ui text-[12px] text-on-surface-variant text-center">Scan with your phone's camera. It must be on the same Wi-Fi as this computer.</p>
          <input
            readOnly value={status.url} aria-label="Remote link"
            onFocus={(e) => e.currentTarget.select()}
            className="field-input font-metadata-mono !text-[11px]"
          />
          <p className="font-body-ui text-[12px] text-on-surface-variant leading-relaxed">
            Anyone with this link can control the screen, so don't share it. The connection isn't encrypted, so use a network you trust.
          </p>
          <button onClick={() => void resetAccess()} disabled={busy} className="w-full h-9 rounded-md ctl font-body-ui text-[13px] text-on-surface disabled:opacity-40">
            Reset link (signs out every phone)
          </button>
        </div>
      )}
      {error && <p className="font-body-ui text-[12px] text-error" role="alert">{error}</p>}
    </div>
  );
}
