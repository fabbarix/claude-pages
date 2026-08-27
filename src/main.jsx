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
