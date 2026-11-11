import { create } from "zustand";
import { getSupabase } from "../../lib/supabase.ts";
import { useOrgStore } from "../orgs/orgStore.ts";
import { useAppStore, type VerseRef } from "../../store/app.ts";
import { api as tauriApi } from "../../lib/tauri.ts";
import {
  type ShareTarget,
  type TeamScriptureNotification,
  type TeamScripturePayload,
  formatShareTarget,
  formatScriptureRefLabel,
  isTargetForUser,
  resolveSenderName,
} from "./teamShareLogic.ts";
import { sendScriptureShare } from "./api.ts";

const TARGET_STORAGE_KEY = "scriptura.teamShare.target";

function loadSavedTarget(): ShareTarget {
  try {
    const raw = localStorage.getItem(TARGET_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.type === "all" || (parsed.type === "member" && parsed.userId))) {
        return parsed;
      }
    }
  } catch {}
  return { type: "all" };
}

function saveTarget(target: ShareTarget) {
  try {
    localStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify(target));
  } catch {}
}

interface TeamShareState {
  defaultTarget: ShareTarget;
  notifications: TeamScriptureNotification[];
  toast: { message: string; type: "success" | "error" | "info" } | null;
  shareModalOpen: boolean;
  shareModalVerse: { ref: VerseRef; verseEnd?: number; text?: string; module?: string | null } | null;

  setDefaultTarget: (target: ShareTarget) => void;
  openShareModal: (verse?: { ref: VerseRef; verseEnd?: number; text?: string; module?: string | null }) => void;
  closeShareModal: () => void;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  clearToast: () => void;

  sendVerse: (options?: {
    ref?: VerseRef;
    verseEnd?: number;
    module?: string | null;
    text?: string;
    note?: string;
    target?: ShareTarget;
  }) => Promise<boolean>;

  dismissNotification: (id: string) => void;
  clearAllNotifications: () => void;
  actOnNotification: (id: string, action: "live" | "schedule") => void;

  initRealtime: () => () => void;
}

let activeChannel: any = null;
let currentSubscribedOrgId: string | null = null;
const processedMessageIds = new Set<string>();

export const useTeamShareStore = create<TeamShareState>()((set, get) => ({
  defaultTarget: loadSavedTarget(),
  notifications: [],
  toast: null,
  shareModalOpen: false,
  shareModalVerse: null,

  setDefaultTarget: (target) => {
    saveTarget(target);
    set({ defaultTarget: target });
    const members = useOrgStore.getState().members;
    get().showToast(`Default target set to ${formatShareTarget(target, members)}`, "info");
  },

  openShareModal: (verse) => {
    const appState = useAppStore.getState();
    const fallbackRef = appState.currentRef;
    const fallbackModule = appState.primaryModule;
    set({
      shareModalOpen: true,
      shareModalVerse: verse ?? { ref: fallbackRef, module: fallbackModule },
    });
  },

  closeShareModal: () => set({ shareModalOpen: false, shareModalVerse: null }),

  showToast: (message, type = "success") => {
    set({ toast: { message, type } });
    setTimeout(() => {
      if (get().toast?.message === message) {
        set({ toast: null });
      }
    }, 3500);
  },

  clearToast: () => set({ toast: null }),

  sendVerse: async (options) => {
    const orgId = useOrgStore.getState().currentOrgId;
    if (!orgId) {
      get().showToast("Join or select an organization to share verses with team members.", "error");
      return false;
    }

    const supabase = getSupabase();
    if (!supabase) {
      get().showToast("Database connection unavailable.", "error");
      return false;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
      get().showToast("Please sign in to share verses with your team.", "error");
      return false;
    }

    const appState = useAppStore.getState();
    const ref = options?.ref ?? appState.currentRef;
    const verseEnd = options?.verseEnd;
    const module = options?.module ?? appState.primaryModule;
    const target = options?.target ?? get().defaultTarget;
    const members = useOrgStore.getState().members;

    // Resolve text if not given
    let text = options?.text?.trim() || "";
    if (!text && module) {
      try {
        const vt = await tauriApi.getVerse(module, ref.book, ref.chapter, ref.verse);
        text = vt.spans
          .filter((s) => !s.is_footnote && !s.is_title)
          .map((s) => s.text)
          .join("")
          .replace(/\s+/g, " ")
          .trim();
      } catch {
        text = `${ref.book} ${ref.chapter}:${ref.verse}`;
      }
    }
    if (!text) {
      text = `${ref.book} ${ref.chapter}:${ref.verse}`;
    }

    const senderName = resolveSenderName(user.id, null, members);
    const recipientId = target.type === "member" ? target.userId : null;
    const targetLabel = formatShareTarget(target, members);
    const refLabel = formatScriptureRefLabel(ref.book, ref.chapter, ref.verse, verseEnd);

    try {
      const payload = await sendScriptureShare({
        orgId,
        senderId: user.id,
        senderName,
        recipientId,
        book: ref.book,
        chapter: ref.chapter,
        verse: ref.verse,
        verseEnd,
        module,
        text,
        note: options?.note,
      });

      // Mark sender's own copy as processed so we don't notify ourselves if broadcast loops back
      processedMessageIds.add(payload.id);

      get().showToast(`Sent ${refLabel} to ${targetLabel}!`, "success");
      return true;
    } catch (err: any) {
      console.error("[teamShare] failed to send verse:", err);
      get().showToast(err?.message || "Failed to send scripture.", "error");
      return false;
    }
  },

  dismissNotification: (id) => {
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
  },

  clearAllNotifications: () => set({ notifications: [] }),

  actOnNotification: (id, action) => {
    const item = get().notifications.find((n) => n.id === id);
    if (!item) return;

    const appStore = useAppStore.getState();

    if (action === "live") {
      // 1. Send live
      appStore.setCurrentRef({ book: item.book, chapter: item.chapter, verse: item.verse });
      appStore.setVersePart(0);
      appStore.setLiveBlack(false);
      appStore.setLiveEmergency(false);

      if (appStore.workspace === "presentation") {
        appStore.setView("live");
      }

      // Mark handled & dismiss after short visual confirmation
      set((s) => ({
        notifications: s.notifications.map((n) => (n.id === id ? { ...n, handled: "live" } : n)),
      }));
      get().showToast(`Sent ${formatScriptureRefLabel(item.book, item.chapter, item.verse, item.verseEnd)} to Live screen!`, "success");

      setTimeout(() => {
        get().dismissNotification(id);
      }, 1200);
    } else if (action === "schedule") {
      // 2. Add to schedule (service order)
      appStore.addToServiceOrder({
        book: item.book,
        chapter: item.chapter,
        verse: item.verse,
        verse_end: item.verseEnd,
        module: item.module || "",
        text: item.text || "",
      });

      set((s) => ({
        notifications: s.notifications.map((n) => (n.id === id ? { ...n, handled: "schedule" } : n)),
      }));
      get().showToast(`Added ${formatScriptureRefLabel(item.book, item.chapter, item.verse, item.verseEnd)} to Schedule`, "success");

      setTimeout(() => {
        get().dismissNotification(id);
      }, 1200);
    }
  },

  initRealtime: () => {
    const supabase = getSupabase();
    if (!supabase) return () => {};

    function setupSubscription() {
      const orgId = useOrgStore.getState().currentOrgId;
      if (!orgId) {
        if (activeChannel) {
          supabase?.removeChannel(activeChannel);
          activeChannel = null;
          currentSubscribedOrgId = null;
        }
        return;
      }

      if (currentSubscribedOrgId === orgId && activeChannel) {
        return;
      }

      if (activeChannel) {
        supabase?.removeChannel(activeChannel);
        activeChannel = null;
      }

      currentSubscribedOrgId = orgId;
      const channelName = `org:${orgId}:team_verses`;

      async function handleIncoming(payload: TeamScripturePayload) {
        if (!payload || !payload.id) return;
        if (processedMessageIds.has(payload.id)) return;
        processedMessageIds.add(payload.id);

        // Keep set bounded
        if (processedMessageIds.size > 500) {
          const first = processedMessageIds.values().next().value;
          if (first) processedMessageIds.delete(first);
        }

        let currentUserId: string | null = null;
        try {
          const { data: sessionData } = await supabase!.auth.getSession();
          currentUserId = sessionData?.session?.user?.id || null;
        } catch {}

        // Don't show notifications for messages we sent ourselves
        if (currentUserId && payload.senderId === currentUserId) return;

        // Check if intended for current user or all members
        if (!isTargetForUser(payload, currentUserId)) return;

        // Add to active notifications
        set((s) => {
          // Avoid duplicate notifications in array
          if (s.notifications.some((n) => n.id === payload.id)) return s;
          return { notifications: [payload, ...s.notifications] };
        });
      }

      if (!supabase) return;
      activeChannel = supabase
        .channel(channelName)
        .on("broadcast", { event: "scripture_share" }, ({ payload }) => {
          handleIncoming(payload as TeamScripturePayload);
        })
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "team_scripture_shares",
            filter: `org_id=eq.${orgId}`,
          },
          (change) => {
            const row = change.new as any;
            if (!row) return;
            handleIncoming({
              id: row.id,
              orgId: row.org_id,
              senderId: row.sender_id,
              senderName: "Team Member",
              recipientId: row.recipient_id,
              book: row.book,
              chapter: row.chapter,
              verse: row.verse,
              verseEnd: row.verse_end ?? undefined,
              module: row.module,
              text: row.text,
              note: row.note ?? undefined,
              createdAt: row.created_at,
            });
          }
        )
        .subscribe();
    }

    setupSubscription();

    // Re-check subscription when active org changes
    const unsubOrg = useOrgStore.subscribe((state, prevState) => {
      if (state.currentOrgId !== prevState.currentOrgId) {
        setupSubscription();
      }
    });

    return () => {
      unsubOrg();
      if (activeChannel && supabase) {
        supabase.removeChannel(activeChannel);
        activeChannel = null;
        currentSubscribedOrgId = null;
      }
    };
  },
}));
