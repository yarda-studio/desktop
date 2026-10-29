import { useState, type ReactNode } from "react";
import { useEntitlementStore } from "./entitlementStore";

interface Props {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
  title?: string;
  description?: string;
  compact?: boolean;
}

const FEATURE_INFO: Record<string, { title: string; description: string; icon: string; targetPlan: "pro" | "team" }> = {
  sync: {
    title: "Yarda Cloud Sync",
    description: "Keep your notes, bookmarks, themes, reading position, and search history in sync across all your devices.",
    icon: "cloud_sync",
    targetPlan: "pro",
  },
  shared_library: {
    title: "Shared Team Library",
    description: "Collaborate with your worship team, share service orders, slides, lyrics, and media seamlessly.",
    icon: "groups",
    targetPlan: "team",
  },
};

export default function ProGate({
  feature,
  children,
  fallback,
  title,
  description,
  compact = false,
}: Props) {
  const hasFeature = useEntitlementStore((s) => s.has(feature));
  const openCheckout = useEntitlementStore((s) => s.openCheckout);
  const [upgrading, setUpgrading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (hasFeature) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  const info = FEATURE_INFO[feature] ?? {
    title: "Yarda Pro Feature",
    description: "This feature requires an active paid plan.",
    icon: "workspace_premium",
    targetPlan: "pro",
  };

  const displayTitle = title ?? info.title;
  const displayDescription = description ?? info.description;

  async function handleUpgrade() {
    setUpgrading(true);
    setErr(null);
    try {
      await openCheckout(info.targetPlan);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't launch checkout. Please try again.");
    } finally {
      setUpgrading(false);
    }
  }

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-primary/25 bg-primary/5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-[20px] text-primary">{info.icon}</span>
          <div className="min-w-0">
            <p className="font-body-ui text-[12px] font-bold text-on-surface truncate">{displayTitle}</p>
            <p className="font-body-ui text-[11px] text-on-surface-variant truncate">{displayDescription}</p>
          </div>
        </div>
        <button
          onClick={handleUpgrade}
          disabled={upgrading}
          className="btn-primary rounded-lg px-3 py-1 font-body-ui text-[11px] font-bold shrink-0 disabled:opacity-40"
        >
          {upgrading ? "Opening…" : "Upgrade"}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl border border-primary/20 bg-primary/5 text-center flex flex-col items-center justify-center max-w-md mx-auto my-6 space-y-3">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        <span className="material-symbols-outlined text-[26px]">{info.icon}</span>
      </div>
      <div>
        <h3 className="font-body-ui text-[15px] font-bold text-on-surface">{displayTitle}</h3>
        <p className="font-body-ui text-[13px] text-on-surface-variant mt-1 leading-relaxed">
          {displayDescription}
        </p>
      </div>
      {err && <p className="font-body-ui text-[12px] text-error" role="alert">{err}</p>}
      <button
        onClick={handleUpgrade}
        disabled={upgrading}
        className="btn-primary rounded-xl px-5 py-2.5 font-body-ui text-[13px] font-bold shadow-xs hover:opacity-95 disabled:opacity-40 mt-1"
      >
        {upgrading ? "Launching checkout…" : `Upgrade to ${info.targetPlan === "team" ? "Team" : "Pro"}`}
      </button>
    </div>
  );
}
