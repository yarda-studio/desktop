import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/app";
import { api, type InstalledModule } from "../lib/tauri";

/** A chip that opens a list of installed Bibles. `allowNone` adds a "None" row. */
function ModuleChip({
  value, onPick, modules, title, placeholder, allowNone, icon, tone,
}: {
  value: string | null;
  onPick: (id: string | null) => void;
  modules: InstalledModule[];
  title: string;
  placeholder: string;
  allowNone?: boolean;
  icon?: string;
  tone: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1 field px-2.5 py-1 rounded-lg font-metadata-mono text-[12px] font-bold hover:text-on-surface transition-colors ${
          tone === "primary" ? "text-on-surface-variant" : "text-secondary"
        }`}
      >
        {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
        <span>{value ?? placeholder}</span>
        <span className="material-symbols-outlined text-[14px]">expand_more</span>
      </button>
      {open && modules.length > 0 && (
        <div role="listbox" className="absolute left-0 top-full mt-1 z-50 glass glass-strong rounded-xl min-w-[160px] max-h-36 overflow-y-auto py-1">
          {allowNone && value && (
            <button
              role="option"
              aria-selected={false}
              onClick={() => { onPick(null); setOpen(false); }}
              className="w-full text-left px-3 py-2 font-body-ui text-[13px] text-secondary hover:bg-surface-container-high"
            >
              — None
            </button>
          )}
          {modules.map((m) => (
            <button
              key={m.id}
              role="option"
              aria-selected={m.id === value}
              onClick={() => { onPick(m.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 font-body-ui text-[13px] transition-colors ${
                m.id === value
                  ? "bg-secondary-container text-on-secondary-container font-medium"
                  : "hover:bg-surface-container-high text-on-surface"
              }`}
            >
              {m.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The Live Show's translation controls: switch the main Bible, and turn on a
 * second one to show side by side on the output. Shares its state with the
 * Study sidebar, so a choice made in either place holds in both.
 */
export default function TranslationBar() {
  const primaryModule = useAppStore((s) => s.primaryModule);
  const setPrimaryModule = useAppStore((s) => s.setPrimaryModule);
  const parallelMode = useAppStore((s) => s.parallelMode);
  const setParallelMode = useAppStore((s) => s.setParallelMode);
  const parallelModule = useAppStore((s) => s.parallelModule);
  const setParallelModule = useAppStore((s) => s.setParallelModule);
  const [bibles, setBibles] = useState<InstalledModule[]>([]);

  useEffect(() => {
    api.listInstalledModules()
      .then((mods) => setBibles(mods.filter((m) => m.category === "Bible")))
      .catch(() => {});
  }, []);

  return (
    <div data-tour="live-translations" className="flex items-center gap-2 shrink-0">
      <ModuleChip
        value={primaryModule}
        onPick={(id) => id && setPrimaryModule(id)}
        modules={bibles}
        title="Switch Bible translation"
        placeholder="No Bible"
        tone="primary"
      />
      <button
        type="button"
        onClick={() => setParallelMode(!parallelMode)}
        title={parallelMode ? "Turn off parallel verses" : "Show a second translation side by side"}
        aria-pressed={parallelMode}
        className={`p-1.5 rounded-lg ${parallelMode ? "ctl-active" : "ctl text-on-surface-variant"}`}
      >
        <span className="material-symbols-outlined text-[16px]">splitscreen</span>
      </button>
      {parallelMode && (
        <ModuleChip
          value={parallelModule}
          onPick={setParallelModule}
          modules={bibles}
          title="Switch parallel translation"
          placeholder="Pick parallel…"
          allowNone
          tone="secondary"
        />
      )}
    </div>
  );
}
