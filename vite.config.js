import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* Served at the root of the custom domain in public/CNAME, so assets are
   absolute from "/". A project site without a custom domain would instead
   live under /<repo>/ and need a matching base. */
export default defineConfig({
  plugins: [react()],
  base: "/",
});
