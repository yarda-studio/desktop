import { getSupabase } from "../../lib/supabase.ts";

export interface OrgDetails {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
  seat_limit: number;
  status: "active" | "grace" | "suspended";
  quota_mode: "per_seat" | "pooled";
  grace_until: string | null;
  created_at: string;
}

export interface OrgMember {
  user_id: string;
  org_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  joined_at: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface OrgInvite {
  id: string;
  org_id: string;
  email: string | null;
  role: "admin" | "member" | "viewer";
  created_at: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  created_by: string;
}

export interface OrgAuditEntry {
  id: number;
  org_id: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface OrgBillingInfo {
  plan: string;
  status: string;
  seats: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to perform this action.",
  no_seats: "No seats available. Please add seats before inviting or joining.",
  invalid_invite: "This invite code is invalid, expired, or has already reached its usage limit.",
  already_member: "You are already a member of this organization.",
  org_not_active: "This organization is not active or is past due.",
  org_read_only: "This organization is suspended and in read-only mode.",
  version_conflict: "This resource was modified by someone else. Please reload and try again.",
  sync_not_included: "Cloud sync is not included in your current plan.",
  owns_org_with_members: "You own an organization with members. Please transfer ownership or remove all members first.",
  invalid_name: "Please enter a valid organization name (2 to 80 characters).",
  org_limit_reached: "You can own a maximum of 3 organizations.",
  invalid_role: "Invalid role specified.",
  cannot_remove_owner: "The organization owner cannot be removed. Transfer ownership first.",
  invalid_target: "The new owner must be an existing member of the organization.",
  not_found: "The requested organization or resource was not found.",
};

export function formatOrgError(err: unknown): string {
  if (!err) return "An unexpected error occurred.";
  const msg = err instanceof Error ? err.message : String(err);
  for (const [code, friendly] of Object.entries(ERROR_MESSAGES)) {
    if (msg.includes(code)) return friendly;
  }
  return msg;
}

export async function createOrganization(name: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not connected.");

  const { data, error } = await supabase.rpc("create_organization", {
    p_name: name,
  });

  if (error) throw new Error(formatOrgError(error));
  return String(data);
}

export async function updateOrganization(
  orgId: string,
  name?: string,
  quotaMode?: "per_seat" | "pooled"
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not connected.");

  const { error } = await supabase.rpc("update_organization", {
    p_org: orgId,
    p_name: name ?? null,
    p_quota_mode: quotaMode ?? null,
  });

  if (error) throw new Error(formatOrgError(error));
}

export async function createOrgInvite(
  orgId: string,
  options: {
    email?: string;
    role?: "admin" | "member" | "viewer";
    maxUses?: number;
    expiresHours?: number;
  } = {}
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not connected.");

  const { data, error } = await supabase.rpc("create_org_invite", {
    p_org: orgId,
    p_email: options.email?.trim() || null,
    p_role: options.role || "member",
    p_max_uses: options.maxUses ?? 1,
    p_expires_hours: options.expiresHours ?? 168, // 7 days
  });

  if (error) throw new Error(formatOrgError(error));
  return String(data);
}

export async function revokeOrgInvite(inviteId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not connected.");

  const { error } = await supabase.rpc("revoke_org_invite", {
    p_invite: inviteId,
  });

  if (error) throw new Error(formatOrgError(error));
}

export async function acceptOrgInvite(token: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not connected.");

  const cleanToken = token.trim().replace(/^(?:yarda|scriptura):\/\/join\?token=/, "");
  const { data, error } = await supabase.rpc("accept_org_invite", {
    p_token: cleanToken,
  });

  if (error) throw new Error(formatOrgError(error));
  return String(data);
}

export async function setMemberRole(
  orgId: string,
  userId: string,
  role: "admin" | "member" | "viewer"
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not connected.");

  const { error } = await supabase.rpc("set_member_role", {
    p_org: orgId,
    p_user: userId,
    p_role: role,
  });

  if (error) throw new Error(formatOrgError(error));
}

export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not connected.");

  const { error } = await supabase.rpc("remove_org_member", {
    p_org: orgId,
    p_user: userId,
  });

  if (error) throw new Error(formatOrgError(error));
}

export async function transferOrgOwnership(orgId: string, newOwnerId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Database not connected.");

  const { error } = await supabase.rpc("transfer_org_ownership", {
    p_org: orgId,
    p_new_owner: newOwnerId,
  });

  if (error) throw new Error(formatOrgError(error));
}

export async function fetchOrgDetails(orgId: string): Promise<OrgDetails | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, owner_id, plan, seat_limit, status, quota_mode, grace_until, created_at")
    .eq("id", orgId)
    .maybeSingle();

  if (error || !data) return null;
  return data as OrgDetails;
}

export async function fetchOrgMembers(orgId: string): Promise<OrgMember[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("org_member_directory")
    .select("user_id, org_id, role, joined_at, email, full_name, avatar_url")
    .eq("org_id", orgId)
    .order("joined_at", { ascending: true });

  if (error || !data) return [];
  return data as OrgMember[];
}

export async function fetchOrgInvites(orgId: string): Promise<OrgInvite[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  // Don't select token_hash (restricted column)
  const { data, error } = await supabase
    .from("org_invites")
    .select("id, org_id, email, role, created_at, expires_at, max_uses, uses, created_by")
    .eq("org_id", orgId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as OrgInvite[];
}

export async function fetchOrgAudit(orgId: string): Promise<OrgAuditEntry[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("org_audit")
    .select("id, org_id, actor_id, action, target, metadata, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) return [];
  return data as OrgAuditEntry[];
}

export async function fetchOrgBilling(orgId: string): Promise<OrgBillingInfo | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status, seats, current_period_end, cancel_at_period_end")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as OrgBillingInfo;
}
