import React from "react";
import { useSyncStore } from "./syncStore.ts";
import { syncNow } from "./syncEngine.ts";
import { useEntitlementStore } from "../entitlements/entitlementStore.ts";

function formatTimeAgo(date: Date | null): string {
  if (!date) return "Never";
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return date.toLocaleDateString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const SyncStatusPill: React.FC = () => {
  const { has } = useEntitlementStore();
  const { status, lastSyncedAt, storageUsedBytes, storageLimitBytes, errorMessage } =
    useSyncStore();

  if (!has("sync")) {
    return null;
  }

  const handleClick = () => {
    if (status !== "syncing") {
      void syncNow();
    }
  };

  const isFull = storageUsedBytes >= storageLimitBytes && storageLimitBytes > 0;

  return (
    <button
      onClick={handleClick}
      title={
        errorMessage ||
        `Cloud Sync: ${status}. Storage: ${formatBytes(storageUsedBytes)} / ${formatBytes(
          storageLimitBytes
        )}. Click to sync now.`
      }
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
        status === "syncing"
          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
          : status === "quota_exceeded" || isFull
          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
          : status === "offline"
          ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === "syncing"
            ? "bg-blue-500 animate-pulse"
            : status === "quota_exceeded" || isFull
            ? "bg-amber-500"
            : status === "offline"
            ? "bg-zinc-400"
            : "bg-emerald-500"
        }`}
      />
      <span>
        {status === "syncing"
          ? "Syncing…"
          : status === "quota_exceeded" || isFull
          ? `Storage full (${formatBytes(storageUsedBytes)})`
          : status === "offline"
          ? "Offline"
          : `Synced ${formatTimeAgo(lastSyncedAt)}`}
      </span>
    </button>
  );
};
