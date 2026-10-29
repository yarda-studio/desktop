import { getSupabase } from "../../lib/supabase.ts";

export type ResourceKind =
  | "service_plan"
  | "song"
  | "slide_deck"
  | "theme"
  | "note"
  | "media_ref";

export interface OrgResource {
  id: string;
  org_id: string;
  kind: ResourceKind;
  title: string;
  data: Record<string, unknown>;
  version: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export async function fetchOrgResources(
  orgId: string,
  kind?: ResourceKind
): Promise<OrgResource[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase
    .from("org_resources")
    .select(
      "id, org_id, kind, title, data, version, created_by, updated_by, created_at, updated_at, deleted"
    )
    .eq("org_id", orgId)
    .eq("deleted", false)
    .order("updated_at", { ascending: false });

  if (kind) {
    query = query.eq("kind", kind);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((r) => ({
    id: r.id,
    org_id: r.org_id,
    kind: r.kind as ResourceKind,
    title: r.title,
    data: (r.data as Record<string, unknown>) || {},
    version: r.version,
    created_by: r.created_by,
    updated_by: r.updated_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted: r.deleted,
  }));
}

export async function saveOrgResource(
  orgId: string,
  id: string | null,
  kind: ResourceKind,
  title: string,
  data: Record<string, unknown>,
  expectedVersion = 0
): Promise<{ id: string; version: number }> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data: res, error } = await supabase.rpc("org_resource_save", {
    p_org: orgId,
    p_id: id,
    p_kind: kind,
    p_title: title,
    p_data: data,
    p_expected_version: expectedVersion,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(res) ? res[0] : res;
  return {
    id: row.id,
    version: Number(row.version),
  };
}

export async function deleteOrgResource(orgId: string, id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { error } = await supabase.rpc("org_resource_delete", {
    p_org: orgId,
    p_id: id,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function uploadOrgMedia(orgId: string, file: File): Promise<string> {
  // 50 MB limit enforced on client before network call
  const MAX_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    throw new Error("File exceeds 50 MB team media limit.");
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const ext = file.name.split(".").pop() || "bin";
  const uuid = crypto.randomUUID();
  const path = `${orgId}/${uuid}.${ext}`;

  const { error } = await supabase.storage.from("org-media").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }
  return path;
}

export async function getOrgMediaSignedUrl(path: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  // 1-hour signed URL for secure playback
  const { data, error } = await supabase.storage
    .from("org-media")
    .createSignedUrl(path, 3600);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create media URL");
  }
  return data.signedUrl;
}
