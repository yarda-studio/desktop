import { create } from "zustand";
import { getSupabase } from "../../lib/supabase.ts";
import {
  deleteOrgResource,
  fetchOrgResources,
  saveOrgResource,
  type OrgResource,
  type ResourceKind,
} from "./api.ts";

export interface ConflictState {
  resourceId: string | null;
  orgId: string;
  kind: ResourceKind;
  title: string;
  data: Record<string, unknown>;
  latestVersion: number;
}

export interface SharedLibraryState {
  resources: Record<string, OrgResource>;
  loading: boolean;
  error: string | null;
  activeFilter: ResourceKind | "all";
  conflict: ConflictState | null;
  isOffline: boolean;

  setFilter: (kind: ResourceKind | "all") => void;
  loadResources: (orgId: string) => Promise<void>;
  saveResource: (
    orgId: string,
    id: string | null,
    kind: ResourceKind,
    title: string,
    data: Record<string, unknown>,
    expectedVersion?: number
  ) => Promise<void>;
  deleteResource: (orgId: string, id: string) => Promise<void>;
  resolveConflict: (resolution: "reload" | "overwrite") => Promise<void>;
  clearConflict: () => void;
  subscribeRealtime: (orgId: string) => () => void;
}

function getLocalCacheKey(orgId: string): string {
  return `scriptura.shared_library.${orgId}`;
}

function loadFromLocalCache(orgId: string): Record<string, OrgResource> {
  try {
    const raw = localStorage.getItem(getLocalCacheKey(orgId));
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Ignore cache parse errors
  }
  return {};
}

function saveToLocalCache(orgId: string, resources: Record<string, OrgResource>): void {
  try {
    localStorage.setItem(getLocalCacheKey(orgId), JSON.stringify(resources));
  } catch {
    // Ignore storage quota errors
  }
}

export const useSharedLibraryStore = create<SharedLibraryState>((set, get) => ({
  resources: {},
  loading: false,
  error: null,
  activeFilter: "all",
  conflict: null,
  isOffline: false,

  setFilter: (kind) => set({ activeFilter: kind }),

  loadResources: async (orgId: string) => {
    set({ loading: true, error: null });

    // 1. Immediately load from offline cache for instant render
    const cached = loadFromLocalCache(orgId);
    if (Object.keys(cached).length > 0) {
      set({ resources: cached });
    }

    try {
      const items = await fetchOrgResources(orgId);
      const dict: Record<string, OrgResource> = {};
      for (const item of items) {
        dict[item.id] = item;
      }
      set({ resources: dict, loading: false, isOffline: false });
      saveToLocalCache(orgId, dict);
    } catch (err: unknown) {
      // Degrade gracefully to offline using cached copy
      const msg = err instanceof Error ? err.message : String(err);
      set({
        loading: false,
        isOffline: true,
        error: `Offline — using local copy (${msg})`,
      });
    }
  },

  saveResource: async (
    orgId: string,
    id: string | null,
    kind: ResourceKind,
    title: string,
    data: Record<string, unknown>,
    expectedVersion = 0
  ) => {
    set({ error: null });
    try {
      const res = await saveOrgResource(
        orgId,
        id,
        kind,
        title,
        data,
        expectedVersion
      );

      // Update local state optimistically
      const resources = { ...get().resources };
      const current = id ? resources[id] : null;
      const updated: OrgResource = {
        id: res.id,
        org_id: orgId,
        kind,
        title,
        data,
        version: res.version,
        created_by: current?.created_by ?? "",
        updated_by: "",
        created_at: current?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted: false,
      };
      resources[res.id] = updated;
      set({ resources, isOffline: false });
      saveToLocalCache(orgId, resources);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("version_conflict")) {
        // Fetch latest version for conflict resolution
        const currentItems = await fetchOrgResources(orgId, kind).catch(() => []);
        const latest = currentItems.find((r) => r.id === id);
        set({
          conflict: {
            resourceId: id,
            orgId,
            kind,
            title,
            data,
            latestVersion: latest?.version ?? expectedVersion + 1,
          },
        });
      } else {
        set({ error: msg });
        throw err;
      }
    }
  },

  deleteResource: async (orgId: string, id: string) => {
    try {
      await deleteOrgResource(orgId, id);
      const resources = { ...get().resources };
      delete resources[id];
      set({ resources });
      saveToLocalCache(orgId, resources);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      throw err;
    }
  },

  resolveConflict: async (resolution: "reload" | "overwrite") => {
    const { conflict, loadResources, saveResource } = get();
    if (!conflict) return;

    if (resolution === "reload") {
      // Overwrite local with remote
      await loadResources(conflict.orgId);
      set({ conflict: null });
    } else {
      // Overwrite remote with local changes by passing latestVersion
      const { orgId, resourceId, kind, title, data, latestVersion } = conflict;
      set({ conflict: null });
      await saveResource(orgId, resourceId, kind, title, data, latestVersion);
    }
  },

  clearConflict: () => set({ conflict: null }),

  subscribeRealtime: (orgId: string) => {
    const supabase = getSupabase();
    if (!supabase) return () => {};

    const channel = supabase
      .channel(`org_resources:${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "org_resources",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const row = payload.new as OrgResource | undefined;
          const old = payload.old as { id: string } | undefined;
          const current = { ...get().resources };

          if (payload.eventType === "DELETE" && old?.id) {
            delete current[old.id];
          } else if (row) {
            if (row.deleted) {
              delete current[row.id];
            } else {
              current[row.id] = row;
            }
          }

          set({ resources: current, isOffline: false });
          saveToLocalCache(orgId, current);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
}));
