import React, { useState } from "react";
import { useSyncStore } from "./syncStore.ts";
import { api } from "../../lib/tauri.ts";
import { syncNow } from "./syncEngine.ts";

export const FirstDevicePrompt: React.FC = () => {
  const { showMergePrompt, setShowMergePrompt } = useSyncStore();
  const [loading, setLoading] = useState(false);

  if (!showMergePrompt) {
    return null;
  }

  const handleChoice = async (replaceWithCloud: boolean) => {
    setLoading(true);
    try {
      await api.resetLocalSyncState(replaceWithCloud);
      setShowMergePrompt(false);
      await syncNow();
    } catch (e) {
      console.error("Failed to apply sync choice:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          Sync Existing Data
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
          This device already contains local Bible study notes and bookmarks. How would you like to
          set up Cloud Sync?
        </p>

        <div className="space-y-3 mb-6">
          <button
            disabled={loading}
            onClick={() => void handleChoice(false)}
            className="w-full text-left p-4 rounded-lg border-2 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 hover:bg-indigo-50 transition-colors"
          >
            <div className="font-medium text-indigo-950 dark:text-indigo-200 mb-0.5">
              Merge this device with cloud (Recommended)
            </div>
            <div className="text-xs text-indigo-700/80 dark:text-indigo-300/80">
              Combines your local bookmarks, notes, and preferences with your cloud library.
            </div>
          </button>

          <button
            disabled={loading}
            onClick={() => void handleChoice(true)}
            className="w-full text-left p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="font-medium text-zinc-900 dark:text-zinc-100 mb-0.5">
              Replace this device with cloud data
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Clears local data on this computer and downloads your exact cloud library.
            </div>
          </button>
        </div>

        <div className="flex justify-end">
          <button
            disabled={loading}
            onClick={() => setShowMergePrompt(false)}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Ask me later
          </button>
        </div>
      </div>
    </div>
  );
};
