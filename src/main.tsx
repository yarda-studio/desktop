import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PresentationView from "./views/PresentationView";
import StageView from "./features/stage/StageView";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles/globals.css";
import "./styles/accents.css";

const flags = window as { __SCRIPTURA_PRESENTATION__?: boolean; __SCRIPTURA_STAGE__?: boolean };
const isPresentation = flags.__SCRIPTURA_PRESENTATION__ === true;
const isStage = flags.__SCRIPTURA_STAGE__ === true;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isStage ? <StageView /> : isPresentation ? <PresentationView /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
