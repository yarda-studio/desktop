import { useEffect } from "react";
import { useAppStore } from "../../store/app";
import ErrorBoundary from "../../components/ErrorBoundary";
import WelcomeScreen from "./WelcomeScreen";
import TourCoach from "./TourCoach";
import { useOnboardingStore } from "./store";
import { hasSeenOnboarding, markOnboardingSeen } from "./storage";

/** Where the tour leaves you: the workspace's home screen, not wherever the last step was. */
function goHome() {
  const s = useAppStore.getState();
  s.setView(s.workspace === "presentation" ? "live" : "reading");
}

function Host() {
  const { phase, steps, index, openWelcome, startTour, next, back, close } = useOnboardingStore();
  const hasModules = useAppStore((s) => s.hasModules);

  // First launch only. The welcome sits on top while the app finishes loading.
  useEffect(() => {
    if (!hasSeenOnboarding()) openWelcome();
  }, [openWelcome]);

  if (phase === "welcome") {
    return (
      <WelcomeScreen
        onDone={(workspace, depth) => {
          markOnboardingSeen();
          // Choosing a mode here is the real workspace choice, not a separate preference.
          useAppStore.getState().setWorkspace(workspace);
          if (depth) startTour(workspace, depth);
          else close();
        }}
      />
    );
  }

  if (phase === "tour") {
    // On a true first launch the Bible is still downloading; the tour needs the
    // reading screen to exist, so hold on a short message until it does.
    if (!hasModules) {
      return (
        <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-6">
          <div role="status" className="glass glass-strong rounded-2xl p-6 max-w-sm text-center">
            <p className="font-headline-sm text-headline-sm text-on-surface">Getting your library ready…</p>
            <p className="font-body-ui text-[13px] text-on-surface-variant mt-1.5">
              Your tour will begin as soon as the first Bible finishes installing.
            </p>
            <button onClick={close} className="mt-4 px-4 py-1.5 rounded-lg ctl font-body-ui text-[13px] font-medium text-on-surface">
              Skip tour
            </button>
          </div>
        </div>
      );
    }
    const step = steps[index];
    if (!step) return null;
    const finish = () => { close(); goHome(); };
    return <TourCoach step={step} index={index} total={steps.length} onNext={next} onBack={back} onClose={finish} />;
  }

  return null;
}

/** Mounted once in App. Its own boundary means a tour bug can never blank the app. */
export default function OnboardingHost() {
  return (
    <ErrorBoundary compact label="Tour">
      <Host />
    </ErrorBoundary>
  );
}
