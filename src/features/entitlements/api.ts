import { getSupabase } from "../../lib/supabase.ts";

export interface OrgSummary {
  id: string;
  name: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "active" | "grace" | "suspended";
  plan: string;
  seat_limit: number;
  grace_until: string | null;
  members: number;
}

export interface Entitlements {
  plan: string;
  source: "personal" | "org";
  org_id: string | null;
  daily_searches: number;
  pooled: boolean;
  features: Record<string, boolean>;
  sync_storage_mb: number;
  sync_used_bytes: number;
  orgs: OrgSummary[];
}

export const FREE_ENTITLEMENTS: Entitlements = {
  plan: "free",
  source: "personal",
  org_id: null,
  daily_searches: 50,
  pooled: false,
  features: {},
  sync_storage_mb: 0,
  sync_used_bytes: 0,
  orgs: [],
};

/**
 * Fetches user entitlements via the `my_entitlements` Postgres RPC.
 * Falls back safely to FREE_ENTITLEMENTS if unauthenticated, offline, or build has no Supabase.
 */
export async function fetchEntitlements(): Promise<Entitlements> {
  const supabase = getSupabase();
  if (!supabase) return FREE_ENTITLEMENTS;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) {
      return FREE_ENTITLEMENTS;
    }

    const { data, error } = await supabase.rpc("my_entitlements");
    if (error || !data || typeof data !== "object") {
      return FREE_ENTITLEMENTS;
    }

    const raw = data as any;
    return {
      plan: String(raw.plan ?? "free"),
      source: raw.source === "org" ? "org" : "personal",
      org_id: raw.org_id ? String(raw.org_id) : null,
      daily_searches: Number(raw.daily_searches) || 50,
      pooled: Boolean(raw.pooled),
      features: raw.features && typeof raw.features === "object" ? raw.features : {},
      sync_storage_mb: Number(raw.sync_storage_mb) || 0,
      sync_used_bytes: Number(raw.sync_used_bytes) || 0,
      orgs: Array.isArray(raw.orgs) ? raw.orgs : [],
    };
  } catch {
    return FREE_ENTITLEMENTS;
  }
}

/**
 * Requests a hosted checkout session URL for purchasing or upgrading to Pro or Team.
 */
export async function createCheckout(params: {
  plan: "pro" | "team";
  org_id?: string;
  seats?: number;
}): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.functions.invoke("billing-checkout", {
    body: params,
  });

  if (error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      const body = await ctx.json().catch(() => null);
      if (body?.message) throw new Error(body.message);
    }
    throw new Error(error.message || "Failed to start checkout.");
  }

  const url = (data as { checkout_url?: string })?.checkout_url;
  if (!url) throw new Error("No checkout URL returned from server.");
  return url;
}

/**
 * Requests customer portal URL for changing payment method, invoices or cancelling.
 */
export async function createPortalSession(orgId?: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.functions.invoke("billing-portal", {
    body: orgId ? { org_id: orgId } : {},
  });

  if (error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      const body = await ctx.json().catch(() => null);
      if (body?.message) throw new Error(body.message);
    }
    throw new Error(error.message || "Failed to open customer portal.");
  }

  const url = (data as { portal_url?: string })?.portal_url;
  if (!url) throw new Error("No portal URL returned from server.");
  return url;
}
