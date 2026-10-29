import { create } from "zustand";
import { getSupabase } from "../../lib/supabase.ts";
import { useEntitlementStore } from "../entitlements/entitlementStore.ts";
import {
  createOrganization,
  updateOrganization,
  createOrgInvite,
  revokeOrgInvite,
  acceptOrgInvite,
  setMemberRole,
  removeOrgMember,
  transferOrgOwnership,
  fetchOrgDetails,
  fetchOrgMembers,
  fetchOrgInvites,
  fetchOrgAudit,
  fetchOrgBilling,
  formatOrgError,
  type OrgDetails,
  type OrgMember,
  type OrgInvite,
  type OrgAuditEntry,
  type OrgBillingInfo,
} from "./api.ts";

interface OrgState {
  currentOrgId: string | null;
  activeOrg: OrgDetails | null;
  members: OrgMember[];
  invites: OrgInvite[];
  auditLogs: OrgAuditEntry[];
  billing: OrgBillingInfo | null;
  loading: boolean;
  error: string | null;

  // Dialog states
  settingsOpen: boolean;
  inviteOpen: boolean;
  acceptInviteOpen: boolean;

  setSettingsOpen: (open: boolean) => void;
  setInviteOpen: (open: boolean) => void;
  setAcceptInviteOpen: (open: boolean) => void;

  setCurrentOrgId: (orgId: string | null) => void;
  refreshOrg: () => Promise<void>;

  createOrg: (name: string) => Promise<string>;
  updateOrg: (name?: string, quotaMode?: "per_seat" | "pooled") => Promise<void>;
  inviteMember: (options: { email?: string; role?: "admin" | "member" | "viewer"; maxUses?: number; expiresHours?: number }) => Promise<string>;
  revokeInvite: (inviteId: string) => Promise<void>;
  joinOrg: (token: string) => Promise<string>;
  changeRole: (userId: string, role: "admin" | "member" | "viewer") => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  leaveOrg: () => Promise<void>;
  transferOwnership: (newOwnerId: string) => Promise<void>;
}

export const useOrgStore = create<OrgState>()((set, get) => ({
  currentOrgId: null,
  activeOrg: null,
  members: [],
  invites: [],
  auditLogs: [],
  billing: null,
  loading: false,
  error: null,

  settingsOpen: false,
  inviteOpen: false,
  acceptInviteOpen: false,

  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setInviteOpen: (inviteOpen) => set({ inviteOpen }),
  setAcceptInviteOpen: (acceptInviteOpen) => set({ acceptInviteOpen }),

  setCurrentOrgId: (currentOrgId) => {
    set({ currentOrgId });
    if (currentOrgId) {
      void get().refreshOrg();
    } else {
      set({ activeOrg: null, members: [], invites: [], auditLogs: [], billing: null });
    }
  },

  refreshOrg: async () => {
    const orgId = get().currentOrgId;
    if (!orgId) return;

    set({ loading: true, error: null });
    try {
      const [details, membersList, invitesList, logs, billingInfo] = await Promise.all([
        fetchOrgDetails(orgId),
        fetchOrgMembers(orgId),
        fetchOrgInvites(orgId),
        fetchOrgAudit(orgId),
        fetchOrgBilling(orgId),
      ]);

      set({
        activeOrg: details,
        members: membersList,
        invites: invitesList,
        auditLogs: logs,
        billing: billingInfo,
        loading: false,
      });
    } catch (e) {
      set({
        loading: false,
        error: formatOrgError(e),
      });
    }
  },

  createOrg: async (name: string) => {
    set({ loading: true, error: null });
    try {
      const orgId = await createOrganization(name);
      await useEntitlementStore.getState().refresh();
      set({ currentOrgId: orgId, loading: false });
      await get().refreshOrg();
      return orgId;
    } catch (e) {
      const errMsg = formatOrgError(e);
      set({ loading: false, error: errMsg });
      throw new Error(errMsg);
    }
  },

  updateOrg: async (name, quotaMode) => {
    const orgId = get().currentOrgId;
    if (!orgId) return;
    set({ loading: true, error: null });
    try {
      await updateOrganization(orgId, name, quotaMode);
      await get().refreshOrg();
      await useEntitlementStore.getState().refresh();
    } catch (e) {
      const errMsg = formatOrgError(e);
      set({ loading: false, error: errMsg });
      throw new Error(errMsg);
    }
  },

  inviteMember: async (options) => {
    const orgId = get().currentOrgId;
    if (!orgId) throw new Error("No organization selected.");
    try {
      const token = await createOrgInvite(orgId, options);
      await get().refreshOrg();
      return token;
    } catch (e) {
      throw new Error(formatOrgError(e));
    }
  },

  revokeInvite: async (inviteId) => {
    try {
      await revokeOrgInvite(inviteId);
      await get().refreshOrg();
    } catch (e) {
      throw new Error(formatOrgError(e));
    }
  },

  joinOrg: async (token) => {
    set({ loading: true, error: null });
    try {
      const orgId = await acceptOrgInvite(token);
      await useEntitlementStore.getState().refresh();
      set({ currentOrgId: orgId, loading: false, acceptInviteOpen: false });
      await get().refreshOrg();
      return orgId;
    } catch (e) {
      const errMsg = formatOrgError(e);
      set({ loading: false, error: errMsg });
      throw new Error(errMsg);
    }
  },

  changeRole: async (userId, role) => {
    const orgId = get().currentOrgId;
    if (!orgId) return;
    try {
      await setMemberRole(orgId, userId, role);
      await get().refreshOrg();
    } catch (e) {
      throw new Error(formatOrgError(e));
    }
  },

  removeMember: async (userId) => {
    const orgId = get().currentOrgId;
    if (!orgId) return;
    try {
      await removeOrgMember(orgId, userId);
      await get().refreshOrg();
      await useEntitlementStore.getState().refresh();
    } catch (e) {
      throw new Error(formatOrgError(e));
    }
  },

  leaveOrg: async () => {
    const orgId = get().currentOrgId;
    if (!orgId) return;
    const userRole = get().activeOrg;
    if (!userRole) return;
    try {
      const supabase = getSupabase();
      const { data } = await supabase?.auth.getUser() ?? {};
      const myId = data?.user?.id;
      if (!myId) throw new Error("Not signed in");
      await removeOrgMember(orgId, myId);
      await useEntitlementStore.getState().refresh();
      const remainingOrgs = useEntitlementStore.getState().entitlements.orgs;
      const nextOrg = remainingOrgs[0]?.id ?? null;
      set({ currentOrgId: nextOrg });
      if (nextOrg) await get().refreshOrg();
      else set({ activeOrg: null, members: [], invites: [], auditLogs: [], billing: null });
    } catch (e) {
      throw new Error(formatOrgError(e));
    }
  },

  transferOwnership: async (newOwnerId) => {
    const orgId = get().currentOrgId;
    if (!orgId) return;
    try {
      await transferOrgOwnership(orgId, newOwnerId);
      await get().refreshOrg();
      await useEntitlementStore.getState().refresh();
    } catch (e) {
      throw new Error(formatOrgError(e));
    }
  },
}));
