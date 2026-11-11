import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatShareTarget,
  resolveSenderName,
  formatScriptureRefLabel,
  isTargetForUser,
  formatRelativeTime,
  isValidVerseRef,
  type ShareTarget,
} from "./teamShareLogic.ts";
import type { OrgMember } from "../orgs/api.ts";

describe("teamShareLogic", () => {
  const dummyMembers: OrgMember[] = [
    {
      user_id: "user-1",
      org_id: "org-1",
      role: "owner",
      joined_at: new Date().toISOString(),
      email: "pastor@church.org",
      full_name: "Pastor David",
      avatar_url: null,
    },
    {
      user_id: "user-2",
      org_id: "org-1",
      role: "member",
      joined_at: new Date().toISOString(),
      email: "tech@church.org",
      full_name: null,
      avatar_url: null,
    },
  ];

  it("formatShareTarget formats 'all' target as Entire Team", () => {
    const target: ShareTarget = { type: "all" };
    assert.equal(formatShareTarget(target, dummyMembers), "Entire Team");
  });

  it("formatShareTarget resolves member name or fallback email", () => {
    const target1: ShareTarget = { type: "member", userId: "user-1", name: "David" };
    assert.equal(formatShareTarget(target1, dummyMembers), "Pastor David");

    const target2: ShareTarget = { type: "member", userId: "user-2", name: "Tech" };
    assert.equal(formatShareTarget(target2, dummyMembers), "tech");

    const target3: ShareTarget = { type: "member", userId: "user-unknown", name: "Guest" };
    assert.equal(formatShareTarget(target3, dummyMembers), "Guest");
  });

  it("resolveSenderName resolves sender properly", () => {
    assert.equal(resolveSenderName("user-1", "user-1", dummyMembers), "You");
    assert.equal(resolveSenderName("user-1", "user-2", dummyMembers), "Pastor David");
    assert.equal(resolveSenderName("user-2", "user-1", dummyMembers), "tech");
    assert.equal(resolveSenderName("user-unknown", "user-1", dummyMembers), "Team Member");
  });

  it("formatScriptureRefLabel formats single verses and ranges", () => {
    assert.equal(formatScriptureRefLabel("John", 3, 16), "John 3:16");
    assert.equal(formatScriptureRefLabel("Romans", 8, 28, 30), "Romans 8:28–30");
    assert.equal(formatScriptureRefLabel("Romans", 8, 28, 28), "Romans 8:28");
  });

  it("isTargetForUser handles broadcast and direct user targeting", () => {
    const broadcastPayload = {
      id: "1",
      orgId: "org-1",
      senderId: "user-1",
      senderName: "Pastor David",
      recipientId: null,
      book: "John",
      chapter: 3,
      verse: 16,
      module: "kjv",
      text: "For God so loved...",
      createdAt: new Date().toISOString(),
    };

    assert.equal(isTargetForUser(broadcastPayload, "user-2"), true);
    assert.equal(isTargetForUser(broadcastPayload, null), false);

    const directPayload = {
      ...broadcastPayload,
      recipientId: "user-2",
    };

    assert.equal(isTargetForUser(directPayload, "user-2"), true);
    assert.equal(isTargetForUser(directPayload, "user-3"), false);
  });

  it("formatRelativeTime formats elapsed time humanely", () => {
    const base = new Date("2026-11-11T12:00:00Z");
    assert.equal(formatRelativeTime("2026-11-11T11:59:55Z", base), "just now");
    assert.equal(formatRelativeTime("2026-11-11T11:59:20Z", base), "40s ago");
    assert.equal(formatRelativeTime("2026-11-11T11:55:00Z", base), "5m ago");
    assert.equal(formatRelativeTime("2026-11-11T10:00:00Z", base), "2h ago");
  });

  it("isValidVerseRef validates verse boundaries", () => {
    assert.equal(isValidVerseRef({ book: "John", chapter: 3, verse: 16 }), true);
    assert.equal(isValidVerseRef({ book: "", chapter: 3, verse: 16 }), false);
    assert.equal(isValidVerseRef({ book: "John", chapter: 0, verse: 16 }), false);
    assert.equal(isValidVerseRef({ book: "John", chapter: 3, verse: -1 }), false);
  });
});
