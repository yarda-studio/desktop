import { useEffect, useRef, useState } from "react";
import { useOrgStore } from "../orgs/orgStore.ts";
import { useTeamShareStore } from "./teamShareStore.ts";
import { formatShareTarget, type ShareTarget } from "./teamShareLogic.ts";

export default function TeamShareTargetSelector({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const members = useOrgStore((s) => s.members);
  const currentOrg = useOrgStore((s) => s.activeOrg);
  const defaultTarget = useTeamShareStore((s) => s.defaultTarget);
  const setDefaultTarget = useTeamShareStore((s) => s.setDefaultTarget);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      window.addEventListener("mousedown", onClickOutside);
      return () => window.removeEventListener("mousedown", onClickOutside);
    }
  }, [open]);

  const targetLabel = formatShareTarget(defaultTarget, members);
  const isAll = defaultTarget.type === "all";

  function selectTarget(target: ShareTarget) {
    setDefaultTarget(target);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Default recipient: ${targetLabel} (Click to change)`}
        aria-label={`Default recipient: ${targetLabel}`}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/40 border border-outline-variant/40 text-[12px] font-body-ui font-medium transition-colors select-none ${
          open ? "bg-surface-variant/50 border-primary/40 text-primary" : ""
        }`}
      >
        <span className="material-symbols-outlined !text-[15px] text-primary/80">
          {isAll ? "groups" : "person"}
        </span>
        <span className={`truncate ${compact ? "max-w-[70px]" : "max-w-[110px]"}`}>
          {targetLabel}
        </span>
        <span className="material-symbols-outlined !text-[14px] text-on-surface-variant/70">
          arrow_drop_down
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-60 z-50 glass shadow-xl rounded-xl border border-outline-variant/60 p-1.5 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2.5 py-1.5 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
            Send Verses To
          </div>

          <button
            onClick={() => selectTarget({ type: "all" })}
            className={`w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] font-body-ui transition-colors ${
              isAll
                ? "bg-primary/10 text-primary font-semibold"
                : "text-on-surface hover:bg-surface-variant/40"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined !text-[18px]">groups</span>
              <span>Entire Team (All Members)</span>
            </div>
            {isAll && (
              <span className="material-symbols-outlined !text-[16px] text-primary">check</span>
            )}
          </button>

          <div className="my-1.5 border-t border-outline-variant/40" />

          <div className="px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider flex items-center justify-between">
            <span>Team Members</span>
            {currentOrg && (
              <span className="normal-case text-[10px] text-on-surface-variant/70 truncate max-w-[90px]">
                {currentOrg.name}
              </span>
            )}
          </div>

          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {members.length === 0 ? (
              <div className="px-2.5 py-2 text-[12px] text-on-surface-variant/70 italic text-center">
                No other team members yet.
              </div>
            ) : (
              members.map((m) => {
                const name = m.full_name?.trim() || m.email?.split("@")[0] || "Member";
                const isSelected = defaultTarget.type === "member" && defaultTarget.userId === m.user_id;
                return (
                  <button
                    key={m.user_id}
                    onClick={() => selectTarget({ type: "member", userId: m.user_id, name })}
                    className={`w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12px] font-body-ui transition-colors ${
                      isSelected
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-on-surface hover:bg-surface-variant/40"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined !text-[16px] shrink-0 text-on-surface-variant">
                        person
                      </span>
                      <div className="truncate">
                        <div className="truncate font-medium">{name}</div>
                        {m.email && (
                          <div className="text-[10px] text-on-surface-variant/60 truncate">
                            {m.email}
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <span className="material-symbols-outlined !text-[16px] text-primary shrink-0 ml-1">
                        check
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
