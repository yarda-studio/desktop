import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { transferApi } from "./api";
import { backupFileName, formatSize, importedExtras } from "./transferLogic";

const FILTERS = [{ name: "Yarda backup", extensions: ["zip"] }];

function msg(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong";
}

/**
 * Move everything to another computer through a file: save a backup here, open
 * it there. It needs no account. Opening a backup replaces what is on that
 * computer, so it asks first; afterwards the app restarts so every screen loads
 * the new data.
 */
export default function TransferPanel() {
  const [includeModules, setIncludeModules] = useState(false);
  const [includeVideos, setIncludeVideos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);

  async function exportFile() {
    setStatus(null);
    try {
      const path = await save({ defaultPath: backupFileName(new Date()), filters: FILTERS });
      if (!path) return;
      setBusy(true);
      setStatus({ text: "Saving the backup…" });
      const size = await transferApi.exportToFile(path, { include_modules: includeModules, include_videos: includeVideos });
      setStatus({ text: `Saved (${formatSize(size)}). Open it from Settings on the other computer.` });
    } catch (e) {
      setStatus({ text: `Could not save the backup: ${msg(e)}`, error: true });
    } finally {
      setBusy(false);
    }
  }

  async function chooseImport() {
    setStatus(null);
    try {
      const picked = await open({ multiple: false, directory: false, filters: FILTERS });
      if (typeof picked === "string") setPendingImport(picked);
    } catch (e) {
      setStatus({ text: `Could not open the file picker: ${msg(e)}`, error: true });
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    setBusy(true);
    setStatus({ text: "Importing…" });
    try {
      const done = await transferApi.importFromFile(pendingImport);
      const extras = importedExtras(done.modules, done.videos);
      setPendingImport(null);
      setStatus({ text: `Imported${extras ? `, with ${extras}` : ""}. Restarting…` });
      try {
        await relaunch();
      } catch {
        setStatus({ text: "Imported. Restart the app to see everything." });
      }
    } catch (e) {
      setPendingImport(null);
      setStatus({ text: `Could not import: ${msg(e)}`, error: true });
    } finally {
      setBusy(false);
    }
  }

  const button = "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-body-ui ctl text-on-surface-variant transition-colors disabled:opacity-40 disabled:pointer-events-none";

  return (
    <>
      <div className="set-row">
        <div className="min-w-0 flex-1 basis-64">
          <span className="set-title block">Move to another computer</span>
          <p className="set-desc">
            Save everything — bookmarks, notes, songs, slides and their pictures, themes and the service plan — to one file, then open it on the other computer. No account needed.
          </p>
          <div className="mt-2 space-y-1">
            <label className="flex items-center gap-2 font-body-ui text-[12px] text-on-surface">
              <input type="checkbox" checked={includeModules} onChange={(e) => setIncludeModules(e.target.checked)} disabled={busy} className="accent-primary" />
              Include Bible modules and Strong&apos;s data (makes the file larger)
            </label>
            <label className="flex items-center gap-2 font-body-ui text-[12px] text-on-surface">
              <input type="checkbox" checked={includeVideos} onChange={(e) => setIncludeVideos(e.target.checked)} disabled={busy} className="accent-primary" />
              Include theme background videos (can be very large)
            </label>
          </div>
        </div>
        <button onClick={() => void exportFile()} disabled={busy} className={button}>
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">upload_file</span>
          Save to file…
        </button>
      </div>

      <div className="set-row">
        <div className="min-w-0 flex-1 basis-64">
          <span className="set-title block">Open a backup file</span>
          <p className="set-desc">Replaces everything on this computer with what is in the file, then restarts the app. Nothing is merged: whatever is here now is overwritten.</p>
          {pendingImport && (
            <div role="alertdialog" aria-label="Confirm import" className="mt-2 rounded-md border border-error/40 p-3">
              <p className="font-body-ui text-[12px] text-on-surface">
                Replace everything on this computer with <span className="font-medium">{pendingImport.split(/[\\/]/).pop()}</span>? This cannot be undone. Save a backup first if you may want what is here.
              </p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => void confirmImport()} disabled={busy} className="px-3 py-1 rounded-md text-[12px] font-body-ui bg-error text-on-error disabled:opacity-40">Replace everything</button>
                <button onClick={() => setPendingImport(null)} disabled={busy} className={button}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        <button onClick={() => void chooseImport()} disabled={busy || pendingImport !== null} className={button}>
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">file_open</span>
          Open a file…
        </button>
      </div>

      {status && (
        <p role={status.error ? "alert" : "status"} className={`px-6 py-2 font-body-ui text-[12px] ${status.error ? "text-error" : "text-on-surface-variant"}`}>
          {status.text}
        </p>
      )}
    </>
  );
}
