import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* On GitHub Pages the site is served from /<repo>/, not the domain root.
   BASE_PATH is set by the deploy workflow; local dev falls back to "/". */
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || "/",
});
