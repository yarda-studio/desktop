import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "../../lib/supabase.ts";
import type { OrgMember } from "../orgs/api.ts";
import { resolveSenderName, teamVerseChannelTopic, type TeamScripturePayload } from "./teamShareLogic.ts";

export interface SendVerseParams {
  orgId: string;
  senderId: string;
  senderName: string;
  recipientId: string | null;
  book: string;
  chapter: number;
  verse: number;
  verseEnd?: number;
  module: string | null;
  text: string;
  note?: string;
  /** Existing subscribed private channel for `orgId`, if already open in the store. */
  existingChannel?: RealtimeChannel | null;
}

/** Sends a scripture share via private Supabase Realtime broadcast and database insert. */
export async function sendScriptureShare(params: SendVerseParams): Promise<TeamScripturePayload> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const payload: TeamScripturePayload = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `share-${Date.now()}`,
    orgId: params.orgId,
    senderId: params.senderId,
    senderName: params.senderName,
    recipientId: params.recipientId,
    book: params.book,
    chapter: params.chapter,
    verse: params.verse,
    verseEnd: params.verseEnd,
    module: params.module,
    text: params.text,
    note: params.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  // 1. Broadcast immediately on the private org channel (ultra-low latency)
  const ownsTempChannel = !params.existingChannel;
  const channel =
    params.existingChannel ??
    supabase.channel(teamVerseChannelTopic(params.orgId), {
      config: { private: true },
    });
  try {
    await supabase.realtime.setAuth().catch((err: unknown) => {
      console.warn("[teamShare] could not refresh realtime auth; private broadcast may be rejected:", err);
    });
    await channel.send({
      type: "broadcast",
      event: "scripture_share",
      payload,
    });
  } catch (err) {
    console.warn("[teamShare] broadcast failed, relying on db sync:", err);
  } finally {
    if (ownsTempChannel) {
      await supabase.removeChannel(channel).catch(() => {});
    }
  }

  // 2. Persist to team_scripture_shares table if it exists (for durability & history)
  try {
    const { data, error } = await supabase.from("team_scripture_shares").insert({
      id: payload.id,
      org_id: payload.orgId,
      sender_id: payload.senderId,
      recipient_id: payload.recipientId,
      book: payload.book,
      chapter: payload.chapter,
      verse: payload.verse,
      verse_end: payload.verseEnd ?? null,
      module: payload.module,
      text: payload.text,
      note: payload.note ?? null,
      created_at: payload.createdAt,
    }).select("id").maybeSingle();

    if (error) {
      console.warn("[teamShare] table insert warning (broadcast still delivered):", error.message);
    } else if (data?.id) {
      payload.id = data.id;
    }
  } catch (e) {
    console.warn("[teamShare] db insert fallback ignored:", e);
  }

  return payload;
}

/** Fetches recent scripture shares for the organization. */
export async function fetchRecentScriptureShares(
  orgId: string,
  limit = 20,
  members: OrgMember[] = [],
  currentUserId: string | null = null,
): Promise<TeamScripturePayload[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("team_scripture_shares")
      .select("id, org_id, sender_id, recipient_id, book, chapter, verse, verse_end, module, text, note, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.id,
      orgId: row.org_id,
      senderId: row.sender_id,
      senderName: resolveSenderName(row.sender_id, currentUserId, members),
      recipientId: row.recipient_id,
      book: row.book,
      chapter: row.chapter,
      verse: row.verse,
      verseEnd: row.verse_end ?? undefined,
      module: row.module,
      text: row.text,
      note: row.note ?? undefined,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}
