import React, { useEffect, useState } from "react";
import { api } from "../../lib/tauri.ts";
import { getSupabase } from "../../lib/supabase.ts";
import { useEntitlementStore } from "../entitlements/entitlementStore.ts";
import {
  BackupItem,
  deleteBackupZip,
  downloadBackupZip,
  listBackups,
  uploadBackupZip,
} from "./api.ts";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const BackupsPanel: React.FC = () => {
  const { has } = useEntitlementStore();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const fetchList = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    try {
      const items = await listBackups(user.id);
      setBackups(items);
    } catch (e) {
      console.error("Failed to load backups:", e);
    }
  };

  useEffect(() => {
    if (has("sync")) {
      void fetchList();
    }
  }, [has]);

  if (!has("sync")) {
    return null;
  }

  const handleBackupNow = async () => {
    setLoading(true);
    setActionMessage("Creating backup archive…");
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Supabase is not configured");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const zipBytes = await api.createBackupZip();
      setActionMessage("Uploading backup to cloud storage…");
      await uploadBackupZip(user.id, new Uint8Array(zipBytes));

      setActionMessage("Backup completed successfully.");
      await fetchList();
      setTimeout(() => setActionMessage(null), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionMessage(`Backup failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (filename: string) => {
    setLoading(true);
    setActionMessage("Downloading backup…");
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Supabase is not configured");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const bytes = await downloadBackupZip(user.id, filename);
      setActionMessage("Restoring database from backup…");
      await api.restoreBackupZip(Array.from(bytes));

      setActionMessage("Restore complete. Data has been reloaded.");
      setConfirmRestore(null);
      setTimeout(() => setActionMessage(null), 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionMessage(`Restore failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    try {
      await deleteBackupZip(user.id, filename);
      await fetchList();
    } catch (e) {
      console.error("Failed to delete backup:", e);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Cloud Backups
          </h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Full snapshots of your Bible study database, songs, and presentation slides.
          </p>
        </div>
        <button
          disabled={loading}
          onClick={() => void handleBackupNow()}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-sm"
        >
          {loading ? "Backing up…" : "Back up now"}
        </button>
      </div>

      {actionMessage && (
        <div className="mb-4 text-xs font-medium px-3 py-2 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
          {actionMessage}
        </div>
      )}

      {confirmRestore && (
        <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 text-xs">
          <div className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
            Confirm Restore
          </div>
          <p className="text-amber-700 dark:text-amber-300 mb-3">
            Restoring from this backup will replace current local bookmarks, notes, songs, and
            slides with the backup snapshot. Continue?
          </p>
          <div className="flex gap-2">
            <button
              disabled={loading}
              onClick={() => void handleRestore(confirmRestore)}
              className="px-2.5 py-1 rounded bg-amber-600 text-white font-medium hover:bg-amber-500"
            >
              Confirm Restore
            </button>
            <button
              disabled={loading}
              onClick={() => setConfirmRestore(null)}
              className="px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {backups.length === 0 ? (
        <div className="text-xs text-zinc-500 dark:text-zinc-400 py-3 text-center border-t border-zinc-100 dark:border-zinc-800">
          No cloud backups yet. Click &quot;Back up now&quot; to create a restore point.
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border-t border-zinc-100 dark:border-zinc-800">
          {backups.slice(0, 10).map((b) => (
            <div key={b.name} className="py-2.5 flex items-center justify-between text-xs">
              <div>
                <div className="font-medium text-zinc-800 dark:text-zinc-200">
                  {new Date(b.created_at).toLocaleString()}
                </div>
                <div className="text-zinc-500 text-[11px]">{formatBytes(b.size)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={loading}
                  onClick={() => setConfirmRestore(b.name)}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                >
                  Restore
                </button>
                <button
                  disabled={loading}
                  onClick={() => void handleDelete(b.name)}
                  className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400"
                  title="Delete backup"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
