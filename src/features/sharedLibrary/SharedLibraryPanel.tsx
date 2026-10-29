import React, { useEffect, useState, useRef } from "react";
import { useOrgStore } from "../orgs/orgStore.ts";
import { useEntitlementStore } from "../entitlements/entitlementStore.ts";
import { useSharedLibraryStore } from "./sharedLibraryStore.ts";
import { type ResourceKind, uploadOrgMedia } from "./api.ts";
import { ConflictDialog } from "./ConflictDialog.tsx";

const KIND_LABELS: Record<ResourceKind | "all", string> = {
  all: "All",
  service_plan: "Service Plans",
  song: "Songs",
  slide_deck: "Slide Decks",
  theme: "Themes",
  note: "Notes",
  media_ref: "Media",
};

const KIND_ICONS: Record<ResourceKind, string> = {
  service_plan: "event_note",
  song: "music_note",
  slide_deck: "slideshow",
  theme: "palette",
  note: "description",
  media_ref: "movie",
};

export const SharedLibraryPanel: React.FC = () => {
  const { currentOrgId } = useOrgStore();
  const { has } = useEntitlementStore();
  const {
    resources,
    loading,
    error,
    activeFilter,
    isOffline,
    setFilter,
    loadResources,
    saveResource,
    deleteResource,
    subscribeRealtime,
  } = useSharedLibraryStore();

  const [search, setSearch] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<ResourceKind>("service_plan");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentOrgId && has("shared_library")) {
      void loadResources(currentOrgId);
      const unsub = subscribeRealtime(currentOrgId);
      return () => unsub();
    }
  }, [currentOrgId, has, loadResources, subscribeRealtime]);

  if (!has("shared_library") || !currentOrgId) {
    return null;
  }

  const items = Object.values(resources).filter((r) => {
    if (activeFilter !== "all" && r.kind !== activeFilter) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleCreate = async () => {
    if (!newTitle.trim() || !currentOrgId) return;
    try {
      await saveResource(currentOrgId, null, newKind, newTitle.trim(), {});
      setNewTitle("");
      setShowCreateModal(false);
    } catch (e) {
      console.error("Failed to create resource:", e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrgId) return;

    setUploading(true);
    setUploadError(null);
    try {
      const path = await uploadOrgMedia(currentOrgId, file);
      await saveResource(currentOrgId, null, "media_ref", file.name, {
        path,
        size: file.size,
        mime: file.type,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900 shadow-sm mt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Team Shared Library
          </h4>
          {isOffline && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Offline — using local copy
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => void handleFileUpload(e)}
            className="hidden"
            accept="image/*,video/*,audio/*"
          />
          <button
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {uploading ? "Uploading…" : "Upload Media"}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-sm"
          >
            New Item
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="mb-3 text-xs font-medium px-3 py-2 rounded-md bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {uploadError}
        </div>
      )}

      {error && !isOffline && (
        <div className="mb-3 text-xs font-medium px-3 py-2 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {error}
        </div>
      )}

      {/* Tabs and search */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex flex-wrap gap-1">
          {(Object.keys(KIND_LABELS) as (ResourceKind | "all")[]).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                activeFilter === k
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter resources…"
          className="px-2.5 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-48"
        />
      </div>

      {/* Resource list */}
      {loading && items.length === 0 ? (
        <div className="text-xs text-zinc-400 py-6 text-center">Loading shared resources…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-zinc-400 py-6 text-center">
          No shared resources found. Click &quot;New Item&quot; or &quot;Upload Media&quot; to add content.
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {items.map((r) => (
            <div
              key={r.id}
              className="py-2.5 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/40 px-2 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-zinc-400">
                  {KIND_ICONS[r.kind] || "folder"}
                </span>
                <div>
                  <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                    <span>{r.title}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded">
                      v{r.version}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {KIND_LABELS[r.kind]} • {new Date(r.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => void deleteResource(currentOrgId, r.id)}
                  className="text-zinc-400 hover:text-red-500 text-xs px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  title="Delete from team"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Resource Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
              Add Shared Resource
            </h4>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1 block">
                  Resource Type
                </label>
                <select
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as ResourceKind)}
                  className="w-full text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-zinc-800 dark:text-zinc-200"
                >
                  <option value="service_plan">Service Plan</option>
                  <option value="song">Song</option>
                  <option value="slide_deck">Slide Deck</option>
                  <option value="theme">Theme</option>
                  <option value="note">Study Note</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1 block">
                  Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Sunday Morning Worship"
                  className="w-full text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent p-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
              >
                Cancel
              </button>
              <button
                disabled={!newTitle.trim()}
                onClick={() => void handleCreate()}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <ConflictDialog />
    </div>
  );
};
