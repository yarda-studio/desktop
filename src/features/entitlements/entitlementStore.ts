import { create } from "zustand";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { getSupabase } from "../../lib/supabase.ts";
import {
  fetchEntitlements,
  createCheckout,
  createPortalSession,
  FREE_ENTITLEMENTS,
  type Entitlements,
  type OrgSummary,
} from "./api.ts";

interface EntitlementState {
  entitlements: Entitlements;
  loading: boolean;
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
  has: (feature: string) => boolean;
  openCheckout: (plan: "pro" | "team", orgId?: string, seats?: number) => Promise<void>;
  openPortal: (orgId?: string) => Promise<void>;

  // Direct getters for convenience
  plan: string;
  source: "personal" | "org";
  orgs: OrgSummary[];
}

let listenerAttached = false;

export const useEntitlementStore = create<EntitlementState>()((set, get) => ({
  entitlements: FREE_ENTITLEMENTS,
  loading: false,
  error: null,
  plan: "free",
  source: "personal",
  orgs: [],

  has: (feature: string) => {
    return Boolean(get().entitlements.features?.[feature]);
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const ent = await fetchEntitlements();
      set({
        entitlements: ent,
        plan: ent.plan,
        source: ent.source,
        orgs: ent.orgs,
        loading: false,
      });
    } catch (e) {
      set({
        entitlements: FREE_ENTITLEMENTS,
        plan: "free",
        source: "personal",
        orgs: [],
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load entitlements",
      });
    }
  },

  openCheckout: async (plan: "pro" | "team", orgId?: string, seats?: number) => {
    const url = await createCheckout({ plan, org_id: orgId, seats });
    try {
      await shellOpen(url);
    } catch {
      window.open(url, "_blank");
    }
  },

  openPortal: async (orgId?: string) => {
    const url = await createPortalSession(orgId);
    try {
      await shellOpen(url);
    } catch {
      window.open(url, "_blank");
    }
  },
}));

/**
 * Initializes listeners for window focus and auth state changes to reload entitlements automatically.
 * Safe to call multiple times.
 */
export function initEntitlementSync() {
  if (listenerAttached || typeof window === "undefined") return;
  listenerAttached = true;

  // Reload when window regains focus (e.g. returning from checkout in system browser)
  window.addEventListener("focus", () => {
    void useEntitlementStore.getState().refresh();
  });

  // Supabase auth change listener
  const supabase = getSupabase();
  if (supabase) {
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        void useEntitlementStore.getState().refresh();
      } else {
        useEntitlementStore.setState({
          entitlements: FREE_ENTITLEMENTS,
          plan: "free",
          source: "personal",
          orgs: [],
        });
      }
    });
  }

  // Initial load
  void useEntitlementStore.getState().refresh();
}
