import { defineConfig } from "vite";

// On GitHub Pages a project site is served from /<repo>/, so the build needs a
// matching base path. The deploy workflow sets VITE_BASE (e.g. "/Startcallers/").
// Locally it defaults to "/".
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  server: {
    host: true, // expose on LAN / tunnel so family can test from phones
    port: 5173,
    fs: {
      // allow importing the engine-agnostic /shared module that lives above /client
      allow: [".."],
    },
  },
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
