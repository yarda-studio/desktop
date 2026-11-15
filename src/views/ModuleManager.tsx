import SegmentedControl from "../components/SegmentedControl";
import { useBuiltinLexicons } from "../features/lexicons/builtinLexiconStore";
import { useEffect, useRef, useState } from "react";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store/app";
import { api, type ModuleInfo } from "../lib/tauri";

type Category = ModuleInfo["category"] | "All";
const CATEGORIES: Category[] = ["All", "Bible", "Commentary", "Lexicon", "Dictionary", "Devotional"];

interface InstallState {
  [moduleId: string]: { progress: number; status: "idle" | "downloading" | "indexing" | "done" | "error"; message?: string };
}

const CATEGORY_ICON: Record<ModuleInfo["category"], string> = {
  Bible: "menu_book",
  Commentary: "forum",
  Lexicon: "translate",
  Dictionary: "dictionary",
  Devotional: "self_improvement",
  Other: "extension",
};

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Stat({ icon, value, label, tone }: { icon: string; value: number; label: string; tone?: "ok" | "busy" }) {
  const color = tone === "ok" ? "text-tertiary" : tone === "busy" ? "text-primary" : "text-on-surface-variant";
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg ctl">
      <span className={`material-symbols-outlined text-[18px] leading-none ${color} ${tone === "busy" ? "animate-spin" : ""}`}>{icon}</span>
      <span className="font-body-ui text-[13px] text-on-surface font-semibold leading-none">{value}</span>
      <span className="font-body-ui text-[12px] text-on-surface-variant leading-none">{label}</span>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "gold" | "error" }) {
  const cls =
    tone === "gold" ? "bg-secondary/12 text-secondary border-secondary/30"
    : tone === "error" ? "bg-error-container/40 text-error border-error/30"
    : "bg-surface/60 text-on-surface-variant border-outline-variant/60";
  return <span className={`inline-flex items-center font-metadata-mono text-[11px] px-1.5 py-0.5 rounded border ${cls}`}>{children}</span>;
}

export default function ModuleManager() {
  const { setHasModules, setPrimaryModule } = useAppStore();
  const [available, setAvailable] = useState<ModuleInfo[]>([]);
  const [installed, setInstalled] = useState<ModuleInfo[]>([]);
  const [tab, setTab] = useState<"available" | "installed">("available");
  const [category, setCategory] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [installState, setInstallState] = useState<InstallState>({});
  const [cipherModal, setCipherModal] = useState<{ moduleId: string; name: string } | null>(null);
  const cipherDialogRef = useRef<HTMLDivElement>(null);
  const closeCipher = () => { setCipherModal(null); setCipherKey(""); };
  useDialogA11y(cipherDialogRef, !!cipherModal, closeCipher);
  const [cipherKey, setCipherKey] = useState("");
  // The lexicons that ship with Yarda: shown with the installed modules, switched on and off here.
  const builtinEntries = useBuiltinLexicons((s) => s.entries);
  const loadBuiltin = useBuiltinLexicons((s) => s.load);
  const setBuiltinEnabled = useBuiltinLexicons((s) => s.setEnabled);

  useEffect(() => {
    void loadBuiltin();
    // Load installed modules immediately (instant local database read)
    api.listInstalledModules().then((inst) => {
      setInstalled(inst);
      // The library only counts as ready once a Bible is in it — lexicons
      // alone can't be read, and used to flip the app into a broken reader.
      const bible = inst.find((m) => m.category === "Bible");
      if (bible) {
        setHasModules(true);
        setPrimaryModule(bible.id);
      }
    });

    // Load available modules (instant cached/seed catalog read)
    api
      .listAvailableModules()
      .then((avail) => {
        setAvailable(avail);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load available modules:", err);
        setLoading(false);
      });

    // Listen for background catalog updates when a refresh completes
    const unlistenUpdated = listen<ModuleInfo[]>("available-modules-updated", (event) => {
      setAvailable(event.payload);
    });

    // Listen for install progress events from Rust backend
    const unlisten = listen<{ module_id: string; progress: number; message: string }>(
      "module-install-progress",
      (event) => {
        const { module_id, progress, message } = event.payload;
        setInstallState((prev) => ({
          ...prev,
          [module_id]: {
            progress,
            status: progress < 50 ? "downloading" : progress < 100 ? "indexing" : "done",
            message,
          },
        }));
        if (progress === 100) {
          // Refresh installed list
          api.listInstalledModules().then((inst) => {
            setInstalled(inst);
            // Lexicon installs (including the silent ones at startup) finish
            // here too — only a Bible makes the library readable.
            const bible = inst.find((m) => m.category === "Bible");
            setHasModules(!!bible);
            if (bible && !useAppStore.getState().primaryModule) setPrimaryModule(bible.id);
          });
        }
      }
    );

    return () => {
      unlisten.then((f) => f());
      unlistenUpdated.then((f) => f());
    };
  }, []);

  async function install(module_id: string, requires_key: boolean, name: string) {
    if (requires_key) {
      setCipherModal({ moduleId: module_id, name });
      return;
    }
    setInstallState((prev) => ({ ...prev, [module_id]: { progress: 0, status: "downloading" } }));
    try {
      await api.installModule(module_id);
    } catch (e) {
      setInstallState((prev) => ({ ...prev, [module_id]: { progress: 0, status: "error", message: String(e) } }));
    }
  }

  // A built-in lexicon that is not on disk yet (the full LSJ, or one still downloading): fetch and cache it.
  async function installBuiltin(module_id: string) {
    setInstallState((prev) => ({ ...prev, [module_id]: { progress: 40, status: "downloading", message: "Downloading…" } }));
    try {
      await api.ensureStepBibleLexicon(module_id);
      setInstallState((prev) => ({ ...prev, [module_id]: { progress: 100, status: "done" } }));
      setInstalled(await api.listInstalledModules());
      await loadBuiltin();
    } catch (e) {
      setInstallState((prev) => ({ ...prev, [module_id]: { progress: 0, status: "error", message: String(e) } }));
    }
  }

  async function installWithKey() {
    if (!cipherModal) return;
    const { moduleId } = cipherModal;
    setCipherModal(null);
    setInstallState((prev) => ({ ...prev, [moduleId]: { progress: 0, status: "downloading" } }));
    try {
      await api.installModuleWithKey(moduleId, cipherKey);
    } catch (e) {
      setInstallState((prev) => ({ ...prev, [moduleId]: { progress: 0, status: "error", message: String(e) } }));
    }
    setCipherKey("");
  }

  // Built-ins whose data is not on disk yet are offered alongside the repository modules.
  const availableAll = [...available, ...builtinEntries.filter((e) => !e.installed)];
  const modules = (tab === "available" ? availableAll : installed).filter((m) => {
    const matchCat = category === "All" || m.category === category;
    const q = query.trim().toLowerCase();
    const matchQ = !q || m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.language.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const source = tab === "available" ? availableAll : installed;
  const countFor = (cat: Category) => (cat === "All" ? source.length : source.filter((m) => m.category === cat).length);
  const installedCount = installed.length;
  const activeDownloads = Object.values(installState).filter((s) => s.status === "downloading" || s.status === "indexing").length;

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-background">
        {/* Hero header */}
        <header className="shrink-0 px-4 lg:px-8 pt-6 pb-4">
          <div className="max-w-6xl mx-auto flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h1 className="font-display-lg text-display-lg text-on-surface">Module Library</h1>
              <p className="font-body-ui text-body-ui text-on-surface-variant mt-1">
                Bibles, commentaries and lexicons, downloaded once and kept on this device.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Stat icon="check_circle" tone="ok" value={installedCount} label="installed" />
              <Stat icon="cloud_download" value={availableAll.filter((m) => !m.installed).length} label="available" />
              {activeDownloads > 0 && <Stat icon="sync" tone="busy" value={activeDownloads} label="in progress" />}
            </div>
          </div>
        </header>

        {/* Sticky toolbar */}
        <div className="shrink-0 px-4 lg:px-8 pb-3 border-b border-outline-variant/60">
          <div className="max-w-6xl mx-auto flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl
                ariaLabel="Module source"
                value={tab}
                onChange={setTab}
                options={[
                  { value: "available", label: <>Browse<span className="ml-1 font-metadata-mono text-[11px] opacity-70">{availableAll.length}</span></> },
                  { value: "installed", label: <>Installed<span className="ml-1 font-metadata-mono text-[11px] opacity-70">{installedCount}</span></> },
                ]}
                className="p-0.5 rounded-lg bg-surface-variant/35 border border-outline-variant/40 shrink-0"
                itemClassName="px-4 py-1.5 rounded-md text-[13px] font-semibold"
              />

              <div className="relative flex-1 min-w-[200px] sm:max-w-sm sm:ml-auto">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none">search</span>
                <input
                  className="pl-9 pr-9 py-2 focus:outline-none font-body-ui text-body-ui w-full field rounded-lg"
                  placeholder="Search by name, language or description"
                  aria-label="Search modules"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
              <SegmentedControl
                ariaLabel="Filter by category"
                value={category}
                onChange={setCategory}
                options={CATEGORIES.map((cat) => ({
                  value: cat,
                  label: (
                    <>
                      {cat !== "All" && <span className="material-symbols-outlined text-[14px] leading-none">{CATEGORY_ICON[cat as ModuleInfo["category"]]}</span>}
                      {cat}
                      <span className="font-metadata-mono text-[11px] opacity-60">{countFor(cat)}</span>
                    </>
                  ),
                }))}
                className="gap-1.5"
                itemClassName="shrink-0 px-3 py-1 rounded-full text-[12px] font-medium"
                activeItemClassName="text-on-secondary-container"
                idleItemClassName="ctl text-on-surface-variant hover:text-primary"
                indicatorClassName="rounded-full bg-secondary-container"
              />
            </div>
          </div>
        </div>

        {/* Module grid */}
        <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 [scrollbar-gutter:stable_both-edges]">
          <div className="max-w-6xl mx-auto">
            {tab === "available" && loading && available.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading modules">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="ctl rounded-xl p-4 h-[148px] animate-pulse flex gap-3">
                    <div className="w-10 h-10 rounded-lg bg-surface-container-high shrink-0" />
                    <div className="flex-1 space-y-2.5 pt-1">
                      <div className="h-3.5 w-2/3 rounded bg-surface-container-high" />
                      <div className="h-3 w-full rounded bg-surface-container" />
                      <div className="h-3 w-4/5 rounded bg-surface-container" />
                    </div>
                  </div>
                ))}
              </div>
            ) : modules.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-20">
                <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[28px] text-on-surface-variant">
                    {tab === "installed" && !query && category === "All" ? "inventory_2" : "search_off"}
                  </span>
                </div>
                <p className="font-body-ui text-body-ui font-semibold text-on-surface">
                  {tab === "installed" && !query && category === "All" ? "Nothing installed yet" : "No modules match"}
                </p>
                <p className="font-body-ui text-[13px] text-on-surface-variant mt-1 max-w-xs">
                  {tab === "installed" && !query && category === "All"
                    ? "Browse the library and install a Bible to start reading."
                    : "Try a different search or category."}
                </p>
                <div className="mt-4 flex gap-2">
                  {tab === "installed" && !query && category === "All" ? (
                    <button onClick={() => setTab("available")} className="btn-primary px-4 py-1.5 rounded-md font-body-ui text-[13px]">Browse library</button>
                  ) : (
                    <button onClick={() => { setQuery(""); setCategory("All"); }} className="ctl px-4 py-1.5 rounded-md font-body-ui text-[13px] text-on-surface">Clear filters</button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {modules.map((m) => {
                  const state = installState[m.id];
                  const isInstalling = state?.status === "downloading" || state?.status === "indexing";
                  const isDone = state?.status === "done" || m.installed;
                  const hasError = state?.status === "error";
                  // Built-in lexicons are never "uninstalled": they have an on/off switch instead.
                  const isBuiltInReady = !!m.built_in && m.installed;
                  const isOn = (builtinEntries.find((e) => e.id === m.id)?.enabled ?? m.enabled) !== false;
                  return (
                    <article key={m.id} className={`ctl rounded-xl p-4 flex flex-col gap-3 min-w-0 transition-opacity duration-200 ${isBuiltInReady && !isOn ? "opacity-60" : ""}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[22px]">{CATEGORY_ICON[m.category] ?? "extension"}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-body-ui text-body-ui font-semibold text-on-surface leading-snug truncate" title={m.name}>{m.name}</h3>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 font-metadata-mono text-[11px] text-on-surface-variant uppercase tracking-wider">
                            <span>{m.category}</span>
                            {m.language && <><span aria-hidden>·</span><span>{m.language}</span></>}
                            {m.size_bytes ? <><span aria-hidden>·</span><span>{formatSize(m.size_bytes)}</span></> : null}
                          </div>
                        </div>
                        {isDone && (
                          <span className="material-symbols-outlined text-[20px] text-tertiary shrink-0" title="Installed" aria-label="Installed">check_circle</span>
                        )}
                      </div>

                      <p className="font-body-ui text-[13px] text-on-surface-variant leading-relaxed line-clamp-3 flex-1">{m.description}</p>

                      {(m.has_strongs || m.requires_key || m.source || m.built_in) && (
                        <div className="flex flex-wrap gap-1.5">
                          {m.built_in && <Badge tone="gold">Built-in</Badge>}
                          {m.has_strongs && <Badge tone="gold">Strong's</Badge>}
                          {m.requires_key && <Badge tone="error"><span className="material-symbols-outlined text-[12px] leading-none mr-1 align-middle">key</span>Key required</Badge>}
                          {m.source && <Badge>{m.source}</Badge>}
                        </div>
                      )}

                      {isInstalling && (
                        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress)}>
                          <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
                            <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${state.progress}%` }} />
                          </div>
                          <p className="font-metadata-mono text-[11px] text-on-surface-variant mt-1 truncate">{state.message || (state.status === "indexing" ? "Indexing…" : "Downloading…")}</p>
                        </div>
                      )}
                      {hasError && (
                        <p className="font-body-ui text-[12px] text-error flex items-start gap-1.5">
                          <span className="material-symbols-outlined text-[14px] leading-none mt-0.5">error</span>
                          <span className="min-w-0 break-words">{state.message}</span>
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-3 pt-3 border-t border-outline-variant/50">
                        <span className="font-metadata-mono text-[11px] text-on-surface-variant/80 truncate">{m.version ? `v${m.version}` : ""}</span>
                        {isBuiltInReady ? (
                          <div className="shrink-0 inline-flex items-center gap-2.5">
                            <span className="font-body-ui text-[13px] font-medium text-on-surface-variant" aria-hidden="true">{isOn ? "On" : "Off"}</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isOn}
                              aria-label={`${m.name}: ${isOn ? "on" : "off"}`}
                              title={isOn ? "Shown in the Strong's panel. Click to turn off." : "Hidden from the Strong's panel. Click to turn on."}
                              onClick={() => void setBuiltinEnabled(m.id, !isOn)}
                              className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${isOn ? "bg-primary" : "bg-outline-variant"}`}
                            >
                              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.4,0.05,0.15,1)] motion-reduce:transition-none ${isOn ? "translate-x-5" : "translate-x-0"}`} />
                            </button>
                          </div>
                        ) : (
                        <button
                          disabled={isDone || isInstalling}
                          onClick={() => (m.built_in ? void installBuiltin(m.id) : install(m.id, m.requires_key, m.name))}
                          className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-body-ui text-[13px] font-medium transition-colors ${
                            isDone
                              ? "text-tertiary cursor-default"
                              : isInstalling
                              ? "bg-surface-container text-on-surface-variant cursor-wait"
                              : "btn-primary"
                          }`}
                        >
                          <span className={`material-symbols-outlined text-[16px] leading-none ${isInstalling ? "animate-spin" : ""}`}>
                            {isDone ? "check" : isInstalling ? "progress_activity" : hasError ? "refresh" : m.requires_key ? "key" : "download"}
                          </span>
                          {isDone ? "Installed" : isInstalling ? (state.status === "indexing" ? "Indexing" : "Downloading") : hasError ? "Retry" : "Install"}
                        </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Cipher key modal */}
      {cipherModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div ref={cipherDialogRef} role="dialog" aria-modal="true" aria-labelledby="cipher-title" className="p-6 w-96 glass rounded-3xl">
            <h2 id="cipher-title" className="font-headline-md text-headline-md font-bold text-on-surface mb-2">Enter cipher key</h2>
            <p className="font-body-ui text-body-ui text-on-surface-variant mb-4">
              <strong>{cipherModal.name}</strong> requires a license key to install.
            </p>
            <input
              className="w-full px-3 py-2 font-metadata-mono text-body-ui focus:outline-none mb-4 field rounded-lg"
              aria-label="Cipher key"
              placeholder="Cipher key"
              value={cipherKey}
              onChange={(e) => setCipherKey(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setCipherModal(null); setCipherKey(""); }} className="px-4 py-2 text-secondary font-body-ui text-body-ui hover:bg-surface-container-low rounded-md">
                Cancel
              </button>
              <button onClick={installWithKey} disabled={!cipherKey.trim()} className="px-4 py-2 btn-primary font-body-ui text-body-ui rounded-md hover:bg-primary-container disabled:opacity-50">
                Install
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
