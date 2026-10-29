import { useState, useRef, useEffect } from "react";
import { useEntitlementStore } from "../entitlements/entitlementStore.ts";
import { useOrgStore } from "./orgStore.ts";

export default function OrgSwitcher() {
  const orgs = useEntitlementStore((s) => s.entitlements.orgs);
  const currentOrgId = useOrgStore((s) => s.currentOrgId);
  const setCurrentOrgId = useOrgStore((s) => s.setCurrentOrgId);
  const setSettingsOpen = useOrgStore((s) => s.setSettingsOpen);
  const setAcceptInviteOpen = useOrgStore((s) => s.setAcceptInviteOpen);
  const createOrg = useOrgStore((s) => s.createOrg);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // If no currentOrgId selected but user belongs to orgs, default to the first one
  useEffect(() => {
    if (!currentOrgId && orgs.length > 0) {
      setCurrentOrgId(orgs[0].id);
    }
  }, [currentOrgId, orgs, setCurrentOrgId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const activeOrg = orgs.find((o) => o.id === currentOrgId);

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreateErr(null);
    try {
      await createOrg(newOrgName.trim());
      setNewOrgName("");
      setCreating(false);
      setOpen(false);
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : "Couldn't create team.");
    }
  }

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container text-on-surface font-body-ui text-[12px] font-medium transition-colors"
        title="Switch team or manage organizations"
      >
        <span className="material-symbols-outlined text-[16px] text-primary">groups</span>
        <span className="max-w-[130px] truncate">{activeOrg ? activeOrg.name : "Select team"}</span>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">expand_more</span>
      </button>

      {open && (
        <div className="absolute left-0 mt-1.5 w-64 rounded-xl border border-outline-variant bg-surface shadow-xl z-50 p-1.5 space-y-1">
          <div className="px-2 py-1 text-[11px] font-body-ui font-semibold text-on-surface-variant uppercase tracking-wider">
            Organizations
          </div>

          {orgs.length === 0 ? (
            <p className="px-2 py-2 text-[12px] font-body-ui text-on-surface-variant">
              You are not a member of any organization yet.
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {orgs.map((org) => {
                const isSelected = org.id === currentOrgId;
                return (
                  <button
                    key={org.id}
                    onClick={() => {
                      setCurrentOrgId(org.id);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between text-[12px] font-body-ui transition-colors ${
                      isSelected
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    <span className="truncate">{org.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-variant text-on-surface-variant capitalize">
                      {org.role}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="border-t border-outline-variant my-1" />

          {activeOrg && (
            <button
              onClick={() => {
                setSettingsOpen(true);
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 rounded-lg text-[12px] font-body-ui text-on-surface hover:bg-surface-container flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">settings</span>
              Organization settings
            </button>
          )}

          <button
            onClick={() => {
              setAcceptInviteOpen(true);
              setOpen(false);
            }}
            className="w-full text-left px-2 py-1.5 rounded-lg text-[12px] font-body-ui text-on-surface hover:bg-surface-container flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">mail</span>
            Join team with code
          </button>

          {creating ? (
            <form onSubmit={handleCreateOrg} className="p-2 space-y-2 border-t border-outline-variant">
              <input
                autoFocus
                type="text"
                placeholder="Team name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                className="w-full field px-2 py-1 text-[12px] rounded-md"
              />
              {createErr && <p className="text-[11px] text-error font-body-ui">{createErr}</p>}
              <div className="flex items-center gap-1.5">
                <button
                  type="submit"
                  disabled={!newOrgName.trim()}
                  className="btn-primary rounded-md px-2.5 py-1 text-[11px] font-bold"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setCreateErr(null);
                  }}
                  className="ghost rounded-md px-2 py-1 text-[11px]"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full text-left px-2 py-1.5 rounded-lg text-[12px] font-body-ui text-primary hover:bg-primary/5 flex items-center gap-2 font-semibold"
            >
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              Create new team
            </button>
          )}
        </div>
      )}
    </div>
  );
}
