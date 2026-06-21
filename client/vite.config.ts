import { defineConfig } from "vite";

export default defineConfig({
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
