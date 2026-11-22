import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles/globals.css";
import "./styles/accents.css";

const App = lazy(() => import("./App"));
const PresentationView = lazy(() => import("./views/PresentationView"));
const StageView = lazy(() => import("./features/stage/StageView"));

const flags = window as { __SCRIPTURA_PRESENTATION__?: boolean; __SCRIPTURA_STAGE__?: boolean };
const isPresentation = flags.__SCRIPTURA_PRESENTATION__ === true;
const isStage = flags.__SCRIPTURA_STAGE__ === true;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense fallback={isPresentation || isStage ? <div style={{ position: "fixed", inset: 0, background: "#000" }} /> : null}>
        {isStage ? <StageView /> : isPresentation ? <PresentationView /> : <App />}
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);
