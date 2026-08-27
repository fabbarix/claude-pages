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
