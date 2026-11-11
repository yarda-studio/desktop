import type { OrgMember } from "../orgs/api.ts";
import type { VerseRef } from "../../store/app.ts";

export type ShareTarget =
  | { type: "all" }
  | { type: "member"; userId: string; name: string };

export interface TeamScripturePayload {
  id: string;
  orgId: string;
  senderId: string;
  senderName: string;
  recipientId: string | null; // null = entire team
  book: string;
  chapter: number;
  verse: number;
  verseEnd?: number;
  module: string | null;
  text: string;
  note?: string;
  createdAt: string;
}

export interface TeamScriptureNotification extends TeamScripturePayload {
  handled?: "live" | "schedule";
}

/** Formats a user-friendly label for a target: "Entire Team", "Pastor David", or email. */
export function formatShareTarget(target: ShareTarget, members: OrgMember[] = []): string {
  if (target.type === "all") return "Entire Team";
  const member = members.find((m) => m.user_id === target.userId);
  if (member) {
    return member.full_name?.trim() || member.email?.split("@")[0] || target.name || "Team Member";
  }
  return target.name || "Team Member";
}

/** Resolves display name for a sender. */
export function resolveSenderName(senderId: string, currentUserId: string | null, members: OrgMember[] = []): string {
  if (currentUserId && senderId === currentUserId) return "You";
  const m = members.find((x) => x.user_id === senderId);
  if (m) {
    return m.full_name?.trim() || m.email?.split("@")[0] || "Team Member";
  }
  return "Team Member";
}

/** Formats a scripture reference label, including range if present: "John 3:16" or "Romans 8:28-30". */
export function formatScriptureRefLabel(book: string, chapter: number, verse: number, verseEnd?: number): string {
  if (verseEnd && verseEnd > verse) {
    return `${book} ${chapter}:${verse}–${verseEnd}`;
  }
  return `${book} ${chapter}:${verse}`;
}

/** Determines if an incoming notification is intended for the current user. */
export function isTargetForUser(notification: TeamScripturePayload, currentUserId: string | null): boolean {
  if (!currentUserId) return false;
  // If recipient is null, it's for everyone
  if (!notification.recipientId) return true;
  return notification.recipientId === currentUserId;
}

/** Formats relative time for notification badges: "just now", "1m ago", etc. */
export function formatRelativeTime(dateStr: string, now: Date = new Date()): string {
  const d = new Date(dateStr);
  const diffSec = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}

/** Validates that a verse share payload has valid bounds. */
export function isValidVerseRef(ref: Partial<VerseRef>): boolean {
  return (
    typeof ref.book === "string" &&
    ref.book.trim().length > 0 &&
    typeof ref.chapter === "number" &&
    ref.chapter > 0 &&
    typeof ref.verse === "number" &&
    ref.verse > 0
  );
}
