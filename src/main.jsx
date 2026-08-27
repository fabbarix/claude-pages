import React from "react";
import { createRoot } from "react-dom/client";
import { installStorage } from "./storage.js";
import EVScorecard from "./EVScorecard.jsx";
import "./index.css";

installStorage();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <EVScorecard />
  </React.StrictMode>
);

/* Registered only in the built site: in dev the same path would sit in front
   of Vite's module server and shadow HMR. Failure here is not worth surfacing
   — the app works without it, just without offline support. */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

/* The report generator is a separate chunk so it costs nothing at first paint,
   but a chunk that has never been fetched is not in the offline cache either.
   Pull it in once the page is idle, so the report still builds with no signal.
   Failure is fine: clicking the button fetches it the ordinary way. */
if (import.meta.env.PROD) {
  const warm = () => import("./pdf/report.js").catch(() => {});
  if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 6000 });
  else window.addEventListener("load", () => setTimeout(warm, 2500));
}
