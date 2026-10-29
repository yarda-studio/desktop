import React from "react";
import { useSharedLibraryStore } from "./sharedLibraryStore.ts";

export const ConflictDialog: React.FC = () => {
  const { conflict, resolveConflict, clearConflict } = useSharedLibraryStore();

  if (!conflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-400">
          <span className="material-symbols-outlined text-[24px]">sync_problem</span>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Version Conflict
          </h3>
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
          &ldquo;{conflict.title}&rdquo; was modified by another team member while you were
          editing. How would you like to resolve this conflict?
        </p>

        <div className="space-y-3 mb-6">
          <button
            onClick={() => void resolveConflict("reload")}
            className="w-full text-left p-4 rounded-lg border-2 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
          >
            <div className="font-medium text-indigo-950 dark:text-indigo-200 mb-0.5">
              Reload (Keep remote changes)
            </div>
            <div className="text-xs text-indigo-700/80 dark:text-indigo-300/80">
              Discards your local edits and loads the latest version saved by your team.
            </div>
          </button>

          <button
            onClick={() => void resolveConflict("overwrite")}
            className="w-full text-left p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <div className="font-medium text-zinc-900 dark:text-zinc-100 mb-0.5">
              Keep Mine (Overwrite remote)
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Saves your local version and bumps the team version to overwrite remote edits.
            </div>
          </button>
        </div>

        <div className="flex justify-end">
          <button
            onClick={clearConflict}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
