import { getSupabase } from "../../lib/supabase.ts";
import type { DirtySyncRecord, RemoteSyncRecord } from "../../lib/tauri.ts";

export interface SyncPushResult {
  accepted: number;
  rejected: number;
  next_cursor: number;
}

export interface SyncUsageResult {
  bytes: number;
}

export interface BackupItem {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  size: number;
}

export async function fetchRemoteSyncRecords(cursor: number): Promise<RemoteSyncRecord[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("sync_records")
    .select("collection, record_id, data, deleted, client_updated_at, seq")
    .gt("seq", cursor)
    .order("seq", { ascending: true })
    .limit(500);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((row) => ({
    collection: row.collection,
    record_id: row.record_id,
    data: (row.data as Record<string, unknown>) || {},
    deleted: Boolean(row.deleted),
    client_updated_at: row.client_updated_at,
    seq: row.seq,
  }));
}

export async function pushSyncBatch(changes: DirtySyncRecord[]): Promise<SyncPushResult> {
  if (changes.length === 0) {
    return { accepted: 0, rejected: 0, next_cursor: 0 };
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data, error } = await supabase.rpc("sync_push", {
    p_changes: changes,
  });

  if (error) {
    throw new Error(error.message);
  }

  // sync_push returns table (accepted int, rejected int, next_cursor bigint)
  const row = Array.isArray(data) ? data[0] : data;
  return {
    accepted: Number(row?.accepted ?? 0),
    rejected: Number(row?.rejected ?? 0),
    next_cursor: Number(row?.next_cursor ?? 0),
  };
}

export async function fetchSyncUsage(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from("sync_usage")
    .select("bytes")
    .maybeSingle();

  if (error) {
    return 0;
  }
  return Number(data?.bytes ?? 0);
}

export async function uploadBackupZip(userId: string, bytes: Uint8Array): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${userId}/${timestamp}-yarda-backup.zip`;

  const { error } = await supabase.storage
    .from("backups")
    .upload(path, bytes, {
      contentType: "application/zip",
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }
  return path;
}

export async function listBackups(userId: string): Promise<BackupItem[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase.storage
    .from("backups")
    .list(userId, {
      limit: 20,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error || !data) {
    return [];
  }

  return data
    .filter((f) => f.name.endsWith(".zip"))
    .map((f) => ({
      id: f.id ?? f.name,
      name: f.name,
      created_at: f.created_at ?? "",
      updated_at: f.updated_at ?? "",
      size: (f.metadata?.size as number | undefined) ?? 0,
    }));
}

export async function downloadBackupZip(userId: string, filename: string): Promise<Uint8Array> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const path = `${userId}/${filename}`;
  const { data, error } = await supabase.storage.from("backups").download(path);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to download backup");
  }

  const arrayBuffer = await data.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function deleteBackupZip(userId: string, filename: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const path = `${userId}/${filename}`;
  const { error } = await supabase.storage.from("backups").remove([path]);
  if (error) {
    throw new Error(error.message);
  }
}
